<script setup lang="ts">
import { ref } from 'vue';
import { pageLabel, useDocumentStore } from '@/core/lvgl/document';
import { tr, useI18n } from '@/shared/i18n';

/**
 * Seiten-Leiste (LVGL `pages:`). Jede Seite ist ein eigener Bildschirm; ein Button auf
 * dem Display kann per „Seiten-Aktion" dorthin wechseln.
 */
const doc = useDocumentStore();
const { t } = useI18n();
const editing = ref<number | null>(null);
const draftName = ref('');
const draftId = ref('');

function startRename(i: number) {
  editing.value = i;
  draftName.value = pageLabel(doc.pages[i], i);
  draftId.value = doc.pages[i].id;
}
function commitRename() {
  if (editing.value == null) return;
  const id = draftId.value.trim().replace(/[^\w]/g, '_');
  doc.renamePage(editing.value, draftName.value.trim() || `Page ${editing.value + 1}`, id || undefined);
  editing.value = null;
}
</script>

<template>
  <!-- Seiten als Reiter über der Arbeitsfläche -->
  <div class="flex items-end gap-0.5 border-b border-white/10 bg-panel px-2 pt-1.5 text-[11px]">
    <span class="sr-only">{{ t('pages_label') }}</span>
    <div class="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
      <div
        v-for="(p, i) in doc.pages"
        :key="p.id"
        class="group flex shrink-0 items-center rounded-t-md border-x border-t"
        :class="i === doc.activePage ? 'border-white/10 bg-app text-gray-100' : 'border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200'"
      >
        <button
          class="py-1 pl-3 pr-1"
          :aria-current="i === doc.activePage ? 'page' : undefined"
          :title="tr('page_id_title', { id: p.id, n: p.children.length })"
          @click="doc.setActivePage(i)"
          @dblclick="startRename(i)"
        >
          {{ pageLabel(p, i) }}
          <span class="ml-1 text-[9px] text-gray-500">{{ p.children.length }}</span>
        </button>
        <button
          class="mr-1 rounded px-1 text-gray-500 opacity-60 hover:bg-white/10 hover:text-gray-200 group-hover:opacity-100 focus:opacity-100"
          :title="t('pages_rename_title')"
          @click="startRename(i)"
        >
          ✎
        </button>
      </div>
      <button
        class="mb-0.5 shrink-0 rounded px-2 py-0.5 text-gray-400 hover:bg-white/10 hover:text-gray-200"
        :title="t('pages_add_title')"
        @click="doc.addPage()"
      >
        {{ t('pages_add') }}
      </button>
    </div>
    <button
      v-if="doc.pages.length > 1"
      class="mb-0.5 shrink-0 rounded px-2 py-0.5 text-red-300 hover:bg-red-950/40"
      :title="t('pages_delete_title')" :aria-label="t('pages_delete_title')"
      @click="doc.removePage(doc.activePage)"
    >
      ✕
    </button>

    <!-- Umbenennen -->
    <div v-if="editing !== null" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" v-dialog="() => (editing = null)" @click.self="editing = null">
      <form class="w-72 rounded-xl border border-white/10 bg-panel p-3" @submit.prevent="commitRename">
        <h2 class="mb-2 text-[12px] font-semibold text-gray-200">{{ t('pages_rename_modal') }}</h2>
        <label class="block text-[10px] text-gray-400">{{ t('pages_display_name') }}</label>
        <input v-model="draftName" class="mb-2 w-full rounded border border-white/10 bg-app px-2 py-1 text-[11px] text-gray-100" />
        <label class="block text-[10px] text-gray-400">{{ t('pages_lvgl_id') }}</label>
        <input v-model="draftId" class="w-full rounded border border-white/10 bg-app px-2 py-1 font-mono text-[11px] text-gray-100" />
        <div class="mt-3 flex justify-end gap-2">
          <button type="button" class="rounded border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5" @click="editing = null">{{ t('pages_cancel') }}</button>
          <button type="submit" class="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">{{ t('pages_apply') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
