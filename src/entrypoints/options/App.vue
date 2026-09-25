<script setup lang="ts">
import SettingsForm from '@/shared/SettingsForm.vue';
import AddonsSettings from '@/shared/addons/AddonsSettings.vue';
import { useI18n } from '@/shared/i18n';
import { useSettingsStore } from '@/shared/settings';
import { onMounted } from 'vue';

const settings = useSettingsStore();
const { t } = useI18n();

onMounted(async () => {
  if (!settings.loaded) await settings.load();
});
</script>

<template>
  <main class="mx-auto max-w-3xl p-6 text-gray-200">
    <div class="mb-4 flex items-center gap-3">
      <img src="/icon/128.png" alt="ESPHome LVGL Studio" class="h-9 w-9 shrink-0" />
      <div>
        <h1 class="text-lg font-semibold text-white">{{ t('options_page_title') }}</h1>
        <p class="text-xs text-gray-500">{{ t('options_subtitle') }}</p>
      </div>
    </div>

    <p class="mb-4 rounded-lg border border-white/10 bg-panel px-3 py-2 text-[11px] text-gray-400">
      {{ t('options_shared_hint') }}
    </p>

    <div class="grid gap-4 md:grid-cols-2">
      <div class="rounded-xl border border-white/10 bg-panel p-4">
        <SettingsForm />
      </div>

      <div class="rounded-xl border border-white/10 bg-panel p-4">
        <div class="mb-2 flex items-center gap-2">
          <h2 class="text-sm font-semibold text-white">{{ t('options_addons_title') }}</h2>
          <span class="text-[10px] text-gray-500">{{ t('options_addons_subtitle') }}</span>
        </div>
        <AddonsSettings />
      </div>
    </div>
  </main>
</template>
