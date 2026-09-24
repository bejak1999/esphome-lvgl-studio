import { createWidget } from '../lvgl/catalog';
import { iconGlyph } from '../lvgl/icons';
import type { WidgetNode, WidgetProps } from '../lvgl/types';
import type { WidgetTemplate } from './types';

/**
 * Reihenfolge der Vorlagen-Kategorien im Modal. Neue Gruppen hier einsortieren;
 * Vorlagen ohne passende Kategorie landen unter "Weitere".
 */
export const TEMPLATE_CATEGORY_ORDER: string[] = [
  'Klima',
  'Beleuchtung',
  'Energie',
  'Sicherheit',
  'Sensoren',
  'Szenen',
  'Cover/Lüftung',
  'Bewässerung',
  'UI/Navigation',
  'WLAN-Setup',
  'Basis',
];

// Fortlaufender Zähler für kollisionsfreie Platzhalter-IDs innerhalb der Vorlagen.
// (Beim Einfügen vergibt `cloneWithNewIds` ohnehin frische IDs.)
let _uid = 0;

/** Kleiner Helfer: Widget mit Geometrie + Props bauen. */
function w(
  type: Parameters<typeof createWidget>[0],
  x: number,
  y: number,
  width: number,
  height: number,
  props: WidgetProps = {},
  children: WidgetNode[] = [],
): WidgetNode {
  _uid += 1;
  const n = createWidget(type, x, y, `tpl_${_uid}`);
  n.geometry.width = width;
  n.geometry.height = height;
  n.props = { ...n.props, ...props };
  n.children = children;
  return n;
}

/** MDI-Glyph als Text (rendert über die gebündelte MDI-Schrift). */
const mdi = (code: number) => iconGlyph(code);
const ICON = {
  fire: 0xf0238,
  clock: 0xf0150,
  flash: 0xf0241,
  thermometer: 0xf050f,
  water: 0xf058c,
  chevronUp: 0xf0143,
  chevronDown: 0xf0140,
  eye: 0xf0208,
  home: 0xf02dc,
  fan: 0xf0210,
  stop: 0xf04db,
  shield: 0xf068a,
  lock: 0xf033e,
  bell: 0xf009a,
  cog: 0xf0493,
  movie: 0xf0381,
  television: 0xf0502,
  speaker: 0xf04c3,
  snowflake: 0xf0717,
  power: 0xf0425,
  refresh: 0xf0450,
  evStation: 0xf05f1,
  motion: 0xf0d91,
  wifi: 0xf05a9,
};

// ── Kompakte Bau-Helfer (halten die Vorlagen lesbar) ─────────────────────────

/** Karte (Wurzel-Container) einer Vorlage. */
const card = (width: number, height: number, bg: string, radius: number, children: WidgetNode[]) =>
  w('obj', 0, 0, width, height, { bg_color: bg, radius, border_width: 0 }, children);

/** Textlabel. */
const lbl = (
  x: number, y: number, width: number, height: number,
  text: string, color: string, size: number, extra: WidgetProps = {},
) => w('label', x, y, width, height, { text, text_color: color, font_size: size, ...extra });

/** Icon (MDI-Glyph). */
const icn = (x: number, y: number, size: number, code: number, color: string) =>
  w('icon', x, y, size, size, { text: mdi(code), text_color: color, font_size: Math.round(size * 0.9) });

/** Fortschrittsbalken. */
const bar = (
  x: number, y: number, width: number, height: number,
  value: number, color: string, track = '#1f2a3a',
) => w('bar', x, y, width, height, {
  value, min_value: 0, max_value: 100, color, bg_color: track, radius: Math.round(height / 2),
});

/** Statuspunkt (LED). */
const dot = (x: number, y: number, size: number, color: string, on = true) =>
  w('led', x, y, size, size, { color, brightness: on ? 100 : 25 });

/** Abgerundeter Button/Pille mit zentriertem Text. */
const pill = (
  x: number, y: number, width: number, height: number,
  text: string, bg: string, fg: string, size = 15, radius = Math.round(height / 2),
) => w('button', x, y, width, height, { text, bg_color: bg, text_color: fg, radius, font_size: size, font_weight: 600 });

/** Dünne Trennlinie. */
const divider = (x: number, y: number, width: number, color = '#1f2a3a') =>
  w('line', x, y, width, 2, { color, line_width: 2 });

// ── Basis-Bausteine ───────────────────────────────────────────────────────────

function sensorCard(): WidgetNode {
  return w('obj', 0, 0, 170, 100, { bg_color: '#1f2937', radius: 14, border_width: 0 }, [
    w('icon', 14, 14, 32, 32, { text: '🌡', font_size: 26 }),
    w('label', 14, 54, 120, 24, { text: 'Temperatur', text_color: '#9ca3af', font_size: 14 }),
    w('label', 100, 14, 60, 30, { text: '23.5°', text_color: '#ffffff', font_size: 26 }),
  ]);
}

function lightButton(): WidgetNode {
  return w('button', 0, 0, 130, 52, { text: 'Licht', bg_color: '#2563eb', text_color: '#ffffff', radius: 12, font_size: 17 });
}

function gauge(): WidgetNode {
  return w('arc', 0, 0, 130, 130, { min_value: 0, max_value: 100, value: 65, color: '#f59e0b', bg_color: '#374151' });
}

function statusRow(): WidgetNode {
  return w('obj', 0, 0, 200, 40, { bg_color: '#111827', radius: 8, border_width: 0 }, [
    w('led', 12, 10, 20, 20, { checked: true, color: '#22c55e' }),
    w('label', 44, 8, 140, 24, { text: 'Status: OK', text_color: '#e5e7eb', font_size: 15 }),
  ]);
}

function sliderRow(): WidgetNode {
  return w('obj', 0, 0, 300, 60, { bg_color: '#1f2937', radius: 12, border_width: 0 }, [
    w('label', 14, 10, 160, 20, { text: 'Helligkeit', text_color: '#e5e7eb', font_size: 15 }),
    w('slider', 14, 36, 272, 14, { min_value: 0, max_value: 100, value: 55, color: '#f59e0b', bg_color: '#374151' }),
  ]);
}

// ── Klima ──────────────────────────────────────────────────────────────────────

/** Kompakte Heiz-/Klimakarte mit Zielwert-Pille und Verlaufs-Balken. */
function climateCard(): WidgetNode {
  return w('obj', 0, 0, 400, 250, { bg_color: '#0f1a2b', radius: 24, border_width: 0 }, [
    w('icon', 20, 18, 26, 26, { text: mdi(ICON.fire), text_color: '#ef4444', font_size: 24 }),
    w('label', 52, 16, 150, 28, { text: 'Heating', text_color: '#ef4444', font_size: 18, font_weight: 600 }),
    w('button', 300, 14, 84, 32, { text: '23.0', bg_color: '#3a1518', text_color: '#f87171', radius: 16, font_size: 15, font_weight: 600 }),
    w('label', 20, 52, 220, 24, { text: 'Living Room', text_color: '#9ca3af', font_size: 16 }),
    w('label', 18, 150, 200, 52, { text: '21.5', text_color: '#ffffff', font_size: 46, font_weight: 700 }),
    w('line', 20, 210, 360, 2, { color: '#1f2a3a' }),
    w('bar', 20, 224, 72, 6, { value: 14, min_value: 0, max_value: 100, color: '#ef4444', bg_color: '#1f2a3a', radius: 3 }),
    w('label', 300, 216, 80, 20, { text: '23.0', text_color: '#6b7280', font_size: 15, text_align: 'right' }),
  ]);
}

/** Voll ausgestattete Klima-Steuerung: großer Gauge, Statuszeile, Modus-Buttons. */
function climateControl(): WidgetNode {
  const stat = (x: number, cap: string, val: string, color: string): WidgetNode[] => [
    w('label', x, 412, 130, 18, { text: cap, text_color: '#6b7280', font_size: 12, font_weight: 600 }),
    w('label', x, 432, 130, 28, { text: val, text_color: color, font_size: 21, font_weight: 600 }),
    w('bar', x, 468, 80, 5, { value: 60, min_value: 0, max_value: 100, color, bg_color: '#1b2536', radius: 3 }),
  ];
  const modeBtn = (x: number, text: string, sel: boolean): WidgetNode =>
    w('button', x, 512, 128, 64, {
      text,
      bg_color: sel ? '#f97316' : '#141d2e',
      text_color: sel ? '#ffffff' : '#9aa4b4',
      radius: sel ? 32 : 22,
      font_size: 24,
      font_weight: sel ? 700 : 500,
    });

  return w('obj', 0, 0, 600, 600, { bg_color: '#0b1526', radius: 32, border_width: 0 }, [
    // Kopfzeile
    w('label', 30, 28, 240, 30, { text: 'Living Room', text_color: '#d1d5db', font_size: 23, font_weight: 600 }),
    w('label', 320, 32, 150, 24, { text: 'Fan: Auto', text_color: '#9ca3af', font_size: 17, text_align: 'right' }),
    w('led', 498, 36, 15, 15, { checked: true, color: '#22c55e' }),
    w('led', 540, 36, 15, 15, { checked: true, color: '#f59e0b' }),
    // Gauge + Mitteinhalt
    w('arc', 125, 62, 350, 350, {
      value: 62, min_value: 0, max_value: 100,
      color: '#f97316', bg_color: '#2a2114', arc_width: 26,
      start_angle: 135, end_angle: 45, show_value: false,
    }),
    w('label', 180, 168, 240, 82, { text: '22.0', text_color: '#ffffff', font_size: 68, font_weight: 700, text_align: 'center' }),
    w('label', 250, 256, 100, 30, { text: '°C', text_color: '#38bdf8', font_size: 24, font_weight: 600, text_align: 'center' }),
    w('label', 180, 292, 240, 24, { text: 'Currently 19.8°', text_color: '#8a94a6', font_size: 17, text_align: 'center' }),
    w('button', 240, 326, 120, 36, { text: 'HEATING', bg_color: '#3a2210', text_color: '#fb923c', radius: 18, font_size: 14, font_weight: 700 }),
    // Statuszeile
    ...stat(30, 'HUMIDITY', '54%', '#22d3ee'),
    ...stat(175, 'AIR QUALITY', 'Good', '#34d399'),
    ...stat(320, 'ENERGY', '2.4 kWh', '#fbbf24'),
    ...stat(465, 'OUTDOOR', '8.2°', '#60a5fa'),
    // Modus-Buttons
    modeBtn(30, 'Heat', true),
    modeBtn(176, 'Cool', false),
    modeBtn(322, 'Auto', false),
    modeBtn(468, 'Off', false),
  ]);
}

/** Reiner Temperatur-Gauge mit Live-Anzeige. */
function temperatureGauge(): WidgetNode {
  return w('obj', 0, 0, 400, 400, { bg_color: '#0d1524', radius: 28, border_width: 0 }, [
    w('label', 240, 24, 100, 22, { text: 'LIVE', text_color: '#f59e0b', font_size: 15, font_weight: 600, text_align: 'right' }),
    w('led', 352, 28, 12, 12, { checked: true, color: '#f59e0b' }),
    w('arc', 50, 70, 300, 300, {
      value: 62, min_value: 0, max_value: 100,
      color: '#f59e0b', bg_color: '#1b2537', arc_width: 20,
      start_angle: 135, end_angle: 45, show_value: false,
    }),
    w('label', 100, 118, 200, 24, { text: 'TEMP', text_color: '#f59e0b', font_size: 18, font_weight: 600, text_align: 'center' }),
    w('label', 60, 178, 280, 72, { text: '21.5', text_color: '#f3f4f6', font_size: 64, font_weight: 700, text_align: 'center' }),
    w('label', 100, 258, 200, 26, { text: '°C', text_color: '#9ca3af', font_size: 20, font_weight: 600, text_align: 'center' }),
    w('label', 60, 300, 280, 26, { text: 'Living Room', text_color: '#6b7280', font_size: 20, text_align: 'center' }),
  ]);
}

/** Heizplan mit Wochentagen und Zeitpunkten. */
function hvacSchedule(): WidgetNode {
  const day = (x: number, label: string, active: boolean): WidgetNode =>
    w('button', x, 96, 68, 40, {
      text: label,
      bg_color: active ? '#ef4444' : '#141a28',
      text_color: active ? '#ffffff' : '#cbd5e1',
      radius: 10,
      font_size: 16,
      font_weight: 600,
    });
  const row = (y: number, name: string, time: string, temp: string, active: boolean): WidgetNode[] => {
    const nameCol = active ? '#f87171' : '#cbd5e1';
    const valCol = active ? '#ef4444' : '#9ca3af';
    return [
      w('led', 28, y + 6, 14, 14, { checked: active, color: active ? '#f87171' : '#374151' }),
      w('label', 54, y, 170, 28, { text: name, text_color: nameCol, font_size: 20, font_weight: 600 }),
      w('label', 240, y, 120, 28, { text: time, text_color: valCol, font_size: 20, text_align: 'center' }),
      w('label', 470, y, 106, 28, { text: temp, text_color: valCol, font_size: 20, font_weight: active ? 600 : 400, text_align: 'right' }),
    ];
  };

  return w('obj', 0, 0, 600, 400, { bg_color: '#0c0f1a', radius: 28, border_width: 0 }, [
    w('icon', 24, 22, 28, 28, { text: mdi(ICON.clock), text_color: '#ef4444', font_size: 24 }),
    w('button', 430, 26, 150, 44, { text: 'Heating', bg_color: '#3a1518', text_color: '#f87171', radius: 14, font_size: 18, font_weight: 600 }),
    w('label', 24, 66, 220, 22, { text: 'Now: 21.5°C', text_color: '#8a94a6', font_size: 16 }),
    day(24, 'Mon', true),
    day(100, 'Tue', true),
    day(176, 'Wed', true),
    day(252, 'Thu', true),
    day(328, 'Fri', true),
    day(428, 'Sat', false),
    day(504, 'Sun', false),
    ...row(150, 'Wake Up', '06:00', '23°C', true),
    ...row(206, 'Away', '08:30', '18°C', false),
    ...row(262, 'Return', '17:00', '22°C', false),
    ...row(318, 'Sleep', '22:00', '19°C', false),
  ]);
}

/** Kompakter Modus-Umschalter (Heat/Cool/Auto/Off). */
function modeSelector(): WidgetNode {
  const btn = (x: number, text: string, sel: boolean): WidgetNode =>
    w('button', x, 58, 128, 120, {
      text,
      bg_color: sel ? '#f59e0b' : '#131b2b',
      text_color: sel ? '#1a1205' : '#9aa4b4',
      radius: 18,
      font_size: 22,
      font_weight: sel ? 700 : 500,
    });
  return w('obj', 0, 0, 600, 200, { bg_color: '#0b1220', radius: 24, border_width: 0 }, [
    w('label', 24, 18, 120, 22, { text: 'MODE', text_color: '#8a94a6', font_size: 15, font_weight: 600 }),
    w('led', 568, 22, 12, 12, { checked: true, color: '#f59e0b' }),
    btn(24, 'Heat', true),
    btn(168, 'Cool', false),
    btn(312, 'Auto', false),
    btn(456, 'Off', false),
  ]);
}

// ── Beleuchtung ───────────────────────────────────────────────────────────────

/** Dimmer-Karte mit großem Ring, Helligkeits-Slider und Schalter. */
function lightControl(): WidgetNode {
  return card(400, 400, '#0d1524', 28, [
    lbl(24, 22, 220, 26, 'Living Room', '#6b7280', 18),
    w('arc', 60, 58, 280, 280, {
      value: 80, min_value: 0, max_value: 100, color: '#f5c542', bg_color: '#1b2537',
      arc_width: 22, start_angle: 135, end_angle: 45, show_value: false,
    }),
    icn(180, 136, 40, ICON.flash, '#f5c542'),
    lbl(100, 172, 200, 50, '80%', '#ffffff', 42, { text_align: 'center', font_weight: 700 }),
    lbl(100, 222, 200, 24, 'LIGHT', '#6b7280', 18, { text_align: 'center', font_weight: 600 }),
    icn(34, 278, 22, ICON.flash, '#f5c542'),
    w('slider', 68, 280, 264, 18, {
      value: 55, min_value: 0, max_value: 100, color: '#b8912f', bg_color: '#1f2a3a', knob_bg_color: '#f5c542',
    }),
    icn(346, 278, 22, ICON.flash, '#3b82f6'),
    w('switch', 34, 330, 74, 36, { checked: true, color: '#f5c542', bg_color: '#1f2a3a', knob_bg_color: '#ffffff' }),
    dot(358, 326, 12, '#f5c542'),
    lbl(296, 344, 82, 24, '12W', '#9ca3af', 17, { text_align: 'right' }),
  ]);
}

/** Übersicht aller Lichter mit Gesamt-Helligkeit und Szenen-Buttons. */
function lightingDashboard(): WidgetNode {
  const row = (y: number, name: string, nameCol: string, dotCol: string, pct: number, barCol: string, pctCol: string) => [
    dot(24, y + 5, 16, dotCol),
    lbl(52, y, 190, 28, name, nameCol, 19),
    bar(360, y + 8, 140, 10, pct, barCol),
    lbl(512, y, 66, 28, `${pct}%`, pctCol, 17, { text_align: 'right', font_weight: 600 }),
  ];
  const btn = (x: number, text: string, sel: boolean) =>
    pill(x, 300, 130, 56, text, sel ? '#eab308' : '#131b2b', sel ? '#1a1205' : '#cbd5e1', 20, 14);

  return card(600, 400, '#0b1220', 24, [
    icn(22, 20, 28, ICON.flash, '#fbbf24'),
    lbl(56, 18, 220, 32, 'Lighting', '#ffffff', 26, { font_weight: 600 }),
    lbl(420, 24, 158, 20, '4 of 6 on', '#6b7280', 14, { text_align: 'right' }),
    bar(22, 60, 480, 14, 75, '#fbbf24'),
    lbl(514, 56, 64, 22, '75%', '#ffffff', 17, { text_align: 'right', font_weight: 600 }),
    divider(22, 94, 556),
    ...row(112, 'Living Room', '#e5e7eb', '#fde047', 80, '#fbbf24', '#fbbf24'),
    ...row(160, 'Kitchen', '#e5e7eb', '#ffffff', 100, '#ffffff', '#ffffff'),
    ...row(208, 'Bedroom', '#e5e7eb', '#fde047', 30, '#f97316', '#f97316'),
    ...row(256, 'Porch', '#e5e7eb', '#22d3ee', 60, '#34d399', '#34d399'),
    btn(22, 'Relax', true), btn(162, 'Focus', false), btn(302, 'Bright', false), btn(442, 'Off', false),
  ]);
}

// ── Energie ───────────────────────────────────────────────────────────────────

/** Verbrauchs-Karte mit Balken je Verbraucher. */
function energyUsage(): WidgetNode {
  const row = (y: number, name: string, value: string, pct: number) => [
    lbl(22, y, 200, 24, name, '#9ca3af', 17),
    lbl(240, y, 138, 24, value, '#ffffff', 17, { text_align: 'right' }),
    bar(22, y + 30, 356, 10, pct, '#10b981'),
  ];
  return card(400, 400, '#0b1220', 24, [
    lbl(22, 20, 220, 30, 'Power Usage', '#ffffff', 22, { font_weight: 600 }),
    lbl(230, 16, 148, 34, '1.4 kW', '#34d399', 26, { text_align: 'right', font_weight: 600 }),
    divider(22, 62, 356),
    ...row(76, 'HVAC', '2.4 kW', 60),
    ...row(134, 'Lighting', '340W', 25),
    ...row(192, 'Kitchen', '240W', 18),
    divider(22, 336, 356),
    lbl(22, 352, 140, 24, 'Today', '#6b7280', 17),
    lbl(240, 352, 138, 24, '12.8 kWh', '#34d399', 17, { text_align: 'right' }),
  ]);
}

/** Detail-Aufschlüsselung mit konzentrischen Ringen und Legende. */
function energyDetail(): WidgetNode {
  // Konzentrische Teilbögen (außen → innen) ergeben das „Wellen"-Motiv.
  const ring = (size: number, value: number, color: string) =>
    w('arc', 110 - size / 2, 132 - size / 2, size, size, {
      value, min_value: 0, max_value: 100, color, bg_color: '#131c2e',
      arc_width: 11, start_angle: 140, end_angle: 40, show_value: false,
    });
  const legend = (y: number, name: string, value: string, color: string) => [
    dot(208, y + 3, 14, color),
    lbl(230, y, 150, 22, name, '#e5e7eb', 17),
    lbl(230, y + 22, 150, 26, value, '#ffffff', 19, { font_weight: 600 }),
  ];
  return card(400, 400, '#0b1220', 24, [
    ring(200, 55, '#10b981'), ring(168, 46, '#3b82f6'), ring(136, 38, '#8b5cf6'),
    ring(104, 30, '#f59e0b'), ring(72, 22, '#ef4444'),
    ...legend(18, 'HVAC', '980W', '#10b981'),
    ...legend(66, 'Lighting', '420W', '#3b82f6'),
    ...legend(114, 'Kitchen', '340W', '#f59e0b'),
    ...legend(162, 'EV Charger', '380W', '#8b5cf6'),
    ...legend(210, 'Other', '280W', '#ef4444'),
    lbl(22, 296, 160, 42, '2.4 kW', '#ffffff', 30, { font_weight: 600 }),
    lbl(190, 306, 110, 26, 'TOTAL', '#374151', 17, { font_weight: 600 }),
    divider(22, 344, 356),
    lbl(22, 358, 140, 24, 'Today', '#6b7280', 17),
    lbl(240, 358, 138, 24, '18.6 kWh', '#34d399', 17, { text_align: 'right' }),
  ]);
}

// ── Sensoren ──────────────────────────────────────────────────────────────────

/** Vier Messwerte als Kachel-Raster. */
function multiSensorCard(): WidgetNode {
  const tile = (x: number, y: number, code: number, unit: string, value: string, color: string) =>
    w('obj', x, y, 172, 142, { bg_color: '#111a2b', radius: 14, border_width: 0 }, [
      icn(14, 12, 26, code, color),
      lbl(46, 12, 90, 24, unit, color, 15),
      lbl(14, 68, 144, 50, value, '#ffffff', 36, { text_align: 'center', font_weight: 600 }),
    ]);
  return card(400, 400, '#0d1524', 24, [
    lbl(22, 20, 240, 28, 'Living Room', '#ffffff', 20, { font_weight: 600 }),
    divider(22, 60, 356),
    tile(22, 76, ICON.thermometer, '°C', '22.4', '#f59e0b'),
    tile(206, 76, ICON.water, '%', '58', '#22d3ee'),
    tile(22, 230, ICON.chevronUp, 'hPa', '1013', '#8b5cf6'),
    tile(206, 230, ICON.eye, 'lux', '340', '#fbbf24'),
  ]);
}

/** Schmale Leiste mit mehreren Messwerten nebeneinander. */
function sensorStrip(): WidgetNode {
  const item = (x: number, code: number, text: string, color: string) => [
    icn(x, 28, 24, code, color),
    lbl(x + 30, 27, 104, 26, text, '#e5e7eb', 16),
  ];
  return card(600, 80, '#0b1220', 16, [
    ...item(24, ICON.thermometer, '22 °C', '#f59e0b'),
    ...item(168, ICON.water, '48 %', '#22d3ee'),
    ...item(312, ICON.flash, '1013 hPa', '#8b5cf6'),
    ...item(456, ICON.eye, '340 ppm', '#fbbf24'),
  ]);
}

/** Raum-Übersicht mit Status und Kennzahlen. */
function roomCard(): WidgetNode {
  return card(400, 260, '#0d1524', 24, [
    icn(22, 24, 32, ICON.home, '#3b82f6'),
    dot(56, 18, 10, '#3b82f6'),
    lbl(64, 22, 240, 32, 'Living Room', '#ffffff', 24, { font_weight: 600 }),
    dot(26, 70, 12, '#fbbf24'),
    lbl(62, 64, 140, 24, 'Online', '#fbbf24', 17),
    lbl(22, 106, 350, 42, '48% · 1013 hPa', '#ffffff', 28, { font_weight: 600 }),
    lbl(22, 176, 260, 24, '3 lights · 2 plugs', '#6b7280', 17),
    bar(22, 224, 80, 6, 100, '#3b82f6', '#0d1524'),
  ]);
}

// ── Cover / Lüftung ───────────────────────────────────────────────────────────

/** Rollladen-Steuerung mit Positions-Ring und Auf/Stopp/Ab. */
function coverControl(): WidgetNode {
  return card(400, 400, '#0d1524', 28, [
    lbl(22, 22, 270, 28, 'Living Room Blinds', '#ffffff', 20, { font_weight: 600 }),
    lbl(288, 24, 90, 24, 'Open', '#3b82f6', 17, { text_align: 'right', font_weight: 600 }),
    w('arc', 70, 66, 260, 260, {
      value: 100, min_value: 0, max_value: 100, color: '#3b82f6', bg_color: '#1b2537',
      arc_width: 22, start_angle: 135, end_angle: 45, show_value: false,
    }),
    lbl(120, 168, 160, 52, '100%', '#ffffff', 40, { text_align: 'center', font_weight: 700 }),
    pill(22, 330, 110, 56, mdi(ICON.chevronUp), '#131b2b', '#e5e7eb', 24, 16),
    pill(146, 330, 110, 56, mdi(ICON.stop), '#2563eb', '#ffffff', 22, 16),
    pill(270, 330, 110, 56, mdi(ICON.chevronDown), '#131b2b', '#e5e7eb', 24, 16),
  ]);
}

/** Ventilator mit Stufenanzeige. */
function fanControl(): WidgetNode {
  const blob = (x: number, y: number, width: number, height: number) =>
    w('obj', x, y, width, height, { bg_color: '#10b981', radius: Math.round(height / 2), border_width: 0 });
  return card(400, 200, '#0b1220', 20, [
    icn(22, 26, 34, ICON.fan, '#10b981'),
    lbl(66, 22, 220, 30, 'Ceiling Fan', '#ffffff', 22, { font_weight: 600 }),
    lbl(66, 54, 160, 24, 'Medium', '#10b981', 18),
    blob(22, 124, 34, 28), blob(64, 118, 36, 36), blob(108, 112, 42, 44),
    lbl(250, 126, 128, 24, 'Speed 2/3', '#6b7280', 17, { text_align: 'right' }),
    bar(22, 178, 110, 4, 100, '#10b981', '#0b1220'),
  ]);
}

// ── Bewässerung ───────────────────────────────────────────────────────────────

/** Einzelne Bewässerungszone mit Bodenfeuchte. */
function irrigationZone(): WidgetNode {
  return card(400, 200, '#0b1220', 20, [
    icn(22, 26, 30, ICON.water, '#10b981'),
    lbl(62, 22, 200, 30, 'Front Lawn', '#ffffff', 22, { font_weight: 600 }),
    lbl(62, 54, 140, 24, 'Idle', '#10b981', 18),
    pill(280, 24, 100, 34, '--:--', '#0f2a20', '#10b981', 16),
    lbl(22, 136, 150, 24, 'Moisture', '#6b7280', 17),
    lbl(300, 136, 78, 24, '65%', '#10b981', 17, { text_align: 'right', font_weight: 600 }),
    bar(22, 168, 356, 10, 65, '#10b981'),
  ]);
}

/** Bewässerungsplan mit Zonen, Laufzeit und Feuchte. */
function irrigationDashboard(): WidgetNode {
  const row = (y: number, name: string, nameCol: string, dotCol: string, mins: string, pct: number, barCol: string, pctCol: string) => [
    dot(24, y + 6, 18, dotCol, dotCol !== '#374151'),
    lbl(54, y, 180, 28, name, nameCol, 19),
    lbl(240, y, 90, 28, mins, '#9ca3af', 17),
    bar(340, y + 9, 160, 12, pct, barCol),
    lbl(512, y, 66, 28, `${pct}%`, pctCol, 17, { text_align: 'right', font_weight: 600 }),
  ];
  return card(600, 400, '#0b1220', 24, [
    icn(22, 20, 28, ICON.water, '#10b981'),
    lbl(58, 18, 220, 32, 'Irrigation', '#ffffff', 24, { font_weight: 600 }),
    dot(552, 26, 18, '#22d3ee'),
    lbl(22, 60, 240, 24, '06:00 AM Daily', '#9ca3af', 16),
    lbl(390, 60, 188, 24, 'Next: 6h 23m', '#10b981', 16, { text_align: 'right' }),
    divider(22, 94, 556),
    ...row(112, 'Front Lawn', '#ffffff', '#22d3ee', '12 min', 72, '#10b981', '#10b981'),
    ...row(168, 'Garden Beds', '#9ca3af', '#374151', '8 min', 48, '#06b6d4', '#e5e7eb'),
    ...row(224, 'Back Yard', '#9ca3af', '#374151', '15 min', 61, '#3b82f6', '#e5e7eb'),
    ...row(280, 'Side Strip', '#9ca3af', '#374151', '10 min', 35, '#8b5cf6', '#e5e7eb'),
    lbl(22, 346, 110, 26, 'TOTAL', '#6b7280', 16, { font_weight: 600 }),
    lbl(240, 344, 110, 28, '45 min', '#ffffff', 19, { font_weight: 600 }),
    lbl(460, 344, 118, 28, '38.4 gal', '#10b981', 18, { text_align: 'right', font_weight: 600 }),
  ]);
}

// ── Sicherheit ────────────────────────────────────────────────────────────────

/** Alarmanlagen-Panel mit Zonenliste. */
function securityPanel(): WidgetNode {
  const row = (y: number, name: string, status: string, col: string) => [
    dot(24, y + 6, 16, col),
    lbl(54, y, 210, 28, name, '#ffffff', 19),
    lbl(260, y, 118, 28, status, col, 18, { text_align: 'right' }),
  ];
  return card(400, 600, '#0b1220', 24, [
    icn(22, 22, 28, ICON.shield, '#10b981'),
    lbl(54, 20, 240, 30, 'ARMED AWAY', '#10b981', 20, { font_weight: 600 }),
    dot(356, 26, 18, '#10b981'),
    bar(22, 64, 356, 5, 100, '#10b981', '#0b1220'),
    ...row(100, 'Front Door', 'Secure', '#10b981'),
    ...row(184, 'Motion Sensor', 'Secure', '#10b981'),
    ...row(268, 'Windows', 'Secure', '#10b981'),
    ...row(352, 'Garage', 'OPEN', '#ef4444'),
    ...row(436, 'Back Door', 'Secure', '#10b981'),
    lbl(22, 508, 240, 26, 'System Armed', '#6b7280', 18),
    lbl(160, 552, 80, 24, '--', '#10b981', 16, { text_align: 'center' }),
  ]);
}

/** Tür-/Fensterkontakt mit Status. */
function doorWindowSensor(): WidgetNode {
  return w('obj', 0, 0, 400, 230, { bg_color: '#0b1220', radius: 22, border_width: 1, border_color: '#123a2a' }, [
    icn(24, 78, 38, ICON.lock, '#10b981'),
    dot(74, 74, 10, '#10b981'),
    lbl(104, 36, 240, 32, 'Front Door', '#ffffff', 22, { font_weight: 600 }),
    lbl(104, 70, 180, 30, 'Closed', '#10b981', 21),
    lbl(104, 150, 200, 24, '2 min ago', '#6b7280', 17),
  ]);
}

/** Bewegungsmelder mit Signalstärke. */
function motionDetector(): WidgetNode {
  const sig = (x: number, y: number, height: number) =>
    w('obj', x, y, 8, height, { bg_color: '#10b981', radius: 2, border_width: 0 });
  return card(600, 260, '#0b1220', 22, [
    icn(22, 30, 40, ICON.motion, '#10b981'),
    dot(68, 26, 10, '#10b981'),
    lbl(98, 22, 240, 34, 'Hallway', '#ffffff', 24, { font_weight: 600 }),
    lbl(98, 58, 180, 28, 'Clear', '#10b981', 19),
    sig(500, 46, 18), sig(520, 38, 26), sig(540, 28, 36),
    lbl(450, 76, 128, 24, '5 min ago', '#6b7280', 16, { text_align: 'right' }),
    bar(22, 228, 556, 6, 20, '#10b981'),
  ]);
}

/** Garagentor mit Position. */
function garageDoor(): WidgetNode {
  return card(400, 200, '#0b1220', 20, [
    icn(22, 32, 34, ICON.chevronDown, '#10b981'),
    dot(60, 26, 10, '#10b981'),
    lbl(92, 24, 240, 32, 'Garage Door', '#ffffff', 22, { font_weight: 600 }),
    lbl(92, 56, 180, 28, 'Closed', '#10b981', 19),
    bar(22, 108, 356, 10, 0, '#10b981'),
    lbl(22, 134, 150, 24, 'Position', '#6b7280', 17),
    lbl(300, 134, 78, 24, '0', '#10b981', 17, { text_align: 'right' }),
    dot(24, 166, 12, '#10b981'),
    lbl(54, 162, 160, 24, 'Secure', '#6b7280', 17),
  ]);
}

// ── Szenen ────────────────────────────────────────────────────────────────────

/** Szenen-Kacheln zum Aktivieren. */
function sceneLauncher(): WidgetNode {
  const tile = (x: number, y: number, code: number, name: string, active: boolean) =>
    w('obj', x, y, 168, 148, {
      bg_color: '#111a2b', radius: 16, border_width: 2,
      border_color: active ? '#ec4899' : '#1a2436',
    }, [
      icn(64, 32, 40, code, active ? '#ec4899' : '#4b5563'),
      lbl(14, 92, 140, 26, name, active ? '#ec4899' : '#4b5563', 18, { text_align: 'center' }),
    ]);
  return card(400, 400, '#0b1220', 24, [
    lbl(22, 20, 220, 26, 'SCENES', '#6b7280', 17, { font_weight: 600 }),
    tile(22, 60, ICON.movie, 'Movie', true),
    tile(210, 60, ICON.flash, 'Morning', false),
    tile(22, 228, ICON.water, 'Dinner', false),
    tile(210, 228, ICON.power, 'Away', false),
  ]);
}

/** Szene mit den enthaltenen Geräten. */
function sceneEditor(): WidgetNode {
  const row = (y: number, dotCol: string, boltCol: string, name: string, value: string) => [
    dot(24, y + 6, 14, dotCol),
    icn(50, y + 2, 22, ICON.flash, boltCol),
    lbl(80, y, 180, 26, name, '#ffffff', 17),
    lbl(230, y, 148, 26, value, '#e5e7eb', 16, { text_align: 'right' }),
  ];
  return card(400, 400, '#0b1220', 24, [
    icn(22, 22, 30, ICON.movie, '#ec4899'),
    lbl(60, 20, 220, 34, 'Movie Night', '#ffffff', 24, { font_weight: 600 }),
    pill(286, 20, 92, 34, 'Active', '#ec4899', '#ffffff', 16),
    lbl(22, 62, 200, 24, '5 devices', '#6b7280', 16),
    divider(22, 96, 356),
    ...row(114, '#fde047', '#fbbf24', 'Living Room Lights', 'Dimmed 20%'),
    ...row(170, '#67e8f9', '#3b82f6', 'TV', 'Netflix'),
    ...row(226, '#f9a8d4', '#8b5cf6', 'Soundbar', 'Surround On'),
    ...row(282, '#67e8f9', '#22d3ee', 'AC', '22°C Cool'),
  ]);
}

/** Schnellschalter-Raster mit Status-Punkten. */
function quickToggle(): WidgetNode {
  const tile = (x: number, y: number, code: number, name: string, accent: string, border: string, on: boolean) =>
    w('obj', x, y, 112, 148, { bg_color: '#111a2b', radius: 14, border_width: 2, border_color: border }, [
      icn(40, 26, 32, code, accent),
      lbl(6, 72, 100, 24, name, on ? '#e5e7eb' : '#4b5563', 16, { text_align: 'center' }),
      dot(51, 110, 10, accent, on),
    ]);
  return card(400, 400, '#0b1220', 24, [
    lbl(22, 20, 260, 30, 'Quick Controls', '#e5e7eb', 21),
    tile(22, 62, ICON.flash, 'Lights', '#fbbf24', '#a16207', true),
    tile(146, 62, ICON.refresh, 'Fan', '#3b82f6', '#1d4ed8', true),
    tile(270, 62, ICON.snowflake, 'AC', '#374151', '#1a2436', false),
    tile(22, 222, ICON.television, 'TV', '#8b5cf6', '#6d28d9', true),
    tile(146, 222, ICON.speaker, 'Speaker', '#374151', '#1a2436', false),
    tile(270, 222, ICON.lock, 'Lock', '#ef4444', '#b91c1c', true),
  ]);
}

// ── UI / Navigation ───────────────────────────────────────────────────────────

/** Schwebende Navigationsleiste. */
function floatingDockNav(): WidgetNode {
  const item = (x: number, code: number, name: string, active: boolean) => [
    icn(x + 30, 22, 32, code, active ? '#4f46e5' : '#374151'),
    lbl(x, 62, 92, 22, name, active ? '#6366f1' : '#374151', 15, { text_align: 'center' }),
  ];
  return w('obj', 0, 0, 600, 110, { bg_color: '#0e1626', radius: 26, border_width: 1, border_color: '#1f2a3a' }, [
    ...item(30, ICON.home, 'Home', true),
    ...item(142, ICON.flash, 'Energy', false),
    ...item(254, ICON.shield, 'Shield', false),
    ...item(366, ICON.bell, 'Alerts', false),
    ...item(478, ICON.cog, 'Settings', false),
  ]);
}

/** Kompakte Statusleiste (Uhr, Datum, Signal, Akku). */
function floatingStatusIsland(): WidgetNode {
  const sig = (x: number, height: number) =>
    w('obj', x, 48 - height, 8, height, { bg_color: '#6366f1', radius: 2, border_width: 0 });
  return card(600, 80, '#0e1626', 22, [
    pill(18, 18, 150, 44, 'Dashboard', '#1a1f3a', '#ffffff', 19),
    icn(196, 28, 24, ICON.clock, '#6366f1'),
    lbl(226, 26, 74, 28, '14:32', '#ffffff', 20, { font_weight: 600 }),
    dot(310, 34, 10, '#374151', false),
    lbl(326, 28, 140, 24, 'Mon 28 Mar', '#6b7280', 16),
    sig(470, 10), sig(482, 16), sig(494, 22),
    lbl(512, 28, 46, 24, '72%', '#e5e7eb', 16),
    w('obj', 566, 26, 16, 26, { bg_color: '#e5e7eb', radius: 4, border_width: 0 }),
  ]);
}

/** Benachrichtigungs-Karte. */
function notificationCard(): WidgetNode {
  return card(600, 180, '#0b1220', 20, [
    icn(34, 66, 42, ICON.bell, '#fbbf24'),
    lbl(96, 28, 340, 34, 'Motion Detected', '#ffffff', 24, { font_weight: 600 }),
    lbl(96, 66, 440, 26, 'Front door camera detected movement', '#6b7280', 17),
    lbl(96, 118, 200, 26, '2 min ago', '#f59e0b', 17),
    dot(552, 24, 14, '#f59e0b'),
  ]);
}

// ── WLAN-Setup (Vollbild-Screens) ─────────────────────────────────────────────

/** Auswahl: bestehendes Netz beitreten oder Hotspot öffnen. */
function wifiApSelect(): WidgetNode {
  const option = (y: number, title: string, sub: string, active: boolean) =>
    w('obj', 30, y, 540, 100, {
      bg_color: active ? '#111a2b' : '#0f1626', radius: 16, border_width: 2,
      border_color: active ? '#3b82f6' : '#1a2436',
    }, [
      dot(28, 40, 22, active ? '#3b82f6' : '#3a3020', active),
      lbl(66, 22, 320, 32, title, active ? '#ffffff' : '#6b7280', 22),
      lbl(66, 56, 360, 26, sub, active ? '#4b5563' : '#374151', 17),
    ]);
  return card(600, 400, '#0b1220', 24, [
    lbl(100, 24, 400, 40, 'Connection Mode', '#ffffff', 30, { text_align: 'center', font_weight: 700 }),
    lbl(100, 68, 400, 28, 'How should this device connect?', '#9ca3af', 19, { text_align: 'center' }),
    divider(30, 110, 540),
    option(126, 'Join Network', 'Connect to your existing WiFi', true),
    option(244, 'Create Hotspot', 'Device creates its own network', false),
    bar(30, 366, 540, 8, 100, '#3b82f6', '#0b1220'),
  ]);
}

/** Hotspot-Zugangsdaten mit QR-Code. */
function wifiCaptivePortal(): WidgetNode {
  return card(600, 400, '#0b1220', 24, [
    lbl(100, 18, 400, 40, 'Device Hotspot', '#8b5cf6', 30, { text_align: 'center', font_weight: 700 }),
    lbl(100, 62, 400, 26, 'Connect to configure this device', '#9ca3af', 18, { text_align: 'center' }),
    w('qrcode', 24, 100, 185, 185, { text: 'WIFI:S:ESP32-Setup;P:esphome123;;', size: 185, light_color: '#ffffff', dark_color: '#000000' }),
    w('obj', 225, 100, 350, 175, { bg_color: '#0f1626', radius: 14, border_width: 1, border_color: '#2a2140' }, [
      dot(316, 16, 16, '#8b5cf6'),
      lbl(18, 18, 200, 24, 'Network', '#9ca3af', 17),
      lbl(18, 44, 300, 34, 'ESP32-Setup', '#ffffff', 24),
      lbl(18, 90, 200, 24, 'Password', '#9ca3af', 17),
      lbl(18, 116, 300, 34, 'esphome123', '#ffffff', 24),
    ]),
    lbl(100, 290, 400, 26, 'Scan to connect', '#6b7280', 17, { text_align: 'center' }),
    pill(24, 326, 552, 56, 'Open Portal', '#7c3aed', '#ffffff', 26, 14),
  ]);
}

/** Verbindungsaufbau mit Spinner und Fortschritt. */
function wifiConnecting(): WidgetNode {
  return card(600, 400, '#0b1220', 24, [
    dot(24, 36, 16, '#3b82f6'),
    lbl(150, 28, 300, 34, 'Connecting', '#e5e7eb', 24, { text_align: 'center' }),
    lbl(450, 32, 126, 26, 'Step 3/4', '#6b7280', 17, { text_align: 'right' }),
    divider(24, 78, 552),
    w('spinner', 252, 140, 96, 96, { color: '#3b82f6', arc_width: 8, spin_time: '1000ms', arc_length: '60deg' }),
    lbl(120, 254, 360, 34, 'HomeNetwork_5G', '#ffffff', 24, { text_align: 'center', font_weight: 600 }),
    lbl(120, 292, 360, 28, 'Authenticating…', '#6b7280', 19, { text_align: 'center' }),
    bar(24, 362, 552, 10, 42, '#3b82f6'),
  ]);
}

/** Fehlerseite mit Wiederholen/Zurück. */
function wifiError(): WidgetNode {
  return card(600, 400, '#0b1220', 24, [
    w('obj', 268, 18, 64, 64, {
      bg_color: '#150c10', radius: 32, border_width: 0,
      shadow_color: '#ef4444', shadow_width: 30, shadow_opa: 60,
    }),
    lbl(100, 94, 400, 40, 'Connection Failed', '#ef4444', 28, { text_align: 'center', font_weight: 700 }),
    lbl(100, 134, 400, 30, 'HomeNetwork_5G', '#ffffff', 21, { text_align: 'center' }),
    lbl(60, 198, 480, 28, 'Wrong password or network unavailable', '#6b7280', 19, { text_align: 'center' }),
    lbl(100, 234, 400, 24, 'ERR_AUTH_FAIL', '#4b5563', 16, { text_align: 'center' }),
    divider(30, 302, 540, '#7f1d1d'),
    pill(30, 322, 255, 58, 'Retry', '#ef4444', '#ffffff', 24, 16),
    pill(315, 322, 255, 58, 'Back', '#131b2b', '#cbd5e1', 24, 16),
  ]);
}

/** Statische IP-Konfiguration. */
function wifiManualIp(): WidgetNode {
  const field = (y: number, label: string, value: string) => [
    lbl(24, y + 4, 150, 28, label, '#9ca3af', 17),
    w('obj', 172, y, 404, 36, { bg_color: '#0f1626', radius: 8, border_width: 1, border_color: '#1f2a3a' }, [
      lbl(0, 5, 404, 26, value, '#ffffff', 20, { text_align: 'center' }),
    ]),
  ];
  return card(600, 400, '#0b1220', 24, [
    lbl(100, 18, 400, 40, 'Manual IP', '#ffffff', 30, { text_align: 'center', font_weight: 700 }),
    lbl(100, 62, 400, 26, 'Static network configuration', '#9ca3af', 18, { text_align: 'center' }),
    ...field(100, 'IP Address', '192.168.1.100'),
    ...field(144, 'Subnet', '255.255.255.0'),
    ...field(188, 'Gateway', '192.168.1.1'),
    ...field(232, 'DNS', '8.8.8.8'),
    pill(24, 322, 552, 58, 'Apply', '#3b82f6', '#ffffff', 26, 14),
  ]);
}

/** Firmware-Update mit Fortschrittsring. */
function wifiOtaUpdate(): WidgetNode {
  return card(600, 400, '#0b1220', 24, [
    lbl(100, 24, 400, 40, 'Firmware Update', '#ffffff', 28, { text_align: 'center', font_weight: 700 }),
    w('arc', 246, 104, 108, 108, {
      value: 65, min_value: 0, max_value: 100, color: '#10b981', bg_color: '#16241f',
      arc_width: 10, start_angle: 135, end_angle: 45, show_value: false,
    }),
    lbl(246, 138, 108, 40, '65%', '#10b981', 26, { text_align: 'center', font_weight: 600 }),
    lbl(120, 248, 360, 30, 'Downloading…', '#9ca3af', 20, { text_align: 'center' }),
    lbl(120, 284, 360, 30, 'v2.1.0 → v2.2.0', '#9ca3af', 20, { text_align: 'center' }),
    bar(24, 362, 552, 10, 65, '#10b981'),
  ]);
}

/** Passwort-Eingabe mit Bildschirmtastatur. */
function wifiPassword(): WidgetNode {
  // Gleichmäßig verteilte Tastenreihe.
  const keyRow = (y: number, keys: string[], accent: (i: number) => boolean) => {
    const gap = 4;
    const kw = Math.floor((564 - gap * (keys.length - 1)) / keys.length);
    return keys.map((t, i) =>
      pill(18 + i * (kw + gap), y, kw, 38, t, accent(i) ? '#7c3aed' : '#131b2b', '#e5e7eb', 15, 6));
  };
  return card(600, 400, '#0b1220', 20, [
    w('obj', 8, 8, 584, 44, { bg_color: '#0f1626', radius: 10, border_width: 0 }, [
      dot(12, 16, 12, '#3b82f6'),
      lbl(34, 8, 280, 28, 'Enter Password', '#ffffff', 21),
      lbl(430, 10, 140, 24, 'Step 2/4', '#374151', 17, { text_align: 'right' }),
    ]),
    w('obj', 18, 62, 564, 44, { bg_color: '#0f1626', radius: 10, border_width: 1, border_color: '#1f2a3a' }, [
      w('obj', 12, 14, 16, 16, { bg_color: '#3b82f6', radius: 3, border_width: 0 }),
      lbl(38, 6, 320, 32, 'HomeNetwork_5G', '#ffffff', 22),
      lbl(410, 10, 140, 24, 'Secured', '#9ca3af', 17, { text_align: 'right' }),
    ]),
    w('obj', 18, 118, 410, 40, { bg_color: '#0f1626', radius: 8, border_width: 1, border_color: '#2a2140' }, [
      lbl(10, 6, 390, 28, 'Enter WiFi password|', '#9ca3af', 19),
    ]),
    pill(436, 118, 146, 40, 'Connect', '#3b82f6', '#ffffff', 22, 8),
    ...keyRow(172, ['1#', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '⌫'], (i) => i === 0 || i === 11),
    ...keyRow(214, ['ABC', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'Enter'], (i) => i === 0 || i === 10),
    ...keyRow(256, ['_', '-', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '.', ',', ':'], (i) => i < 2 || i > 8),
    pill(18, 298, 100, 38, '⌨', '#7c3aed', '#e5e7eb', 15, 6),
    pill(122, 298, 100, 38, '<', '#131b2b', '#e5e7eb', 15, 6),
    pill(226, 298, 200, 38, 'Space', '#7c3aed', '#e5e7eb', 15, 6),
    pill(430, 298, 70, 38, '>', '#7c3aed', '#e5e7eb', 15, 6),
    pill(504, 298, 78, 38, '✓', '#7c3aed', '#e5e7eb', 15, 6),
    lbl(150, 348, 300, 24, 'TEXT_LOWER → wpw_ta', '#6b7280', 15, { text_align: 'center' }),
  ]);
}

/** Erfolgsseite mit Netzwerk-Infos. */
function wifiSuccess(): WidgetNode {
  return card(600, 400, '#0b1220', 24, [
    w('obj', 268, 18, 64, 64, {
      bg_color: '#0d1f18', radius: 32, border_width: 0,
      shadow_color: '#10b981', shadow_width: 30, shadow_opa: 60,
    }),
    lbl(100, 94, 400, 40, 'Connected!', '#10b981', 30, { text_align: 'center', font_weight: 700 }),
    divider(30, 146, 540),
    lbl(30, 176, 150, 28, 'Network', '#6b7280', 18),
    lbl(180, 176, 390, 28, 'HomeNetwork_5G', '#ffffff', 20),
    lbl(30, 216, 150, 28, 'IP', '#6b7280', 18),
    lbl(180, 216, 390, 28, '192.168.1.42', '#ffffff', 20),
    lbl(30, 256, 150, 28, 'Signal', '#6b7280', 18),
    bar(180, 264, 390, 12, 90, '#10b981'),
    pill(24, 322, 552, 58, 'Done', '#10b981', '#ffffff', 26, 14),
  ]);
}

/** Mitgelieferte Widget-Vorlagen. */
export const BUILTIN_WIDGET_TEMPLATES: WidgetTemplate[] = [
  // Klima
  { id: 'b_climate_card', name: 'Klimakarte', kind: 'widget', category: 'Klima', builtin: true, createdAt: 0, node: climateCard() },
  { id: 'b_climate_control', name: 'Klima-Steuerung', kind: 'widget', category: 'Klima', builtin: true, createdAt: 0, node: climateControl() },
  { id: 'b_temperature_gauge', name: 'Temperatur-Gauge', kind: 'widget', category: 'Klima', builtin: true, createdAt: 0, node: temperatureGauge() },
  { id: 'b_hvac_schedule', name: 'Heizplan', kind: 'widget', category: 'Klima', builtin: true, createdAt: 0, node: hvacSchedule() },
  { id: 'b_mode_selector', name: 'Modus-Auswahl', kind: 'widget', category: 'Klima', builtin: true, createdAt: 0, node: modeSelector() },
  // Beleuchtung
  { id: 'b_light_control', name: 'Licht-Dimmer', kind: 'widget', category: 'Beleuchtung', builtin: true, createdAt: 0, node: lightControl() },
  { id: 'b_lighting_dashboard', name: 'Licht-Übersicht', kind: 'widget', category: 'Beleuchtung', builtin: true, createdAt: 0, node: lightingDashboard() },
  // Energie
  { id: 'b_energy_usage', name: 'Verbrauch', kind: 'widget', category: 'Energie', builtin: true, createdAt: 0, node: energyUsage() },
  { id: 'b_energy_detail', name: 'Verbrauch-Detail', kind: 'widget', category: 'Energie', builtin: true, createdAt: 0, node: energyDetail() },
  // Sensoren
  { id: 'b_multi_sensor', name: 'Multi-Sensor', kind: 'widget', category: 'Sensoren', builtin: true, createdAt: 0, node: multiSensorCard() },
  { id: 'b_sensor_strip', name: 'Sensor-Leiste', kind: 'widget', category: 'Sensoren', builtin: true, createdAt: 0, node: sensorStrip() },
  { id: 'b_room_card', name: 'Raum-Karte', kind: 'widget', category: 'Sensoren', builtin: true, createdAt: 0, node: roomCard() },
  // Cover/Lüftung
  { id: 'b_cover_control', name: 'Rollladen', kind: 'widget', category: 'Cover/Lüftung', builtin: true, createdAt: 0, node: coverControl() },
  { id: 'b_fan_control', name: 'Ventilator', kind: 'widget', category: 'Cover/Lüftung', builtin: true, createdAt: 0, node: fanControl() },
  // Bewässerung
  { id: 'b_irrigation_zone', name: 'Bewässerungs-Zone', kind: 'widget', category: 'Bewässerung', builtin: true, createdAt: 0, node: irrigationZone() },
  { id: 'b_irrigation_dashboard', name: 'Bewässerungs-Plan', kind: 'widget', category: 'Bewässerung', builtin: true, createdAt: 0, node: irrigationDashboard() },
  // Sicherheit
  { id: 'b_security_panel', name: 'Alarm-Panel', kind: 'widget', category: 'Sicherheit', builtin: true, createdAt: 0, node: securityPanel() },
  { id: 'b_door_sensor', name: 'Tür-/Fensterkontakt', kind: 'widget', category: 'Sicherheit', builtin: true, createdAt: 0, node: doorWindowSensor() },
  { id: 'b_motion_detector', name: 'Bewegungsmelder', kind: 'widget', category: 'Sicherheit', builtin: true, createdAt: 0, node: motionDetector() },
  { id: 'b_garage_door', name: 'Garagentor', kind: 'widget', category: 'Sicherheit', builtin: true, createdAt: 0, node: garageDoor() },
  // Szenen
  { id: 'b_scene_launcher', name: 'Szenen-Kacheln', kind: 'widget', category: 'Szenen', builtin: true, createdAt: 0, node: sceneLauncher() },
  { id: 'b_scene_editor', name: 'Szene-Details', kind: 'widget', category: 'Szenen', builtin: true, createdAt: 0, node: sceneEditor() },
  { id: 'b_quick_toggle', name: 'Schnellschalter', kind: 'widget', category: 'Szenen', builtin: true, createdAt: 0, node: quickToggle() },
  // UI/Navigation
  { id: 'b_dock_nav', name: 'Navigationsleiste', kind: 'widget', category: 'UI/Navigation', builtin: true, createdAt: 0, node: floatingDockNav() },
  { id: 'b_status_island', name: 'Statusleiste', kind: 'widget', category: 'UI/Navigation', builtin: true, createdAt: 0, node: floatingStatusIsland() },
  { id: 'b_notification', name: 'Benachrichtigung', kind: 'widget', category: 'UI/Navigation', builtin: true, createdAt: 0, node: notificationCard() },
  // WLAN-Setup
  { id: 'b_wifi_ap_select', name: 'Verbindungsart', kind: 'widget', category: 'WLAN-Setup', builtin: true, createdAt: 0, node: wifiApSelect() },
  { id: 'b_wifi_portal', name: 'Hotspot / QR', kind: 'widget', category: 'WLAN-Setup', builtin: true, createdAt: 0, node: wifiCaptivePortal() },
  { id: 'b_wifi_password', name: 'Passwort-Eingabe', kind: 'widget', category: 'WLAN-Setup', builtin: true, createdAt: 0, node: wifiPassword() },
  { id: 'b_wifi_connecting', name: 'Verbinde…', kind: 'widget', category: 'WLAN-Setup', builtin: true, createdAt: 0, node: wifiConnecting() },
  { id: 'b_wifi_success', name: 'Verbunden', kind: 'widget', category: 'WLAN-Setup', builtin: true, createdAt: 0, node: wifiSuccess() },
  { id: 'b_wifi_error', name: 'Verbindungsfehler', kind: 'widget', category: 'WLAN-Setup', builtin: true, createdAt: 0, node: wifiError() },
  { id: 'b_wifi_manual_ip', name: 'Manuelle IP', kind: 'widget', category: 'WLAN-Setup', builtin: true, createdAt: 0, node: wifiManualIp() },
  { id: 'b_wifi_ota', name: 'Firmware-Update', kind: 'widget', category: 'WLAN-Setup', builtin: true, createdAt: 0, node: wifiOtaUpdate() },
  // Basis
  { id: 'b_sensor_card', name: 'Sensor-Karte', kind: 'widget', category: 'Basis', builtin: true, createdAt: 0, node: sensorCard() },
  { id: 'b_light_button', name: 'Licht-Button', kind: 'widget', category: 'Basis', builtin: true, createdAt: 0, node: lightButton() },
  { id: 'b_gauge', name: 'Gauge (Arc)', kind: 'widget', category: 'Basis', builtin: true, createdAt: 0, node: gauge() },
  { id: 'b_status_row', name: 'Status-Zeile', kind: 'widget', category: 'Basis', builtin: true, createdAt: 0, node: statusRow() },
  { id: 'b_slider_row', name: 'Slider-Karte', kind: 'widget', category: 'Basis', builtin: true, createdAt: 0, node: sliderRow() },
];
