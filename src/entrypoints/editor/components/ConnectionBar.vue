<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from '@/shared/i18n';
import { useSettingsStore } from '@/shared/settings';
import { useEsphomeStore } from '@/core/esphome/store';
import { useHaStore } from '@/core/ha/store';
import { useSchemaStore } from '@/core/schema/store';
import { useDocumentStore } from '@/core/lvgl/document';
import { useVersionStore } from '@/shared/versions';
import { browser } from 'wxt/browser';

const settings = useSettingsStore();
const { t } = useI18n();
const esphome = useEsphomeStore();
const ha = useHaStore();
const schema = useSchemaStore();
const doc = useDocumentStore();
const versions = useVersionStore();
const selectedConfig = ref('');
const saveStatus = ref('');

onMounted(async () => {
  await settings.load();
  // Beim Öffnen (z. B. aus der Sidebar) automatisch verbinden und – falls per URL ein
  // Gerät übergeben wurde (?device=…) – dieses laden. So muss man sich nicht neu verbinden.
  if (settings.settings.esphome.url && !esphome.connected) {
    await connectEsphome();
    const device = new URLSearchParams(location.search).get('device');
    if (device && esphome.connected) {
      selectedConfig.value = device;
      await openDevice();
    }
    // Handoff aus der Sidebar: exakt den dortigen (auch ungespeicherten) Stand übernehmen.
    try {
      const { handoff } = await browser.storage.local.get('handoff');
      const h = handoff as { device?: string; yaml?: string } | undefined;
      if (h?.yaml && (!device || h.device === device)) {
        if (h.device) esphome.currentConfiguration = h.device;
        doc.importYaml(h.yaml);
      }
      await browser.storage.local.remove('handoff');
    } catch {
      /* ignore */
    }
  }
});

async function connectEsphome() {
  if (esphome.connected) {
    esphome.disconnect();
    selectedConfig.value = '';
    return;
  }
  // Noch keine URL eingetragen (Erststart) → direkt zu den Einstellungen.
  if (!settings.settings.esphome.url) {
    await browser.runtime.openOptionsPage();
    return;
  }
  try {
    await esphome.connect(settings.settings.esphome.url, settings.settings.esphome.token);
    // Schema/Docs exakt auf die Version DER Instanz pinnen.
    const version = esphome.esphomeVersion;
    if (version) {
      settings.settings.schema.version = version;
      await schema.loadLvgl(version);
    }
    // Geräte-Liste laden, damit man das richtige Gerät wählen kann.
    await esphome.loadDevices().catch(() => {});
  } catch {
    /* Fehler steht in esphome.error */
  }
}

async function openDevice() {
  if (!selectedConfig.value) return;
  try {
    const yaml = await esphome.openDevice(selectedConfig.value);
    await versions.load(selectedConfig.value);
    // Den geladenen Stand als Ausgangspunkt in die Historie legen.
    await versions.snapshot(yaml, 'Gerät geladen');
    doc.importYaml(yaml); // lädt das echte Geräte-YAML in den Editor
  } catch (e) {
    esphome.error = (e as Error).message;
  }
}

async function saveDevice() {
  try {
    const yaml = doc.exportedYaml;
    // Vor dem Überschreiben auf dem Gerät einen Wiederherstellungspunkt sichern.
    if (esphome.currentConfiguration && versions.device !== esphome.currentConfiguration) {
      await versions.load(esphome.currentConfiguration);
    }
    await versions.snapshot(yaml, 'Gerät gespeichert');
    await esphome.saveDevice(yaml);
    doc.markSaved();
    saveStatus.value = t('conn_saved');
    setTimeout(() => (saveStatus.value = ''), 2000);
  } catch (e) {
    saveStatus.value = 'Error: ' + (e as Error).message;
  }
}

const emit = defineEmits<{ history: [] }>();

function loadEntities() {
  ha.load(settings.settings.ha.url, settings.settings.ha.token);
}
</script>

<template>
  <div class="flex items-center gap-3 border-b border-white/10 bg-[#0e1626] px-3 py-1.5 text-[11px]">
    <!-- ESPHome -->
    <div class="flex items-center gap-2">
      <span
        class="inline-block h-2 w-2 rounded-full"
        :class="esphome.connected ? 'bg-emerald-400' : esphome.error ? 'bg-red-400' : 'bg-gray-600'"
      />
      <span class="text-gray-400">ESPHome</span>
      <template v-if="esphome.connected">
        <span class="text-gray-300">
          v{{ esphome.esphomeVersion ?? '?' }}
          <span v-if="esphome.serverInfo?.server_version" class="text-gray-500">· builder {{ esphome.serverInfo.server_version }}</span>
        </span>
        <button class="rounded border border-white/10 px-2 py-0.5 text-gray-400 hover:bg-white/5" @click="connectEsphome">{{ t('conn_disconnect') }}</button>

        <!-- Gerät folgt der Seitenleiste (docSync). Nur ohne aktives Gerät zur Auswahl anbieten. -->
        <span
          v-if="esphome.currentConfiguration"
          class="text-gray-300"
          :title="t('conn_synced_title')"
        >
          {{ esphome.currentConfiguration }}
          <span class="text-gray-600">{{ t('conn_synced') }}</span>
        </span>
        <select
          v-else
          v-model="selectedConfig"
          class="rounded border border-white/10 bg-[#111827] px-1.5 py-0.5 text-gray-200 focus:outline-none"
          @change="openDevice"
        >
          <option value="" disabled>{{ t('conn_select_device') }}</option>
          <option v-for="d in esphome.devices" :key="d.configuration" :value="d.configuration">
            {{ d.friendly_name || d.name }} ({{ d.configuration }})
          </option>
        </select>
        <button
          v-if="esphome.currentConfiguration"
          class="rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5"
          :title="t('conn_save_device_title')"
          @click="saveDevice"
        >
          {{ t('conn_save_device') }}
        </button>
        <!-- Hinweis auf ungespeicherte Änderungen -->
        <span
          v-if="esphome.currentConfiguration && doc.dirty && !saveStatus"
          class="flex items-center gap-1 text-amber-400"
          :title="t('conn_unsaved_title')"
        >
          <span class="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
          {{ t('conn_unsaved') }}
        </span>
        <span v-if="saveStatus" class="text-emerald-400">{{ saveStatus }}</span>
        <button
          v-if="esphome.currentConfiguration"
          class="rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5"
          :title="t('conn_history_title')"
          @click="emit('history')"
        >
          {{ t('conn_history') }}
        </button>
      </template>
      <template v-else>
        <button
          class="rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5 disabled:opacity-50"
          :disabled="esphome.connecting"
          @click="connectEsphome"
        >
          {{ esphome.connecting ? t('conn_connecting') : t('conn_connect') }}
        </button>
        <span v-if="esphome.error" class="max-w-72 truncate text-red-400" :title="esphome.error">{{ esphome.error }}</span>
      </template>
    </div>

    <span class="text-white/10">|</span>

    <!-- Home Assistant -->
    <div class="flex items-center gap-2">
      <span
        class="inline-block h-2 w-2 rounded-full"
        :class="ha.entities.length ? 'bg-emerald-400' : ha.error ? 'bg-red-400' : 'bg-gray-600'"
      />
      <span class="text-gray-400">Home Assistant</span>
      <span v-if="ha.entities.length" class="text-gray-300">{{ ha.entities.length }} Entities</span>
      <button
        class="rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5 disabled:opacity-50"
        :disabled="ha.loading"
        @click="loadEntities"
      >
        {{ ha.loading ? t('conn_loading') : t('conn_load_entities') }}
      </button>
      <span v-if="ha.error" class="max-w-72 truncate text-red-400" :title="ha.error">{{ ha.error }}</span>
    </div>
  </div>
</template>
