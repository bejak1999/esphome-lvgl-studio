<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import { tr, useI18n } from '@/shared/i18n';
import { useSettingsStore } from '@/shared/settings';
import { openEditorTab } from '@/shared/messaging';
import { pageLabel, useDocumentStore } from '@/core/lvgl/document';
import { useSchemaStore } from '@/core/schema/store';
import { useEsphomeStore } from '@/core/esphome/store';
import {
  ENTITY_STATES_KEY, ENTITY_VALUES_KEY, entityNumericValue, entityUnit, isEntityActive, useHaStore,
  type EntityValue,
} from '@/core/ha/store';
import WidgetView from '@/core/lvgl/WidgetView.vue';
import { OpenRouterClient, userMessageWithAttachments, type Attachment, type ChatMessage } from '@/core/agent/openrouter';
import { getSystemPrompt, runAgent, type StepEvent } from '@/core/agent/loop';
import { TOOL_DEFS, type AgentContext } from '@/core/agent/tools';
import { fetchSchemaFile, fetchSchemaIndex } from '@/core/schema/client';
import { fetchComponentDoc } from '@/core/docs/client';
import { browser } from 'wxt/browser';
import { toPng } from 'html-to-image';
import { useDocSync } from '@/shared/docSync';
import { useVersionStore } from '@/shared/versions';
import { isWebSerialSupported } from '@/core/esphome/serial';
import { formatTokens } from '@/shared/models';
import SettingsForm from '@/shared/SettingsForm.vue';
import { diffLines, type LineDiff } from '@/shared/diff';


interface FeedItem {
  role: 'user' | 'assistant' | 'step' | 'error' | 'diff';
  text: string;
  diff?: LineDiff;
  expanded?: boolean;
}

const settings = useSettingsStore();
const { t } = useI18n();
const doc = useDocumentStore();
const schema = useSchemaStore();
const esphome = useEsphomeStore();
const ha = useHaStore();
const versions = useVersionStore();

// Live-Werte auch in der Sidebar-Vorschau (gleiche Reflexion wie im Editor-Canvas).
const entityStates = computed<Record<string, boolean> | null>(() => {
  const map: Record<string, boolean> = {};
  for (const e of ha.entities) map[e.entity_id] = isEntityActive(e.state);
  return map;
});
const entityValues = computed<Record<string, EntityValue> | null>(() => {
  const map: Record<string, EntityValue> = {};
  for (const e of ha.entities) map[e.entity_id] = { state: e.state ?? '', num: entityNumericValue(e), unit: entityUnit(e) };
  return map;
});
provide(ENTITY_STATES_KEY, entityStates);
provide(ENTITY_VALUES_KEY, entityValues);

let haTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  haTimer = setInterval(() => {
    const { url, token } = settings.settings.ha;
    if (url && token && !ha.loading) ha.load(url, token);
  }, 15000);
});
onBeforeUnmount(() => clearInterval(haTimer));
useDocSync(); // Live-Sync mit dem Editor-Tab

const input = ref('');
const running = ref(false);
const stopFlag = ref(false);
const flashReady = ref(false); // nach erfolgreichem Kompilieren: Flash-/Download-Optionen zeigen
let abortController: AbortController | null = null;

function onStop() {
  stopFlag.value = true;
  abortController?.abort();
}
const attachments = ref<Attachment[]>([]);
const dragOver = ref(false);
const imageInput = ref<HTMLInputElement | null>(null);
const feed = ref<FeedItem[]>([]);

// Auto-Scroll: nur ans Ende springen, wenn der Nutzer ohnehin schon (nahe) unten ist.
// Scrollt er hoch, um Älteres zu lesen, bleibt die Ansicht dort stehen.
const feedEl = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);
function onFeedScroll() {
  const el = feedEl.value;
  if (!el) return;
  stickToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
}
watch(
  () => feed.value.length,
  async () => {
    if (!stickToBottom.value) return;
    await nextTick();
    const el = feedEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  },
);

const history: ChatMessage[] = [];

/** Größe der Tool-Antworten, die in den Folgekontext übernommen wird. */
const MAX_TOOL_CHARS = 2000;

/**
 * Übernimmt den kompletten Verlauf eines Laufs (inkl. Tool-Aufrufen) als Kontext für
 * Folgeanfragen – sonst weiß die KI beim nächsten „mach das noch blau" nicht, was sie
 * gerade getan hat. Damit das Fenster nicht explodiert, werden lange Tool-Antworten
 * gekürzt und alte Vorschau-Screenshots entfernt (nur der aktuelle zählt).
 */
function commitHistory(messages: ChatMessage[]) {
  const compacted = messages.map((m): ChatMessage => {
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > MAX_TOOL_CHARS) {
      return { ...m, content: m.content.slice(0, MAX_TOOL_CHARS) + '\n…[gekürzt]' };
    }
    // Vorschaubilder aus dem Verlauf werfen – sie sind nach der nächsten Änderung veraltet.
    if (Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')) {
      const text = m.content.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text).join(' ');
      return { ...m, content: `${text} [Bild aus dem Verlauf entfernt]` };
    }
    return m;
  });
  history.splice(0, history.length, ...compacted);
}

/** Token-Füllstand des Kontextfensters (aus der letzten OpenRouter-Antwort). */
const promptTokens = ref(0);
const completionTokens = ref(0);
const contextLimit = computed(() => settings.settings.ai.contextLength || 0);
const contextPct = computed(() =>
  contextLimit.value ? Math.min(100, Math.round((promptTokens.value / contextLimit.value) * 100)) : 0,
);
const contextLabel = computed(() => {
  if (!promptTokens.value) return '';
  const used = formatTokens(promptTokens.value);
  return contextLimit.value ? `${used} / ${formatTokens(contextLimit.value)}` : used;
});

function clearHistory() {
  history.splice(0, history.length);
  promptTokens.value = 0;
  completionTokens.value = 0;
  feed.value.push({ role: 'step', text: t('side_history_cleared') });
}

const hasKey = computed(() => settings.loaded && !!settings.settings.ai.apiKey);
const previewScale = computed(() => {
  const maxW = 300;
  return Math.min(1, maxW / doc.screen.width);
});
const sidebarConfig = ref('');
const previewNode = ref<HTMLElement | null>(null);

/** Rendert die aktuelle Vorschau als PNG-data-URL (für die visuelle Selbstprüfung der KI). */
async function capturePreview(): Promise<string | null> {
  if (!previewNode.value || !doc.screen.children.length) return null;
  try {
    return await toPng(previewNode.value, {
      // In natürlicher Größe rendern (die Vorschau ist im UI herunterskaliert).
      style: { transform: 'none', transformOrigin: 'top left' },
      width: doc.screen.width,
      height: doc.screen.height,
      pixelRatio: 2,
      backgroundColor: doc.screen.bg_color,
    });
  } catch {
    return null;
  }
}

onMounted(async () => {
  await settings.load();
  // Begrüßung erst nach dem Laden der Einstellungen – sonst immer in der Standardsprache.
  if (!feed.value.length) {
    feed.value.push({ role: 'assistant', text: settings.settings.language === 'de'
      ? 'Hi! Beschreibe dein Dashboard oder deine ESPHome-Config – ich schreibe & prüfe das YAML. Du kannst auch ein Bild eines Layouts anhängen.'
      : 'Hi! Describe your dashboard or ESPHome config – I will write & validate the YAML. You can also attach an image of a layout.' });
  }
  // Schema der eingestellten Version im Hintergrund laden (für statische Validierung).
  schema.loadLvgl(settings.settings.schema.version || 'dev').catch(() => {});
  // Beim Öffnen automatisch verbinden und – falls man in ESPHome auf einem Gerät ist –
  // genau dieses Gerät laden.
  initConnection();
  // Serielle Logs, die im Editor mit „An KI senden" übergeben wurden, aufgreifen.
  pickUpSerialHandoff();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.serial_handoff?.newValue) pickUpSerialHandoff();
  });
});

/** Übernimmt vom Editor übergebene serielle Logs in die Chat-Eingabe (und schickt sie ab). */
async function pickUpSerialHandoff() {
  try {
    const { serial_handoff } = await browser.storage.local.get('serial_handoff');
    const h = serial_handoff as { text?: string; at?: number } | undefined;
    if (!h?.text || (h.at && Date.now() - h.at > 5 * 60 * 1000)) return; // nur frische
    await browser.storage.local.remove('serial_handoff');
    input.value =
      'Der ESP gibt beim Start diese seriellen Logs aus (evtl. Boot-Loop/Absturz wegen einer Fehlkonfiguration). ' +
      'Analysiere sie, finde die Ursache und behebe sie im YAML mit set_yaml:\n\n```\n' + h.text + '\n```';
    if (hasKey.value && !running.value) send();
  } catch {
    /* ignore */
  }
}

/** Ermittelt aus dem aktiven Browser-Tab (ESPHome-Web-UI) die geöffnete Config. */
async function detectDeviceFromTab(): Promise<string> {
  try {
    const esphomeHost = new URL(settings.settings.esphome.url).host;
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url;
    if (!url) return '';
    const u = new URL(url);
    if (u.host !== esphomeHost) return '';
    const q =
      u.searchParams.get('configuration') || u.searchParams.get('config') || u.searchParams.get('device');
    if (q) return q.endsWith('.yaml') ? q : `${q}.yaml`;
    const hay = `${u.pathname}/${u.hash}`;
    const m = hay.match(/([\w.-]+\.yaml)/);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

/** @param interactive true aus dem „Verbinden"-Klick → fehlende Host-Berechtigung wird erfragt. */
async function initConnection(interactive = false) {
  if (esphome.connected || !settings.settings.esphome.url) return;
  try {
    await esphome.connect(settings.settings.esphome.url, settings.settings.esphome.token, interactive);
    const version = esphome.esphomeVersion;
    if (version) {
      settings.settings.schema.version = version;
      schema.loadLvgl(version).catch(() => {});
    }
    await esphome.loadDevices().catch(() => {});
    // Aktives Gerät erkennen und laden.
    const hint = await detectDeviceFromTab();
    const match = esphome.devices.find(
      (d) => d.configuration === hint || d.name === hint || d.configuration === `${hint}.yaml`,
    );
    if (match) {
      sidebarConfig.value = match.configuration;
      await openSidebarDevice(match.configuration);
    }
  } catch {
    /* Fehler steht in esphome.error */
  }
}

async function openSidebarDevice(configuration: string) {
  try {
    const yaml = await esphome.openDevice(configuration);
    await versions.load(configuration);
    const isDe = settings.settings.language === 'de';
    await versions.snapshot(yaml, t('snap_loaded'));
    doc.importYaml(yaml);
    feed.value.push({
      role: 'assistant',
      text: isDe
        ? `Gerät „${configuration}" geladen – ${doc.screen.children.length} Widgets, ${doc.screen.width}×${doc.screen.height}.`
        : `Device "${configuration}" loaded – ${doc.screen.children.length} widgets, ${doc.screen.width}×${doc.screen.height}.`,
    });
  } catch (e) {
    feed.value.push({ role: 'error', text: (e as Error).message });
  }
}

const lastLog = computed(() => (esphome.logs.length ? esphome.logs[esphome.logs.length - 1] : ''));

/** Kompiliert das aktuelle Gerät; bei Fehler übergibt die KI-Loop das Log und bessert nach. */
async function compileWithAutofix() {
  const isDe = settings.settings.language === 'de';
  if (!esphome.connected || !esphome.currentConfiguration) {
    feed.value.push({ role: 'error', text: isDe ? 'Erst mit einem Gerät verbinden und eins auswählen.' : 'Connect to a device and select one first.' });
    return;
  }
  if (running.value) return;
  running.value = true;
  stopFlag.value = false;
  abortController = new AbortController();
  try {
    for (let attempt = 1; attempt <= 4; attempt++) {
      if (stopFlag.value) break;
      feed.value.push({ role: 'step', text: isDe ? `🔨 Kompiliere „${esphome.currentConfiguration}" (Versuch ${attempt})…` : `🔨 Compiling "${esphome.currentConfiguration}" (attempt ${attempt})…` });
      try {
        await esphome.saveDevice(doc.exportedYaml);
        doc.markSaved();
      } catch {
        /* trotzdem versuchen */
      }
      let res: { success: boolean; status: string; error: string | null };
      try {
        res = await esphome.compile(esphome.currentConfiguration);
      } catch (e) {
        feed.value.push({ role: 'error', text: (isDe ? 'Kompilierung nicht startbar: ' : 'Compilation failed to start: ') + (e as Error).message });
        break;
      }
      if (res.success) {
        flashReady.value = true;
        feed.value.push({ role: 'assistant', text: isDe ? '✅ Kompilierung erfolgreich! Jetzt aufs Gerät flashen (OTA) oder .bin herunterladen.' : '✅ Compilation successful! Flash to device (OTA) or download .bin.' });
        break;
      }
      const tail = esphome.logs.slice(-60).join('\n');
      feed.value.push({ role: 'error', text: isDe ? `❌ Fehlgeschlagen (${res.status}). Log-Ende:\n${tail.slice(-1400)}` : `❌ Failed (${res.status}). Log end:\n${tail.slice(-1400)}` });
      if (!hasKey.value) {
        feed.value.push({ role: 'error', text: isDe ? 'Kein OpenRouter-Key – kann nicht automatisch nachbessern.' : 'No OpenRouter key set – cannot automatically fix.' });
        break;
      }
      if (attempt >= 4) {
        feed.value.push({ role: 'error', text: isDe ? 'Nach mehreren Versuchen weiterhin Fehler – bitte manuell prüfen.' : 'Errors persist after multiple attempts – please inspect manually.' });
        break;
      }
      feed.value.push({ role: 'step', text: isDe ? '🤖 Übergebe den Fehler an die KI zur Korrektur…' : '🤖 Passing error to AI for correction…' });
      history.push({
        role: 'user',
        content: isDe
          ? `Die ESPHome-Kompilierung ist fehlgeschlagen. Analysiere das Build-Log, finde die Ursache und behebe sie im YAML mit set_yaml (nur das Nötige ändern, den Rest erhalten). Danach mit validate prüfen. Build-Log (Ende):\n${tail}`
          : `ESPHome compilation failed. Analyze the build log, find the cause and fix it in the YAML using set_yaml (only change what is necessary, keep the rest). Afterwards check with validate. Build log (end):\n${tail}`,
      });
      const client = new OpenRouterClient({
        apiKey: settings.settings.ai.apiKey,
        baseUrl: settings.settings.ai.baseUrl,
      });
      const { messages } = await runAgent({
        llm: client,
        model: settings.settings.ai.model,
        system: getSystemPrompt(settings.settings.language as 'en' | 'de'),
        history,
        tools: TOOL_DEFS,
        ctx: buildContext(),
        lang: settings.settings.language as 'en' | 'de',
        onStep,
        shouldStop: () => stopFlag.value,
        signal: abortController.signal,
      });
      commitHistory(messages);
      if (!changedThisRun.value) {
        feed.value.push({ role: 'error', text: isDe ? 'Die KI hat keine Änderung vorgenommen – Abbruch.' : 'AI made no changes – aborting.' });
        break;
      }
    }
  } finally {
    running.value = false;
  }
}

// Einstellungen direkt in der Sidebar (ganze Form im geteilten <SettingsForm>).
const showSettings = ref(false);

// Anwende-Modus: 'auto' übernimmt sofort, 'confirm' fragt vorher mit Diff-Popup.
// Übernahme-Modus für KI-Änderungen – in den Einstellungen gespeichert (Standard: bestätigen),
// damit eine Umstellung auf „Auto" einen Neustart übersteht.
const applyMode = computed<'auto' | 'confirm'>({
  get: () => settings.settings.ai.applyMode ?? 'confirm',
  set: (v) => {
    settings.saveApplyMode(v);
  },
});
const pendingChange = ref<{ yaml: string; diff: LineDiff; resolve: (ok: boolean) => void } | null>(null);

/** Übernimmt YAML der KI und protokolliert den Diff im Chat. */
function applyAgentYaml(y: string) {
  const before = doc.exportedYaml;
  doc.importYaml(y);
  const d = diffLines(before, doc.exportedYaml);
  if (d.added || d.removed) {
    const isDe = settings.settings.language === 'de';
    feed.value.push({ role: 'diff', text: (isDe ? 'Code aktualisiert' : 'Code updated') + `  +${d.added} −${d.removed}`, diff: d, expanded: false });
  }
}

function acceptPending() {
  const p = pendingChange.value;
  if (!p) return;
  pendingChange.value = null;
  applyAgentYaml(p.yaml);
  p.resolve(true);
}
function rejectPending() {
  const p = pendingChange.value;
  if (!p) return;
  pendingChange.value = null;
  const isDe = settings.settings.language === 'de';
  feed.value.push({ role: 'step', text: isDe ? '✋ Änderung abgelehnt – YAML unverändert.' : '✋ Change rejected – YAML unchanged.' });
  p.resolve(false);
}

/** Exportiert den Chatverlauf als Textdatei. */
function exportChat() {
  const isDe = settings.settings.language === 'de';
  const lines = feed.value.map((m) => {
    if (m.role === 'diff' && m.diff) return isDe ? `— Code-Änderung (+${m.diff.added} −${m.diff.removed}) —` : `— Code change (+${m.diff.added} −${m.diff.removed}) —`;
    const who = m.role === 'user' ? (isDe ? 'Du' : 'You') : m.role === 'error' ? (isDe ? 'Fehler' : 'Error') : m.role === 'step' ? '·' : 'AI';
    return `${who}: ${m.text}`;
  });
  const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chat-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Flasht die zuletzt kompilierte Firmware über WLAN (OTA) aufs Gerät. */
async function otaInstall() {
  if (running.value || esphome.installing || esphome.compiling) return;
  const isDe = settings.settings.language === 'de';
  const port = esphome.otaPort;
  if (!port) {
    feed.value.push({ role: 'error', text: isDe ? 'Kein OTA-Ziel gefunden (Geräteadresse unbekannt).' : 'No OTA target found (device address unknown).' });
    return;
  }
  feed.value.push({ role: 'step', text: isDe ? `📡 Flashe „${esphome.currentConfiguration}" über WLAN → ${port} …` : `📡 Flashing "${esphome.currentConfiguration}" via Wi-Fi → ${port} …` });
  try {
    const res = await esphome.install(port);
    if (res.success) {
      feed.value.push({ role: 'assistant', text: isDe ? '✅ Auf das Gerät geflasht! Es startet gleich neu.' : '✅ Flashed to device! Reboots shortly.' });
    } else {
      const tail = esphome.logs.slice(-40).join('\n');
      feed.value.push({ role: 'error', text: isDe ? `❌ OTA fehlgeschlagen (${res.status}). Log-Ende:\n${tail.slice(-1200)}` : `❌ OTA failed (${res.status}). Log end:\n${tail.slice(-1200)}` });
    }
  } catch (e) {
    feed.value.push({ role: 'error', text: (isDe ? 'OTA nicht startbar: ' : 'OTA failed to start: ') + (e as Error).message });
  }
}

// USB-Flashen & serielle Logs laufen nur im Editor-Tab (Firefox gibt der Seitenleiste
// keinen Zugriff auf serielle Ports). Dieser Schalter blendet dafür einen „→ Editor"-Button ein.
const usbSupported = isWebSerialSupported();

/** Lädt die kompilierte Firmware (.bin) herunter. */
async function downloadBin() {
  const isDe = settings.settings.language === 'de';
  const url = esphome.downloadUrl();
  if (!url) {
    feed.value.push({ role: 'error', text: isDe ? 'Kein Gerät/Download verfügbar.' : 'No device/download available.' });
    return;
  }
  feed.value.push({ role: 'step', text: isDe ? '⬇️ Lade Firmware (.bin) …' : '⬇️ Downloading firmware (.bin) …' });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = esphome.currentConfiguration.replace(/\.ya?ml$/i, '') + '.bin';
    a.click();
    URL.revokeObjectURL(a.href);
    feed.value.push({ role: 'assistant', text: isDe ? '✅ Firmware heruntergeladen.' : '✅ Firmware downloaded.' });
  } catch (e) {
    feed.value.push({ role: 'error', text: (isDe ? 'Download fehlgeschlagen: ' : 'Download failed: ') + (e as Error).message });
  }
}

function buildContext(): AgentContext {
  const version = settings.settings.schema.version || 'dev';
  return {
    getYaml: () => doc.exportedYaml,
    setYaml: (y) => {
      // Auto-Modus: sofort übernehmen. Bestätigungs-Modus: erst Popup, dann entscheiden.
      if (applyMode.value === 'auto') {
        applyAgentYaml(y);
        return;
      }
      const d = diffLines(doc.exportedYaml, y);
      if (!d.added && !d.removed) return; // nichts geändert → nichts zu bestätigen
      return new Promise<boolean>((resolve) => {
        pendingChange.value = { yaml: y, diff: d, resolve };
      });
    },
    validateStatic: () =>
      schema.loaded
        ? schema.validate(doc.exportedYaml).map((i) => ({ message: i.message, where: i.widgetId }))
        : [],
    validateLive: esphome.connected
      ? async () =>
          (await esphome.validate(doc.exportedYaml)).map((i) => ({
            message: i.message,
            where: i.line ? `Z${i.line}` : undefined,
          }))
      : undefined,
    getComponentSchema: (c) => fetchSchemaFile(c, version),
    getComponentDoc: (c) => fetchComponentDoc(c),
    listComponents: async () => {
      const idx = (await fetchSchemaIndex(version)) as { core?: { components?: Record<string, unknown> } };
      return Object.keys(idx.core?.components ?? {});
    },
    listEntities: () => ha.entityIds,
    getScreenInfo: () => ({
      width: doc.screen.width,
      height: doc.screen.height,
      pages: doc.pages.map((p, i) => ({ id: p.id, name: pageLabel(p, i), widgets: p.children.length })),
      activePage: doc.activePage,
    }),
    capturePreview,
  };
}

const changedThisRun = ref(false);

function onStep(ev: StepEvent) {
  if (ev.kind === 'assistant' && ev.text) feed.value.push({ role: 'assistant', text: ev.text });
  else if (ev.kind === 'tool_call') {
    feed.value.push({ role: 'step', text: `🔧 ${ev.name}` });
    if (ev.name === 'set_yaml') changedThisRun.value = true;
  } else if (ev.kind === 'usage') {
    promptTokens.value = ev.promptTokens;
    completionTokens.value = ev.completionTokens;
  } else if (ev.kind === 'done' && ev.reason === 'max_steps') {
    // Sonst bricht die KI scheinbar grundlos mitten in der Arbeit ab.
    feed.value.push({ role: 'error', text: `⏹ ${ev.text}` });
  } else if (ev.kind === 'error') feed.value.push({ role: 'error', text: ev.message });
}

// ---- HA-Entity-Autovervollständigung im Chat ("ha:lig" → light.schreibtischlampe) ----
const textareaEl = ref<HTMLTextAreaElement | null>(null);
const acOpen = ref(false);
const acQuery = ref('');
const acIndex = ref(0);
const acTokenStart = ref(0); // Index im Text, an dem "ha:" beginnt
const HA_TOKEN = /ha:([\w.]*)$/i;

const acMatches = computed(() => {
  if (!acOpen.value) return [];
  const q = acQuery.value.toLowerCase();
  return ha.entities
    .filter((e) => !q || e.entity_id.toLowerCase().includes(q) || (e.friendly_name ?? '').toLowerCase().includes(q))
    .slice(0, 8);
});

function onChatInput() {
  const el = textareaEl.value;
  if (!el) return;
  const caret = el.selectionStart ?? input.value.length;
  const before = input.value.slice(0, caret);
  const m = before.match(HA_TOKEN);
  if (m) {
    acOpen.value = true;
    acQuery.value = m[1];
    acTokenStart.value = caret - m[0].length;
    acIndex.value = 0;
    // Entities noch nicht geladen? Im Hintergrund nachladen, damit Vorschläge erscheinen.
    if (!ha.entities.length && !ha.loading) {
      const { url, token } = settings.settings.ha;
      if (url && token) ha.load(url, token);
    }
  } else {
    acOpen.value = false;
  }
}

function applyCompletion(entityId: string) {
  const el = textareaEl.value;
  const caret = el?.selectionStart ?? input.value.length;
  const before = input.value.slice(0, acTokenStart.value);
  const after = input.value.slice(caret);
  input.value = `${before}${entityId}${after}`;
  acOpen.value = false;
  nextTick(() => {
    const pos = (before + entityId).length;
    el?.focus();
    el?.setSelectionRange(pos, pos);
  });
}

/** Tastatur im Chat-Eingabefeld: erst die Vervollständigung, sonst Enter = Senden. */
function onChatKeydown(ev: KeyboardEvent) {
  if (acOpen.value && acMatches.value.length) {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); acIndex.value = (acIndex.value + 1) % acMatches.value.length; return; }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); acIndex.value = (acIndex.value - 1 + acMatches.value.length) % acMatches.value.length; return; }
    if (ev.key === 'Tab' || ev.key === 'Enter') { ev.preventDefault(); applyCompletion(acMatches.value[acIndex.value].entity_id); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); acOpen.value = false; return; }
  }
  if (ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    send();
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

/** Öffnet den Editor und übergibt den aktuellen (auch ungespeicherten) Stand. */
async function openEditor() {
  try {
    await browser.storage.local.set({
      handoff: { device: esphome.currentConfiguration, yaml: doc.exportedYaml, at: Date.now() },
    });
  } catch {
    /* ignore */
  }
  openEditorTab(esphome.currentConfiguration || undefined);
}

async function pickImage() {
  imageInput.value?.click();
}
// Text-/Code-/Konfig-Dateien werden als Klartext eingebettet (nicht als binärer file-Part,
// den OpenRouter nur für PDFs akzeptiert). Ergänzt die MIME-Erkennung um übliche Endungen.
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|ya?ml|log|ini|conf|cfg|toml|xml|html?|css|js|ts|py|c|h|cpp|hpp|ino|sh|bat|env|properties|list)$/i;
function isTextFile(file: File): boolean {
  return file.type.startsWith('text/') || file.type === 'application/json' || TEXT_EXT.test(file.name);
}
function readFile(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const asText = isTextFile(file);
    reader.onerror = () => reject(reader.error ?? new Error(t('side_file_read')));
    reader.onload = () =>
      resolve(
        asText
          ? { name: file.name, type: file.type || 'text/plain', text: String(reader.result) }
          : { name: file.name, type: file.type || 'application/octet-stream', dataUrl: String(reader.result) },
      );
    if (asText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}
async function addFiles(files: FileList | File[]) {
  for (const f of Array.from(files)) {
    if (f.size > 20 * 1024 * 1024) {
      feed.value.push({ role: 'error', text: `„${f.name}" ist zu groß (max. 20 MB).` });
      continue;
    }
    // Unterstützt: Bilder (Vision), PDFs (Datenblätter) und Textdateien. Alles andere
    // (z. B. .docx, .zip) würde beim Provider zu einem Fehler führen → freundlich ablehnen.
    const ok = f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name) || isTextFile(f);
    if (!ok) {
      feed.value.push({ role: 'error', text: `„${f.name}" wird nicht unterstützt – nur Bilder, PDFs und Textdateien.` });
      continue;
    }
    try {
      attachments.value.push(await readFile(f));
    } catch (e) {
      feed.value.push({ role: 'error', text: `„${f.name}" konnte nicht gelesen werden: ${(e as Error).message}` });
    }
  }
}
function isPdf(a: Attachment) {
  return a.type === 'application/pdf' || /\.pdf$/i.test(a.name);
}
function onImageChosen(ev: Event) {
  const files = (ev.target as HTMLInputElement).files;
  if (files) addFiles(files);
  (ev.target as HTMLInputElement).value = '';
}
function onDrop(ev: DragEvent) {
  dragOver.value = false;
  const files = ev.dataTransfer?.files;
  if (files && files.length) addFiles(files);
}
function isImage(a: Attachment) {
  return a.type.startsWith('image/');
}

async function send() {
  const text = input.value.trim();
  if ((!text && !attachments.value.length) || running.value) return;
  if (!hasKey.value) {
    feed.value.push({ role: 'error', text: t('side_no_key') });
    return;
  }

  const atts = attachments.value.slice();
  const badge = atts.length ? ` 📎${atts.length}` : '';
  const isDe = settings.settings.language === 'de';
  feed.value.push({ role: 'user', text: text + badge });
  history.push(userMessageWithAttachments(text || (isDe ? 'Baue dieses Dashboard.' : 'Build this dashboard.'), atts));
  input.value = '';
  attachments.value = [];
  running.value = true;
  stopFlag.value = false;
  changedThisRun.value = false;
  abortController = new AbortController();

  // Vor der KI-Änderung einen Wiederherstellungspunkt sichern (falls sie Mist baut).
  if (esphome.currentConfiguration) {
    if (versions.device !== esphome.currentConfiguration) await versions.load(esphome.currentConfiguration);
    await versions.snapshot(doc.exportedYaml, t('snap_before_ai'));
  }

  try {
    const client = new OpenRouterClient({
      apiKey: settings.settings.ai.apiKey,
      baseUrl: settings.settings.ai.baseUrl,
    });
    const { messages } = await runAgent({
      llm: client,
      model: settings.settings.ai.model,
      system: getSystemPrompt(settings.settings.language as 'en' | 'de'),
      history,
      tools: TOOL_DEFS,
      ctx: buildContext(),
      lang: settings.settings.language as 'en' | 'de',
      onStep,
      shouldStop: () => stopFlag.value,
      signal: abortController.signal,
    });
    // Kompletten Lauf als Kontext für Folgeanfragen behalten.
    commitHistory(messages);

    // KI-Änderungen aufs verbundene Gerät speichern, damit Code/Editor sie zeigen.
    if (changedThisRun.value && esphome.connected && esphome.currentConfiguration) {
      try {
        await esphome.saveDevice(doc.exportedYaml);
        doc.markSaved();
        feed.value.push({ role: 'assistant', text: `💾 Auf Gerät „${esphome.currentConfiguration}" gespeichert.` });
      } catch (e) {
        feed.value.push({ role: 'error', text: t('side_save_failed') + (e as Error).message });
      }
    }
  } catch (e) {
    feed.value.push({ role: 'error', text: (e as Error).message });
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <main class="flex h-full flex-col bg-[#0b1220] text-gray-200">
    <input ref="imageInput" type="file" accept="image/*,application/pdf,text/*,.txt,.md,.csv,.json,.yaml,.yml,.log,.ini,.conf,.xml,.ino,.cpp,.h,.py" multiple class="hidden" @change="onImageChosen" />

    <!-- Header -->
    <header class="flex items-center justify-between border-b border-white/10 px-3 py-2">
      <div class="flex items-center gap-2">
        <img src="/icon/128.png" alt="ESPHome LVGL Studio" class="h-6 w-6 shrink-0" />
        <h1 class="text-xs font-semibold text-white">ESPHome LVGL Studio</h1>
      </div>
      <div class="flex items-center gap-1">
        <button class="rounded-md border border-white/10 px-1.5 py-1 text-[11px] text-gray-300 enabled:hover:bg-white/5 disabled:opacity-40" :disabled="!doc.canUndo" :title="t('sidepanel_undo')" @click="doc.undo()">↶</button>
        <button class="rounded-md border border-white/10 px-1.5 py-1 text-[11px] text-gray-300 enabled:hover:bg-white/5 disabled:opacity-40" :disabled="!doc.canRedo" :title="t('sidepanel_redo')" @click="doc.redo()">↷</button>
        <span class="mx-0.5 text-white/15">|</span>
        <button class="rounded-md border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5" @click="openEditor">{{ t('sidepanel_editor') }}</button>
        <button class="rounded-md border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5" :title="t('sidepanel_settings')" @click="showSettings = true">⚙</button>
      </div>
    </header>

    <!-- Verbindung / Gerät -->
    <div class="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-[10px]">
      <span
        class="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        :class="esphome.connected ? 'bg-emerald-400' : esphome.error ? 'bg-red-400' : 'bg-gray-600'"
      />
      <template v-if="esphome.connected">
        <span class="shrink-0 text-gray-400">v{{ esphome.esphomeVersion ?? '?' }}</span>
        <select
          v-model="sidebarConfig"
          :aria-label="t('sidepanel_device')"
          class="min-w-0 flex-1 rounded border border-white/10 bg-[#111827] px-1.5 py-0.5 text-gray-200 focus:outline-none"
          @change="openSidebarDevice(sidebarConfig)"
        >
          <option value="" disabled>{{ t('sidepanel_device') }}</option>
          <option v-for="d in esphome.devices" :key="d.configuration" :value="d.configuration">
            {{ d.friendly_name || d.name }}
          </option>
        </select>
        <button
          class="shrink-0 rounded border border-emerald-500/30 px-2 py-0.5 text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
          :disabled="running || esphome.compiling || !esphome.currentConfiguration"
          :title="t('sidepanel_compile_title')"
          @click="compileWithAutofix"
        >
          {{ t('sidepanel_compile') }}
        </button>
      </template>
      <template v-else>
        <span class="text-gray-500">{{ t('sidepanel_esphome') }}</span>
        <button class="rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5" @click="settings.settings.esphome.url ? initConnection(true) : (showSettings = true)">{{ t('sidepanel_connect') }}</button>
        <span v-if="esphome.error" class="truncate text-red-400" :title="esphome.error">{{ esphome.error }}</span>
      </template>
    </div>

    <!-- Flash-Optionen nach erfolgreichem Kompilieren -->
    <div
      v-if="esphome.connected && flashReady"
      class="flex items-center gap-1.5 border-b border-white/10 px-2 py-1 text-[11px]"
    >
      <span class="shrink-0 text-gray-500">{{ t('sidepanel_firmware') }}</span>
      <button
        class="shrink-0 rounded border border-blue-500/30 px-2 py-0.5 text-blue-300 hover:bg-blue-950/40 disabled:opacity-50"
        :disabled="esphome.installing || esphome.compiling || running || !esphome.otaPort"
        :title="`${t('sidepanel_flash_wifi_title')} (${esphome.otaPort || '?'})`"
        @click="otaInstall"
      >
        {{ t('sidepanel_flash_wifi') }}
      </button>
      <button
        class="shrink-0 rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5 disabled:opacity-50"
        :disabled="esphome.installing"
        title=".bin"
        @click="downloadBin"
      >
        ⬇️ .bin
      </button>
      <button
        v-if="usbSupported"
        class="shrink-0 rounded border border-emerald-500/30 px-2 py-0.5 text-emerald-300 hover:bg-emerald-950/40"
        :title="t('sidepanel_usb_title')"
        @click="openEditor"
      >
        {{ t('sidepanel_usb_logs') }}
      </button>
      <span v-if="esphome.installing" class="shrink-0 text-amber-300">{{ t('sidepanel_flashing') }}</span>
    </div>

    <!-- Live-Vorschau -->
    <section class="border-b border-white/10 p-3">
      <div class="mb-1.5 flex items-center gap-2">
        <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{{ t('sidepanel_preview') }}</div>
        <!-- Seitenumschalter (LVGL pages) – gilt auch für das, was die KI als „aktuell" sieht. -->
        <div v-if="doc.pages.length > 1" class="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          <button
            v-for="(p, i) in doc.pages"
            :key="p.id"
            class="shrink-0 rounded border px-1.5 py-0.5 text-[10px]"
            :class="i === doc.activePage
              ? 'border-blue-500/50 bg-blue-500/20 text-blue-200'
              : 'border-white/10 text-gray-400 hover:bg-white/5'"
            :title="tr('page_id_short', { id: p.id })"
            @click="doc.setActivePage(i)"
          >
            {{ pageLabel(p, i) }}
          </button>
        </div>
      </div>
      <div class="flex justify-center overflow-hidden rounded-lg border border-white/10 bg-black/20 p-2">
        <div
          ref="previewNode"
          data-lvgl-canvas
          class="relative shrink-0 overflow-hidden rounded"
          :style="{ width: doc.screen.width + 'px', height: doc.screen.height + 'px', backgroundColor: doc.screen.bg_color, transform: `scale(${previewScale})`, transformOrigin: 'top center' }"
        >
          <WidgetView v-for="n in doc.screen.children" :key="n.id" :node="n" :selected-id="null" />
          <div v-if="!doc.screen.children.length" class="absolute inset-0 flex items-center justify-center text-xs text-gray-600">
            {{ t('sidepanel_still_empty') }}
          </div>
        </div>
      </div>
    </section>

    <!-- Chat / Agent-Feed (Drag&Drop-Zone für Bilder/PDFs) -->
    <section
      class="relative flex min-h-0 flex-1 flex-col"
      @dragover.prevent="dragOver = true"
      @dragenter.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <div
        v-if="dragOver"
        class="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-400/70 bg-blue-500/10 text-xs text-blue-200"
      >
        {{ t('sidepanel_drag_drop') }}
      </div>
      <div class="flex items-center justify-between gap-2 border-b border-white/10 px-2 py-1">
        <div class="flex items-center gap-1 text-[10px]">
          <span class="shrink-0 text-gray-500">{{ t('sidepanel_changes') }}</span>
          <button
            class="rounded px-1.5 py-0.5"
            :class="applyMode === 'auto' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'"
            :title="t('sidepanel_auto_title')"
            :aria-pressed="applyMode === 'auto'"
            @click="applyMode = 'auto'"
          >
            {{ t('sidepanel_auto') }}
          </button>
          <button
            class="rounded px-1.5 py-0.5"
            :class="applyMode === 'confirm' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'"
            :title="t('sidepanel_confirm_title')"
            :aria-pressed="applyMode === 'confirm'"
            @click="applyMode = 'confirm'"
          >
            {{ t('sidepanel_confirm') }}
          </button>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button
            class="rounded border border-white/10 px-2 py-0.5 text-[10px] text-gray-400 hover:bg-white/5 hover:text-gray-200"
            :title="t('sidepanel_export_chat_title')"
            @click="exportChat"
          >
            {{ t('sidepanel_export_chat') }}
          </button>
        </div>
      </div>

      <!-- Kontextfenster-Füllstand der KI -->
      <div
        v-if="contextLabel"
        class="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-1 text-[10px] text-gray-500"
        :title="`${t('sidepanel_context')}: ${promptTokens} Tokens, ${completionTokens} generated${contextLimit ? ` – window ${contextLimit}` : ''}`"
      >
        <span class="shrink-0">{{ t('sidepanel_context') }}</span>
        <div v-if="contextLimit" class="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            class="h-full rounded-full transition-all"
            :class="contextPct >= 90 ? 'bg-red-500' : contextPct >= 70 ? 'bg-amber-500' : 'bg-blue-500'"
            :style="{ width: contextPct + '%' }"
          />
        </div>
        <div v-else class="flex-1" />
        <span class="shrink-0 tabular-nums" :class="contextPct >= 90 ? 'text-red-400' : ''">
          {{ contextLabel }}<span v-if="contextLimit"> ({{ contextPct }}%)</span>
        </span>
        <button class="shrink-0 hover:text-gray-300" :title="t('sidepanel_clear_context')" @click="clearHistory">
          🧹
        </button>
      </div>
      <div ref="feedEl" class="flex-1 space-y-2 overflow-y-auto p-3" @scroll="onFeedScroll">
        <div v-for="(m, i) in feed" :key="i" class="group flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
          <!-- Code-Diff (ein-/ausklappbar) -->
          <div v-if="m.role === 'diff' && m.diff" class="max-w-[92%] overflow-hidden rounded-lg border border-white/10 bg-[#0b1220]">
            <button
              class="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11px] text-gray-300 hover:bg-white/5"
              @click="m.expanded = !m.expanded"
            >
              <span>{{ m.expanded ? '▾' : '▸' }}</span>
              <span>📝 {{ m.text.replace(/\s+\+.*/, '') }}</span>
              <span class="text-emerald-400">+{{ m.diff.added }}</span>
              <span class="text-red-400">−{{ m.diff.removed }}</span>
            </button>
            <div v-if="m.expanded" class="max-h-64 overflow-auto border-t border-white/10 font-mono text-[10px] leading-[1.45]">
              <div
                v-for="(ln, k) in m.diff.lines"
                :key="k"
                class="whitespace-pre px-2"
                :class="{
                  'bg-emerald-950/40 text-emerald-300': ln.type === 'add',
                  'bg-red-950/40 text-red-300': ln.type === 'del',
                  'text-gray-500': ln.type === 'ctx',
                  'select-none text-center text-gray-600': ln.type === 'gap',
                }"
              >{{ ln.type === 'add' ? '+ ' : ln.type === 'del' ? '- ' : ln.type === 'gap' ? '' : '  ' }}{{ ln.text }}</div>
            </div>
          </div>
          <div
            v-else-if="m.role !== 'step'"
            class="relative max-w-[85%] rounded-lg px-2.5 py-1.5 text-[12px] leading-snug"
            :class="{
              'bg-blue-600 text-white': m.role === 'user',
              'border border-white/10 bg-[#111827] text-gray-200': m.role === 'assistant',
              'border border-red-500/30 bg-red-950/40 text-red-300': m.role === 'error',
            }"
          >
            <div class="select-text whitespace-pre-wrap break-words">{{ m.text }}</div>
            <button
              class="absolute -right-1.5 -top-2 rounded border border-white/10 bg-[#0b1220] px-1 py-0.5 text-[9px] text-gray-400 opacity-0 hover:text-white group-hover:opacity-100"
              :title="t('common_copy')" :aria-label="t('common_copy')"
              @click="copyText(m.text)"
            >
              ⧉
            </button>
          </div>
          <div v-else class="select-text text-[10px] text-gray-500">{{ m.text }}</div>
        </div>
        <div v-if="esphome.compiling" class="truncate font-mono text-[10px] text-emerald-400/80" :title="lastLog">
          {{ lastLog || t('sidepanel_compiling') }}
        </div>
        <div v-else-if="running" class="text-[10px] text-gray-500">{{ t('sidepanel_agent_working') }}</div>
      </div>

      <!-- Eingabe -->
      <div class="border-t border-white/10 p-2">
        <div v-if="attachments.length" class="mb-1.5 flex flex-wrap gap-1.5">
          <div
            v-for="(a, i) in attachments"
            :key="i"
            class="flex items-center gap-1 rounded-md border border-white/10 bg-[#111827] py-0.5 pl-0.5 pr-1.5 text-[10px] text-gray-300"
          >
            <img v-if="isImage(a)" :src="a.dataUrl" class="h-6 w-6 rounded object-cover" :alt="a.name" />
            <span v-else-if="isPdf(a)" class="flex h-6 w-6 items-center justify-center rounded bg-red-500/20 text-[9px] text-red-300">PDF</span>
            <span v-else class="flex h-6 w-6 items-center justify-center rounded bg-sky-500/20 text-[11px] text-sky-300">📄</span>
            <span class="max-w-24 truncate">{{ a.name }}</span>
            <button class="text-gray-500 hover:text-gray-200" :title="t('common_remove')" :aria-label="t('common_remove')" @click="attachments.splice(i, 1)">✕</button>
          </div>
        </div>
        <div class="relative flex items-end gap-2">
          <!-- HA-Entity-Vorschläge (Tippen von „ha:…") -->
          <div
            v-if="acOpen && acMatches.length"
            class="absolute bottom-full left-9 z-20 mb-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-white/15 bg-[#0e1626] shadow-xl"
          >
            <div class="border-b border-white/10 px-2 py-1 text-[10px] text-gray-500">
              {{ t('sidepanel_ha_entity') }}
            </div>
            <button
              v-for="(e, k) in acMatches"
              :key="e.entity_id"
              class="block w-full px-2 py-1 text-left hover:bg-white/5"
              :class="k === acIndex ? 'bg-blue-600/30' : ''"
              @mousedown.prevent="applyCompletion(e.entity_id)"
              @mouseenter="acIndex = k"
            >
              <div class="truncate text-[11px] text-gray-200">{{ e.entity_id }}</div>
              <div v-if="e.friendly_name" class="truncate text-[10px] text-gray-500">{{ e.friendly_name }}</div>
            </button>
          </div>
          <button class="rounded-lg border border-white/10 px-2 py-2 text-[12px] text-gray-300 hover:bg-white/5" :title="t('sidepanel_attach_title')" @click="pickImage">📎</button>
          <textarea
            ref="textareaEl"
            v-model="input"
            rows="2"
            :placeholder="t('sidepanel_placeholder')"
            class="min-h-9 flex-1 resize-none rounded-lg border border-white/10 bg-[#111827] px-2.5 py-1.5 text-[12px] text-gray-100 placeholder-gray-500 focus:border-blue-500/60 focus:outline-none"
            @input="onChatInput"
            @keydown="onChatKeydown"
            @blur="acOpen = false"
          />
          <button
            v-if="!running"
            class="rounded-lg bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:from-blue-600 hover:to-blue-700"
            @click="send"
          >
            {{ t('sidepanel_send') }}
          </button>
          <button v-else class="rounded-lg border border-red-500/40 px-3 py-2 text-[12px] text-red-300 hover:bg-red-950/40" @click="onStop">{{ t('sidepanel_stop') }}</button>
        </div>
        <p v-if="settings.loaded && !hasKey" class="mt-1 text-[10px] text-amber-400/80">
          {{ t('sidepanel_no_key') }}<button class="underline" @click="showSettings = true">{{ t('sidepanel_no_key_link') }}</button>
        </p>
      </div>
    </section>

    <!-- Einstellungen direkt in der Sidebar -->
    <div v-if="showSettings" v-dialog="() => (showSettings = false)" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" @click.self="showSettings = false">
      <div class="flex max-h-[88vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0e1626]">
        <header class="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <h2 class="text-[12px] font-semibold text-gray-200">{{ t('sidepanel_modal_settings') }}</h2>
          <button class="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white" :title="t('common_close')" :aria-label="t('common_close')" @click="showSettings = false">✕</button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto p-3">
          <SettingsForm />
        </div>
      </div>
    </div>

    <!-- Bestätigungs-Modus: Code-Änderung vor dem Übernehmen prüfen -->
    <div
      v-if="pendingChange"
      v-dialog="rejectPending"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
    >
      <div class="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0e1626]">
        <header class="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[12px] text-gray-200">
          <h2 class="font-normal">{{ t('sidepanel_confirm_change') }}</h2>
          <span class="text-emerald-400">+{{ pendingChange.diff.added }}</span>
          <span class="text-red-400">−{{ pendingChange.diff.removed }}</span>
        </header>
        <div class="min-h-0 flex-1 overflow-auto font-mono text-[10px] leading-[1.45]">
          <div
            v-for="(ln, k) in pendingChange.diff.lines"
            :key="k"
            class="whitespace-pre px-2"
            :class="{
              'bg-emerald-950/40 text-emerald-300': ln.type === 'add',
              'bg-red-950/40 text-red-300': ln.type === 'del',
              'text-gray-500': ln.type === 'ctx',
              'select-none text-center text-gray-600': ln.type === 'gap',
            }"
          >{{ ln.type === 'add' ? '+ ' : ln.type === 'del' ? '- ' : ln.type === 'gap' ? '' : '  ' }}{{ ln.text }}</div>
        </div>
        <footer class="flex justify-end gap-2 border-t border-white/10 px-3 py-2">
          <button
            class="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-gray-300 hover:bg-white/5"
            @click="rejectPending"
          >
            {{ t('sidepanel_discard') }}
          </button>
          <button
            class="rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700"
            @click="acceptPending"
          >
            {{ t('sidepanel_apply') }}
          </button>
        </footer>
      </div>
    </div>
  </main>
</template>
