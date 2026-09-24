<script setup lang="ts">
/**
 * Rendert EIN Feld einer Addon-Konfiguration. Neue Feldtypen werden ausschließlich hier
 * ergänzt (plus `FieldKind` in `core/addons/types.ts` und die Doku in `docs/ADDONS.md`) –
 * Addons selbst bleiben reines JSON.
 */
import { computed } from 'vue';
import type { FieldSpec } from '@/core/addons/types';
import { getPath, render } from '@/core/addons/template';
import type { TemplateContext } from '@/core/addons/template';
import MapPicker from './MapPicker.vue';
import type { MapValue } from './MapPicker.vue';
import RemoteSelect from './RemoteSelect.vue';
import { useI18n } from '@/shared/i18n';
const { t } = useI18n();

const props = defineProps<{
  spec: FieldSpec;
  ctx: TemplateContext;
  modelValue: unknown;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: unknown): void }>();

const num = computed(() => Number(props.modelValue ?? 0));
const str = computed(() => String(props.modelValue ?? ''));
const size = computed(() => {
  const v = (props.modelValue ?? {}) as { width?: number; height?: number };
  return { width: Number(v.width ?? 100), height: Number(v.height ?? 100) };
});
const mapValue = computed<MapValue>(() => {
  const v = (props.modelValue ?? {}) as Partial<MapValue>;
  return {
    lat: Number(v.lat ?? 51.1657),
    lon: Number(v.lon ?? 10.4515),
    zoom: Number(v.zoom ?? 6),
    spanKm: Number(v.spanKm ?? props.spec.spanKm?.default ?? 30),
  };
});

/** Seitenverhältnis für den Ausschnitt-Rahmen der Karte (`aspectFrom` zeigt auf ein size-Feld). */
const aspect = computed(() => {
  if (!props.spec.aspectFrom) return 0.75;
  const v = getPath(props.ctx, props.spec.aspectFrom) as { width?: number; height?: number } | undefined;
  const w = Number(v?.width ?? 0);
  const h = Number(v?.height ?? 0);
  return w > 0 && h > 0 ? h / w : 0.75;
});

/** Kachelquelle der Karte – darf Platzhalter enthalten (z. B. einen API-Key aus settings). */
const tileUrl = computed(() => (props.spec.tileUrl ? render(props.spec.tileUrl, props.ctx) : ''));

function setSize(patch: { width?: number; height?: number }) {
  emit('update:modelValue', { ...size.value, ...patch });
}
</script>

<template>
  <div v-if="spec.kind === 'note'" class="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] text-gray-400">
    <span class="font-semibold text-gray-300">{{ spec.label }}</span>
    <span v-if="spec.help"> — {{ spec.help }}</span>
  </div>

  <div v-else>
    <div class="mb-1 flex items-center justify-between gap-2">
      <label class="text-[11px] text-gray-300">{{ spec.label }}</label>
      <span v-if="spec.kind === 'slider'" class="text-[10px] text-gray-400">{{ num }}{{ spec.unit ?? '' }}</span>
    </div>

    <!-- Text / Passwort -->
    <input
      v-if="spec.kind === 'text'"
      :type="spec.password ? 'password' : 'text'"
      :value="str"
      :placeholder="spec.placeholder"
      class="addon-input"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />

    <!-- Home-Assistant-Entity (nutzt die datalist des Editors) -->
    <input
      v-else-if="spec.kind === 'ha-entity'"
      :value="str"
      list="ha-entities"
      :placeholder="t('addon_entity_placeholder')"
      class="addon-input"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />

    <!-- Zahl -->
    <input
      v-else-if="spec.kind === 'number'"
      type="number"
      :value="num"
      :min="spec.min"
      :max="spec.max"
      :step="spec.step ?? 1"
      class="addon-input"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />

    <!-- Schieberegler -->
    <input
      v-else-if="spec.kind === 'slider'"
      type="range"
      :value="num"
      :min="spec.min ?? 0"
      :max="spec.max ?? 100"
      :step="spec.step ?? 1"
      class="w-full"
      @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />

    <!-- Auswahl -->
    <select
      v-else-if="spec.kind === 'select'"
      :value="str"
      class="addon-input"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="o in spec.options ?? []" :key="o.value" :value="o.value">{{ o.label ?? o.value }}</option>
    </select>

    <!-- Auswahl aus dem Netz -->
    <RemoteSelect
      v-else-if="spec.kind === 'remote-select'"
      :spec="spec"
      :ctx="ctx"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <!-- Schalter -->
    <label v-else-if="spec.kind === 'checkbox'" class="flex items-center gap-2 text-[11px] text-gray-400">
      <input
        type="checkbox"
        :checked="!!modelValue"
        @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
      />
      aktiv
    </label>

    <!-- Farbe -->
    <div v-else-if="spec.kind === 'color'" class="flex items-center gap-2">
      <input
        type="color"
        :value="str || '#ff0000'"
        class="h-7 w-10 rounded border border-white/10 bg-transparent"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <input
        :value="str"
        class="addon-input flex-1"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <!-- Größe -->
    <div v-else-if="spec.kind === 'size'" class="space-y-1">
      <div class="flex items-center gap-1.5">
        <input
          type="number"
          min="8"
          :value="size.width"
          class="addon-num"
          @input="setSize({ width: Number(($event.target as HTMLInputElement).value) })"
        />
        <span class="text-[11px] text-gray-500">×</span>
        <input
          type="number"
          min="8"
          :value="size.height"
          class="addon-num"
          @input="setSize({ height: Number(($event.target as HTMLInputElement).value) })"
        />
        <span class="text-[10px] text-gray-500">px</span>
      </div>
      <div v-if="spec.presets?.length" class="flex flex-wrap gap-1">
        <button
          v-for="p in spec.presets"
          :key="p"
          class="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-white/5 hover:text-white"
          @click="setSize({ width: Number(p.split('x')[0]), height: Number(p.split('x')[1]) })"
        >
          {{ p }}
        </button>
      </div>
    </div>

    <!-- Karte -->
    <MapPicker
      v-else-if="spec.kind === 'map'"
      :model-value="mapValue"
      :span-km="spec.spanKm"
      :aspect="aspect"
      :tile-url="tileUrl"
      :tile-attribution="spec.tileAttribution"
      @update:model-value="emit('update:modelValue', $event)"
    />

    <p v-if="spec.help" class="mt-1 text-[10px] leading-snug text-gray-500">{{ spec.help }}</p>
  </div>
</template>

<style scoped>
.addon-input,
.addon-num {
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #111827;
  padding: 0.25rem 0.5rem;
  font-size: 11px;
  color: #f3f4f6;
}
.addon-input {
  width: 100%;
  min-width: 0;
}
.addon-num {
  width: 5rem;
}
.addon-input:focus,
.addon-num:focus {
  border-color: rgba(59, 130, 246, 0.6);
  outline: none;
}
</style>
