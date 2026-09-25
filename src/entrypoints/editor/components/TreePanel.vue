<script setup lang="ts">
import { useDocumentStore } from '@/core/lvgl/document';
import TreeItem from './TreeItem.vue';
import { useI18n } from '@/shared/i18n';

const doc = useDocumentStore();
const { t } = useI18n();
</script>

<template>
  <div>
    <h2 class="mb-2 text-xs font-semibold text-gray-200">{{ t('tree_title') }}</h2>
    <div class="rounded-lg border border-white/10 bg-field p-1">
      <div v-if="!doc.screen.children.length" class="px-2 py-1.5 text-[11px] text-gray-500">
        {{ t('tree_empty') }}
      </div>
      <TreeItem
        v-for="node in doc.screen.children"
        :key="node.id"
        :node="node"
        :depth="0"
      />
    </div>
  </div>
</template>
