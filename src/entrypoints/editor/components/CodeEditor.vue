<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

/** YAML-Editor mit Zeilennummern und Live-Übernahme (debounced). */
const props = defineProps<{ modelValue: string; highlightLine?: number | null }>();
const emit = defineEmits<{ (e: 'change', value: string): void }>();

const buffer = ref(props.modelValue);
const focused = ref(false);
const gutter = ref<HTMLElement | null>(null);
const area = ref<HTMLTextAreaElement | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

/** Markierte Zeile (ausgewähltes Widget) in den sichtbaren Bereich scrollen. */
watch(
  () => props.highlightLine,
  async (line) => {
    if (!line || focused.value) return;
    await nextTick();
    const row = gutter.value?.children[line - 1] as HTMLElement | undefined;
    const ta = area.value;
    if (!row || !ta) return;
    const target = row.offsetTop - ta.clientHeight / 3;
    ta.scrollTop = Math.max(0, target);
    if (gutter.value) gutter.value.scrollTop = ta.scrollTop;
  },
);

// Externe Änderungen (Canvas/KI) nur übernehmen, wenn man nicht gerade selbst tippt.
watch(
  () => props.modelValue,
  (v) => {
    if (!focused.value) buffer.value = v;
  },
);

const lines = computed(() => {
  const count = buffer.value.split('\n').length;
  return Array.from({ length: count }, (_, i) => i + 1);
});

function onInput(e: Event) {
  buffer.value = (e.target as HTMLTextAreaElement).value;
  clearTimeout(timer);
  timer = setTimeout(() => emit('change', buffer.value), 350); // live, aber leicht entprellt
}
function onScroll(e: Event) {
  if (gutter.value) gutter.value.scrollTop = (e.target as HTMLTextAreaElement).scrollTop;
}
function onBlur() {
  focused.value = false;
  clearTimeout(timer);
  emit('change', buffer.value);
}
</script>

<template>
  <div class="code-editor flex min-h-0 flex-1 overflow-hidden bg-[#0b1220] text-[11px] leading-[1.5]">
    <div
      ref="gutter"
      class="select-none overflow-hidden py-3 pl-3 pr-2 text-right text-gray-600"
      aria-hidden="true"
    >
      <div
        v-for="n in lines"
        :key="n"
        :class="n === highlightLine ? 'rounded bg-blue-500/30 px-1 font-semibold text-blue-200' : ''"
      >
        {{ n }}
      </div>
    </div>
    <textarea
      ref="area"
      :value="buffer"
      spellcheck="false"
      aria-label="ESPHome YAML"
      class="min-h-0 flex-1 resize-none py-3 pl-2 pr-3 text-gray-300 focus:outline-none"
      @input="onInput"
      @scroll="onScroll"
      @focus="focused = true"
      @blur="onBlur"
    />
  </div>
</template>

<style scoped>
/* MDI zuerst, dann Monospace: ASCII fällt per Glyph auf die Mono-Schrift zurück,
   MDI-Icon-Glyphen (PUA) rendern als Icon statt als □. */
.code-editor,
.code-editor :deep(textarea),
.code-editor :deep(div) {
  font-family: 'Material Design Icons', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
