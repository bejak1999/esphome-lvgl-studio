<script setup lang="ts">
import type { WidgetNode } from '@/core/lvgl/types';
import { useDocumentStore } from '@/core/lvgl/document';
import { CATALOG_BY_TYPE } from '@/core/lvgl/catalog';

defineProps<{ node: WidgetNode; depth: number }>();
const doc = useDocumentStore();
</script>

<template>
  <div>
    <div
      class="group flex items-center gap-1 rounded px-1.5 py-1 text-[11px]"
      :class="doc.selectedId === node.id ? 'bg-blue-600/30 text-white' : 'text-gray-300 hover:bg-white/5'"
      :style="{ paddingLeft: 6 + depth * 12 + 'px' }"
      @click="doc.select(node.id)"
    >
      <span class="text-gray-500">{{ CATALOG_BY_TYPE[node.type]?.label ?? node.type }}</span>
      <span class="truncate text-gray-500/70">· {{ node.name || node.id }}</span>
      <button
        class="ml-auto rounded px-1 text-gray-500 opacity-0 hover:text-red-400 group-hover:opacity-100"
        title="Löschen"
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
