import type { Geometry, WidgetCategory, WidgetNode, WidgetProps, WidgetType } from './types';

/**
 * Katalog aller verfügbaren Widgets: Palette-Metadaten + Default-Geometrie/Props.
 */
export interface CatalogEntry {
  type: WidgetType;
  label: string;
  category: WidgetCategory;
  /** ID-Präfix für generierte IDs (z. B. btn_1). */
  prefix: string;
  defaultSize: { width: number; height: number };
  defaultProps: () => WidgetProps;
}

export const CATALOG: CatalogEntry[] = [
  // Container
  {
    type: 'obj',
    label: 'Object',
    category: 'Container',
    prefix: 'obj',
    defaultSize: { width: 180, height: 120 },
    defaultProps: () => ({ bg_color: '#1f2937', radius: 10, border_width: 0, bg_opa: 100 }),
  },

  // Display
  {
    type: 'label',
    label: 'Label',
    category: 'Display',
    prefix: 'lbl',
    defaultSize: { width: 120, height: 28 },
    defaultProps: () => ({ text: 'Label', text_color: '#e5e7eb', font_size: 18 }),
  },
  {
    type: 'icon',
    label: 'Icon',
    category: 'Display',
    prefix: 'icon',
    defaultSize: { width: 40, height: 40 },
    defaultProps: () => ({ text: '★', text_color: '#fbbf24', font_size: 32 }),
  },
  {
    type: 'image',
    label: 'Image',
    category: 'Display',
    prefix: 'img',
    defaultSize: { width: 100, height: 100 },
    // `src` ist in ESPHome Pflicht → Standardquelle setzen, sonst kompiliert das
    // frisch eingefügte Bild nicht.
    defaultProps: () => ({ bg_color: '#374151', radius: 6, img_source: 'file', img_file: 'mdi:image', img_type: 'RGB565' }),
  },
  {
    type: 'bar',
    label: 'Bar',
    category: 'Display',
    prefix: 'bar',
    defaultSize: { width: 200, height: 16 },
    defaultProps: () => ({ value: 60, min_value: 0, max_value: 100, color: '#f59e0b', bg_color: '#374151', radius: 8 }),
  },
  {
    type: 'led',
    label: 'LED',
    category: 'Display',
    prefix: 'led',
    defaultSize: { width: 28, height: 28 },
    defaultProps: () => ({ color: '#fbbf24', brightness: 100 }),
  },
  {
    type: 'line',
    label: 'Line',
    category: 'Display',
    prefix: 'line',
    defaultSize: { width: 160, height: 4 },
    // `points` ist in ESPHome Pflicht – ohne sie schlägt die Kompilierung fehl.
    // Die Punkte spannen genau die Standard-Box auf (y mittig), damit Rahmen und Linie
    // von Anfang an übereinstimmen – siehe core/lvgl/line.ts.
    defaultProps: () => ({ color: '#60a5fa', line_width: 4, points: '0,2 160,2' }),
  },
  {
    type: 'meter',
    label: 'Meter',
    category: 'Display',
    prefix: 'meter',
    defaultSize: { width: 120, height: 120 },
    defaultProps: () => ({ value: 45, min_value: 0, max_value: 100, color: '#f59e0b' }),
  },
  {
    type: 'spinner',
    label: 'Spinner',
    category: 'Display',
    prefix: 'spin',
    defaultSize: { width: 48, height: 48 },
    defaultProps: () => ({ color: '#60a5fa', arc_width: 6, spin_time: '1000ms', arc_length: '60deg' }),
  },
  {
    type: 'qrcode',
    label: 'QR Code',
    category: 'Display',
    prefix: 'qr',
    defaultSize: { width: 90, height: 90 },
    defaultProps: () => ({ size: 90, light_color: '#ffffff', dark_color: '#000000' }),
  },

  // Input
  {
    type: 'button',
    label: 'Button',
    category: 'Input',
    prefix: 'btn',
    defaultSize: { width: 120, height: 44 },
    defaultProps: () => ({
      text: 'Button', bg_color: '#2563eb', text_color: '#ffffff', radius: 8, font_size: 16,
      // Aussehen im Toggle-„an"-Zustand (nur wirksam, wenn checkable aktiv ist).
      checked_bg_color: '#6b7280', checked_bg_opa: 60,
    }),
  },
  {
    type: 'slider',
    label: 'Slider',
    category: 'Input',
    prefix: 'sld',
    defaultSize: { width: 200, height: 18 },
    defaultProps: () => ({ value: 50, min_value: 0, max_value: 100, color: '#f59e0b', bg_color: '#374151', radius: 9 }),
  },
  {
    type: 'arc',
    label: 'Arc',
    category: 'Input',
    prefix: 'arc',
    defaultSize: { width: 120, height: 120 },
    // Griff standardmäßig an (LVGL zeichnet ihn nur bei `adjustable`).
    defaultProps: () => ({ value: 70, min_value: 0, max_value: 100, color: '#f59e0b', bg_color: '#374151', adjustable: true, knob_bg_color: '#ffffff' }),
  },
  {
    type: 'switch',
    label: 'Switch',
    category: 'Input',
    prefix: 'sw',
    defaultSize: { width: 52, height: 28 },
    defaultProps: () => ({ checked: true, color: '#22c55e', bg_color: '#4b5563' }),
  },
  {
    type: 'checkbox',
    label: 'Checkbox',
    category: 'Input',
    prefix: 'cb',
    defaultSize: { width: 130, height: 24 },
    defaultProps: () => ({ checked: true, text: 'Checkbox', text_color: '#e5e7eb', color: '#2563eb' }),
  },
  {
    type: 'dropdown',
    label: 'Dropdown',
    category: 'Input',
    prefix: 'dd',
    defaultSize: { width: 140, height: 36 },
    defaultProps: () => ({ options: ['Option 1', 'Option 2', 'Option 3'], text: 'Option 1', bg_color: '#374151', text_color: '#e5e7eb', radius: 6 }),
  },
  {
    type: 'textarea',
    label: 'Textarea',
    category: 'Input',
    prefix: 'ta',
    defaultSize: { width: 180, height: 60 },
    defaultProps: () => ({ text: '', bg_color: '#111827', text_color: '#e5e7eb', border_color: '#374151', border_width: 1, radius: 6 }),
  },
];

export const CATALOG_BY_TYPE: Record<WidgetType, CatalogEntry> = Object.fromEntries(
  CATALOG.map((e) => [e.type, e]),
) as Record<WidgetType, CatalogEntry>;

export const CATEGORY_ORDER: WidgetCategory[] = ['Container', 'Display', 'Input'];

/** Erzeugt eine eindeutige ID mit Katalog-Präfix, die noch nicht in `existing` vorkommt. */
export function nextId(type: WidgetType, existing: Set<string>): string {
  const prefix = CATALOG_BY_TYPE[type]?.prefix ?? type;
  let n = 1;
  let id = `${prefix}_${n}`;
  while (existing.has(id)) {
    n += 1;
    id = `${prefix}_${n}`;
  }
  return id;
}

/** Baut einen neuen Widget-Knoten an Position (x, y). */
export function createWidget(type: WidgetType, x: number, y: number, id: string): WidgetNode {
  const entry = CATALOG_BY_TYPE[type];
  const geometry: Geometry = {
    x: Math.round(x),
    y: Math.round(y),
    width: entry.defaultSize.width,
    height: entry.defaultSize.height,
  };
  return {
    id,
    type,
    geometry,
    props: entry.defaultProps(),
    children: [],
  };
}
