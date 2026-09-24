<script setup lang="ts">
import type { WidgetType } from '@/core/lvgl/types';

/**
 * Kleines Vorschau-Icon je Widget-Typ für die Palette – zeigt grob, was einen erwartet.
 * Bewusst als schlichte SVG-Pfade (kein Icon-Font), damit es überall gleich aussieht.
 */
defineProps<{ type: WidgetType }>();

// 16x16-Viewbox. `s` = gestrichene Form (stroke), `f` = gefüllte Form (fill).
const PATHS: Record<WidgetType, { f?: string; s?: string }> = {
  obj: { s: 'M2.5 3.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z' },
  label: { f: 'M2 4h12v1.6H2zM2 7.2h9v1.6H2zM2 10.4h11V12H2z' },
  icon: { f: 'M8 1.6l1.8 4.1 4.4.4-3.3 2.9 1 4.3L8 11l-3.9 2.3 1-4.3L1.8 6.1l4.4-.4z' },
  image: {
    s: 'M2.5 3.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z',
    f: 'M3.5 11.5l3-3.4 2 2.2 2.2-2.7 2.3 3.9zM5.4 6.6a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2z',
  },
  bar: { f: 'M1.5 6.4h13v3.2h-13z', s: 'M1.5 6.4h13v3.2h-13z' },
  led: { f: 'M8 4.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z' },
  line: { f: 'M1.6 10.8l3.6-3.9 3 2.4 5.4-5.1 1.1 1.2-6.3 6-3-2.4-2.7 2.9z' },
  meter: {
    s: 'M2.4 12a6.4 6.4 0 1 1 11.2 0',
    f: 'M8 11.4L11.2 6.9l1.1.9-3.2 4.5z',
  },
  spinner: { s: 'M8 2.2a5.8 5.8 0 1 0 5.8 5.8' },
  qrcode: { f: 'M2 2h4.2v4.2H2zM3.3 3.3v1.6h1.6V3.3zM9.8 2H14v4.2H9.8zM11.1 3.3v1.6h1.6V3.3zM2 9.8h4.2V14H2zM3.3 11.1v1.6h1.6v-1.6zM9.8 9.8H12v2.2H9.8zM12.4 12.2H14V14h-1.6zM9.8 12.9h1.4V14H9.8z' },
  button: { s: 'M2.2 5h11.6a1.2 1.2 0 0 1 1.2 1.2v3.6a1.2 1.2 0 0 1-1.2 1.2H2.2A1.2 1.2 0 0 1 1 9.8V6.2A1.2 1.2 0 0 1 2.2 5z', f: 'M5 7.4h6v1.2H5z' },
  slider: { f: 'M1.5 7.2h13v1.6h-13z', s: 'M10.2 8a2 2 0 1 1 4 0 2 2 0 0 1-4 0z' },
  arc: { s: 'M3 12.2A6 6 0 1 1 13 12.2' },
  switch: { s: 'M5 4.4h6a3.6 3.6 0 1 1 0 7.2H5a3.6 3.6 0 1 1 0-7.2z', f: 'M11 6.1a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8z' },
  checkbox: { s: 'M2.6 2.6h6.4v6.4H2.6z', f: 'M4 5.6l1.5 1.6 3.2-3.4 1 1-4.2 4.5-2.5-2.6z' },
  dropdown: { s: 'M2 4.4h12v7.2H2z', f: 'M7 7.2h2l-1 1.6z' },
  textarea: { s: 'M2 3.4h12v9.2H2z', f: 'M3.6 5.4h6v1.1h-6zM3.6 7.6h8v1.1h-8zM3.6 9.8h4v1.1h-4z' },
};
</script>

<template>
  <svg viewBox="0 0 16 16" class="h-4 w-4 shrink-0" aria-hidden="true">
    <path v-if="PATHS[type]?.s" :d="PATHS[type].s" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" />
    <path v-if="PATHS[type]?.f" :d="PATHS[type].f" fill="currentColor" />
  </svg>
</template>
