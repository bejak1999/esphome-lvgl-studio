<script setup lang="ts">
/**
 * Hinweis + Knopf, wenn für eine URL noch keine Host-Berechtigung besteht (z. B. Kamera-Bild,
 * Addon-Datenquelle). Rendert nichts, sobald der Zugriff erlaubt ist.
 */
import { ref, watch } from 'vue';
import { useI18n } from '@/shared/i18n';
import { hasHostAccess, hostLabel, hostPatterns, requestHostAccess } from '@/shared/hostAccess';

const props = defineProps<{ url: string }>();
const emit = defineEmits<{ granted: [] }>();
const { t } = useI18n();
const missing = ref(false);

watch(
  () => props.url,
  async (url) => {
    missing.value = !!hostPatterns([url]).length && !(await hasHostAccess([url]));
  },
  { immediate: true },
);

function allow() {
  // synchron im Klick-Handler anfragen (Browser-Vorgabe)
  requestHostAccess([props.url]).then((ok) => {
    if (ok) {
      missing.value = false;
      emit('granted');
    }
  });
}
</script>

<template>
  <p v-if="missing" class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] leading-snug text-amber-300">
    {{ t('host_access_missing').replace('{host}', hostLabel(url)) }}
    <button type="button" class="rounded border border-amber-400/40 px-1.5 py-0.5 text-amber-200 hover:bg-amber-500/10" @click="allow">
      {{ t('host_access_allow') }}
    </button>
  </p>
</template>
