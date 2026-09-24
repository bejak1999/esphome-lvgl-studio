<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentStore } from '@/core/lvgl/document';
import { useSchemaStore } from '@/core/schema/store';
import { useSettingsStore } from '@/shared/settings';
import { useEsphomeStore } from '@/core/esphome/store';
import { useI18n } from '@/shared/i18n';

const doc = useDocumentStore();
const schema = useSchemaStore();
const settings = useSettingsStore();
const esphome = useEsphomeStore();
const { t } = useI18n();

const issues = computed(() => (schema.loaded ? schema.validate(doc.exportedYaml) : []));
const warnings = computed(() => issues.value.filter((i) => i.level === 'warning'));
const infos = computed(() => issues.value.filter((i) => i.level === 'info'));

async function loadAndCheck() {
  const version = settings.loaded ? settings.settings.schema.version : 'dev';
  await schema.loadLvgl(version || 'dev');
}

async function liveValidate() {
  try {
    await esphome.validate(doc.exportedYaml);
  } catch {
    /* Fehler steht in esphome.error / Verbindung */
  }
}
</script>

<template>
  <div class="border-t border-white/10 bg-[#0b1220]">
    <div class="flex items-center justify-between px-3 py-1.5">
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{{ t('val_title') }}</span>
        <span v-if="schema.loaded" class="text-[10px] text-gray-500">Schema {{ schema.version }} · {{ schema.widgetTypes.length }} Widgets</span>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="schema.loading" class="text-[10px] text-gray-400">{{ t('val_loading') }}</span>
        <template v-else-if="schema.loaded">
          <span v-if="issues.length === 0" class="text-[10px] text-emerald-400">{{ t('val_no_issues') }}</span>
          <span v-else class="text-[10px] text-amber-400">{{ warnings.length }} ⚠ · {{ infos.length }} ℹ</span>
          <button class="rounded border border-white/10 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-white/5" @click="loadAndCheck">{{ t('val_reload') }}</button>
        </template>
        <button v-else class="rounded border border-white/10 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-white/5" @click="loadAndCheck">
          {{ t('val_load_check') }}
        </button>
      </div>
    </div>

    <div v-if="schema.error" class="px-3 pb-2 text-[10px] text-red-400">
      {{ `${t('val_schema_error')}${schema.error}` }}
    </div>

    <ul v-if="schema.loaded && issues.length" class="max-h-32 overflow-y-auto px-3 pb-2" tabindex="0">
      <li v-for="(issue, i) in issues" :key="i" class="flex items-start gap-2 py-0.5 text-[11px]">
        <span :class="issue.level === 'warning' ? 'text-amber-400' : 'text-sky-400'">
          {{ issue.level === 'warning' ? '⚠' : 'ℹ' }}
        </span>
        <span class="text-gray-300">
          <span v-if="issue.widgetId" class="text-gray-500">{{ issue.widgetId }}: </span>{{ issue.message }}
        </span>
      </li>
    </ul>

    <!-- Live-Validierung gegen die echte ESPHome-Instanz -->
    <div class="flex items-center justify-between border-t border-white/5 px-3 py-1.5">
      <div class="flex items-center gap-2">
        <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{{ t('val_live_title') }}</span>
        <span v-if="esphome.validating" class="text-[10px] text-gray-400">{{ t('val_checking') }}</span>
        <span v-else-if="!esphome.connected" class="text-[10px] text-gray-600">{{ t('val_not_connected') }}</span>
        <span v-else-if="esphome.deviceIssues.length === 0" class="text-[10px] text-emerald-400">{{ t('val_valid') }}</span>
        <span v-else class="text-[10px] text-red-400">{{ esphome.deviceIssues.length }}{{ t('val_errors') }}</span>
      </div>
      <button
        class="rounded border border-white/10 px-2 py-0.5 text-[10px] text-gray-300 hover:bg-white/5 disabled:opacity-50"
        :disabled="!esphome.connected || esphome.validating"
        @click="liveValidate"
      >
        {{ t('val_live_check') }}
      </button>
    </div>
    <ul v-if="esphome.deviceIssues.length" class="max-h-32 overflow-y-auto px-3 pb-2" tabindex="0">
      <li v-for="(iss, i) in esphome.deviceIssues" :key="i" class="flex items-start gap-2 py-0.5 text-[11px]">
        <span class="text-red-400">✕</span>
        <span class="text-gray-300">
          <span v-if="iss.line" class="text-gray-500">Z{{ iss.line }}: </span>{{ iss.message }}
        </span>
      </li>
    </ul>
  </div>
</template>
