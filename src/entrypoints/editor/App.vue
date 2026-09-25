<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from '@/shared/i18n';
import { openOptionsPage } from '@/shared/messaging';
import { useDocumentStore } from '@/core/lvgl/document';
import type { WidgetType } from '@/core/lvgl/types';
import PalettePanel from './components/PalettePanel.vue';
import CanvasStage from './components/CanvasStage.vue';
import TreePanel from './components/TreePanel.vue';
import PropertiesPanel from './components/PropertiesPanel.vue';
import ValidationPanel from './components/ValidationPanel.vue';
import ConnectionBar from './components/ConnectionBar.vue';
import SerialTools from './components/SerialTools.vue';
import PageTabs from './components/PageTabs.vue';
import TemplatesModal from './components/TemplatesModal.vue';
import VersionHistoryModal from './components/VersionHistoryModal.vue';
import CodeEditor from './components/CodeEditor.vue';
import AddonsPanel from './components/addons/AddonsPanel.vue';
import AddonConfigModal from './components/addons/AddonConfigModal.vue';
import { useHaStore } from '@/core/ha/store';
import { useDocSync } from '@/shared/docSync';
import { provideDeferredYaml } from './deferredYaml';

const ha = useHaStore();
const { t } = useI18n();
const showTemplates = ref(false);
const showHistory = ref(false);
/** Instanz-id des gerade konfigurierten Addons (null = kein Popup offen). */
const addonIid = ref<string | null>(null);

function configureAddon(iid: string) {
  addonIid.value = iid;
}

type Mode = 'design' | 'split' | 'code' | 'preview';
const mode = ref<Mode>('design');
const doc = useDocumentStore();
const showCode = computed(() => mode.value === 'split' || mode.value === 'code');
const codeYaml = provideDeferredYaml(showCode);

/** Zeile im YAML, in der das aktuell ausgewählte Widget definiert ist (`id: <id>`). */
const selectedCodeLine = computed<number | null>(() => {
  const id = doc.selectedId;
  if (!id) return null;
  const needle = `id: ${id}`;
  const lines = codeYaml.value.split('\n');
  const i = lines.findIndex((l) => l.trim() === needle);
  return i >= 0 ? i + 1 : null;
});
useDocSync(); // Live-Sync mit der Sidebar
const fileInput = ref<HTMLInputElement | null>(null);
const yamlError = ref('');

const modes = computed<{ id: Mode; label: string }[]>(() => [
  { id: 'design', label: t('mode_design') },
  { id: 'split', label: t('mode_split') },
  { id: 'code', label: t('mode_code') },
  { id: 'preview', label: t('mode_preview') },
]);

const showCanvas = computed(() => mode.value !== 'code');
const showPanels = computed(() => mode.value === 'design' || mode.value === 'split');

// Linke Werkzeugleiste: welcher Bereich offen ist (Widgets, Ebenen, Addons).
type RailSection = 'widgets' | 'layers' | 'addons';
const railSection = ref<RailSection>('widgets');
const glyph = (code: number) => String.fromCodePoint(code);
const railItems = computed(() => [
  { id: 'widgets' as const, label: t('rail_widgets'), icon: glyph(0xf1c4f) },
  { id: 'layers' as const, label: t('rail_layers'), icon: glyph(0xf09fe) },
  { id: 'addons' as const, label: t('rail_addons'), icon: glyph(0xf0a66) },
]);

function addWidget(type: WidgetType) {
  doc.addWidget(type, 20, 20);
}

// ---- Import / Export ----------------------------------------------------
function triggerImport() {
  fileInput.value?.click();
}

async function onFileChosen(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    doc.importYaml(text);
    yamlError.value = '';
    mode.value = 'split';
  } catch (e) {
    yamlError.value = t('editor_import_failed') + (e as Error).message;
  }
  input.value = '';
}

function exportDownload() {
  const text = doc.exportedYaml;
  const blob = new Blob([text], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dashboard.yaml';
  a.click();
  URL.revokeObjectURL(url);
}

function applyYaml(text: string) {
  try {
    doc.importYaml(text);
    yamlError.value = '';
  } catch (e) {
    yamlError.value = t('editor_yaml_error') + (e as Error).message;
  }
}

// ---- Tastatur -----------------------------------------------------------
function onKey(ev: KeyboardEvent) {
  const el = ev.target as HTMLElement;
  const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
  const meta = ev.ctrlKey || ev.metaKey;
  if (meta && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
    ev.preventDefault();
    doc.undo();
  } else if (meta && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) {
    ev.preventDefault();
    doc.redo();
  } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && doc.selectedId && !typing) {
    ev.preventDefault();
    if (doc.selectedIds.length > 1) doc.removeSelection();
    else doc.remove(doc.selectedId);
  } else if (ev.key === 'Escape') {
    if (mode.value === 'preview') mode.value = 'design';
    else doc.select(null);
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <main class="flex h-screen w-screen flex-col overflow-hidden bg-app text-gray-200">
    <input
      ref="fileInput"
      type="file"
      accept=".yaml,.yml,.txt"
      class="hidden"
      @change="onFileChosen"
    />

    <!-- Kopfzeile: Marke · geöffnetes Gerät · Modus · Aktionen.
         flex-wrap: bei schmalem Fenster/hohem Zoom umbrechen statt Knöpfe abzuschneiden. -->
    <header class="flex min-h-11 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-panel px-3 py-1">
      <div class="flex items-center gap-2">
        <img src="/icon/128.png" alt="ESPHome LVGL Studio" class="h-6 w-6 shrink-0" />
        <h1 class="whitespace-nowrap text-[13px] font-semibold tracking-tight text-white">ESPHome LVGL Studio</h1>
      </div>

      <!-- Gerät (Inhalt kommt aus ConnectionBar per Teleport) -->
      <div id="header-device" class="flex min-w-0 flex-1 items-center" />

      <div class="flex items-center gap-3 text-xs">
        <button v-for="m in modes" :key="m.id"
          class="border-b-2 px-0.5 py-1.5 transition-colors"
          :class="mode === m.id ? 'border-blue-400 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'"
          :aria-pressed="mode === m.id"
          @click="mode = m.id">
          {{ m.label }}
        </button>
      </div>

      <div class="flex items-center gap-1">
        <button class="mdi-glyph rounded-md px-1.5 py-1 text-base leading-none text-gray-300 enabled:hover:bg-white/10 disabled:opacity-40"
          :disabled="!doc.canUndo" :title="t('editor_undo')" :aria-label="t('editor_undo')" @click="doc.undo()">{{ glyph(0xf054c) }}</button>
        <button class="mdi-glyph rounded-md px-1.5 py-1 text-base leading-none text-gray-300 enabled:hover:bg-white/10 disabled:opacity-40"
          :disabled="!doc.canRedo" :title="t('editor_redo')" :aria-label="t('editor_redo')" @click="doc.redo()">{{ glyph(0xf044e) }}</button>
        <span class="mx-1 h-4 w-px bg-white/10" aria-hidden="true" />
        <button class="rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-white/10" @click="triggerImport">{{ t('editor_import') }}</button>
        <button class="rounded-md px-2 py-1 text-xs text-gray-300 hover:bg-white/10" @click="exportDownload">{{ t('editor_export') }}</button>
        <button class="mdi-glyph rounded-md px-1.5 py-1 text-base leading-none text-gray-300 hover:bg-white/10" :title="t('editor_settings')" :aria-label="t('editor_settings')" @click="openOptionsPage">{{ glyph(0xf08bb) }}</button>
      </div>
    </header>

    <!-- HA-Entities für Autocomplete im Property-Panel -->
    <datalist id="ha-entities">
      <option v-for="e in ha.entities" :key="e.entity_id" :value="e.entity_id">
        {{ e.friendly_name }}
      </option>
    </datalist>

    <div class="flex min-h-0 flex-1">
      <!-- Werkzeugleiste links: Bereiche + Vorlagen -->
      <nav v-if="showPanels" :aria-label="t('rail_label')" class="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-white/10 bg-panel py-2">
        <button
          v-for="r in railItems"
          :key="r.id"
          class="flex w-12 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[9px]"
          :class="railSection === r.id ? 'bg-blue-600/25 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'"
          :aria-pressed="railSection === r.id"
          :title="r.label"
          @click="railSection = r.id"
        >
          <span class="mdi-glyph text-lg leading-none" aria-hidden="true">{{ r.icon }}</span>
          {{ r.label }}
        </button>
        <span class="my-1 h-px w-8 bg-white/10" aria-hidden="true" />
        <button
          class="flex w-12 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[9px] text-gray-400 hover:bg-white/5 hover:text-gray-200"
          :title="t('editor_templates')"
          @click="showTemplates = true"
        >
          <span class="mdi-glyph text-lg leading-none" aria-hidden="true">{{ glyph(0xf0a1d) }}</span>
          {{ t('rail_templates') }}
        </button>
      </nav>

      <!-- Bereich zur Werkzeugleiste -->
      <div v-if="showPanels" class="flex w-60 shrink-0 flex-col border-r border-white/10 bg-panel">
        <PalettePanel v-if="railSection === 'widgets'" @add="addWidget" />
        <aside v-else-if="railSection === 'layers'" :aria-label="t('rail_layers')" class="min-h-0 flex-1 overflow-y-auto p-3">
          <TreePanel />
        </aside>
        <AddonsPanel v-else @configure="configureAddon" />
      </div>

      <!-- Mitte: Seiten-Reiter + Canvas und/oder Code -->
      <section class="flex min-w-0 flex-1 flex-col">
        <PageTabs />
        <div class="flex min-h-0 flex-1">
          <CanvasStage v-if="showCanvas" :preview="mode === 'preview'" />

          <div v-if="showCode" class="flex min-w-0 flex-1 flex-col border-l border-white/10 bg-panel">
            <div class="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
              <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">ESPHome YAML</span>
              <span v-if="yamlError" class="text-[10px] text-red-400">{{ yamlError }}</span>
              <span v-else class="text-[10px] text-emerald-400">{{ t('editor_yaml_hint') }}</span>
            </div>
            <CodeEditor :model-value="codeYaml" :highlight-line="selectedCodeLine" @change="applyYaml" />
            <ValidationPanel />
          </div>
        </div>
      </section>

      <!-- Rechts: Eigenschaften -->
      <aside v-if="showPanels" :aria-label="t('editor_panel_label')" class="w-72 shrink-0 overflow-y-auto border-l border-white/10 bg-panel p-3">
        <PropertiesPanel />
      </aside>
    </div>

    <!-- Statusleiste: Verbindung · USB · (rechts) Canvas-Werkzeuge -->
    <footer :aria-label="t('statusbar_label')" class="relative flex min-h-8 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 bg-panel px-3 py-1 text-[11px]">
      <ConnectionBar @history="showHistory = true" />
      <SerialTools />
      <div class="flex-1" />
      <div id="statusbar-canvas" class="flex items-center" />
    </footer>

    <TemplatesModal v-if="showTemplates" @close="showTemplates = false" />
    <VersionHistoryModal v-if="showHistory" @close="showHistory = false" />
    <AddonConfigModal v-if="addonIid" :iid="addonIid" @close="addonIid = null" />
  </main>
</template>

<style scoped>
.mdi-glyph {
  font-family: 'Material Design Icons', sans-serif;
}
</style>
