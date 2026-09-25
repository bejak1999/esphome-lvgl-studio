<script setup lang="ts">
import { computed, ref } from 'vue';
import { CATALOG, CATEGORY_ORDER } from '@/core/lvgl/catalog';
import type { WidgetType } from '@/core/lvgl/types';
import WidgetIcon from './WidgetIcon.vue';
import { useI18n } from '@/shared/i18n';

const emit = defineEmits<{ (e: 'add', type: WidgetType): void }>();
const { t } = useI18n();
const search = ref('');

const groups = computed(() =>
  CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: CATALOG.filter(
      (e) =>
        e.category === cat &&
        e.label.toLowerCase().includes(search.value.trim().toLowerCase()),
    ),
  })).filter((g) => g.items.length > 0),
);

function onDragStart(ev: DragEvent, type: WidgetType) {
  ev.dataTransfer?.setData('application/x-lvgl-widget', type);
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'copy';
}
</script>

<template>
  <!-- Breite/Rahmen kommen von der linken Spalte im Editor (darunter sitzt das Addon-Panel). -->
  <aside :aria-label="t('editor_palette_label')" class="flex min-h-0 flex-1 flex-col bg-panel">
    <div class="px-3 pt-3">
      <h2 class="text-xs font-semibold text-gray-200">{{ t('palette_widgets') }}</h2>
    </div>
    <div class="px-3 py-2">
      <input
        v-model="search"
        type="text"
        :placeholder="t('palette_search')"
        class="w-full rounded-lg border border-white/10 bg-field px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500/60 focus:outline-none"
      />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <div v-for="group in groups" :key="group.category" class="mb-3">
        <div class="mb-1 px-1 text-[10px] text-gray-500">
          {{ group.category }}
        </div>
        <div class="grid grid-cols-3 gap-1">
          <button
            v-for="entry in group.items"
            :key="entry.type"
            draggable="true"
            class="flex cursor-grab flex-col items-center gap-1 rounded-md px-1 py-2 text-[10px] text-gray-300 hover:bg-white/10 hover:text-white active:cursor-grabbing"
            :title="t('palette_add_title').replace('{label}', entry.label)"
            @dragstart="onDragStart($event, entry.type)"
            @click="emit('add', entry.type)"
          >
            <WidgetIcon :type="entry.type" class="text-blue-300" />
            <span class="w-full truncate text-center">{{ entry.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
