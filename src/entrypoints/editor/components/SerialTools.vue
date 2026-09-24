<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import { tr, useI18n } from '@/shared/i18n';
import { browser } from 'wxt/browser';
import { useEsphomeStore } from '@/core/esphome/store';
import { useSettingsStore } from '@/shared/settings';
import {
  flashOverUsb, isFirefox, isPortCancelled, isWebSerialSupported, openSerialLogs, requestSerialPort,
  webSerialUsableHere, type SerialLogSession,
} from '@/core/esphome/serial';

/**
 * USB-Flashen & serielle Logs im EDITOR-Tab (Top-Level-Seite). Firefox erlaubt den
 * Web-Serial-Portdialog zuverlässig in einem echten Tab – anders als in der schmalen
 * Seitenleiste. „An KI senden" reicht die Logs an die Sidebar-KI weiter.
 */
const esphome = useEsphomeStore();
const settings = useSettingsStore();
const { t } = useI18n();
// Web Serial funktioniert hier nur auf Chromium; auf Firefox verweisen wir aufs Dashboard.
const usable = webSerialUsableHere();
const firefoxFallback = isWebSerialSupported() && isFirefox();

/** Öffnet das ESPHome-Dashboard (echte Web-Origin) – dort geht USB-Flashen/-Logs auch in Firefox. */
function openDashboard() {
  const url = settings.settings.esphome.url;
  if (url) browser.tabs.create({ url });
}

const status = ref('');
const flashing = ref(false);
const progress = ref(0);
const lines = ref<string[]>([]);
const active = ref(false);
const showLog = ref(false);
const logEl = ref<HTMLElement | null>(null);
let session: SerialLogSession | null = null;

function errText(e: unknown, what: string): string {
  const err = e as { name?: string; message?: string };
  const name = err?.name ?? t('serial_error');
  if (name === 'NotFoundError' || isPortCancelled(e)) {
    // Leere Auswahl: entweder abgebrochen ODER Firefox sieht keinen Port (Treiber fehlt /
    // Port ist von einem anderen Tab wie web.esphome.io belegt).
    return tr('serial_no_port', { what });
  }
  return tr('serial_failed', { what, name, msg: err?.message ?? String(e) });
}

async function flash() {
  if (flashing.value) return;
  const url = esphome.downloadUrl();
  if (!url) { status.value = t('serial_no_build'); return; }
  // Port-Dialog ZUERST (User-Geste), dann erst die Firmware laden.
  let port: unknown;
  try { port = await requestSerialPort(); } catch (e) { status.value = errText(e, t('serial_what_flash')); return; }
  flashing.value = true;
  progress.value = 0;
  status.value = t('serial_loading_fw');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download HTTP ${res.status}`);
    const bin = new Uint8Array(await res.arrayBuffer());
    await flashOverUsb(port, bin, {
      onProgress: (p) => (progress.value = p),
      onLog: (l) => { if (l.trim()) status.value = l.trim().slice(0, 120); },
    });
    status.value = t('serial_flashed');
  } catch (e) {
    status.value = errText(e, t('serial_what_flash'));
  } finally {
    flashing.value = false;
  }
}

async function toggleLogs() {
  if (active.value) {
    await session?.stop();
    session = null;
    active.value = false;
    return;
  }
  let port: unknown;
  try { port = await requestSerialPort(); } catch (e) { status.value = errText(e, t('serial_what_logs')); return; }
  try {
    lines.value = [];
    showLog.value = true;
    session = await openSerialLogs(
      port, 115200,
      (line) => {
        lines.value.push(line);
        if (lines.value.length > 1000) lines.value.splice(0, lines.value.length - 1000);
        queueMicrotask(() => { if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight; });
      },
      () => { active.value = false; },
    );
    active.value = true;
  } catch (e) {
    status.value = errText(e, t('serial_what_port'));
  }
}

/**
 * Logs an die Sidebar-KI übergeben: Seitenleiste öffnen und in den Storage legen.
 *
 * Reihenfolge ist wichtig: Beide Browser verlangen für das Öffnen eine laufende
 * User-Geste, die ein vorheriges `await` verbraucht – deshalb wird ZUERST geöffnet und
 * erst danach gespeichert. Die Seitenleiste holt sich den Storage-Eintrag beim Start bzw.
 * über `storage.onChanged`, die Reihenfolge kostet also nichts.
 */
async function sendToAi() {
  const tail = lines.value.slice(-200).join('\n').slice(-6000);
  if (!tail.trim()) { status.value = t('serial_no_logs'); return; }

  const b = browser as unknown as {
    sidebarAction?: { open: () => Promise<void> };
    sidePanel?: { open: (o: { windowId?: number; tabId?: number }) => Promise<void> };
    windows?: { getCurrent: () => Promise<{ id?: number }> };
  };
  let opened = false;
  try {
    if (b.sidebarAction?.open) {
      // Firefox
      await b.sidebarAction.open();
      opened = true;
    } else if (b.sidePanel?.open) {
      // Chrome: braucht ausdrücklich ein Ziel (Fenster oder Tab).
      const win = await b.windows?.getCurrent();
      if (win?.id != null) {
        await b.sidePanel.open({ windowId: win.id });
        opened = true;
      }
    }
  } catch {
    // Öffnen scheiterte (z. B. Geste verbraucht) – der Hinweis unten deckt das ab.
  }

  await browser.storage.local.set({ serial_handoff: { text: tail, at: Date.now() } });
  status.value = opened
    ? t('serial_logs_sent')
    : t('serial_logs_ready');
}

onBeforeUnmount(() => { session?.stop(); });
</script>

<template>
  <!-- Firefox: Web Serial geht nicht aus der Erweiterung – aufs echte Dashboard verweisen. -->
  <div v-if="firefoxFallback" class="flex items-center gap-2 border-b border-white/10 bg-[#0e1626] px-3 py-1 text-[11px]">
    <span class="text-gray-500">USB:</span>
    <span class="text-gray-400">
      {{ t('serial_firefox_msg') }}
    </span>
    <button
      class="rounded border border-emerald-500/30 px-2 py-0.5 text-emerald-300 hover:bg-emerald-950/40"
      :title="t('serial_open_dashboard_title')"
      @click="openDashboard"
    >
      {{ t('serial_open_dashboard') }}
    </button>
  </div>

  <div v-else-if="usable" class="border-b border-white/10 bg-[#0e1626]">
    <div class="flex items-center gap-1.5 px-3 py-1 text-[11px]">
      <span class="text-gray-500">USB:</span>
      <button
        class="rounded border border-emerald-500/30 px-2 py-0.5 text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
        :disabled="flashing"
        :title="t('serial_usb_flash_title')"
        @click="flash"
      >
        {{ t('serial_usb_flash') }}<span v-if="flashing"> {{ progress }}%</span>
      </button>
      <button
        class="rounded border px-2 py-0.5"
        :class="active ? 'border-red-500/40 text-red-300 hover:bg-red-950/40' : 'border-white/10 text-gray-300 hover:bg-white/5'"
        :title="t('serial_logs_title')"
        @click="toggleLogs"
      >
        {{ active ? t('serial_stop_logs') : t('serial_usb_logs') }}
      </button>
      <span v-if="active" class="flex items-center gap-1 text-emerald-400">
        <span class="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> {{ t('serial_reading') }}
      </span>
      <button
        v-if="lines.length"
        class="rounded border border-blue-500/30 px-2 py-0.5 text-blue-300 hover:bg-blue-950/40"
        :title="t('serial_send_ai_title')"
        @click="sendToAi"
      >
        {{ t('serial_send_ai') }}
      </button>
      <button
        v-if="lines.length"
        class="rounded border border-white/10 px-1.5 py-0.5 text-gray-400 hover:bg-white/5"
        @click="lines = []"
      >
        🧹
      </button>
      <button
        v-if="lines.length"
        class="rounded border border-white/10 px-1.5 py-0.5 text-gray-400 hover:bg-white/5"
        @click="showLog = !showLog"
      >
        {{ showLog ? '▾' : '▸' }}
      </button>
      <div class="flex-1" />
      <span v-if="status" class="max-w-[45%] truncate text-gray-400" :title="status">{{ status }}</span>
    </div>
    <div
      v-if="showLog && lines.length"
      ref="logEl"
      class="max-h-48 overflow-auto border-t border-white/10 bg-[#0b1220] px-3 py-1 font-mono text-[10px] leading-[1.4] text-gray-300"
    >
      <div v-for="(l, i) in lines" :key="i" class="whitespace-pre-wrap break-all">{{ l }}</div>
    </div>
  </div>
</template>
