<script setup lang="ts">
import { computed, ref } from 'vue';
import { useVersionStore, type CodeVersion } from '@/shared/versions';
import { useDocumentStore } from '@/core/lvgl/document';
import { diffLines } from '@/shared/diff';
import { useI18n } from '@/shared/i18n';

const versions = useVersionStore();
const doc = useDocumentStore();
const emit = defineEmits<{ close: [] }>();
const { t, lang } = useI18n();

const selectedId = ref<string | null>(null);
const confirmingId = ref<string | null>(null);

const selected = computed<CodeVersion | null>(() =>
  selectedId.value ? versions.get(selectedId.value) ?? null : null,
);

// Diff des gewählten Stands gegen den AKTUELLEN Editor-Stand (was würde sich ändern).
const diff = computed(() => (selected.value ? diffLines(doc.exportedYaml, selected.value.yaml) : null));

function fmt(at: number): string {
  return new Date(at).toLocaleString(lang.value === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'medium' });
}

async function snapshotNow() {
  await versions.snapshot(doc.exportedYaml, t('hist_manual'));
}

function restore(v: CodeVersion) {
  doc.importYaml(v.yaml);
  // Nach dem Wiederherstellen gilt der Stand als abweichend vom Gerät.
  doc.dirty = true;
  emit('close');
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-white/10 bg-panel">
      <header class="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div class="flex items-center gap-2">
          <h2 class="text-sm font-semibold text-white">{{ t('hist_title') }}</h2>
          <span class="text-[11px] text-gray-500">{{ versions.device || '—' }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button class="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-gray-300 hover:bg-white/5" @click="snapshotNow">
            {{ t('hist_snapshot_now') }}
          </button>
          <button class="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white" :title="t('common_close')" :aria-label="t('common_close')" @click="emit('close')">✕</button>
        </div>
      </header>

      <div class="flex min-h-0 flex-1">
        <!-- Liste -->
        <div class="w-64 shrink-0 overflow-y-auto border-r border-white/10">
          <p v-if="!versions.ordered.length" class="p-3 text-[11px] text-gray-500">
            {{ t('hist_no_versions') }}
          </p>
          <button
            v-for="v in versions.ordered"
            :key="v.id"
            class="block w-full border-b border-white/5 px-3 py-2 text-left hover:bg-white/5"
            :class="selectedId === v.id ? 'bg-white/10' : ''"
            @click="selectedId = v.id"
          >
            <div class="text-[11px] font-medium text-gray-200">{{ v.label }}</div>
            <div class="text-[10px] text-gray-500">{{ fmt(v.at) }}</div>
          </button>
        </div>

        <!-- Detail / Diff -->
        <div class="flex min-w-0 flex-1 flex-col">
          <div v-if="!selected" class="flex flex-1 items-center justify-center text-[11px] text-gray-500">
            {{ t('hist_select_hint') }}
          </div>
          <template v-else>
            <div class="flex items-center justify-between border-b border-white/10 px-3 py-2">
              <div class="text-[11px] text-gray-400">
                {{ t('hist_diff_label') }}
              </div>
              <div class="flex items-center gap-2">
                <template v-if="confirmingId === selected.id">
                  <span class="text-[10px] text-amber-400">{{ t('hist_confirm_replace') }}</span>
                  <button class="rounded bg-amber-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-700" @click="restore(selected)">{{ t('hist_restore_yes') }}</button>
                  <button class="rounded border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5" @click="confirmingId = null">{{ t('hist_cancel') }}</button>
                </template>
                <template v-else>
                  <button class="rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700" @click="confirmingId = selected.id">
                    {{ t('hist_restore') }}
                  </button>
                  <button class="rounded border border-white/10 px-2 py-1 text-[11px] text-gray-400 hover:bg-white/5" @click="versions.removeVersion(selected.id); selectedId = null">
                    {{ t('hist_delete') }}
                  </button>
                </template>
              </div>
            </div>
            <div class="min-h-0 flex-1 overflow-auto bg-app p-2 font-mono text-[10px] leading-relaxed">
              <p v-if="diff && diff.added === 0 && diff.removed === 0" class="text-gray-500">
                {{ t('hist_identical') }}
              </p>
              <template v-else-if="diff">
                <div class="mb-1 text-gray-600">
                  <span class="text-emerald-400">+{{ diff.added }}</span>
                  <span class="ml-2 text-red-400">−{{ diff.removed }}</span>
                </div>
                <div
                  v-for="(ln, li) in diff.lines"
                  :key="li"
                  :class="ln.type === 'add' ? 'text-emerald-400' : ln.type === 'del' ? 'text-red-400' : ln.type === 'gap' ? 'text-gray-700' : 'text-gray-500'"
                >{{ ln.type === 'add' ? '+' : ln.type === 'del' ? '-' : ln.type === 'gap' ? '' : ' ' }}{{ ln.text }}</div>
              </template>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
