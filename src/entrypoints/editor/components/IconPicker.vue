<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { ICONS, ICON_CATEGORIES, iconGlyph, type IconDef } from '@/core/lvgl/icons';
import { useI18n } from '@/shared/i18n';
const { t } = useI18n();

const emit = defineEmits<{ (e: 'select', glyph: string): void; (e: 'close'): void }>();

const search = ref('');
const activeCat = ref('');

// Die vollständige MDI-Liste (~210 KB) erst bei der ersten Suche nachladen – sie wird nur
// hier gebraucht und soll den Editor-Start nicht bremsen.
const mdiAll = shallowRef<typeof import('@/core/lvgl/mdiAll').MDI_ALL | null>(null);
watch(search, (q) => {
  if (q.trim() && !mdiAll.value) import('@/core/lvgl/mdiAll').then((m) => (mdiAll.value = m.MDI_ALL));
});

function humanize(s: string): string {
  return s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Ohne Suche: kuratierte Icons nach Kategorie. Mit Suche: über ALLE MDI-Icons.
const filtered = computed<Pick<IconDef, 'name' | 'label' | 'code'>[]>(() => {
  const q = search.value.trim().toLowerCase();
  if (q) {
    const res: Pick<IconDef, 'name' | 'label' | 'code'>[] = [];
    // Solange die volle Liste lädt: in den kuratierten Icons suchen.
    const source = mdiAll.value ?? ICONS.map((i) => [i.name, i.code] as const);
    for (const [name, code] of source) {
      if (name.includes(q)) {
        res.push({ name, label: humanize(name), code });
        if (res.length >= 150) break;
      }
    }
    return res;
  }
  return ICONS.filter((i) => !activeCat.value || i.category === activeCat.value);
});
</script>

<template>
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0e1626]">
      <header class="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 class="text-sm font-semibold text-white">{{ t('icon_title') }}</h2>
        <button class="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white" :title="t('common_close')" :aria-label="t('common_close')" @click="emit('close')">✕</button>
      </header>

      <div class="border-b border-white/10 p-3">
        <input
          v-model="search"
          :placeholder="t('icon_search')"
          class="mb-2 w-full rounded-lg border border-white/10 bg-[#111827] px-3 py-1.5 text-xs text-gray-100 focus:border-blue-500/60 focus:outline-none"
        />
        <div v-if="!search" class="flex flex-wrap gap-1">
          <button
            class="rounded-full px-2.5 py-0.5 text-[11px]"
            :class="!activeCat ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'"
            @click="activeCat = ''"
          >
            Alle
          </button>
          <button
            v-for="c in ICON_CATEGORIES"
            :key="c"
            class="rounded-full px-2.5 py-0.5 text-[11px]"
            :class="activeCat === c ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'"
            @click="activeCat = c"
          >
            {{ c }}
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <div class="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
          <button
            v-for="i in filtered"
            :key="i.name"
            class="group flex flex-col items-center gap-0.5 rounded-md p-1.5 hover:bg-blue-500/15"
            :title="i.label"
            @click="emit('select', iconGlyph(i.code)); emit('close')"
          >
            <span class="mdi-glyph text-[22px] leading-none text-gray-200 group-hover:text-white">{{ iconGlyph(i.code) }}</span>
            <span class="w-full truncate text-center text-[8px] text-gray-500">{{ i.label }}</span>
          </button>
        </div>
        <div v-if="!filtered.length" class="py-6 text-center text-xs text-gray-500">{{ t('icon_none') }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mdi-glyph {
  font-family: 'Material Design Icons', sans-serif;
}
</style>
