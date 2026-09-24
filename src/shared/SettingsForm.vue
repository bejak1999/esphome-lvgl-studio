<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useSettingsStore } from '@/shared/settings';
import { formatTokens, useModelList } from '@/shared/models';
import { openOptionsPage } from '@/shared/messaging';
import { useI18n } from '@/shared/i18n';

/**
 * Gemeinsames Einstellungs-Formular für Sidebar UND Options-Seite – damit es die
 * Einstellungen nur EINMAL gibt und beide Orte exakt dasselbe zeigen/speichern.
 * Persistiert dauerhaft in browser.storage.local, sodass man nichts erneut eingeben muss.
 */
const settings = useSettingsStore();
const saved = ref(false);
const { t } = useI18n();
const {
  models,
  loading: modelsLoading,
  error: modelsError,
  custom: customModel,
  load: loadModels,
  syncContextLength,
  count: modelCount,
} = useModelList(settings);

onMounted(async () => {
  if (!settings.loaded) await settings.load();
  if (settings.settings.ai.apiKey && !models.value.length) loadModels();
});

async function save() {
  syncContextLength();
  await settings.save();
  saved.value = true;
  setTimeout(() => (saved.value = false), 1600);
}
</script>

<template>
  <div class="space-y-3 text-[11px]">
    <!-- Language -->
    <div>
      <label class="mb-1 block font-semibold uppercase tracking-wide text-gray-500">{{ t('settings_language') }}</label>
      <select v-model="settings.settings.language" class="set-input">
        <option value="en">🇬🇧 English</option>
        <option value="de">🇩🇪 Deutsch</option>
      </select>
    </div>

    <div>
      <p class="mb-1 font-semibold uppercase tracking-wide text-gray-500">{{ t('settings_title_esphome') }}</p>
      <label class="block text-gray-400">{{ t('settings_url') }}</label>
      <input v-model="settings.settings.esphome.url" class="set-input" placeholder="http://192.168.1.10:6052" />
      <label class="mt-1.5 block text-gray-400">{{ t('settings_token_optional') }}</label>
      <input v-model="settings.settings.esphome.token" type="password" class="set-input" />
    </div>

    <div>
      <p class="mb-1 font-semibold uppercase tracking-wide text-gray-500">{{ t('settings_title_ha') }}</p>
      <label class="block text-gray-400">{{ t('settings_base_url') }}</label>
      <input v-model="settings.settings.ha.url" class="set-input" placeholder="http://homeassistant.local:8123" />
      <label class="mt-1.5 block text-gray-400">{{ t('settings_long_lived_token') }}</label>
      <input v-model="settings.settings.ha.token" type="password" class="set-input" />
    </div>

    <div>
      <p class="mb-1 font-semibold uppercase tracking-wide text-gray-500">{{ t('settings_title_ai') }}</p>
      <label class="block text-gray-400">{{ t('settings_api_key') }}</label>
      <input v-model="settings.settings.ai.apiKey" type="password" class="set-input" placeholder="sk-or-…" />

      <div class="mt-1.5 flex items-center justify-between">
        <label class="text-gray-400">{{ t('settings_model') }}</label>
        <div class="flex items-center gap-2 text-[10px]">
          <button type="button" class="text-blue-400 hover:underline disabled:opacity-50" :disabled="modelsLoading" :title="t('settings_load_list')" @click="loadModels">
            {{ modelsLoading ? t('settings_loading') : `${t('settings_load_list')}${modelCount ? ` (${modelCount})` : ''}` }}
          </button>
          <label class="flex items-center gap-1 text-gray-400" :title="t('settings_enter_manually')">
            <input v-model="customModel" type="checkbox" /> {{ t('settings_enter_manually') }}
          </label>
        </div>
      </div>
      <select v-if="!customModel && models.length" v-model="settings.settings.ai.model" :aria-label="t('settings_model')" class="set-input" @change="syncContextLength">
        <option v-for="m in models" :key="m.id" :value="m.id">
          {{ m.name || m.id }}{{ m.context_length ? ` – ${formatTokens(m.context_length)}` : '' }}
        </option>
      </select>
      <input v-else v-model="settings.settings.ai.model" :aria-label="t('settings_model')" class="set-input" placeholder="google/gemini-2.0-flash-001" />
      <p v-if="modelsError" class="mt-1 text-[10px] text-amber-400">{{ modelsError }}</p>
      <p v-else class="mt-1 text-[10px] text-gray-500">{{ t('settings_only_vision_models') }}</p>

      <label class="mt-1.5 block text-gray-400">{{ t('settings_base_url_ai') }}</label>
      <input v-model="settings.settings.ai.baseUrl" class="set-input" />
    </div>

    <div>
      <p class="mb-1 font-semibold uppercase tracking-wide text-gray-500">{{ t('settings_title_addons') }}</p>
      <p class="text-[10px] leading-snug text-gray-500">
        {{ t('settings_addons_hint') }}
        <button type="button" class="text-blue-400 hover:underline" @click="openOptionsPage">
          {{ t('settings_open_settings') }}
        </button>
      </p>
    </div>

    <div>
      <p class="mb-1 font-semibold uppercase tracking-wide text-gray-500">{{ t('settings_title_schema') }}</p>
      <label class="block text-gray-400">{{ t('settings_schema_version') }}</label>
      <input v-model="settings.settings.schema.version" class="set-input" placeholder="dev" />
    </div>

    <div class="flex items-center justify-between pt-1">
      <span v-if="saved" class="text-[11px] text-emerald-400">{{ t('settings_saved') }}</span>
      <span v-else class="text-[10px] text-gray-500">{{ t('settings_persistent') }}</span>
      <button class="rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700" @click="save">
        {{ t('settings_save') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.set-input {
  width: 100%;
  border-radius: 0.375rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #0b1220;
  padding: 0.3rem 0.5rem;
  font-size: 11px;
  color: #e5e7eb;
}
.set-input:focus {
  border-color: rgba(59, 130, 246, 0.6);
  outline: none;
}
</style>
