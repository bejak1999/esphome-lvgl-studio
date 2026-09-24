import type { Language } from '@/shared/i18n';

/**
 * Zweisprachige Beschriftungen für das Eigenschaften-Panel: Feldnamen, Auswahloptionen und
 * Part-Gruppen. Getrennt von i18n.ts, weil die Schlüssel hier die LVGL-Property-Namen sind.
 */

type Opt = { v: string; en: string; de: string };

const SELECT: Record<string, Opt[]> = {
  align: [
    { v: '', en: '— (absolute x/y)', de: '— (x/y absolut)' },
    { v: 'top_left', en: 'Top left', de: 'Oben links' },
    { v: 'top_mid', en: 'Top center', de: 'Oben mitte' },
    { v: 'top_right', en: 'Top right', de: 'Oben rechts' },
    { v: 'left_mid', en: 'Center left', de: 'Mitte links' },
    { v: 'center', en: 'Center', de: 'Zentriert' },
    { v: 'right_mid', en: 'Center right', de: 'Mitte rechts' },
    { v: 'bottom_left', en: 'Bottom left', de: 'Unten links' },
    { v: 'bottom_mid', en: 'Bottom center', de: 'Unten mitte' },
    { v: 'bottom_right', en: 'Bottom right', de: 'Unten rechts' },
  ],
  text_align: [
    { v: '', en: '—', de: '—' },
    { v: 'left', en: 'Left', de: 'Links' },
    { v: 'center', en: 'Center', de: 'Mitte' },
    { v: 'right', en: 'Right', de: 'Rechts' },
  ],
  text_decor: [
    { v: '', en: '—', de: '—' },
    { v: 'NONE', en: 'None', de: 'Keine' },
    { v: 'UNDERLINE', en: 'Underline', de: 'Unterstrichen' },
    { v: 'STRIKETHROUGH', en: 'Strikethrough', de: 'Durchgestrichen' },
  ],
  bg_grad_dir: [
    { v: '', en: 'No gradient', de: 'Kein Verlauf' },
    { v: 'VER', en: 'Vertical', de: 'Vertikal' },
    { v: 'HOR', en: 'Horizontal', de: 'Horizontal' },
  ],
  scrollbar_mode: [
    { v: '', en: 'Off (editor default)', de: 'Aus (Standard im Editor)' },
    { v: 'AUTO', en: 'Automatic', de: 'Automatisch' },
    { v: 'ON', en: 'Always', de: 'Immer' },
    { v: 'ACTIVE', en: 'While scrolling', de: 'Beim Scrollen' },
    { v: 'OFF', en: 'Never', de: 'Nie' },
  ],
  img_source: [
    { v: '', en: '— (placeholder)', de: '— (Platzhalter)' },
    { v: 'online', en: 'Online (URL, live)', de: 'Online (URL, live)' },
    { v: 'file', en: 'File / URL / mdi:', de: 'Datei / URL / mdi:' },
    { v: 'ref', en: 'Existing image (id)', de: 'Vorhandenes Bild (id)' },
  ],
  // ESPHome kennt bei online_image nur diese vier Werte – „AUTO" gibt es nicht.
  img_format: ['PNG', 'JPEG', 'JPG', 'BMP'].map((f) => ({ v: f, en: f, de: f })),
  img_type: [
    { v: 'RGB565', en: 'RGB565 (default)', de: 'RGB565 (Standard)' },
    { v: 'RGB', en: 'RGB (24-bit)', de: 'RGB (24-bit)' },
    { v: 'GRAYSCALE', en: 'Grayscale', de: 'Graustufen' },
    { v: 'BINARY', en: 'Binary (1-bit)', de: 'Binär (1-bit)' },
  ],
  img_transparency: [
    { v: '', en: 'None', de: 'Keine' },
    { v: 'alpha_channel', en: 'Alpha channel', de: 'Alpha-Kanal' },
    { v: 'chroma_key', en: 'Chroma key', de: 'Chroma-Key' },
  ],
  grad_part: [
    { v: '', en: 'Background', de: 'Hintergrund' },
    { v: 'indicator', en: 'Indicator fill', de: 'Regler-Füllung' },
  ],
  long_mode: [
    { v: '', en: '—', de: '—' },
    { v: 'WRAP', en: 'Wrap', de: 'Umbrechen' },
    { v: 'DOT', en: 'Truncate (…)', de: 'Kürzen (…)' },
    { v: 'SCROLL', en: 'Scroll', de: 'Scrollen' },
    { v: 'SCROLL_CIRCULAR', en: 'Scroll endlessly', de: 'Endlos scrollen' },
    { v: 'CLIP', en: 'Clip', de: 'Abschneiden' },
  ],
};

const LABELS: Record<string, [en: string, de: string]> = {
  bg_color: ['Background', 'Hintergrund'],
  bg_opa: ['Opacity %', 'Deckkraft %'],
  radius: ['Radius', 'Radius'],
  border_width: ['Border width', 'Rahmenbreite'],
  border_color: ['Border color', 'Rahmenfarbe'],
  text: ['Text', 'Text'],
  text_color: ['Text color', 'Textfarbe'],
  font_size: ['Font size', 'Schriftgröße'],
  value: ['Value', 'Wert'],
  min_value: ['Min', 'Min'],
  max_value: ['Max', 'Max'],
  color: ['Color', 'Farbe'],
  checked: ['Checked', 'Aktiv'],
  options: ['Options', 'Optionen'],
  arc_width: ['Arc width', 'Bogenbreite'],
  opa: ['Widget opacity %', 'Widget-Deckkraft %'],
  hidden: ['Hidden', 'Versteckt'],
  border_opa: ['Border opacity %', 'Rahmen-Deckkraft %'],
  pad_all: ['Padding', 'Innenabstand'],
  shadow_color: ['Shadow color', 'Schatten-Farbe'],
  shadow_width: ['Shadow width', 'Schatten-Breite'],
  shadow_opa: ['Shadow opacity %', 'Schatten-Deckkraft %'],
  shadow_spread: ['Shadow spread', 'Schatten-Spread'],
  shadow_offset_x: ['Shadow X', 'Schatten X'],
  shadow_offset_y: ['Shadow Y', 'Schatten Y'],
  outline_color: ['Outline color', 'Kontur-Farbe'],
  outline_width: ['Outline width', 'Kontur-Breite'],
  outline_opa: ['Outline opacity %', 'Kontur-Deckkraft %'],
  outline_pad: ['Outline padding', 'Kontur-Abstand'],
  bg_grad_color: ['Gradient color', 'Verlaufsfarbe'],
  bg_grad_dir: ['Gradient direction', 'Verlaufsrichtung'],
  scrollbar_mode: ['Scrollbar', 'Scrollbalken'],
  scrollable: ['Allow scrolling', 'Scrollen erlauben'],
  img_source: ['Image source', 'Bildquelle'],
  img_url: ['Image URL (live)', 'Bild-URL (live)'],
  img_file: ['File / URL / mdi:', 'Datei / URL / mdi:'],
  img_ref: ['Image id (existing)', 'Bild-id (vorhanden)'],
  img_format: ['Format', 'Format'],
  img_type: ['Color format', 'Farbformat'],
  img_update_interval: ['Update interval (e.g. 4s)', 'Aktualisierung (z. B. 4s)'],
  img_resize: ['Resize (WxH, e.g. 480x320)', 'Skalieren (BxH, z. B. 480x320)'],
  img_transparency: ['Transparency', 'Transparenz'],
  img_buffer_size: ['Download buffer (bytes, default 65536)', 'Download-Puffer (Byte, Standard 65536)'],
  knob_bg_color: ['Knob color', 'Knopf-Farbe'],
  knob_radius: ['Knob radius', 'Knopf-Radius'],
  knob_pad_all: ['Knob size', 'Knopf-Größe'],
  text_align: ['Text alignment', 'Textausrichtung'],
  text_opa: ['Text opacity %', 'Text-Deckkraft %'],
  text_letter_spacing: ['Letter spacing', 'Buchstabenabstand'],
  text_line_space: ['Line spacing', 'Zeilenabstand'],
  text_decor: ['Text decoration', 'Text-Dekoration'],
  decimals: ['Decimals (live)', 'Nachkommastellen (Live)'],
  grad_part: ['Gradient on', 'Verlauf auf'],
  align: ['Alignment in parent', 'Ausrichtung im Eltern'],
  brightness: ['Brightness %', 'Helligkeit %'],
  animated: ['Animated', 'Animiert'],
  selected_index: ['Selected index', 'Ausgewählter Index'],
  placeholder_text: ['Placeholder text', 'Platzhalter-Text'],
  max_length: ['Max. length', 'Max. Länge'],
  one_line: ['Single line', 'Einzeilig'],
  password_mode: ['Password mode', 'Passwort-Modus'],
  spin_time: ['Spin time (e.g. 1000ms)', 'Umlaufzeit (z. B. 1000ms)'],
  arc_length: ['Arc length (e.g. 60deg)', 'Bogenlänge (z. B. 60deg)'],
  line_width: ['Line width', 'Linienbreite'],
  line_rounded: ['Rounded line', 'Linie abgerundet'],
  arc_rounded: ['Rounded ends', 'Enden abgerundet'],
  points: ['Points (x,y x,y …)', 'Punkte (x,y x,y …)'],
  size: ['Size (px)', 'Größe (px)'],
  light_color: ['Light color', 'Helle Farbe'],
  dark_color: ['Dark color', 'Dunkle Farbe'],
  long_mode: ['Long text', 'Langer Text'],
  recolor: ['Color codes in text (#RRGGBB)', 'Farbcodes im Text (#RRGGBB)'],
  src: ['Image ID', 'Bild-ID'],
  checkable: ['Toggle mode (on/off)', 'Toggle-Modus (an/aus)'],
  adjustable: ['Adjustable (shows the knob)', 'Bedienbar (zeigt den Griff)'],
  checked_bg_color: ['Color when on', 'Farbe im An-Zustand'],
  checked_bg_opa: ['Opacity when on %', 'Deckkraft im An-Zustand %'],
};

const PART_SUFFIX: Record<string, [en: string, de: string]> = {
  bg_color: ['Color', 'Farbe'],
  radius: ['Radius', 'Radius'],
  border_color: ['Border color', 'Rahmenfarbe'],
  border_width: ['Border width', 'Rahmenbreite'],
  shadow_color: ['Shadow color', 'Schatten-Farbe'],
  shadow_width: ['Shadow width', 'Schatten-Breite'],
  pad_all: ['Size (padding)', 'Größe (Padding)'],
  arc_color: ['Arc color', 'Bogenfarbe'],
  arc_width: ['Arc width', 'Bogenbreite'],
  arc_opa: ['Arc opacity %', 'Bogen-Deckkraft %'],
  arc_rounded: ['Rounded ends', 'Enden abgerundet'],
};

const PART_GROUP: Record<string, [en: string, de: string]> = {
  knob: ['Knob', 'Knopf'],
  checkbox: ['Box', 'Kästchen'],
  indicator: ['Indicator fill', 'Regler-Füllung'],
};

const pick = (pair: [string, string] | undefined, lang: Language) => (pair ? pair[lang === 'de' ? 1 : 0] : undefined);

export function propLabel(key: string, lang: Language): string {
  return pick(LABELS[key], lang) ?? key;
}

export function partFieldLabel(key: string, lang: Language): string {
  return pick(PART_SUFFIX[key.replace(/^(indicator|knob)_/, '')], lang) ?? key;
}

export function partGroupLabel(part: string, type: string, lang: Language): string {
  const k = part === 'knob' ? 'knob' : type === 'checkbox' ? 'checkbox' : 'indicator';
  return pick(PART_GROUP[k], lang)!;
}

export function selectOptions(key: string, lang: Language): { v: string; l: string }[] {
  return (SELECT[key] ?? []).map((o) => ({ v: o.v, l: lang === 'de' ? o.de : o.en }));
}

export function hasSelectOptions(key: string): boolean {
  return key in SELECT;
}
