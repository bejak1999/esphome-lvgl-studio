<script setup lang="ts">
import { ref } from 'vue';
import { useDocumentStore } from '@/core/lvgl/document';
import { useI18n } from '@/shared/i18n';

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
  draftName.value = doc.pages[i].name;
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
  <div class="flex items-center gap-1 border-b border-white/10 bg-[#0e1626] px-3 py-1 text-[11px]">
    <span class="shrink-0 text-gray-500">{{ t('pages_label') }}</span>

    <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
      <div v-for="(p, i) in doc.pages" :key="p.id" class="flex shrink-0 items-center">
        <button
          class="rounded-l border-y border-l px-2 py-0.5"
          :class="i === doc.activePage
            ? 'border-blue-500/50 bg-blue-500/20 text-blue-200'
            : 'border-white/10 text-gray-300 hover:bg-white/5'"
          :title="`Seiten-id: ${p.id} (${p.children.length} Widgets)`"
          @click="doc.setActivePage(i)"
          @dblclick="startRename(i)"
        >
          {{ p.name }}
          <span class="ml-1 text-[9px] text-gray-500">{{ p.children.length }}</span>
        </button>
        <button
          class="rounded-r border px-1 py-0.5 text-gray-500 hover:bg-white/5 hover:text-gray-200"
          :class="i === doc.activePage ? 'border-blue-500/50' : 'border-white/10'"
          :title="t('pages_rename_title')"
          @click="startRename(i)"
        >
          ✎
        </button>
      </div>
    </div>

    <button
      class="shrink-0 rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5"
      :title="t('pages_add_title')"
      @click="doc.addPage()"
    >
      {{ t('pages_add') }}
    </button>
    <button
      v-if="doc.pages.length > 1"
      class="shrink-0 rounded border border-white/10 px-2 py-0.5 text-red-300/80 hover:bg-red-950/40"
      :title="`${doc.screen.name}`"
      @click="doc.removePage(doc.activePage)"
    >
      ✕
    </button>

    <!-- Umbenennen -->
    <div v-if="editing !== null" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="editing = null">
      <div class="w-72 rounded-xl border border-white/10 bg-[#0e1626] p-3">
        <p class="mb-2 text-[12px] font-semibold text-gray-200">{{ t('pages_rename_modal') }}</p>
        <label class="block text-[10px] text-gray-400">{{ t('pages_display_name') }}</label>
        <input v-model="draftName" class="mb-2 w-full rounded border border-white/10 bg-[#0b1220] px-2 py-1 text-[11px] text-gray-100" />
        <label class="block text-[10px] text-gray-400">{{ t('pages_lvgl_id') }}</label>
        <input v-model="draftId" class="w-full rounded border border-white/10 bg-[#0b1220] px-2 py-1 font-mono text-[11px] text-gray-100" />
        <div class="mt-3 flex justify-end gap-2">
          <button class="rounded border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5" @click="editing = null">{{ t('pages_cancel') }}</button>
          <button class="rounded bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700" @click="commitRename">{{ t('pages_apply') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
