<script setup lang="ts">
/**
 * Feldtyp `remote-select`: Auswahlliste, deren Optionen zur Laufzeit von einer URL
 * geladen werden (z. B. die Kameraliste aus `Frigate/api/config`).
 *
 * `itemsPath` zeigt auf die Liste ODER auf ein Objekt – bei einem Objekt sind die
 * Schlüssel die Werte (genau so liefert Frigate seine Kameras). Ist der Endpunkt nicht
 * erreichbar, kann der Wert immer von Hand eingetragen werden.
 */
import { computed, onMounted, ref, watch } from 'vue';
import type { FieldSpec } from '@/core/addons/types';
import { getPath, render } from '@/core/addons/template';
import type { TemplateContext } from '@/core/addons/template';
import { tr, useI18n } from '@/shared/i18n';
import { hasHostAccess, hostLabel, requestHostAccess } from '@/shared/hostAccess';
const { t } = useI18n();

const props = defineProps<{
  spec: FieldSpec;
  ctx: TemplateContext;
  modelValue: unknown;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: unknown): void }>();

interface Option {
  value: string;
  label: string;
}

const options = ref<Option[]>([]);
const loading = ref(false);
const error = ref('');
const manual = ref(false);

const url = computed(() => (props.spec.url ? render(props.spec.url, props.ctx).trim() : ''));

function toOptions(data: unknown): Option[] {
  if (Array.isArray(data)) {
    return data.map((it) => {
      if (it == null || typeof it !== 'object') return { value: String(it), label: String(it) };
      const rec = it as Record<string, unknown>;
      const value = String(rec[props.spec.valueKey ?? 'id'] ?? rec.name ?? '');
      const label = String(rec[props.spec.labelKey ?? 'name'] ?? value);
      return { value, label };
    }).filter((o) => o.value);
  }
  if (data && typeof data === 'object') {
    return Object.entries(data as Record<string, unknown>).map(([key, v]) => {
      const label =
        props.spec.labelKey && v && typeof v === 'object'
          ? String((v as Record<string, unknown>)[props.spec.labelKey] ?? key)
          : key;
      return { value: key, label };
    });
  }
  return [];
}

/** @param interactive true aus dem Neu-laden-Klick → fehlende Host-Berechtigung erfragen. */
async function load(interactive = false) {
  if (!url.value) {
    error.value = t('remote_no_url');
    options.value = [];
    return;
  }
  const access = interactive ? requestHostAccess([url.value]) : hasHostAccess([url.value]);
  if (!(await access)) {
    error.value = t('host_access_missing').replace('{host}', hostLabel(url.value)) + ' ⟳';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch(url.value, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as unknown;
    const data = props.spec.itemsPath ? getPath(json as Record<string, unknown>, props.spec.itemsPath) : json;
    options.value = toOptions(data);
    if (!options.value.length) error.value = t('remote_empty');
    // Noch nichts gewählt → erste Option übernehmen, damit die Vorschau sofort etwas zeigt.
    if (!props.modelValue && options.value.length) emit('update:modelValue', options.value[0].value);
  } catch (e) {
    error.value = `${(e as Error).message} – Wert ggf. von Hand eintragen.`;
    options.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => load());
watch(url, () => load());
</script>

<template>
  <div class="space-y-1">
    <div class="flex gap-1.5">
      <select
        v-if="!manual && options.length"
        :value="modelValue"
        class="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#111827] px-2 py-1 text-[11px] text-gray-100 focus:border-blue-500/60 focus:outline-none"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <input
        v-else
        :value="modelValue"
        :placeholder="spec.placeholder || t('remote_placeholder')"
        class="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#111827] px-2 py-1 text-[11px] text-gray-100 placeholder-gray-500 focus:border-blue-500/60 focus:outline-none"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        class="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5 disabled:opacity-50"
        :disabled="loading"
        :title="t('remote_reload')" :aria-label="t('remote_reload')"
        @click="load(true)"
      >
        {{ loading ? '…' : '⟳' }}
      </button>
    </div>
    <div class="flex items-center justify-between">
      <p v-if="error" class="text-[10px] text-amber-400">{{ error }}</p>
      <p v-else class="truncate text-[10px] text-gray-600" :title="url">{{ tr('remote_count', { n: options.length }) }}</p>
      <label v-if="options.length" class="ml-2 flex shrink-0 items-center gap-1 text-[10px] text-gray-500">
        <input v-model="manual" type="checkbox" /> {{ t('remote_manual') }}
      </label>
    </div>
  </div>
</template>
