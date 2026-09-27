<script setup lang="ts">
import { computed, ref } from 'vue';
import { pageLabel, useDocumentStore } from '@/core/lvgl/document';
import { CATALOG_BY_TYPE } from '@/core/lvgl/catalog';
import { NO_GRADIENT, NO_SHADOW, STYLEABLE_PARTS } from '@/core/yaml/mapping';
import { PROP_FIELDS, UNIVERSAL_FIELD_KEYS } from '@/core/lvgl/fields';
import type { WidgetNode, WidgetType } from '@/core/lvgl/types';
import IconPicker from './IconPicker.vue';
import HostAccessHint from '@/shared/HostAccessHint.vue';
import { useI18n } from '@/shared/i18n';
import { hasSelectOptions, partFieldLabel as partLabelFor, partGroupLabel, propLabel, selectOptions } from '@/core/lvgl/propLabels';

const doc = useDocumentStore();
const { t, lang } = useI18n();
const showIconPicker = ref(false);

/** Bei Text-tragenden Widgets (label/icon/button/checkbox) einen Icon-Picker anbieten. */
const canPickIcon = computed(() => {
  const t = doc.selected?.type;
  return t === 'label' || t === 'icon' || t === 'button' || t === 'checkbox';
});

function onIconSelected(glyph: string) {
  if (doc.selected) doc.updateProps(doc.selected.id, { text: glyph });
}

type FieldKind = 'text' | 'number' | 'color' | 'bool' | 'list' | 'select' | 'range';
interface Field {
  key: string;
  kind: FieldKind;
}

// Beschriftungen (Felder, Dropdown-Optionen, Part-Gruppen) zweisprachig: core/lvgl/propLabels.ts
const label = (key: string) => propLabel(key, lang.value);
const opts = (key: string) => selectOptions(key, lang.value);

const BOOL_KEYS = new Set(['checked', 'hidden', 'recolor', 'one_line', 'password_mode', 'animated', 'line_rounded', 'checkable', 'scrollable', 'adjustable', 'indicator_arc_rounded', 'arc_rounded']);
const NUM_KEYS = new Set(['font_size', 'value', 'min_value', 'max_value', 'arc_width', 'decimals',
  'brightness', 'selected_index', 'max_length', 'size', 'img_buffer_size']);

function kindForKey(key: string): FieldKind {
  if (hasSelectOptions(key)) return 'select';
  if (BOOL_KEYS.has(key)) return 'bool';
  if (key === 'options') return 'list';
  if (key.endsWith('_color') || key === 'color' || key === 'bg_color') return 'color';
  if (key === 'opa' || key.endsWith('_opa') || key === 'brightness') return 'range'; // 0..100 als Slider
  if (
    key.endsWith('_width') || key.endsWith('_pad') || key.endsWith('pad_all') ||
    key.endsWith('_x') || key.endsWith('_y') || key.endsWith('_spread') || key.endsWith('radius') ||
    NUM_KEYS.has(key)
  )
    return 'number';
  return 'text';
}

// Welche Bild-Detailfelder je Quelle sinnvoll sind.
const IMG_FIELDS_BY_SOURCE: Record<string, Set<string>> = {
  '': new Set(),
  online: new Set(['img_url', 'img_format', 'img_type', 'img_update_interval', 'img_resize', 'img_transparency', 'img_buffer_size']),
  file: new Set(['img_file', 'img_type', 'img_resize', 'img_transparency']),
  ref: new Set(['img_ref']),
};

/** Seiten-Navigation: „Weiter"-Button & Co. – Optionen ergeben sich aus den Seiten. */
const pageActionOptions = computed(() => [
  { v: '', l: t('prop_page_action_none') },
  { v: 'next', l: t('prop_page_action_next') },
  { v: 'prev', l: t('prop_page_action_prev') },
  ...doc.pages.map((p, i) => ({ v: `show:${p.id}`, l: `${t('prop_page_action_show')}: ${pageLabel(p, i)}` })),
]);

const fields = computed<Field[]>(() => {
  const node = doc.selected;
  if (!node) return [];
  const src = String(node.props.img_source ?? '');
  return (PROP_FIELDS[node.type] ?? [])
    .filter((key) => {
      // Bild-Detailfelder nur passend zur gewählten Quelle einblenden.
      if (key.startsWith('img_') && key !== 'img_source') {
        return (IMG_FIELDS_BY_SOURCE[src] ?? new Set()).has(key);
      }
      return true;
    })
    .map((key) => ({ key, kind: kindForKey(key) }));
});

const showAdvanced = ref(false);
const universalFields = computed<Field[]>(() => {
  const node = doc.selected;
  const type = node?.type;
  return UNIVERSAL_FIELD_KEYS.filter((key) => {
    if ((key === 'bg_grad_color' || key === 'bg_grad_dir') && type && NO_GRADIENT.has(type)) return false;
    // Schatten zeichnet LVGL am RECHTECK des Widgets. Bei diesen Typen sieht das immer
    // falsch aus (Kasten um Bogen/Regler/Häkchen) → gar nicht erst anbieten.
    if (key.startsWith('shadow_') && type && NO_SHADOW.has(type)) return false;
    // Scroll-Einstellungen sind nur an Containern mit Kindern sinnvoll.
    if ((key === 'scrollbar_mode' || key === 'scrollable') && !node?.children.length) return false;
    return true;
  }).map((key) => ({ key, kind: kindForKey(key) }));
});

const typeLabel = computed(() =>
  doc.selected ? (CATALOG_BY_TYPE[doc.selected.type]?.label ?? doc.selected.type) : '',
);

function propColor(key: string): string {
  const v = doc.selected?.props[key];
  return typeof v === 'string' ? v : '#000000';
}
function propStr(key: string): string {
  const v = doc.selected?.props[key];
  return v == null ? '' : String(v);
}
/** Leerer String, wenn die Zahl nicht gesetzt ist (statt irreführender 0). */
function propNumOrEmpty(key: string): number | '' {
  const v = doc.selected?.props[key];
  return typeof v === 'number' ? v : '';
}
/** Setzt eine Zahl; leeres Feld → Prop entfernen (nicht als 0 schreiben). */
function setNum(key: string, raw: string) {
  if (!doc.selected) return;
  doc.updateProps(doc.selected.id, { [key]: raw === '' ? undefined : Number(raw) });
}
/** Deckkraft-Wert für den Slider (ungesetzt = 100 = voll deckend). */
function propRange(key: string): number {
  const v = doc.selected?.props[key];
  return typeof v === 'number' ? v : 100;
}
function optionsStr(): string {
  const v = doc.selected?.props.options;
  return Array.isArray(v) ? v.join('\n') : '';
}

function setProp(key: string, value: unknown) {
  if (!doc.selected) return;
  const patch: Record<string, unknown> = { [key]: value };
  // Ein Verlauf braucht eine Richtung. Wählt man nur eine Farbe, ergänzen wir sie, damit
  // der Verlauf sofort sichtbar ist („Kein Verlauf" schaltet ihn weiterhin ab).
  if (key === 'bg_grad_color' && value && !doc.selected.props.bg_grad_dir) patch.bg_grad_dir = 'VER';
  doc.updateProps(doc.selected.id, patch);
}
function setOptions(text: string) {
  if (!doc.selected) return;
  const arr = text.split('\n').map((s) => s.trim()).filter(Boolean);
  doc.updateProps(doc.selected.id, { options: arr });
}

/** Ausrichtung setzen: x/y werden zu Offsets ab dem Ankerpunkt → auf 0 zurücksetzen. */
function setAlign(value: string) {
  if (!doc.selected) return;
  doc.updateProps(doc.selected.id, { align: value });
  if (value) doc.updateGeometry(doc.selected.id, { x: 0, y: 0 });
}

// Feature 4: Layout (Flex/Grid) bearbeiten – props.layout als Ganzes patchen.
function layoutObj(): Record<string, unknown> {
  const l = doc.selected?.props.layout;
  return l && typeof l === 'object' ? (l as Record<string, unknown>) : {};
}
function layoutVal(key: string): string {
  const v = layoutObj()[key];
  return v == null ? '' : String(v);
}
function setLayout(patch: Record<string, unknown>) {
  if (!doc.selected) return;
  doc.updateProps(doc.selected.id, { layout: { ...layoutObj(), ...patch } });
}

/** Elternknoten des ausgewählten Widgets (für Grid-/Flex-Kind-Optionen). */
function findParentOf(id: string): WidgetNode | null {
  const walk = (nodes: WidgetNode[], parent: WidgetNode | null): WidgetNode | null => {
    for (const n of nodes) {
      if (n.id === id) return parent;
      const f = walk(n.children, n);
      if (f !== null || n.children.some((c) => c.id === id)) return f ?? n;
    }
    return null;
  };
  return walk(doc.screen.children, null);
}
function parentLayoutType(): string {
  const id = doc.selected?.id;
  if (!id) return '';
  const l = findParentOf(id)?.props.layout as Record<string, unknown> | undefined;
  return String(l?.type ?? '').toLowerCase();
}
const parentIsGrid = computed(() => parentLayoutType() === 'grid');
const parentIsFlex = computed(() => parentLayoutType() === 'flex');

// Style-Felder je Part (Indicator-Füllfarbe kommt aus „Farbe", daher dort kein bg_color).
const PART_SUFFIXES_UI = ['bg_color', 'radius', 'border_color', 'border_width', 'shadow_color', 'shadow_width', 'pad_all'];
/** Der Arc-Indicator ist ein Bogen-Strich – dort greifen nur die ARC-Style-Props. */
const ARC_INDICATOR_UI = ['arc_color', 'arc_width', 'arc_opa', 'arc_rounded'];
/** Kästchen der Checkbox: Hintergrund, Rahmen, Rundung. */
const CHECKBOX_INDICATOR_UI = ['bg_color', 'border_color', 'border_width', 'radius'];

function partFieldsFor(type: WidgetType, part: string): string[] {
  if (type === 'arc' && part === 'indicator') return ARC_INDICATOR_UI;
  if (type === 'checkbox' && part === 'indicator') return CHECKBOX_INDICATOR_UI;
  // Beim Indicator bleibt die Füllfarbe dem `color`-Prop vorbehalten.
  return PART_SUFFIXES_UI.filter((s) => !(part === 'indicator' && s === 'bg_color'));
}
function partFieldLabel(key: string): string {
  return partLabelFor(key, lang.value);
}
const showParts = ref(false);
const partGroups = computed(() => {
  const node = doc.selected;
  const type = node?.type;
  if (!type) return [];
  return (STYLEABLE_PARTS[type] ?? [])
    // Der Arc zeichnet seinen Griff NUR, wenn er bedienbar ist – sonst wären die
    // Knopf-Einstellungen wirkungslos (LVGL: adjustable, Default false).
    .filter((part) => !(part === 'knob' && type === 'arc' && node?.props.adjustable !== true))
    .map((part) => ({
    part,
    label: partGroupLabel(part, type, lang.value),
    fields: partFieldsFor(type, part).map((s) => ({
      key: `${part}_${s}`,
      kind: kindForKey(`${part}_${s}`),
    })),
  }));
});
</script>

<template>
  <div>
    <h2 class="mb-2 text-xs font-semibold text-gray-200">
      {{ t('prop_title') }}
    </h2>

    <!-- Nichts ausgewählt → Screen-Einstellungen -->
    <div v-if="!doc.selected" class="space-y-2 rounded-lg border border-white/10 bg-field p-3">
      <p class="text-[11px] text-gray-500">{{ t('prop_screen') }}</p>
      <label class="block text-[10px] text-gray-400">{{ t('prop_width') }}</label>
      <input
        type="number"
        :value="doc.screen.width"
        class="prop-input"
        @change="doc.setScreenProp({ width: Number(($event.target as HTMLInputElement).value) })"
      />
      <label class="block text-[10px] text-gray-400">{{ t('prop_height') }}</label>
      <input
        type="number"
        :value="doc.screen.height"
        class="prop-input"
        @change="doc.setScreenProp({ height: Number(($event.target as HTMLInputElement).value) })"
      />
      <label class="block text-[10px] text-gray-400">{{ t('prop_background') }}</label>
      <input
        type="color"
        :value="doc.screen.bg_color"
        class="h-8 w-full rounded border border-white/10 bg-transparent"
        @input="doc.setScreenProp({ bg_color: ($event.target as HTMLInputElement).value })"
      />
    </div>

    <!-- Widget ausgewählt -->
    <div v-else class="space-y-3 rounded-lg border border-white/10 bg-field p-3">
      <div class="text-[11px] text-blue-400">{{ typeLabel }} · {{ doc.selected.id }}</div>

      <button
        v-if="canPickIcon"
        class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1.5 text-[11px] text-gray-200 hover:bg-white/10"
        @click="showIconPicker = true"
      >
        <span class="mdi-glyph text-base">{{ doc.selected.props.text || '★' }}</span>
        {{ t('prop_icon_pick') }}
      </button>

      <!-- Name + Entity -->
      <div>
        <label class="block text-[10px] text-gray-400">{{ t('prop_name') }}</label>
        <input
          type="text"
          :value="doc.selected.name ?? ''"
          :placeholder="t('prop_optional')"
          class="prop-input"
          @change="doc.rename(doc.selected!.id, ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div>
        <label class="block text-[10px] text-gray-400">{{ t('prop_ha_entity') }}</label>
        <input
          type="text"
          list="ha-entities"
          :value="doc.selected.entity ?? ''"
          :placeholder="t('prop_ha_entity_placeholder')"
          class="prop-input"
          @change="doc.setEntity(doc.selected!.id, ($event.target as HTMLInputElement).value)"
        />
        <p class="mt-1 text-[10px] leading-tight text-gray-500">
          {{ t('prop_ha_entity_hint') }}
        </p>
      </div>

      <!-- Seiten-Navigation (nur ohne Entity, sonst gehört on_press der Entity-Steuerung) -->
      <div v-if="doc.pages.length > 1 || doc.selected.props.page_action">
        <label class="block text-[10px] text-gray-400">{{ t('prop_page_action') }}</label>
        <select
          class="prop-input"
          :value="propStr('page_action')"
          :disabled="!!doc.selected.entity"
          @change="setProp('page_action', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="o in pageActionOptions" :key="o.v" :value="o.v">{{ o.l }}</option>
        </select>
        <p class="mt-1 text-[10px] leading-tight text-gray-500">
          <template v-if="doc.selected.entity">
            {{ t('prop_page_action_hint_entity') }}
          </template>
          <template v-else>
            {{ t('prop_page_action_hint') }}
          </template>
        </p>
      </div>

      <!-- Z-Reihenfolge (Ebene) -->
      <div>
        <label class="block text-[10px] text-gray-400">{{ t('prop_z_order') }}</label>
        <div class="flex gap-1">
          <button class="prop-btn flex items-center justify-center" :title="t('prop_z_back_all')" @click="doc.reorder(doc.selected!.id, 'back')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 13l6 6 6-6" /><path d="M6 6l6 6 6-6" opacity="0.45" />
            </svg>
          </button>
          <button class="prop-btn flex items-center justify-center" :title="t('prop_z_back')" @click="doc.reorder(doc.selected!.id, 'backward')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          <button class="prop-btn flex items-center justify-center" :title="t('prop_z_front')" @click="doc.reorder(doc.selected!.id, 'forward')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </button>
          <button class="prop-btn flex items-center justify-center" :title="t('prop_z_front_all')" @click="doc.reorder(doc.selected!.id, 'front')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 11l6-6 6 6" /><path d="M6 18l6-6 6 6" opacity="0.45" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Geometrie -->
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] text-gray-400">X</label>
          <input type="number" :value="doc.selected.geometry.x" class="prop-input"
            @change="doc.updateGeometry(doc.selected!.id, { x: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-400">Y</label>
          <input type="number" :value="doc.selected.geometry.y" class="prop-input"
            @change="doc.updateGeometry(doc.selected!.id, { y: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-400">{{ t('prop_width') }}</label>
          <input type="number" :value="doc.selected.geometry.width" class="prop-input"
            @change="doc.updateGeometry(doc.selected!.id, { width: Number(($event.target as HTMLInputElement).value) })" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-400">{{ t('prop_height') }}</label>
          <input type="number" :value="doc.selected.geometry.height" class="prop-input"
            @change="doc.updateGeometry(doc.selected!.id, { height: Number(($event.target as HTMLInputElement).value) })" />
        </div>
      </div>

      <!-- Feature 4: Ausrichtung im Eltern -->
      <div>
        <label class="block text-[10px] text-gray-400">{{ t('prop_align_in_parent') }}</label>
        <select :value="propStr('align')" class="prop-input"
          @change="setAlign(($event.target as HTMLSelectElement).value)">
          <option v-for="o in opts('align')" :key="o.v" :value="o.v">{{ o.l }}</option>
        </select>
      </div>

      <!-- Feature 4: Layout (Flex/Grid) mit Row/Col-Gap -->
      <div>
        <label class="block text-[10px] text-gray-400">{{ t('prop_layout') }}</label>
        <select :value="layoutVal('type')" class="prop-input"
          @change="setLayout({ type: ($event.target as HTMLSelectElement).value })">
          <option value="">{{ t('prop_layout_none') }}</option>
          <option value="flex">Flex</option>
          <option value="grid">Grid</option>
        </select>
      </div>
      <div v-if="layoutVal('type') === 'flex' || layoutVal('type') === 'grid'" class="space-y-2">
        <div v-if="layoutVal('type') === 'flex'">
          <label class="block text-[10px] text-gray-400">{{ t('prop_flow') }}</label>
          <select :value="layoutVal('flex_flow') || 'row'" class="prop-input"
            @change="setLayout({ flex_flow: ($event.target as HTMLSelectElement).value })">
            <option value="row">{{ t('prop_flow_row') }}</option>
            <option value="column">{{ t('prop_flow_col') }}</option>
            <option value="row_wrap">{{ t('prop_flow_row_wrap') }}</option>
          </select>
        </div>
        <div v-if="layoutVal('type') === 'grid'" class="space-y-2">
          <div>
            <label class="block text-[10px] text-gray-400">{{ t('prop_grid_columns') }}</label>
            <input type="text" :value="layoutVal('grid_columns')" class="prop-input" placeholder="FR(1), FR(1)"
              @change="setLayout({ grid_columns: ($event.target as HTMLInputElement).value })" />
          </div>
          <div>
            <label class="block text-[10px] text-gray-400">{{ t('prop_grid_rows') }}</label>
            <input type="text" :value="layoutVal('grid_rows')" class="prop-input" placeholder="FR(1), FR(1)"
              @change="setLayout({ grid_rows: ($event.target as HTMLInputElement).value })" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] text-gray-400">{{ t('prop_col_gap') }}</label>
            <input type="number" :value="layoutVal('pad_column')" class="prop-input"
              @change="setLayout({ pad_column: Number(($event.target as HTMLInputElement).value) })" />
          </div>
          <div>
            <label class="block text-[10px] text-gray-400">{{ t('prop_row_gap') }}</label>
            <input type="number" :value="layoutVal('pad_row')" class="prop-input"
              @change="setLayout({ pad_row: Number(($event.target as HTMLInputElement).value) })" />
          </div>
        </div>
      </div>

      <!-- Kind-Optionen, wenn das Elternelement ein Layout hat -->
      <div v-if="parentIsGrid" class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] text-gray-400">{{ t('prop_grid_col') }}</label>
          <input type="number" :value="propNumOrEmpty('grid_cell_column_pos')" class="prop-input"
            @change="setNum('grid_cell_column_pos', ($event.target as HTMLInputElement).value)" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-400">{{ t('prop_grid_row') }}</label>
          <input type="number" :value="propNumOrEmpty('grid_cell_row_pos')" class="prop-input"
            @change="setNum('grid_cell_row_pos', ($event.target as HTMLInputElement).value)" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-400">{{ t('prop_col_span') }}</label>
          <input type="number" :value="propNumOrEmpty('grid_cell_column_span')" class="prop-input"
            @change="setNum('grid_cell_column_span', ($event.target as HTMLInputElement).value)" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-400">{{ t('prop_row_span') }}</label>
          <input type="number" :value="propNumOrEmpty('grid_cell_row_span')" class="prop-input"
            @change="setNum('grid_cell_row_span', ($event.target as HTMLInputElement).value)" />
        </div>
      </div>
      <div v-else-if="parentIsFlex">
        <label class="block text-[10px] text-gray-400">{{ t('prop_flex_grow') }}</label>
        <input type="number" :value="propNumOrEmpty('flex_grow')" class="prop-input"
          @change="setNum('flex_grow', ($event.target as HTMLInputElement).value)" />
      </div>

      <!-- Typ-spezifische Felder -->
      <div v-for="field in fields" :key="field.key">
        <label class="block text-[10px] text-gray-400">{{ label(field.key) }}</label>

        <input v-if="field.kind === 'color'" type="color" :value="propColor(field.key)"
          class="h-8 w-full rounded border border-white/10 bg-transparent"
          @input="setProp(field.key, ($event.target as HTMLInputElement).value)" />

        <input v-else-if="field.kind === 'number'" type="number" :value="propNumOrEmpty(field.key)"
          class="prop-input"
          @change="setNum(field.key, ($event.target as HTMLInputElement).value)" />

        <label v-else-if="field.kind === 'bool'" class="flex items-center gap-2 text-[11px] text-gray-300">
          <input type="checkbox" :checked="!!doc.selected!.props[field.key]"
            @change="setProp(field.key, ($event.target as HTMLInputElement).checked)" />
          {{ t('prop_active') }}
        </label>

        <textarea v-else-if="field.kind === 'list'" :value="optionsStr()" rows="3"
          class="prop-input resize-none" @change="setOptions(($event.target as HTMLTextAreaElement).value)" />

        <select v-else-if="field.kind === 'select'" :value="propStr(field.key)" class="prop-input"
          @change="setProp(field.key, ($event.target as HTMLSelectElement).value)">
          <option v-for="o in opts(field.key)" :key="o.v" :value="o.v">{{ o.l }}</option>
        </select>

        <div v-else-if="field.kind === 'range'" class="flex items-center gap-2">
          <input type="range" min="0" max="100" :value="propRange(field.key)" class="flex-1"
            @input="setNum(field.key, ($event.target as HTMLInputElement).value)" />
          <span class="w-8 shrink-0 text-right text-[11px] text-gray-400">{{ propRange(field.key) }}%</span>
        </div>

        <input v-else type="text" :value="propStr(field.key)" class="prop-input"
          @change="setProp(field.key, ($event.target as HTMLInputElement).value)" />
        <!-- Live-Bild von einem Gerät im Heimnetz: Zugriff auf dessen Host erlauben -->
        <HostAccessHint v-if="field.key === 'img_url' && propStr('img_url')" :url="propStr('img_url')" />
      </div>

      <!-- Styling einzelner Teile (Regler-Füllung / Knopf) -->
      <div v-if="partGroups.length" class="mt-2 border-t border-white/10 pt-2">
        <button
          class="flex w-full items-center gap-1 text-[11px] font-semibold text-gray-300 hover:text-gray-300"
          @click="showParts = !showParts"
        >
          <span>{{ showParts ? '▾' : '▸' }}</span> {{ t('prop_parts_title') }}
        </button>
        <div v-if="showParts" class="mt-1.5 space-y-3">
          <div v-for="grp in partGroups" :key="grp.part" class="space-y-2">
            <div class="text-[10px] font-semibold text-gray-400">{{ grp.label }}</div>
            <div v-for="field in grp.fields" :key="field.key">
              <label class="block text-[10px] text-gray-400">{{ partFieldLabel(field.key) }}</label>

              <input v-if="field.kind === 'color'" type="color" :value="propColor(field.key)"
                class="h-8 w-full rounded border border-white/10 bg-transparent"
                @input="setProp(field.key, ($event.target as HTMLInputElement).value)" />

              <div v-else-if="field.kind === 'range'" class="flex items-center gap-2">
                <input type="range" min="0" max="100" :value="propRange(field.key)" class="flex-1"
                  @input="setNum(field.key, ($event.target as HTMLInputElement).value)" />
                <span class="w-8 shrink-0 text-right text-[11px] text-gray-400">{{ propRange(field.key) }}%</span>
              </div>

              <input v-else type="number" :value="propNumOrEmpty(field.key)" class="prop-input"
                @change="setNum(field.key, ($event.target as HTMLInputElement).value)" />
            </div>
          </div>
        </div>
      </div>

      <!-- Universelle Style-Optionen (Deckkraft, Schatten, Kontur, Padding …) -->
      <div class="mt-2 border-t border-white/10 pt-2">
        <button
          class="flex w-full items-center gap-1 text-[11px] font-semibold text-gray-300 hover:text-gray-300"
          @click="showAdvanced = !showAdvanced"
        >
          <span>{{ showAdvanced ? '▾' : '▸' }}</span> {{ t('prop_advanced_title') }}
        </button>
        <div v-if="showAdvanced" class="mt-1.5 space-y-2">
          <div v-for="field in universalFields" :key="field.key">
            <label class="block text-[10px] text-gray-400">{{ label(field.key) }}</label>

            <input v-if="field.kind === 'color'" type="color" :value="propColor(field.key)"
              class="h-8 w-full rounded border border-white/10 bg-transparent"
              @input="setProp(field.key, ($event.target as HTMLInputElement).value)" />

            <label v-else-if="field.kind === 'bool'" class="flex items-center gap-2 text-[11px] text-gray-300">
              <input type="checkbox" :checked="!!doc.selected!.props[field.key]"
                @change="setProp(field.key, ($event.target as HTMLInputElement).checked)" />
              {{ t('prop_active') }}
            </label>

            <select v-else-if="field.kind === 'select'" :value="propStr(field.key)" class="prop-input"
              @change="setProp(field.key, ($event.target as HTMLSelectElement).value)">
              <option v-for="o in opts(field.key)" :key="o.v" :value="o.v">{{ o.l }}</option>
            </select>

            <div v-else-if="field.kind === 'range'" class="flex items-center gap-2">
              <input type="range" min="0" max="100" :value="propRange(field.key)" class="flex-1"
                @input="setNum(field.key, ($event.target as HTMLInputElement).value)" />
              <span class="w-8 shrink-0 text-right text-[11px] text-gray-400">{{ propRange(field.key) }}%</span>
            </div>

            <input v-else type="number" :value="propNumOrEmpty(field.key)" class="prop-input"
              @change="setNum(field.key, ($event.target as HTMLInputElement).value)" />
          </div>
        </div>
      </div>
    </div>

    <IconPicker v-if="showIconPicker" @select="onIconSelected" @close="showIconPicker = false" />
  </div>
</template>

<style scoped>
.mdi-glyph {
  font-family: 'Material Design Icons', sans-serif;
}
.prop-input {
  width: 100%;
  border-radius: 0.375rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--color-app);
  padding: 0.35rem 0.5rem;
  font-size: 11px;
  color: var(--color-gray-200);
  /* MDI zuerst: Icon-Glyphen (z. B. im Text-Feld) rendern als Icon statt als □. */
  font-family: 'Material Design Icons', ui-sans-serif, system-ui, sans-serif;
}
.prop-btn {
  flex: 1;
  border-radius: 0.375rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--color-app);
  padding: 0.25rem;
  font-size: 11px;
  color: var(--color-gray-300);
}
.prop-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}
.prop-input:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.6);
}
</style>
