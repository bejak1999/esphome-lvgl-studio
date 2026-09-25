<script setup lang="ts">
/**
 * Addon-Verwaltung für die Einstellungen: installieren (URL / Datei / JSON einfügen),
 * pro Addon die `settings`-Werte pflegen, aktivieren/deaktivieren, deinstallieren.
 *
 * Addons sind reines JSON – es wird also kein Code nachgeladen (unter MV3 ohnehin
 * verboten). Beim Installieren wird das Manifest geprüft und Fehler werden im Klartext
 * angezeigt, damit Autoren sofort sehen, was fehlt.
 */
import { computed, onMounted, ref } from 'vue';
import { useAddonsStore } from '@/core/addons/store';
import { buildContext, testCondition } from '@/core/addons/apply';
import type { InstalledAddon } from '@/core/addons/types';
import AddonField from './AddonField.vue';
import { useI18n } from '@/shared/i18n';

const store = useAddonsStore();
const { t } = useI18n();

const url = ref('');
const json = ref('');
const showJson = ref(false);
const problems = ref<string[]>([]);
const okMessage = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
/** Aufgeklappte Addon-Einstellungen (Addon-id). */
const openId = ref<string | null>(null);
/** Arbeitskopien der Einstellungswerte je Addon. */
const drafts = ref<Record<string, Record<string, unknown>>>({});

onMounted(async () => {
  if (!store.loaded) await store.load();
});

const list = computed<InstalledAddon[]>(() => store.all);

function draftFor(a: InstalledAddon): Record<string, unknown> {
  const id = a.manifest.id;
  if (!drafts.value[id]) drafts.value[id] = { ...store.settingsFor(id) };
  return drafts.value[id];
}

/** Kontext nur für `visibleIf` der Einstellungsfelder (Instanz-Konfiguration gibt es hier nicht). */
function ctxFor(a: InstalledAddon) {
  return {
    ...buildContext(a.manifest, { iid: 'settings', config: {} }, draftFor(a)),
    settings: draftFor(a),
  };
}

function visibleSettings(a: InstalledAddon) {
  return (a.manifest.settings ?? []).filter((f) => testCondition(f.visibleIf, ctxFor(a)));
}

function report(result: string[], what: string) {
  problems.value = result;
  // Wartet auf die Lambda-Bestätigung → noch nicht installiert.
  if (store.pendingLambda) {
    okMessage.value = '';
    return;
  }
  okMessage.value = result.length ? '' : t('addons_installed_ok').replace('{name}', what);
  if (okMessage.value) setTimeout(() => (okMessage.value = ''), 2500);
}

async function installUrl() {
  if (!url.value.trim()) return;
  report(await store.installFromUrl(url.value.trim()), 'Addon');
  if (!problems.value.length && !store.pendingLambda) url.value = '';
}

async function installJson() {
  if (!json.value.trim()) return;
  report(await store.installFromJson(json.value), 'Addon');
  if (!problems.value.length && !store.pendingLambda) json.value = '';
}

async function confirmLambda() {
  const name = store.pendingLambda?.name ?? 'Addon';
  report(await store.confirmPendingLambda(), name);
  if (!problems.value.length) {
    url.value = '';
    json.value = '';
  }
}

async function onFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  report(await store.installFromJson(await file.text(), 'file'), file.name);
}

async function saveSettings(a: InstalledAddon) {
  await store.saveSettings(a.manifest.id, draftFor(a));
  okMessage.value = t('addons_saved').replace('{name}', a.manifest.name);
  setTimeout(() => (okMessage.value = ''), 2000);
}

function copyManifest(id: string) {
  const text = store.exportJson(id);
  if (text) navigator.clipboard?.writeText(text).catch(() => {});
}

function sourceLabel(source: InstalledAddon['source']) {
  if (source === 'url') return t('addons_source_url');
  if (source === 'file') return t('addons_source_file');
  return t('addons_source_json');
}
</script>

<template>
  <div class="space-y-4 text-[11px]">
    <!-- Installieren -->
    <section>
      <p class="mb-1 font-semibold text-gray-300">{{ t('addons_install_title') }}</p>
      <div class="flex gap-1.5">
        <input
          v-model="url"
          :placeholder="t('addons_install_url_placeholder')"
          class="min-w-0 flex-1 rounded-lg border border-white/10 bg-app px-2 py-1.5 text-[11px] text-gray-100 placeholder-gray-500 focus:border-blue-500/60 focus:outline-none"
          @keydown.enter.prevent="installUrl"
        />
        <button
          class="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          :disabled="store.busy"
          @click="installUrl"
        >
          {{ store.busy ? t('addons_loading') : t('addons_from_url') }}
        </button>
        <button
          class="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-gray-300 hover:bg-white/5"
          @click="fileInput?.click()"
        >
          {{ t('addons_file') }}
        </button>
      </div>
      <input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="onFile" />

      <button class="mt-1 text-[10px] text-blue-400 hover:underline" @click="showJson = !showJson">
        {{ showJson ? t('addons_hide_json') : t('addons_toggle_json') }}
      </button>
      <div v-if="showJson" class="mt-1 space-y-1">
        <textarea
          v-model="json"
          rows="6"
          spellcheck="false"
          :placeholder="t('addons_json_placeholder')"
          class="w-full rounded-lg border border-white/10 bg-app p-2 font-mono text-[10px] text-gray-100 focus:border-blue-500/60 focus:outline-none"
        />
        <button class="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700" @click="installJson">
          {{ t('addons_install_json') }}
        </button>
      </div>

      <!-- Sicherheitswarnung: Addon enthält Lambda-Code (C++, läuft auf dem ESP) -->
      <div v-if="store.pendingLambda" role="alert" class="mt-1.5 space-y-1.5 rounded-lg border border-red-500/40 bg-red-950/30 p-2">
        <p class="text-[11px] font-semibold text-red-300">⚠ {{ t('addons_lambda_title').replace('{name}', store.pendingLambda.name) }}</p>
        <p class="text-[10px] leading-snug text-gray-300">{{ t('addons_lambda_text') }}</p>
        <pre
          v-for="(snip, i) in store.pendingLambda.snippets"
          :key="i"
          class="overflow-x-auto whitespace-pre-wrap rounded bg-black/40 p-1.5 font-mono text-[10px] text-gray-200"
        >{{ snip }}</pre>
        <div class="flex justify-end gap-2">
          <button class="rounded border border-white/10 px-2.5 py-1 text-[11px] text-gray-200 hover:bg-white/5" @click="store.cancelPendingLambda()">
            {{ t('addons_lambda_cancel') }}
          </button>
          <button class="rounded bg-red-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-800" @click="confirmLambda">
            {{ t('addons_lambda_confirm') }}
          </button>
        </div>
      </div>

      <ul v-if="problems.length" class="mt-1.5 space-y-0.5 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2">
        <li v-for="p in problems" :key="p" class="text-[10px] leading-snug text-amber-300">• {{ p }}</li>
      </ul>
      <p v-else-if="okMessage" class="mt-1.5 text-[10px] text-emerald-400">✓ {{ okMessage }}</p>
      <p class="mt-1 text-[10px] leading-snug text-gray-500">
        {{ t('addons_format_hint') }}
      </p>
    </section>

    <!-- Liste -->
    <section>
      <p class="mb-1 font-semibold text-gray-300">{{ t('addons_installed_title') }}</p>
      <p v-if="!list.length" class="mb-1.5 rounded-lg border border-white/10 bg-app p-2 text-[10px] leading-snug text-gray-500">
        {{ t('addons_none_installed') }}
      </p>
      <div v-for="a in list" :key="a.manifest.id" class="mb-1.5 rounded-lg border border-white/10 bg-app p-2">
        <div class="flex items-center gap-2">
          <span>{{ a.manifest.icon ?? '🧩' }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
              <span class="truncate text-[12px] text-gray-200">{{ a.manifest.name }}</span>
              <span class="shrink-0 text-[10px] text-gray-500">v{{ a.manifest.version }}</span>
              <span class="shrink-0 rounded bg-white/10 px-1 text-[9px] text-gray-400">
                {{ sourceLabel(a.source) }}
              </span>
            </div>
            <p class="truncate text-[10px] text-gray-500" :title="a.manifest.description">
              {{ a.manifest.id }}<span v-if="a.manifest.author"> · {{ a.manifest.author }}</span>
            </p>
          </div>
          <label class="flex shrink-0 items-center gap-1 text-[10px] text-gray-400" :title="t('addons_active_title')">
            <input
              type="checkbox"
              :checked="a.enabled"
              @change="store.setEnabled(a.manifest.id, ($event.target as HTMLInputElement).checked)"
            />
            {{ t('addons_active') }}
          </label>
        </div>

        <p v-if="a.manifest.description" class="mt-1 text-[10px] leading-snug text-gray-400">
          {{ a.manifest.description }}
        </p>

        <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
          <button v-if="a.manifest.settings?.length" class="text-blue-400 hover:underline" @click="openId = openId === a.manifest.id ? null : a.manifest.id">
            {{ openId === a.manifest.id ? t('addons_settings_close') : t('addons_settings_open') }}
          </button>
          <a v-if="a.manifest.homepage" :href="a.manifest.homepage" target="_blank" rel="noreferrer" class="text-blue-400 hover:underline">
            Info
          </a>
          <button class="text-gray-400 hover:text-white" @click="copyManifest(a.manifest.id)">{{ t('addons_copy_manifest') }}</button>
          <button v-if="a.sourceUrl" class="text-gray-400 hover:text-white" @click="store.updateFromSource(a.manifest.id)">
            {{ t('addons_update') }}
          </button>
          <button class="ml-auto text-red-400 hover:underline" @click="store.uninstall(a.manifest.id)">
            {{ t('addons_uninstall') }}
          </button>
        </div>

        <div v-if="openId === a.manifest.id" class="mt-2 space-y-3 border-t border-white/10 pt-2">
          <AddonField
            v-for="f in visibleSettings(a)"
            :key="f.key"
            :spec="f"
            :ctx="ctxFor(a)"
            :model-value="draftFor(a)[f.key]"
            @update:model-value="draftFor(a)[f.key] = $event"
          />
          <div class="flex justify-end">
            <button class="rounded-lg bg-blue-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-blue-700" @click="saveSettings(a)">
              {{ t('addons_save_settings') }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
