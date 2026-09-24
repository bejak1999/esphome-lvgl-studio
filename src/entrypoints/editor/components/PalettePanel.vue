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
  <aside :aria-label="t('editor_palette_label')" class="flex min-h-0 flex-1 flex-col bg-[#0e1626]">
    <div class="border-b border-white/10 px-3 py-2">
      <h2 class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{{ t('palette_widgets') }}</h2>
    </div>
    <div class="p-2">
      <input
        v-model="search"
        type="text"
        :placeholder="t('palette_search')"
        class="w-full rounded-lg border border-white/10 bg-[#111827] px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-500 focus:border-blue-500/60 focus:outline-none"
      />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <div v-for="group in groups" :key="group.category" class="mb-3">
        <div class="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {{ group.category }}
        </div>
        <div class="grid grid-cols-2 gap-1.5">
          <button
            v-for="entry in group.items"
            :key="entry.type"
            draggable="true"
            class="flex cursor-grab items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-[11px] text-gray-300 hover:border-blue-500/50 hover:bg-blue-500/10 active:cursor-grabbing"
            :title="t('palette_add_title').replace('{label}', entry.label)"
            @dragstart="onDragStart($event, entry.type)"
            @click="emit('add', entry.type)"
          >
            <WidgetIcon :type="entry.type" class="text-blue-300/80" />
            <span class="truncate">{{ entry.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
