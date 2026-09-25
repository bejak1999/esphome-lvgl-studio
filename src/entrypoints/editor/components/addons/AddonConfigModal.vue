<script setup lang="ts">
/**
 * Konfigurations-Popup einer Addon-Instanz: Felder aus dem Manifest, Live-Vorschau und
 * (eingeklappt) die Installations-Einstellungen des Addons – die braucht man z. B. beim
 * ersten Frigate-Addon sofort, ohne den Umweg über die Options-Seite.
 */
import { computed, ref, watch } from 'vue';
import { useAddons } from '@/core/addons/useAddons';
import { resolvePreviewUrl, testCondition, withDefaults } from '@/core/addons/apply';
import type { AddonInstance } from '@/core/addons/types';
import AddonField from '@/shared/addons/AddonField.vue';
import { useI18n } from '@/shared/i18n';

const props = defineProps<{ iid: string }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { doc, store, manifestOf, context, apply } = useAddons();
const { t } = useI18n();

const instance = computed<AddonInstance | null>(() => doc.addonInstance(props.iid));
const manifest = computed(() => (instance.value ? manifestOf(instance.value) : null));

/** Arbeitskopie: erst „Übernehmen" schreibt ins Dokument (ein Undo-Schritt je Änderung). */
const draft = ref<Record<string, unknown>>({});
const name = ref('');
const settingsDraft = ref<Record<string, unknown>>({});
const showSettings = ref(false);
const applied = ref(false);

watch(
  () => [props.iid, manifest.value?.id] as const,
  () => {
    const inst = instance.value;
    const m = manifest.value;
    if (!inst || !m) return;
    draft.value = withDefaults(m.fields, inst.config);
    name.value = inst.name ?? m.name;
    settingsDraft.value = store.settingsFor(m.id);
    // Ohne ausgefüllte Pflicht-Einstellungen (z. B. Frigate-URL) direkt aufklappen.
    showSettings.value = (m.settings ?? []).some((f) => !settingsDraft.value[f.key]);
  },
  { immediate: true },
);

/** Kontext für Templates/Feld-Sichtbarkeit – nutzt die Arbeitskopien, nicht das Dokument. */
const ctx = computed(() => {
  const m = manifest.value;
  if (!m) return {};
  return {
    ...context(m, props.iid, draft.value),
    // Einstellungen aus der Arbeitskopie überschreiben die gespeicherten,
    // damit die Vorschau sofort auf eine getippte URL reagiert.
    settings: withDefaults(m.settings, settingsDraft.value),
  };
});

const visibleFields = computed(() =>
  (manifest.value?.fields ?? []).filter((f) => testCondition(f.visibleIf, ctx.value)),
);
const visibleSettings = computed(() =>
  (manifest.value?.settings ?? []).filter((f) => testCondition(f.visibleIf, ctx.value)),
);

const previewUrl = computed(() => (manifest.value ? resolvePreviewUrl(manifest.value, ctx.value) : ''));
const previewError = ref(false);
watch(previewUrl, () => (previewError.value = false));

/** Erzeugte Widgets/YAML als Kurzinfo – hilft beim Verstehen und beim Fehlersuchen. */
const summary = computed(() => {
  const m = manifest.value;
  if (!m) return { widgets: [] as string[], yaml: '' };
  const ids = instance.value?.widgetIds ?? {};
  return {
    widgets: Object.entries(ids).map(([k, id]) => `${k} → ${id}`),
    yaml: m.yaml ?? '',
  };
});

async function saveSettings() {
  const m = manifest.value;
  if (!m) return;
  await store.saveSettings(m.id, settingsDraft.value);
}

async function applyNow() {
  const m = manifest.value;
  if (!m) return;
  await saveSettings();
  doc.updateAddonInstance(props.iid, { name: name.value });
  apply(m, props.iid, draft.value);
  applied.value = true;
  setTimeout(() => (applied.value = false), 1400);
}

function removeInstance() {
  doc.removeAddonInstance(props.iid);
  emit('close');
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-panel">
      <header class="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div class="flex min-w-0 items-center gap-2">
          <span class="text-lg">{{ manifest?.icon ?? '🧩' }}</span>
          <div class="min-w-0">
            <h2 class="truncate text-sm font-semibold text-white">{{ manifest?.name ?? instance?.addon }}</h2>
            <p class="truncate text-[10px] text-gray-500">
              {{ instance?.addon }} · v{{ manifest?.version ?? '?' }} · {{ iid }}
            </p>
          </div>
        </div>
        <button class="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white" :title="t('common_close')" :aria-label="t('common_close')" @click="emit('close')">✕</button>
      </header>

      <div v-if="!manifest" class="p-6 text-[12px] text-amber-400">
        {{ t('addon_config_not_installed').replace('{id}', instance?.addon ?? '') }}
      </div>

      <div v-else class="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1fr_260px]">
        <!-- Felder -->
        <div class="min-w-0 space-y-3">
          <p v-if="manifest.description" class="text-[11px] leading-snug text-gray-400">
            {{ manifest.description }}
          </p>

          <div>
            <label class="mb-1 block text-[11px] text-gray-300">{{ t('addon_config_name_label') }}</label>
            <input
              v-model="name"
              class="w-full rounded-lg border border-white/10 bg-field px-2 py-1 text-[11px] text-gray-100 focus:border-blue-500/60 focus:outline-none"
            />
          </div>

          <AddonField
            v-for="f in visibleFields"
            :key="f.key"
            :spec="f"
            :ctx="ctx"
            :model-value="draft[f.key]"
            @update:model-value="draft[f.key] = $event"
          />

          <!-- Installations-Einstellungen -->
          <section v-if="visibleSettings.length" class="rounded-lg border border-white/10 bg-white/5 p-2.5">
            <button
              class="mb-1 flex w-full items-center justify-between text-[11px] font-semibold text-gray-300"
              @click="showSettings = !showSettings"
            >
              <span>{{ t('addon_config_settings_title') }}</span>
              <span class="text-gray-500">{{ showSettings ? '▾' : '▸' }}</span>
            </button>
            <div v-if="showSettings" class="space-y-3 pt-1">
              <AddonField
                v-for="f in visibleSettings"
                :key="f.key"
                :spec="f"
                :ctx="ctx"
                :model-value="settingsDraft[f.key]"
                @update:model-value="settingsDraft[f.key] = $event"
              />
            </div>
          </section>
        </div>

        <!-- Vorschau + Info -->
        <section class="min-w-0 space-y-2">
          <div v-if="manifest.preview">
            <p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{{ t('addon_config_preview') }}</p>
            <div class="flex min-h-24 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-field p-1">
              <img
                v-if="previewUrl && !previewError"
                :src="previewUrl"
                alt="Vorschau"
                class="max-h-48 w-full object-contain"
                @error="previewError = true"
              />
              <span v-else class="px-2 py-6 text-center text-[10px] text-gray-500">
                {{ previewUrl ? t('addon_config_preview_error') : t('addon_config_preview_no_url') }}
              </span>
            </div>
            <p v-if="previewUrl" class="mt-1 break-all text-[9px] leading-snug text-gray-600">{{ previewUrl }}</p>
          </div>

          <div v-if="summary.widgets.length">
            <p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{{ t('addon_config_generated_widgets') }}</p>
            <ul class="space-y-0.5 text-[10px] text-gray-400">
              <li v-for="w in summary.widgets" :key="w" class="truncate">{{ w }}</li>
            </ul>
          </div>

          <div v-if="summary.yaml">
            <p class="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{{ t('addon_config_additional_yaml') }}</p>
            <pre class="overflow-x-auto rounded-lg border border-white/10 bg-field p-2 text-[10px] text-gray-400">{{ summary.yaml }}</pre>
          </div>
        </section>
      </div>

      <footer v-if="manifest" class="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
        <button class="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/40" @click="removeInstance">
          {{ t('addon_config_remove') }}
        </button>
        <div class="flex items-center gap-2">
          <span v-if="applied" class="text-[11px] text-emerald-400">{{ t('addon_config_applied') }}</span>
          <button class="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5" @click="emit('close')">
            {{ t('addon_config_close') }}
          </button>
          <button
            class="rounded-lg bg-gradient-to-b from-blue-500 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:from-blue-600 hover:to-blue-700"
            @click="applyNow"
          >
            {{ t('addon_config_apply') }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>
