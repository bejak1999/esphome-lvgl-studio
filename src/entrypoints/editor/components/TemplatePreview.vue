<script setup lang="ts">
import { computed } from 'vue';
import WidgetView from '@/core/lvgl/WidgetView.vue';
import type { WidgetNode } from '@/core/lvgl/types';

/** Skalierte Mini-Vorschau einer Vorlage (Widget-Teilbäume) mit dem echten Renderer. */
const props = withDefaults(defineProps<{ nodes: WidgetNode[]; box?: number; bg?: string }>(), {
  box: 104,
  bg: '#0b1220',
});

const bbox = computed(() => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of props.nodes) {
    minX = Math.min(minX, n.geometry.x);
    minY = Math.min(minY, n.geometry.y);
    maxX = Math.max(maxX, n.geometry.x + n.geometry.width);
    maxY = Math.max(maxY, n.geometry.y + n.geometry.height);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, w: props.box, h: props.box };
  return { minX, minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
});

const scale = computed(() => {
  const pad = 0.85; // etwas Rand lassen
  const s = Math.min((props.box * pad) / bbox.value.w, (props.box * pad) / bbox.value.h);
  return Math.min(s, 2);
});

const displayNodes = computed(() =>
  props.nodes.map((n) => ({
    ...n,
    geometry: { ...n.geometry, x: n.geometry.x - bbox.value.minX, y: n.geometry.y - bbox.value.minY },
  })),
);
</script>

<template>
  <div
    aria-hidden="true"
    data-lvgl-canvas
    class="pointer-events-none flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10"
    :style="{ width: box + 'px', height: box + 'px', background: bg }"
  >
    <div class="relative" :style="{ width: bbox.w + 'px', height: bbox.h + 'px', transform: `scale(${scale})` }">
      <WidgetView v-for="n in displayNodes" :key="n.id" :node="n" :selected-id="null" />
    </div>
  </div>
</template>
