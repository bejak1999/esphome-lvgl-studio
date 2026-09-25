<script setup lang="ts">
/**
 * Addon-Bereich in der linken Spalte des Editors: installierte Addons hinzufügen und die
 * bereits im Dokument platzierten Instanzen öffnen/entfernen.
 */
import { computed, onMounted, ref } from 'vue';
import { openOptionsPage } from '@/shared/messaging';
import { useAddons } from '@/core/addons/useAddons';
import type { AddonInstance } from '@/core/addons/types';
import { useI18n } from '@/shared/i18n';

const emit = defineEmits<{ (e: 'configure', iid: string): void }>();

const { doc, store, manifestOf, addInstance } = useAddons();
const { t } = useI18n();

onMounted(() => {
  if (!store.loaded) store.load();
});

const available = computed(() => store.enabled);

interface Row {
  inst: AddonInstance;
  label: string;
  icon: string;
  missing: boolean;
  otherPage: boolean;
}

const rows = computed<Row[]>(() =>
  doc.addons.map((inst) => {
    const m = manifestOf(inst);
    return {
      inst,
      label: inst.name || m?.name || inst.addon,
      icon: m?.icon ?? '🧩',
      missing: !m,
      otherPage: inst.page !== doc.screen.id,
    };
  }),
);

/** Fehler beim Anlegen einer Instanz – sonst „passiert einfach nichts". */
const error = ref('');

function add(id: string) {
  error.value = '';
  const m = store.manifest(id);
  if (!m) {
    error.value = `Addon „${id}" nicht gefunden.`;
    return;
  }
  try {
    const inst = addInstance(m);
    emit('configure', inst.iid);
  } catch (e) {
    error.value = `${m.name}: ${(e as Error).message}`;
    console.error('[addons] Instanz konnte nicht angelegt werden', e);
  }
}

function open(row: Row) {
  // Liegt die Instanz auf einer anderen Seite, erst dorthin wechseln.
  if (row.otherPage) {
    const i = doc.pages.findIndex((p) => p.id === row.inst.page);
    if (i >= 0) doc.setActivePage(i);
  }
  emit('configure', row.inst.iid);
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col">
    <div class="flex items-center justify-between px-3 py-2">
      <h2 class="text-xs font-semibold text-gray-200">{{ t('addons_panel_title') }}</h2>
      <button
        class="rounded p-0.5 text-[11px] text-gray-500 hover:bg-white/5 hover:text-white"
        :title="t('addons_panel_manage_title')"
        @click="openOptionsPage"
      >
        ⚙
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      <p v-if="error" class="mb-2 rounded-lg border border-amber-500/40 bg-amber-950/30 px-2 py-1.5 text-[10px] leading-snug text-amber-300">
        {{ error }}
      </p>

      <!-- Verfügbare Addons -->
      <div v-if="available.length" class="mb-3 space-y-1">
        <button
          v-for="a in available"
          :key="a.manifest.id"
          class="flex w-full items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-left text-[11px] text-gray-300 hover:border-blue-500/50 hover:bg-blue-500/10"
          :title="a.manifest.description || a.manifest.name"
          @click="add(a.manifest.id)"
        >
          <span class="shrink-0">{{ a.manifest.icon ?? '🧩' }}</span>
          <span class="truncate">{{ a.manifest.name }}</span>
          <span class="ml-auto shrink-0 text-gray-500">＋</span>
        </button>
      </div>
      <p v-else class="mb-3 px-1 text-[10px] leading-snug text-gray-500">
        {{ t('addons_panel_none_active') }}
        <button class="text-blue-400 hover:underline" @click="openOptionsPage">{{ t('addons_panel_install_link') }}</button>.
      </p>

      <!-- Platzierte Instanzen -->
      <div v-if="rows.length">
        <div class="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
          {{ t('addons_panel_in_dashboard') }}
        </div>
        <div
          v-for="row in rows"
          :key="row.inst.iid"
          class="mb-1 flex items-center gap-1.5 rounded-lg border border-white/10 bg-field px-2 py-1.5 text-[11px]"
          :class="row.missing ? 'border-amber-500/40' : ''"
        >
          <span class="shrink-0">{{ row.icon }}</span>
          <button class="min-w-0 flex-1 truncate text-left text-gray-200 hover:text-white" :title="row.missing ? t('addons_panel_not_installed') : t('addons_panel_configure')" @click="open(row)">
            {{ row.label }}
            <span v-if="row.otherPage" class="text-[9px] text-gray-500">{{ t('addons_panel_other_page') }}</span>
          </button>
          <button
            class="shrink-0 rounded px-1 text-[11px] text-red-400 hover:bg-red-950/40"
            :title="t('addons_panel_remove_title')"
            @click="doc.removeAddonInstance(row.inst.iid)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
