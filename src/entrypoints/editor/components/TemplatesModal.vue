<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useDocumentStore } from '@/core/lvgl/document';
import { useTemplatesStore } from '@/core/templates/store';
import { TEMPLATE_CATEGORY_ORDER } from '@/core/templates/builtins';
import type { DashboardTemplate, WidgetTemplate } from '@/core/templates/types';
import TemplatePreview from './TemplatePreview.vue';
import { useI18n } from '@/shared/i18n';
import { categoryName, templateName } from '@/core/templates/labels';
import { useSettingsStore } from '@/shared/settings';
import { TEMPLATE_THEMES, applyTemplateTheme, themeById, DEFAULT_TEMPLATE_THEME } from '@/core/templates/themes';
import type { WidgetNode } from '@/core/lvgl/types';
import { localizeTemplate } from '@/core/templates/content';

const emit = defineEmits<{ (e: 'close'): void }>();
const doc = useDocumentStore();
const templates = useTemplatesStore();
const { t, lang } = useI18n();

const newDashboardName = ref('');
const newWidgetName = ref('');

/** Widget-Vorlagen nach Kategorie gruppiert, in fester Reihenfolge (Unkategorisierte zuletzt). */
const widgetGroups = computed(() => {
  const buckets = new Map<string, WidgetTemplate[]>();
  for (const tpl of templates.widgets) {
    const cat = tpl.category || 'Weitere';
    let bucket = buckets.get(cat);
    if (!bucket) buckets.set(cat, (bucket = []));
    bucket.push(tpl);
  }
  // Bekannte Kategorien in fester Reihenfolge, danach eigene (z. B. „Meine Vorlagen“), zuletzt „Weitere“.
  const custom = [...buckets.keys()].filter((c) => !TEMPLATE_CATEGORY_ORDER.includes(c) && c !== 'Weitere');
  const order = [...TEMPLATE_CATEGORY_ORDER, ...custom, 'Weitere'];
  return order
    .filter((c) => buckets.get(c)?.length)
    .map((category) => ({ category, items: buckets.get(category)! }));
});

onMounted(() => templates.load());

// ── Theme der eingebauten Vorlagen (eigene Vorlagen behalten ihre Farben) ──
const settings = useSettingsStore();
const theme = computed(() => themeById(settings.settings.templateTheme) ?? themeById(DEFAULT_TEMPLATE_THEME)!);
const themedBuiltins = computed(() => {
  const map = new Map<string, WidgetNode>();
  // Eingebaute Vorlagen: Beispielinhalte in der UI-Sprache, dann Farben im Theme.
  for (const tpl of templates.widgets) if (tpl.builtin) map.set(tpl.id, applyTemplateTheme(localizeTemplate(tpl.node, lang.value), theme.value));
  return map;
});
const nodeFor = (tpl: WidgetTemplate): WidgetNode => themedBuiltins.value.get(tpl.id) ?? tpl.node;
const previewBg = (tpl: WidgetTemplate) => (tpl.builtin ? theme.value.surfaces[0] : undefined);

// ── Import / Export eigener Vorlagen ──
const importInput = ref<HTMLInputElement | null>(null);
const ioStatus = ref('');
async function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const n = await templates.importJson(await file.text());
    ioStatus.value = t('tpl_imported').replace('{n}', String(n));
  } catch (e) {
    ioStatus.value = t('tpl_import_failed') + (e as Error).message;
  }
}
function exportUser() {
  const blob = new Blob([templates.exportUserJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lvgl-studio-templates.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function saveDashboard() {
  await templates.saveDashboard(newDashboardName.value || `Dashboard ${templates.dashboards.length + 1}`, doc.screen);
  newDashboardName.value = '';
}

function applyDashboard(tpl: DashboardTemplate) {
  // Ersetzt die LVGL-Widgets; nicht-LVGL-Teile des YAML bleiben beim Export erhalten.
  doc.loadScreen(JSON.parse(JSON.stringify(tpl.screen)));
  emit('close');
}

async function saveSelectedWidget() {
  if (!doc.selected) return;
  await templates.saveWidget(newWidgetName.value || doc.selected.type, doc.selected);
  newWidgetName.value = '';
}

function insertWidget(tpl: WidgetTemplate) {
  // Skaliert die Vorlage bei Bedarf deterministisch auf die aktuelle Displaygröße.
  // Eingebaute Vorlagen kommen im gewählten Theme.
  doc.insertTemplate(nodeFor(tpl));
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" v-dialog="() => emit('close')" @click.self="emit('close')">
    <div class="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/10 bg-panel">
      <header class="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 class="text-sm font-semibold text-white">{{ t('tpl_title') }}</h2>
        <button class="rounded p-1 text-gray-400 hover:bg-white/5 hover:text-white" :title="t('common_close')" :aria-label="t('common_close')" @click="emit('close')">✕</button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <!-- Dashboards -->
        <section class="mb-6">
          <h3 class="mb-2 text-xs font-semibold text-gray-200">{{ t('tpl_dashboards') }}</h3>
          <div class="mb-2 flex gap-2">
            <input
              v-model="newDashboardName"
              :placeholder="t('tpl_dashboard_name_placeholder')"
              class="flex-1 rounded-lg border border-white/10 bg-field px-3 py-1.5 text-xs text-gray-100 focus:border-blue-500/60 focus:outline-none"
            />
            <button class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700" @click="saveDashboard">
              {{ t('tpl_save_current') }}
            </button>
          </div>
          <div v-if="!templates.dashboards.length" class="text-[11px] text-gray-500">{{ t('tpl_no_dashboards') }}</div>
          <div v-for="tpl in templates.dashboards" :key="tpl.id" class="mb-1.5 flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-2">
            <TemplatePreview :nodes="tpl.screen.children" :box="72" :bg="tpl.screen.bg_color" />
            <div class="min-w-0 flex-1">
              <div class="truncate text-xs text-gray-200">{{ templateName(tpl, lang) }}</div>
              <div class="text-[10px] text-gray-500">{{ tpl.screen.children.length }} Widgets · {{ tpl.screen.width }}×{{ tpl.screen.height }}</div>
            </div>
            <div class="flex shrink-0 gap-1.5">
              <button class="rounded border border-white/10 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-white/5" @click="applyDashboard(tpl)">{{ t('tpl_apply') }}</button>
              <button class="rounded border border-white/10 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-950/40" @click="templates.remove(tpl.id)">{{ t('tpl_delete') }}</button>
            </div>
          </div>
        </section>

        <!-- Widget-Vorlagen -->
        <section>
          <h3 class="mb-2 text-xs font-semibold text-gray-200">{{ t('tpl_widget_templates') }}</h3>

          <!-- Theme der eingebauten Vorlagen -->
          <div class="mb-3 rounded-lg border border-white/10 bg-white/5 p-2">
            <p class="mb-1.5 text-[11px] font-semibold text-gray-300">{{ t('tpl_theme') }}</p>
            <div class="flex flex-wrap gap-1.5" role="group" :aria-label="t('tpl_theme')">
              <button
                v-for="th in TEMPLATE_THEMES"
                :key="th.id"
                type="button"
                class="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]"
                :class="theme.id === th.id ? 'border-blue-400/60 bg-blue-500/15 text-white' : 'border-white/10 text-gray-300 hover:bg-white/5'"
                :aria-pressed="theme.id === th.id"
                @click="settings.saveTemplateTheme(th.id)"
              >
                <span class="flex" aria-hidden="true">
                  <span class="h-3 w-3 rounded-l-sm" :style="{ background: th.surfaces[1] }" />
                  <span class="h-3 w-3" :style="{ background: th.accents.blue }" />
                  <span class="h-3 w-3 rounded-r-sm" :style="{ background: th.accents.green }" />
                </span>
                {{ lang === 'de' ? th.name.de : th.name.en }}
              </button>
            </div>
            <p class="mt-1.5 text-[10px] text-gray-500">{{ t('tpl_theme_hint') }}</p>
          </div>

          <div class="mb-2 flex items-center gap-2 text-[11px]">
            <input ref="importInput" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" />
            <button class="rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5" @click="importInput?.click()">{{ t('tpl_import') }}</button>
            <button class="rounded border border-white/10 px-2 py-0.5 text-gray-300 hover:bg-white/5 disabled:opacity-40" :disabled="!templates.user.length" @click="exportUser">{{ t('tpl_export_mine') }}</button>
            <span v-if="ioStatus" role="status" class="text-gray-400">{{ ioStatus }}</span>
          </div>
          <div class="mb-2 flex gap-2">
            <input
              v-model="newWidgetName"
              :placeholder="doc.selected ? t('tpl_widget_placeholder_selected').replace('{type}', doc.selected.type) : t('tpl_widget_placeholder_none')"
              :disabled="!doc.selected"
              class="flex-1 rounded-lg border border-white/10 bg-field px-3 py-1.5 text-xs text-gray-100 focus:border-blue-500/60 focus:outline-none disabled:opacity-50"
            />
            <button
              class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="!doc.selected"
              @click="saveSelectedWidget"
            >
              {{ t('tpl_save_selection') }}
            </button>
          </div>
          <div v-for="group in widgetGroups" :key="group.category" class="mb-4 last:mb-0">
            <h4 class="mb-1.5 text-[10px] font-semibold text-gray-400">{{ categoryName(group.category, lang) }}</h4>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div v-for="tpl in group.items" :key="tpl.id" class="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/5 p-2">
                <TemplatePreview :nodes="[nodeFor(tpl)]" :box="104" :bg="previewBg(tpl)" class="mx-auto" />
                <div class="flex items-center justify-between gap-1">
                  <span class="truncate text-[11px] text-gray-200" :title="templateName(tpl, lang)">{{ templateName(tpl, lang) }}</span>
                  <div class="flex shrink-0 gap-1">
                    <button class="rounded border border-white/10 px-2 py-0.5 text-[11px] text-blue-300 hover:bg-blue-950/40" :title="t('tpl_insert')" @click="insertWidget(tpl)">＋</button>
                    <button v-if="!tpl.builtin" class="rounded border border-white/10 px-1.5 py-0.5 text-[11px] text-red-400 hover:bg-red-950/40" @click="templates.remove(tpl.id)">✕</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
