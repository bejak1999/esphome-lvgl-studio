/**
 * Prüft für JEDE im Eigenschaften-Panel angebotene Einstellung, dass sie beim Export
 * tatsächlich im YAML landet. Verhindert „Regler ohne Wirkung": Einstellungen, die der
 * Nutzer verändert, die aber nie beim Gerät ankommen.
 */
import { describe, it, expect } from 'vitest';
import { screensToYaml, yamlToScreens } from './engine';
import { createWidget } from '../lvgl/catalog';
import { PROP_FIELDS, UNIVERSAL_FIELD_KEYS } from '../lvgl/fields';
import { NO_GRADIENT, NO_SHADOW, STYLEABLE_PARTS, partSuffixes } from './mapping';
import type { Screen, WidgetProps, WidgetType } from '../lvgl/types';

/** Testwert je Prop – bewusst auffällig, damit er im YAML eindeutig auffindbar ist. */
function sampleValue(key: string): unknown {
  if (key === 'options') return ['A', 'B'];
  if (key === 'points') return '3,4 55,66';
  if (key === 'img_source') return 'online';
  if (key === 'img_url') return 'http://example.com/x.jpg';
  if (key === 'img_file') return 'mdi:home';
  if (key === 'img_ref') return 'my_img';
  if (key === 'img_format') return 'JPEG';
  if (key === 'img_type') return 'RGB565';
  if (key === 'img_update_interval') return '7s';
  if (key === 'img_resize') return '64x64';
  if (key === 'img_transparency') return 'alpha_channel';
  if (key === 'grad_part') return 'indicator';
  if (key === 'bg_grad_dir') return 'VER';
  if (key === 'scrollbar_mode') return 'ON';
  if (key === 'text_align') return 'center';
  if (key === 'text_decor') return 'UNDERLINE';
  if (key === 'long_mode') return 'DOT';
  if (key === 'spin_time') return '1234ms';
  if (key === 'arc_length') return '77deg';
  if (key.endsWith('_color') || key === 'color') return '#123456';
  if (['checked', 'recolor', 'one_line', 'password_mode', 'line_rounded', 'checkable',
       'adjustable', 'hidden', 'arc_rounded'].includes(key)) return true;
  if (key === 'scrollable') return false;
  if (key === 'text' || key === 'placeholder_text') return 'PROBETEXT';
  return 37; // Zahl, die sonst nirgends vorkommt
}

/**
 * Props, die absichtlich NICHT als eigener YAML-Key erscheinen – mit Begründung.
 * Alles andere muss nachweisbar im Export auftauchen.
 */
const NOT_A_YAML_KEY: Record<string, string> = {
  font_size: 'wird zu text_font (studio_font_<n>) aufgelöst',
  decimals: 'nur Editor/Live-Anzeige + Lambda-Format der Entity-Bindung',
  grad_part: 'steuert nur, ob der Verlauf auf main oder indicator geschrieben wird',
  img_source: 'steuert, welche Bildkomponente erzeugt wird',
  img_ref: 'wird zu src',
  checked_bg_color: 'landet im checked:-Block',
  checked_bg_opa: 'landet im checked:-Block',
  color: 'je Widget unterschiedlich (arc_color/line_color/indicator …)',
  bg_color: 'bei Arc/Meter/Spinner die Track-Farbe (arc_color / scales)',
  value: 'bei Meter Teil der scales-Indikatoren',
  min_value: 'bei Meter range_from',
  max_value: 'bei Meter range_to',
  arc_width: 'bei Meter/Spinner Breite des Indikators',
};

function exportWith(type: WidgetType, props: Partial<WidgetProps>): string {
  const node = createWidget(type, 10, 10, `${type}_probe`);
  node.props = { ...node.props, ...props };
  const screen: Screen = {
    id: 'main_page', name: 'p', width: 480, height: 320, bg_color: '#111827', children: [node],
  };
  return screensToYaml([screen], '');
}

/** Kommt der gesetzte Wert irgendwo im YAML an? (Farben als 0x…, Zahlen als Zahl) */
function reaches(yaml: string, key: string, value: unknown): boolean {
  if (key === 'points') {
    // Werden als YAML-Paare geschrieben: - [ 3, 4 ]
    const nums = String(value).match(/-?\d+/g) ?? [];
    return nums.every((n) => new RegExp(String.raw`[[,]\s*${n}\s*[,\]]`).test(yaml));
  }
  if (typeof value === 'string' && value.startsWith('#')) {
    return yaml.includes('0x' + value.slice(1).toLowerCase()) || yaml.includes('0x' + value.slice(1).toUpperCase());
  }
  if (value === true) return new RegExp(`${key.replace(/^(indicator|knob)_/, '')}:\\s*true`).test(yaml);
  if (value === false) return new RegExp(`${key.replace(/^(indicator|knob)_/, '')}:\\s*false`).test(yaml);
  if (Array.isArray(value)) return value.every((v) => yaml.includes(String(v)));
  return yaml.includes(String(value));
}

describe('Jede Einstellung erreicht das YAML', () => {
  for (const [type, keys] of Object.entries(PROP_FIELDS) as [WidgetType, string[]][]) {
    it(`${type}: typ-spezifische Felder`, () => {
      const missing: string[] = [];
      for (const key of keys) {
        if (key in NOT_A_YAML_KEY) continue;
        const v = sampleValue(key);
        // Bild-Detailfelder wirken nur zusammen mit einer vollständigen Quelle.
        const fileSrc = key === 'img_file' || key === 'img_transparency';
        const extra = key.startsWith('img_') && key !== 'img_source'
          ? fileSrc
            ? { img_source: 'file', img_file: 'mdi:home' }
            : { img_source: 'online', img_url: 'http://example.com/x.jpg' }
          : {};
        const yaml = exportWith(type, { [key]: v, ...extra } as Partial<WidgetProps>);
        if (!reaches(yaml, key, v)) missing.push(`${key} = ${JSON.stringify(v)}`);
      }
      expect(missing, `${type}: kommt nicht im YAML an:\n  ${missing.join('\n  ')}`).toEqual([]);
    });
  }

  it('universelle Style-Felder erreichen das YAML (alle Typen)', () => {
    const missing: string[] = [];
    for (const type of Object.keys(PROP_FIELDS) as WidgetType[]) {
      for (const key of UNIVERSAL_FIELD_KEYS) {
        // Genau die Felder überspringen, die das Panel bei diesem Typ auch nicht anbietet.
        if (key.startsWith('shadow_') && NO_SHADOW.has(type)) continue;
        if (key.startsWith('bg_grad_') && NO_GRADIENT.has(type)) continue;
        const v = sampleValue(key);
        // bg_grad_color wirkt nur zusammen mit einer Richtung.
        const extra = key === 'bg_grad_color' ? { bg_grad_dir: 'VER' } : {};
        const yaml = exportWith(type, { [key]: v, ...extra } as Partial<WidgetProps>);
        if (!reaches(yaml, key, v)) missing.push(`${type}.${key} = ${JSON.stringify(v)}`);
      }
    }
    expect(missing, `Universelle Props kommen nicht an:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it('Round-Trip: jede Einstellung kommt beim Import unverändert zurück', () => {
    // Fängt „schreibt zwar, liest aber nicht zurück" – so gingen früher Bindungen verloren.
    const lost: string[] = [];
    for (const [type, keys] of Object.entries(PROP_FIELDS) as [WidgetType, string[]][]) {
      for (const key of keys) {
        if (key in NOT_A_YAML_KEY) continue;
        const v = sampleValue(key);
        const fileSrc = key === 'img_file' || key === 'img_transparency';
        const extra = key.startsWith('img_') && key !== 'img_source'
          ? fileSrc
            ? { img_source: 'file', img_file: 'mdi:home' }
            : { img_source: 'online', img_url: 'http://example.com/x.jpg' }
          : {};
        const yaml = exportWith(type, { [key]: v, ...extra } as Partial<WidgetProps>);
        const back = yamlToScreens(yaml).pages[0].children[0];
        const got = back?.props[key];
        const same =
          typeof v === 'string' && v.startsWith('#')
            ? String(got).toLowerCase() === v.toLowerCase()
            : Array.isArray(v)
              ? JSON.stringify(got) === JSON.stringify(v)
              : got === v;
        if (!same) lost.push(`${type}.${key}: ${JSON.stringify(v)} → ${JSON.stringify(got)}`);
      }
    }
    expect(lost, `Beim Import verloren/verändert:\n  ${lost.join('\n  ')}`).toEqual([]);
  });

  it('Part-Styles (indicator/knob) erreichen das YAML', () => {
    const missing: string[] = [];
    for (const [type, parts] of Object.entries(STYLEABLE_PARTS) as [WidgetType, string[]][]) {
      for (const part of parts) {
        for (const pm of partSuffixes(type, part)) {
          const key = `${part}_${pm.prop}`;
          // Die Füllfarbe des Indicators kommt aus `color` – im UI gar nicht angeboten.
          if (part === 'indicator' && pm.prop === 'bg_color') continue;
          const v = sampleValue(pm.prop);
          // Arc zeichnet den Knob nur, wenn er bedienbar ist.
          const extra = type === 'arc' && part === 'knob' ? { adjustable: true } : {};
          const yaml = exportWith(type, { [key]: v, ...extra } as Partial<WidgetProps>);
          if (!reaches(yaml, key, v)) missing.push(`${type}.${key} = ${JSON.stringify(v)}`);
        }
      }
    }
    expect(missing, `Part-Styles kommen nicht an:\n  ${missing.join('\n  ')}`).toEqual([]);
  });
});
