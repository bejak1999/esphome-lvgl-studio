<script setup lang="ts">
import type { WidgetNode } from '@/core/lvgl/types';
import { useDocumentStore } from '@/core/lvgl/document';
import { CATALOG_BY_TYPE } from '@/core/lvgl/catalog';
import { useI18n } from '@/shared/i18n';
const { t } = useI18n();

defineProps<{ node: WidgetNode; depth: number }>();
const doc = useDocumentStore();
</script>

<template>
  <div>
    <!-- Auswahl-Button und Löschen-Button nebeneinander (nicht verschachtelt), damit beide
         per Tastatur erreichbar und für Screenreader eindeutig sind. -->
    <div
      class="group flex items-center gap-1 rounded px-1.5 py-1 text-[11px]"
      :class="doc.selectedId === node.id ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-white/5'"
      :style="{ paddingLeft: 6 + depth * 12 + 'px' }"
      @click="doc.select(node.id)"
    >
      <button
        type="button"
        class="flex min-w-0 flex-1 items-center gap-1 text-left"
        :aria-current="doc.selectedId === node.id ? 'true' : undefined"
        @click.stop="doc.select(node.id)"
      >
        <span class="text-gray-500">{{ CATALOG_BY_TYPE[node.type]?.label ?? node.type }}</span>
        <span class="truncate text-gray-500">· {{ node.name || node.id }}</span>
      </button>
      <button
        type="button"
        class="rounded px-1 text-gray-500 opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
        :title="t('tree_delete')" :aria-label="t('tree_delete')"
        @click.stop="doc.remove(node.id)"
      >
        ✕
      </button>
    </div>
    <TreeItem
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :depth="depth + 1"
    />
  </div>
</template>
