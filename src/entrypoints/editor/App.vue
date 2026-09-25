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

const showPalette = computed(() => mode.value === 'design');
const showCanvas = computed(() => mode.value !== 'code');
const showPanels = computed(() => mode.value === 'design' || mode.value === 'split');

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
  <main class="flex h-screen w-screen flex-col overflow-hidden bg-[#0b1220] text-gray-200">
    <input
      ref="fileInput"
      type="file"
      accept=".yaml,.yml,.txt"
      class="hidden"
      @change="onFileChosen"
    />

    <!-- Kopfzeile -->
    <header class="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
      <div class="flex items-center gap-2">
        <img src="/icon/128.png" alt="ESPHome LVGL Studio" class="h-7 w-7 shrink-0" />
        <h1 class="text-sm font-semibold text-white">ESPHome LVGL Studio</h1>
        <span class="text-xs text-gray-500">/ Editor</span>
      </div>

      <div class="flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5">
        <button v-for="m in modes" :key="m.id"
          class="rounded-md px-3 py-1 text-xs transition-colors"
          :class="mode === m.id ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'"
          :aria-pressed="mode === m.id"
          @click="mode = m.id">
          {{ m.label }}
        </button>
      </div>

      <div class="flex items-center gap-1.5">
        <button class="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-gray-300 enabled:hover:bg-white/5 disabled:opacity-40"
          :disabled="!doc.canUndo" :title="t('editor_undo')" @click="doc.undo()">↶</button>
        <button class="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-gray-300 enabled:hover:bg-white/5 disabled:opacity-40"
          :disabled="!doc.canRedo" :title="t('editor_redo')" @click="doc.redo()">↷</button>
        <span class="mx-1 text-white/15">|</span>
        <button class="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5" @click="showTemplates = true">{{ t('editor_templates') }}</button>
        <button class="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5" @click="triggerImport">{{ t('editor_import') }}</button>
        <button class="rounded-lg bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:from-blue-600 hover:to-blue-700" @click="exportDownload">{{ t('editor_export') }}</button>
        <button class="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-gray-300 hover:bg-white/5" :title="t('editor_settings')" @click="openOptionsPage">⚙</button>
      </div>
    </header>

    <ConnectionBar @history="showHistory = true" />
    <SerialTools />
    <PageTabs />

    <!-- HA-Entities für Autocomplete im Property-Panel -->
    <datalist id="ha-entities">
      <option v-for="e in ha.entities" :key="e.entity_id" :value="e.entity_id">
        {{ e.friendly_name }}
      </option>
    </datalist>

    <div class="flex min-h-0 flex-1">
      <!-- Links: Widget-Palette + Addons -->
      <div v-if="showPalette" class="flex w-56 shrink-0 flex-col border-r border-white/10 bg-[#0e1626]">
        <PalettePanel @add="addWidget" />
        <AddonsPanel @configure="configureAddon" />
      </div>

      <!-- Mitte: Canvas und/oder Code -->
      <div class="flex min-w-0 flex-1">
        <CanvasStage v-if="showCanvas" :preview="mode === 'preview'" />

        <div v-if="showCode" class="flex min-w-0 flex-1 flex-col border-l border-white/10 bg-[#0e1626]">
          <div class="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">ESPHome YAML</span>
            <span v-if="yamlError" class="text-[10px] text-red-400">{{ yamlError }}</span>
            <span v-else class="text-[10px] text-emerald-400">{{ t('editor_yaml_hint') }}</span>
          </div>
          <CodeEditor :model-value="codeYaml" :highlight-line="selectedCodeLine" @change="applyYaml" />
          <ValidationPanel />
        </div>
      </div>

      <!-- Rechts: Baum + Properties -->
      <aside v-if="showPanels" :aria-label="t('editor_panel_label')" class="w-64 shrink-0 overflow-y-auto border-l border-white/10 bg-[#0e1626] p-3">
        <TreePanel />
        <PropertiesPanel />
      </aside>
    </div>

    <TemplatesModal v-if="showTemplates" @close="showTemplates = false" />
    <VersionHistoryModal v-if="showHistory" @close="showHistory = false" />
    <AddonConfigModal v-if="addonIid" :iid="addonIid" @close="addonIid = null" />
  </main>
</template>
