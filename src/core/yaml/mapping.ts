import type { WidgetType } from '../lvgl/types';

/**
 * Abbildung Editor-Modell ↔ ESPHome-`lvgl:`-Widget-Keys.
 *
 * Wichtig: Hier sind NUR die vom visuellen Editor **verwalteten** Keys aufgeführt.
 * Beim Export werden ausschließlich diese Keys gesetzt – alle anderen Keys eines
 * Widget-Knotens (z. B. `on_press`, `lambda`, `adjustable`, `group`, `align`) bleiben
 * unangetastet und überleben damit jede Editor-Änderung.
 */

export type PropKind = 'color' | 'number' | 'text' | 'percent' | 'list' | 'bool' | 'points';

export interface PropMap {
  /** Key im Editor-Modell (`WidgetProps`). */
  prop: string;
  /** Key im ESPHome-YAML. */
  yaml: string;
  kind: PropKind;
  /**
   * Nur für `bool`: In LVGL ist dieser Key standardmäßig `true`. Dann trägt gerade `false`
   * die Information und muss geschrieben werden (sonst greift wieder der LVGL-Default).
   */
  defaultTrue?: boolean;
}

export interface TypeMap {
  /** ESPHome-Widget-Key (meist identisch mit dem Modell-Typ). */
  yaml: string;
  /** Verwaltete Style-/Inhalts-Keys (Geometrie/`id` werden separat behandelt). */
  props: PropMap[];
  /** Button-artige Widgets tragen ihren Text als verschachteltes `label`-Widget. */
  textAsChildLabel?: boolean;
  /** Pflicht-/Default-Keys, die beim Erzeugen gesetzt werden, damit das YAML valide bleibt. */
  defaults?: Record<string, string | number>;
}

const color = (prop: string, yaml = prop): PropMap => ({ prop, yaml, kind: 'color' });
const num = (prop: string, yaml = prop): PropMap => ({ prop, yaml, kind: 'number' });
const text = (prop: string, yaml = prop): PropMap => ({ prop, yaml, kind: 'text' });
const pct = (prop: string, yaml = prop): PropMap => ({ prop, yaml, kind: 'percent' });

/**
 * Universelle LVGL-Style-Keys, die auf JEDES Widget angewandt werden können
 * (zusätzlich zu den typspezifischen Props). Werden beim Export/Import genauso
 * verwaltet wie die typspezifischen Keys.
 */
export const UNIVERSAL_PROPS: PropMap[] = [
  pct('opa'), // Gesamt-Deckkraft des Widgets
  { prop: 'hidden', yaml: 'hidden', kind: 'bool' },
  pct('border_opa'),
  num('pad_all'),
  color('shadow_color'),
  num('shadow_width'),
  pct('shadow_opa'),
  num('shadow_spread'),
  num('shadow_offset_x'),
  num('shadow_offset_y'),
  color('outline_color'),
  num('outline_width'),
  pct('outline_opa'),
  num('outline_pad'),
  // Feature 2: Farbverlauf (Hintergrund)
  color('bg_grad_color'),
  text('bg_grad_dir'), // NONE | HOR | VER
  // Scrollen: LVGL-Default ist scrollable + scrollbar_mode AUTO, d. h. sobald ein Kind
  // über den Inhaltsbereich ragt, zeichnet das Gerät Scrollbalken – die es in der
  // Editor-Vorschau nie gibt. Deshalb hier steuerbar.
  text('scrollbar_mode'), // OFF | ON | ACTIVE | AUTO
  { prop: 'scrollable', yaml: 'scrollable', kind: 'bool', defaultTrue: true },
  // Layout-Keys des KINDES (nur wirksam im Flex-/Grid-Container des Elternteils).
  num('flex_grow'),
  num('grid_cell_row_pos'),
  num('grid_cell_column_pos'),
  num('grid_cell_row_span'),
  num('grid_cell_column_span'),
];

/**
 * Feature 3: Text-Style-Props für direkte Text-Widgets (label/icon). Werden zusätzlich
 * zu den typspezifischen Props verwaltet.
 */
export const TEXT_PROPS: PropMap[] = [
  text('text_align'), // LEFT | CENTER | RIGHT (im Modell auch für Rendering genutzt)
  pct('text_opa'),
  num('text_letter_spacing', 'text_letter_space'), // ESPHome-Key heißt text_letter_space
  num('text_line_space'),
  text('text_decor'), // NONE | UNDERLINE | STRIKETHROUGH
];

/** Widget-Typen mit direktem Text-Style. */
export const TEXT_TYPES = new Set<WidgetType>(['label', 'icon', 'checkbox']);

/**
 * Feature 1: Parts (LVGL-Teile). Style-Suffixe pro Teil (knob/indicator) → verschachtelte
 * YAML-Map `<part>: { <suffix>: value }`. Modell-Keys sind `<part>_<suffix>`.
 */
export const PART_SUFFIXES: PropMap[] = [
  color('bg_color'),
  pct('bg_opa'),
  color('border_color'),
  num('border_width'),
  num('radius'),
  num('pad_all'), // vergrößert z. B. den Knob (LVGL: pad erweitert den Part)
];

/**
 * Widgets, bei denen LVGL den Schatten zwangsläufig als Kasten um die eigentliche Form
 * zeichnet (Bogen, Regler-Bahn, Häkchen+Text). Dort bieten wir ihn nicht an – und der
 * Export räumt vorhandene Schatten-Keys weg, damit Altbestand sauber wird.
 */
export const NO_SHADOW = new Set<WidgetType>(['arc', 'meter', 'spinner', 'slider', 'checkbox', 'line']);

/** Widgets ohne sinnvollen Hintergrund-Verlauf. */
export const NO_GRADIENT = new Set<WidgetType>(['arc', 'meter', 'line', 'led', 'spinner', 'qrcode', 'checkbox', 'icon']);

/**
 * Der INDICATOR eines Arcs ist ein Bogen-Strich, kein Kasten: LVGL zeichnet ihn über die
 * ARC-Style-Props. bg_color/radius/border/shadow haben dort KEINE Wirkung – deshalb bekommt
 * dieser Part eine eigene, passende Liste.
 */
/**
 * Das Kästchen der Checkbox ist der `indicator`. Dort zählen Hintergrund, RAHMEN und
 * Radius – der Rahmen ist sonst die blaue Theme-Farbe und nicht änderbar.
 */
export const CHECKBOX_PART_SUFFIXES: PropMap[] = [
  color('bg_color'),
  color('border_color'),
  num('border_width'),
  num('radius'),
];

export const ARC_PART_SUFFIXES: PropMap[] = [
  color('arc_color'),
  num('arc_width'),
  pct('arc_opa'),
  { prop: 'arc_rounded', yaml: 'arc_rounded', kind: 'bool' },
];

/** Style-Suffixe für einen konkreten Part eines Widgets. */
export function partSuffixes(type: WidgetType, part: string): PropMap[] {
  if (type === 'arc' && part === 'indicator') return ARC_PART_SUFFIXES;
  if (type === 'checkbox' && part === 'indicator') return CHECKBOX_PART_SUFFIXES;
  return PART_SUFFIXES;
}

/** Parts, die pro Widget-Typ stylebar sind (main ist das Widget selbst). */
export const STYLEABLE_PARTS: Partial<Record<WidgetType, string[]>> = {
  // Die Füllung (indicator) IST die normale `color` des Widgets – ein eigener Style-Block
  // dafür wäre nur doppelt. Übrig bleibt der Griff, der wirklich eigene Optik hat.
  slider: ['knob'],
  arc: ['knob'],
  switch: ['knob'],
  // Kästchen der Checkbox: eigener Rahmen/Hintergrund (Theme wäre sonst blau).
  checkbox: ['indicator'],
};

/** Welche Widgets einen stylebaren Knob (Griff) haben. */
export const KNOB_TYPES = new Set<WidgetType>(['slider', 'arc', 'switch']);

export const TYPE_MAP: Record<WidgetType, TypeMap> = {
  obj: {
    yaml: 'obj',
    props: [color('bg_color'), { prop: 'bg_opa', yaml: 'bg_opa', kind: 'percent' }, num('radius'), num('border_width'), color('border_color')],
  },
  label: {
    yaml: 'label',
    props: [text('text'), color('text_color'), text('long_mode'), { prop: 'recolor', yaml: 'recolor', kind: 'bool' }],
  },
  // Icon ist im Editor ein Label mit Symbol-Text → wird als ESPHome-`label` exportiert.
  icon: { yaml: 'label', props: [text('text'), color('text_color')] },
  // `src` + Bildquelle (image/online_image) verwaltet die Engine separat (applyImageSources).
  image: { yaml: 'image', props: [color('bg_color'), num('radius')] },
  button: {
    yaml: 'button',
    props: [
      color('bg_color'), num('radius'), num('border_width'), color('border_color'),
      { prop: 'checkable', yaml: 'checkable', kind: 'bool' }, // Toggle-Modus
    ],
    textAsChildLabel: true,
  },
  slider: { yaml: 'slider', props: [num('value'), num('min_value'), num('max_value'), color('bg_color')] },
  // `adjustable` ist der Schalter für den Griff (Knob): LVGL zeichnet ihn NUR, wenn der
  // Arc bedienbar ist. Ohne das bleiben alle Knob-Einstellungen wirkungslos.
  arc: {
    yaml: 'arc',
    props: [num('value'), num('min_value'), num('max_value'), { prop: 'adjustable', yaml: 'adjustable', kind: 'bool' }],
  },
  bar: { yaml: 'bar', props: [num('value'), num('min_value'), num('max_value'), color('bg_color'), num('radius')] },
  switch: { yaml: 'switch', props: [color('bg_color')] },
  checkbox: { yaml: 'checkbox', props: [text('text'), color('text_color')] },
  // LED: color + brightness (0..255) sind die echten LVGL-Keys.
  // `brightness` ist laut Doku eine Prozentangabe (0% … 100%).
  led: { yaml: 'led', props: [color('color'), pct('brightness')] },
  dropdown: {
    yaml: 'dropdown',
    props: [
      { prop: 'options', yaml: 'options', kind: 'list' }, num('selected_index'),
      color('bg_color'), color('text_color'), num('radius'),
    ],
  },
  textarea: {
    yaml: 'textarea',
    props: [
      text('text'), text('placeholder_text'), num('max_length'),
      { prop: 'one_line', yaml: 'one_line', kind: 'bool' },
      { prop: 'password_mode', yaml: 'password_mode', kind: 'bool' },
      color('bg_color'), color('text_color'), color('border_color'), num('border_width'), num('radius'),
    ],
  },
  // Der Meter braucht eine `scales:`-Struktur mit `indicators:` – ohne die zeichnet LVGL
  // nur einen leeren Kreis. Das erzeugt die Engine (applyMeterScales) aus diesen Props.
  meter: { yaml: 'meter', props: [] },
  // Line: Farbe/Breite heißen line_color / line_width (nicht color!).
  // `points` ist in ESPHome PFLICHT – ohne sie bricht die Kompilierung ab.
  line: {
    yaml: 'line',
    props: [
      { prop: 'points', yaml: 'points', kind: 'points' },
      color('color', 'line_color'), num('line_width'),
      { prop: 'line_rounded', yaml: 'line_rounded', kind: 'bool' },
    ],
    defaults: { points: '0,0 160,0' },
  },
  // Spinner: spin_time/arc_length sind Config; Farbe/Breite laufen über den indicator-Part.
  spinner: {
    yaml: 'spinner',
    props: [text('spin_time'), text('arc_length'), { prop: 'arc_rounded', yaml: 'arc_rounded', kind: 'bool' }],
    defaults: { spin_time: '1000ms', arc_length: '60deg' },
  },
  qrcode: {
    yaml: 'qrcode',
    props: [text('text'), num('size'), color('light_color'), color('dark_color')],
    defaults: { text: 'https://esphome.io' },
  },
};

/** Umkehrabbildung ESPHome-Widget-Key → Modell-Typ (für den Import). */
export const YAML_TO_TYPE: Record<string, WidgetType> = (() => {
  const out: Record<string, WidgetType> = {};
  for (const [type, m] of Object.entries(TYPE_MAP) as [WidgetType, TypeMap][]) {
    // Bei Kollisionen (icon/label teilen `label`) gewinnt der Typ, dessen Name dem YAML-Key entspricht.
    if (!(m.yaml in out) || m.yaml === type) out[m.yaml] = type;
  }
  return out;
})();
