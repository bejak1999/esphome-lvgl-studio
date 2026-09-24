/**
 * Prüft die vom Editor verwalteten YAML-Keys gegen das ECHTE ESPHome-Schema.
 * Verhindert „tote" Einstellungen: Regler im UI, die ESPHome stillschweigend ignoriert
 * (so wie früher `text_letter_spacing` statt `text_letter_space` oder `animated` am switch).
 *
 * Läuft nur, wenn das Schema lokal vorliegt – sonst wird der Test übersprungen:
 *   curl -s https://schema.esphome.io/dev/lvgl.json -o lvgl-schema.json
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { TEXT_PROPS, TYPE_MAP, UNIVERSAL_PROPS } from './mapping';
import { screensToYaml } from './engine';
import { createWidget } from '../lvgl/catalog';
import type { Screen, WidgetType } from '../lvgl/types';

const CANDIDATES = [
  'lvgl-schema.json',
  'C:/Users/Benni/AppData/Local/Temp/lvgl.json',
];
const path = CANDIDATES.find((p) => existsSync(p));

/**
 * Keys, die das Schema-Dump nicht je Widget auflistet, die es aber gibt (sie werden erst
 * wirksam/ergänzt, wenn der Elterncontainer ein Flex-/Grid-Layout hat).
 */
const LAYOUT_CHILD_KEYS = new Set([
  'flex_grow',
  'grid_cell_row_pos',
  'grid_cell_column_pos',
  'grid_cell_row_span',
  'grid_cell_column_span',
]);

describe.runIf(path)('Schema-Audit: keine toten Einstellungen', () => {
  it('alle verwalteten Keys existieren im ESPHome-Schema', () => {
    const schema = JSON.parse(readFileSync(path!, 'utf8'));
    const CV = schema.lvgl.schemas.WIDGET_TYPES.schema.config_vars;
    const problems: string[] = [];

    for (const [type, tm] of Object.entries(TYPE_MAP)) {
      const widget = CV[tm.yaml];
      if (!widget) {
        problems.push(`Widget "${tm.yaml}" (${type}) existiert nicht`);
        continue;
      }
      const keys = new Set(Object.keys(widget.schema?.config_vars ?? {}));
      const check = (k: string, src: string) => {
        if (!keys.has(k) && !LAYOUT_CHILD_KEYS.has(k)) problems.push(`${tm.yaml}: "${k}" (${src})`);
      };
      for (const pm of tm.props) check(pm.yaml, `${type}-spezifisch`);
      for (const pm of UNIVERSAL_PROPS) check(pm.yaml, 'universal');
      if (['label', 'icon', 'checkbox', 'button'].includes(type)) {
        for (const pm of TEXT_PROPS) check(pm.yaml, 'text');
      }
    }

    expect(problems, `Tote Einstellungen:\n${problems.join('\n')}`).toEqual([]);
  });

  it('kein Skalar dort, wo ESPHome einen Block (Dictionary) erwartet', () => {
    // Genau dieser Fehler war `checked: true` am switch → „expected a dictionary".
    const schema = JSON.parse(readFileSync(path!, 'utf8'));
    const CV = schema.lvgl.schemas.WIDGET_TYPES.schema.config_vars;
    const problems: string[] = [];

    for (const [type, tm] of Object.entries(TYPE_MAP)) {
      const cv = CV[tm.yaml]?.schema?.config_vars;
      if (!cv) continue;
      const scalarKinds = new Set(['color', 'number', 'text', 'percent', 'bool', 'points', 'list']);
      for (const pm of [...tm.props, ...UNIVERSAL_PROPS]) {
        const def = cv[pm.yaml] as { type?: string } | undefined;
        if (def?.type === 'schema' && scalarKinds.has(pm.kind)) {
          problems.push(`${tm.yaml}: "${pm.yaml}" ist ein Block, wird aber als ${pm.kind} geschrieben (${type})`);
        }
      }
    }
    expect(problems, `Falscher Werttyp (Kompilierfehler!):\n${problems.join('\n')}`).toEqual([]);
  });

  it('frisch angelegte Widgets erfüllen alle Pflichtfelder', () => {
    const schema = JSON.parse(readFileSync(path!, 'utf8'));
    const CV = schema.lvgl.schemas.WIDGET_TYPES.schema.config_vars;
    const missing: string[] = [];

    for (const [type, tm] of Object.entries(TYPE_MAP)) {
      const cv = CV[tm.yaml]?.schema?.config_vars;
      if (!cv) continue;
      const required = Object.entries(cv)
        .filter(([, v]) => (v as { key?: string })?.key === 'Required')
        .map(([k]) => k);
      if (!required.length) continue;

      const screen: Screen = {
        id: 'main_page', name: 'p', width: 480, height: 320, bg_color: '#111827',
        children: [createWidget(type as WidgetType, 10, 10, `${type}_1`)],
      };
      const out = screensToYaml([screen], '');
      for (const key of required) {
        // `src` beim image erzeugt die Engine aus der Bildquelle.
        if (!new RegExp(`^\\s*${key}:`, 'm').test(out)) missing.push(`${tm.yaml}: "${key}" fehlt`);
      }
    }

    expect(missing, `Pflichtfelder fehlen (Kompilierfehler!):\n${missing.join('\n')}`).toEqual([]);
  });
});
