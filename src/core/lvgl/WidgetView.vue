<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { WidgetNode } from './types';
import { isContainer } from './types';
import { parseLinePoints } from './line';
import { ENTITY_STATES_KEY, ENTITY_VALUES_KEY, type EntityValue } from '../ha/store';
import qrcode from 'qrcode-generator';
import { useI18n } from '@/shared/i18n';
import { hasHostAccess } from '@/shared/hostAccess';
const { t } = useI18n();

const props = defineProps<{
  node: WidgetNode;
  selectedId: string | null;
  /** Alle markierten IDs (Mehrfachauswahl) – für die Umrandung. */
  selectedIds?: string[];
  /** true, wenn dieses Widget ein Flex-Item eines Layout-Containers ist. */
  flexItem?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'grab', id: string, ev: PointerEvent): void;
  (e: 'resize', id: string, dir: string, ev: PointerEvent): void;
}>();

// 8 Resize-Griffe (Ecken + Kanten), positioniert am Rand der Widget-Box.
const HANDLES = [
  { dir: 'nw', style: { top: '-4px', left: '-4px', cursor: 'nwse-resize' } },
  { dir: 'n', style: { top: '-4px', left: '50%', marginLeft: '-4px', cursor: 'ns-resize' } },
  { dir: 'ne', style: { top: '-4px', right: '-4px', cursor: 'nesw-resize' } },
  { dir: 'e', style: { top: '50%', right: '-4px', marginTop: '-4px', cursor: 'ew-resize' } },
  { dir: 'se', style: { bottom: '-4px', right: '-4px', cursor: 'nwse-resize' } },
  { dir: 's', style: { bottom: '-4px', left: '50%', marginLeft: '-4px', cursor: 'ns-resize' } },
  { dir: 'sw', style: { bottom: '-4px', left: '-4px', cursor: 'nesw-resize' } },
  { dir: 'w', style: { top: '50%', left: '-4px', marginTop: '-4px', cursor: 'ew-resize' } },
] as const;

function onHandleDown(dir: string, ev: PointerEvent) {
  ev.stopPropagation();
  ev.preventDefault();
  emit('resize', props.node.id, dir, ev);
}

const p = computed(() => props.node.props);
const g = computed(() => props.node.geometry);
const selected = computed(() => props.selectedId === props.node.id);
// In der Mehrfachauswahl markiert, aber nicht das „primäre" Widget (dezentere Umrandung).
const coSelected = computed(
  () => props.selectedId !== props.node.id && !!props.selectedIds?.includes(props.node.id),
);

// Optionale Entity-Status-Map (nur im Editor-Canvas bereitgestellt; in Vorlagen-
// Previews null → keine Reflexion). true=aktiv, false=inaktiv, undefined=unbekannt.
const entityStates = inject<Ref<Record<string, boolean> | null> | null>(ENTITY_STATES_KEY, null);
const entityActive = computed<boolean | null>(() => {
  const e = props.node.entity;
  const map = entityStates?.value;
  if (!e || !map) return null;
  const v = map[e];
  return v === undefined ? null : v;
});
// Effektiver Zustand für Schalt-Widgets: an Entity gebunden → Entity-Status, sonst Prop.
const checkedEff = computed(() => entityActive.value ?? Boolean(p.value.checked));
/** LED-Helligkeit: an Entity gebunden → an/aus, sonst der `brightness`-Wert (0..100). */
const ledOpacity = computed(() => {
  if (entityActive.value != null) return entityActive.value ? 1 : 0.2;
  const b = Number(p.value.brightness);
  return Number.isFinite(b) ? Math.max(0.12, Math.min(1, b / 100)) : 1;
});

// Nicht-Schalt-Widgets werden bei inaktiver Entity abgedunkelt (klares „aus"-Signal).
const dimInactive = computed(
  () => entityActive.value === false && !['switch', 'led', 'checkbox'].includes(props.node.type),
);

/** Widgets, die als SVG-Form (Bogen/Kreis) gezeichnet werden – kein Kasten-Hintergrund. */
const SVG_SHAPE_TYPES = new Set(['arc', 'meter', 'spinner']);

// ---- Spinner: Umlaufzeit, Bogenlänge und Rundung wie auf dem Gerät ----------
/** `spin_time` (z. B. „1000ms", „2s") → CSS-Animationsdauer. */
const spinnerDuration = computed(() => {
  const m = String(p.value.spin_time ?? '1000ms').match(/^(\d+(?:\.\d+)?)\s*(ms|s)?$/i);
  if (!m) return '1000ms';
  const n = Number(m[1]);
  return (m[2] ?? 'ms').toLowerCase() === 's' ? `${n}s` : `${n}ms`;
});
const spinnerGeom = computed(() => {
  const minSide = Math.max(1, Math.min(g.value.width, g.value.height));
  const stroke = (Number(p.value.arc_width ?? 6) / minSide) * 100; // px → viewBox
  const r = Math.max(1, 50 - stroke / 2);
  const circumference = 2 * Math.PI * r;
  // `arc_length` (z. B. „60deg") bestimmt, wie viel des Kreises gefüllt ist.
  const deg = Number(String(p.value.arc_length ?? '60deg').replace(/[^\d.]/g, '')) || 60;
  const dash = (Math.min(360, Math.max(1, deg)) / 360) * circumference;
  return { r, stroke, dash, gap: circumference - dash };
});

/**
 * Linien-Punkte („0,0 160,0") → SVG. LVGL zeichnet die Punkte relativ zum Widget und
 * beschneidet sie NICHT an dessen Box – deshalb bekommt das SVG eine viewBox über die
 * echte Hüllbox der Punkte (inkl. halber Strichbreite) statt der Widget-Größe. Sonst
 * driften Vorschau und Gerät auseinander, sobald Punkte über die Box hinausgehen.
 */
const lineGeom = computed(() => {
  const pts = parseLinePoints(p.value.points);
  // Ohne Punkte eine waagerechte Linie mittig über die Widget-Breite (wie der Default).
  if (pts.length < 2) pts.splice(0, pts.length, [0, g.value.height / 2], [g.value.width, g.value.height / 2]);

  const w = Math.max(1, Number(p.value.line_width ?? 4));
  const pad = w / 2 + 1; // halbe Strichbreite ragt über die Endpunkte hinaus
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return {
    points: pts.map((q) => `${q[0]},${q[1]}`).join(' '),
    viewBox: `${minX} ${minY} ${Math.max(...xs) - minX + pad} ${Math.max(...ys) - minY + pad}`,
    // Das SVG deckt die Hüllbox ab, ausgerichtet am Widget-Ursprung (0,0 der Punkte).
    style: {
      position: 'absolute' as const,
      left: `${minX}px`,
      top: `${minY}px`,
      width: `${Math.max(...xs) - minX + pad}px`,
      height: `${Math.max(...ys) - minY + pad}px`,
      overflow: 'visible',
    },
  };
});

/** Echter QR-Code für die Vorschau (zeigt wirklich den eingegebenen Text). */
const qrMatrix = computed<{ n: number; cells: number[] } | null>(() => {
  if (props.node.type !== 'qrcode') return null;
  const text = String(p.value.text ?? '');
  if (!text) return null;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const cells: number[] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (qr.isDark(y, x)) cells.push(y * n + x);
    }
    return { n, cells };
  } catch {
    return null; // z. B. Text zu lang für die Version
  }
});

// Universelle LVGL-Style-Props → CSS (Deckkraft, Hidden, Schatten, Kontur, Padding).
const universalStyle = computed(() => {
  const s: Record<string, string> = {};
  const num = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

  const opa = num(p.value.opa);
  let opacity = opa != null ? Math.max(0, Math.min(1, opa / 100)) : 1;
  if (p.value.hidden === true) opacity = Math.min(opacity, 0.2); // im Editor sichtbar-aber-ausgeblendet
  if (opacity !== 1) s.opacity = String(opacity);

  const sw = num(p.value.shadow_width);
  if (sw != null && sw > 0) {
    const ox = num(p.value.shadow_offset_x) ?? 0;
    const oy = num(p.value.shadow_offset_y) ?? 0;
    const spread = num(p.value.shadow_spread) ?? 0;
    const col = hexToRgba(p.value.shadow_color ?? '#000000', p.value.shadow_opa ?? 100);
    // Runde/gezeichnete Widgets (Arc, Meter, Spinner) haben keinen Kasten-Hintergrund –
    // ein box-shadow würde dort ein Rechteck um den Bogen malen. drop-shadow folgt der
    // tatsächlich gezeichneten Form.
    if (SVG_SHAPE_TYPES.has(props.node.type)) {
      s.filter = `drop-shadow(${ox}px ${oy}px ${Math.max(1, sw / 2)}px ${col})`;
    } else {
      s.boxShadow = `${ox}px ${oy}px ${sw}px ${spread}px ${col}`;
    }
  }

  const ow = num(p.value.outline_width);
  if (ow != null && ow > 0) {
    s.outline = `${ow}px solid ${hexToRgba(p.value.outline_color ?? '#000000', p.value.outline_opa ?? 100)}`;
    const op = num(p.value.outline_pad);
    if (op != null) s.outlineOffset = `${op}px`;
  }

  const pad = num(p.value.pad_all);
  if (pad != null && pad > 0) {
    s.padding = `${pad}px`;
    s.boxSizing = 'border-box';
  }
  // Schatten/Kontur sollen der Widget-Rundung folgen (radius sitzt sonst nur am Innencontainer).
  if (s.boxShadow || s.outline) {
    // Der Switch ist eine Pille – ohne das läge der Schatten als Rechteck darum.
    if (props.node.type === 'switch') s.borderRadius = '9999px';
    else if (p.value.radius != null) s.borderRadius = `${p.value.radius}px`;
  }
  return s;
});

// Optionale Live-Werte-Map (Editor-Canvas). Bound Widgets zeigen echte HA-Werte.
const entityValues = inject<Ref<Record<string, EntityValue> | null> | null>(ENTITY_VALUES_KEY, null);
const boundValue = computed<EntityValue | null>(() => {
  const e = props.node.entity;
  const map = entityValues?.value;
  if (!e || !map) return null;
  return map[e] ?? null;
});

const pct = computed(() => {
  const min = Number(p.value.min_value ?? 0);
  const max = Number(p.value.max_value ?? 100);
  // An Entity gebunden → Live-Wert, sonst der Prop-Wert.
  const bv = boundValue.value;
  const val = bv && bv.num != null ? bv.num : Number(p.value.value ?? 0);
  if (max === min) return 0;
  return Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
});

/** Anzeigetext eines Labels: an eine Entity gebunden → Live-Wert (gerundet + Einheit). */
const displayText = computed(() => {
  const bv = boundValue.value;
  if (bv && props.node.type === 'label') {
    if (bv.num != null) {
      const dec = Number(p.value.decimals);
      const d = Number.isFinite(dec) ? Math.max(0, dec) : 1; // Standard: 1 Nachkommastelle
      const rounded = Number(bv.num.toFixed(d)); // rundet & entfernt überflüssige Nullen
      const sep = bv.unit === '%' || !bv.unit ? '' : ' ';
      return `${rounded}${sep}${bv.unit}`;
    }
    if (bv.state) return bv.state;
  }
  return p.value.text;
});

// Horizontale Ausrichtung eines Labels (LVGL text_align → CSS justify-content).
const labelJustify = computed(() => {
  const a = String(p.value.text_align ?? 'left').toLowerCase();
  if (a === 'center') return 'center';
  if (a === 'right') return 'flex-end';
  return 'flex-start';
});

/** Punkt auf einem Kreis. LVGL-Winkel: 0°=rechts, 90°=unten (im Uhrzeigersinn). */
function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
/** SVG-Pfad eines Kreisbogens von Winkel a0 nach a1 (im Uhrzeigersinn bei a1>a0). */
function arcD(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const span = a1 - a0;
  const large = Math.abs(span) > 180 ? 1 : 0;
  const sweep = span >= 0 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// Bogen-Geometrie (offener Winkelbereich, Standard = LVGL-Gauge 135°→45° mit Lücke unten).
const arcGeom = computed(() => {
  const s = Number(p.value.start_angle ?? 135);
  const e = Number(p.value.end_angle ?? 45);
  let span = e - s;
  while (span <= 0) span += 360; // im Uhrzeigersinn, (0..360]
  const wpx = Number(p.value.arc_width ?? 14);
  const min = Math.max(1, Math.min(g.value.width, g.value.height));
  const stroke = (wpx / min) * 100; // px → viewBox-Einheiten (100)
  const r = Math.max(1, 50 - stroke / 2);
  return { s, span, stroke, r, full: span >= 359.5 };
});
// Slider/Switch-Knopf: Größe (aus knob_pad_all) und Rundung (aus knob_radius).
const knobSize = computed(() => {
  // LVGL: Der Griff ist so hoch wie die Bahn (= Widget-Höhe) und wächst um knob-`pad_all`.
  const base = Math.max(4, g.value.height);
  const pad = Number(p.value.knob_pad_all);
  return base + (Number.isFinite(pad) ? pad * 2 : 0);
});
const knobRadius = computed(() => {
  const r = Number(p.value.knob_radius);
  return Number.isFinite(r) ? r : knobSize.value / 2;
});

// Switch-Griff: LVGL leitet ihn aus der Widget-Höhe ab; knob-`pad_all` vergrößert ihn
// (negatives Padding macht ihn kleiner), `radius` rundet ihn. Standard: rund.
const switchKnobPad = computed(() => {
  const pad = Number(p.value.knob_pad_all);
  return Number.isFinite(pad) ? pad : 0;
});
const switchKnobSize = computed(() =>
  Math.max(2, g.value.height * 0.8 + switchKnobPad.value * 2),
);
const switchKnobInset = computed(() => Math.max(0, (g.value.height - switchKnobSize.value) / 2));
const switchKnobRadius = computed(() => {
  const r = Number(p.value.knob_radius);
  return Number.isFinite(r) ? r : switchKnobSize.value / 2;
});

const arcTrackD = computed(() =>
  arcD(50, 50, arcGeom.value.r, arcGeom.value.s, arcGeom.value.s + Math.min(arcGeom.value.span, 359.9)),
);
const arcValueD = computed(() =>
  arcD(50, 50, arcGeom.value.r, arcGeom.value.s, arcGeom.value.s + arcGeom.value.span * (pct.value / 100)),
);

/**
 * Griff (Knob) des Arcs – LVGL zeichnet ihn NUR bei `adjustable: true`. Er sitzt am Ende
 * des Wertbogens und ist ein QUADRAT in Bogenbreite (zzgl. `knob_pad_all`), dessen Ecken
 * über `knob_radius` gerundet werden. Ohne Angabe rundet LVGL voll → Kreis.
 */
const arcKnob = computed(() => {
  if (props.node.type !== 'arc' || p.value.adjustable !== true) return null;
  const gm = arcGeom.value;
  const [cx, cy] = polar(50, 50, gm.r, gm.s + gm.span * (pct.value / 100));
  const min = Math.max(1, Math.min(g.value.width, g.value.height));
  const toVb = (px: number) => (px / min) * 100; // px → viewBox-Einheiten (100)
  const padPx = Number(p.value.knob_pad_all);
  const side = Math.max(2, gm.stroke + (Number.isFinite(padPx) ? toVb(padPx) * 2 : 0));
  const radPx = Number(p.value.knob_radius);
  // knob_radius gesetzt → echte Eckenrundung (0 = eckig), sonst voll rund.
  const rx = Number.isFinite(radPx) ? Math.min(toVb(radPx), side / 2) : side / 2;
  return { x: cx - side / 2, y: cy - side / 2, side, rx };
});

/** Hex + Deckkraft(%) → rgba. bg_opa betrifft NUR den Hintergrund, nicht den Inhalt. */
function hexToRgba(hex: unknown, opa: unknown): string | undefined {
  const h = String(hex ?? '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return hex as string | undefined;
  const r = parseInt(h.slice(0, 2), 16);
  const gg = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = opa != null && Number.isFinite(Number(opa)) ? Math.max(0, Math.min(1, Number(opa) / 100)) : 1;
  return `rgba(${r}, ${gg}, ${b}, ${a})`;
}

// LVGL-align → [horizontal, vertikal]
const ALIGN_MAP: Record<string, [string, string]> = {
  center: ['center', 'center'],
  top_mid: ['center', 'top'],
  top_left: ['left', 'top'],
  top_right: ['right', 'top'],
  bottom_mid: ['center', 'bottom'],
  bottom_left: ['left', 'bottom'],
  bottom_right: ['right', 'bottom'],
  left_mid: ['left', 'center'],
  right_mid: ['right', 'center'],
};

// LVGL-Flex-Alignment → CSS justify-content/align-items
function mapFlexAlign(v: unknown): string {
  const s = String(v ?? '').toLowerCase();
  if (s.includes('space_evenly')) return 'space-evenly';
  if (s.includes('space_around')) return 'space-around';
  if (s.includes('space_between')) return 'space-between';
  if (s.includes('end')) return 'flex-end';
  if (s.includes('center')) return 'center';
  return 'flex-start';
}

/** LVGL-Grid-Track (`FR(2)`, `CONTENT`, `100px`) → CSS-Track. */
function gridTrack(v: string): string {
  const s = v.trim();
  const fr = s.match(/^FR\(\s*(\d+)\s*\)$/i);
  if (fr) return `${fr[1]}fr`;
  if (/^CONTENT$/i.test(s)) return 'auto';
  return s;
}
function gridTemplate(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.split(',').map((s) => s.trim()).filter(Boolean).map(gridTrack).join(' ');
}

/** CSS-Layout-Style, wenn dieser Container ein LVGL-Flex-/Grid-Layout hat, sonst null. */
const flexStyle = computed(() => {
  const l = p.value.layout as Record<string, unknown> | undefined;
  const type = String(l?.type ?? '').toLowerCase();
  if (!l || (type !== 'flex' && type !== 'grid')) return null;
  const colGap = Number(l.pad_column);
  const rowGap = Number(l.pad_row);
  const gap = `${Number.isFinite(rowGap) ? rowGap : 0}px ${Number.isFinite(colGap) ? colGap : 0}px`;

  if (type === 'grid') {
    return {
      display: 'grid',
      gridTemplateColumns: gridTemplate(l.grid_columns) ?? 'auto',
      gridTemplateRows: gridTemplate(l.grid_rows) ?? 'auto',
      gap,
    } as Record<string, string | undefined>;
  }
  const flow = String(l.flex_flow ?? 'row').toLowerCase();
  return {
    display: 'flex',
    flexDirection: flow.includes('column') ? 'column' : 'row',
    flexWrap: flow.includes('wrap') ? 'wrap' : 'nowrap',
    justifyContent: mapFlexAlign(l.flex_align_main),
    alignItems: mapFlexAlign(l.flex_align_cross),
    gap,
  } as Record<string, string | undefined>;
});

const boxStyle = computed(() => {
  const { x, y, width, height } = g.value;
  // Als Layout-Item bestimmt der Container die Position; nur Größe (+ Grid-Zelle/flex_grow) setzen.
  if (props.flexItem) {
    const cell: Record<string, string> = {};
    const cp = Number(p.value.grid_cell_column_pos);
    const rp = Number(p.value.grid_cell_row_pos);
    const cs = Number(p.value.grid_cell_column_span);
    const rs = Number(p.value.grid_cell_row_span);
    if (Number.isFinite(cp)) cell.gridColumn = `${cp + 1} / span ${Number.isFinite(cs) && cs > 0 ? cs : 1}`;
    if (Number.isFinite(rp)) cell.gridRow = `${rp + 1} / span ${Number.isFinite(rs) && rs > 0 ? rs : 1}`;
    const grow = Number(p.value.flex_grow);
    if (Number.isFinite(grow) && grow > 0) cell.flexGrow = String(grow);
    return { width: `${width}px`, height: `${height}px`, flexShrink: '0', ...cell };
  }
  const base: Record<string, string> = { width: `${width}px`, height: `${height}px` };
  const align = typeof p.value.align === 'string' ? p.value.align.toLowerCase() : '';
  const a = ALIGN_MAP[align];
  if (!a) return { ...base, left: `${x}px`, top: `${y}px` };

  const [h, v] = a;
  const tx: string[] = [];
  if (h === 'left') base.left = `${x}px`;
  else if (h === 'right') base.right = `${-x}px`;
  else {
    base.left = `calc(50% + ${x}px)`;
    tx.push('translateX(-50%)');
  }
  if (v === 'top') base.top = `${y}px`;
  else if (v === 'bottom') base.bottom = `${-y}px`;
  else {
    base.top = `calc(50% + ${y}px)`;
    tx.push('translateY(-50%)');
  }
  if (tx.length) base.transform = tx.join(' ');
  return base;
});

/** Text-Dekoration (LVGL text_decor → CSS). */
function textDecoration(v: unknown): string | undefined {
  const s = String(v ?? '').toUpperCase();
  if (s.includes('UNDER')) return 'underline';
  if (s.includes('STRIKE') || s.includes('THROUGH')) return 'line-through';
  return undefined;
}

/**
 * Hintergrund-Style (Farbe + optionaler Verlauf ab `baseColor`). Der Verlauf wird nur
 * gezeichnet, wenn er zu diesem `part` gehört (Standard: main/Hintergrund; alternativ
 * indicator/Regler-Füllung).
 */
function surfaceBg(baseColor: unknown, part: 'main' | 'indicator' = 'main'): Record<string, string | undefined> {
  const bg = hexToRgba(baseColor, p.value.bg_opa);
  const activePart = String(p.value.grad_part || 'main');
  // Wie in LVGL ist bg_grad_dir der Schalter (Default NONE) – ohne Richtung kein Verlauf.
  const rawDir = String(p.value.bg_grad_dir ?? '').toUpperCase();
  const hasGrad = (rawDir === 'VER' || rawDir === 'HOR') && !!p.value.bg_grad_color;
  const gradColor = hasGrad && activePart === part ? hexToRgba(p.value.bg_grad_color, p.value.bg_opa) : null;
  const dir = rawDir === 'HOR' ? 'to right' : 'to bottom';
  return {
    backgroundColor: bg,
    backgroundImage: gradColor ? `linear-gradient(${dir}, ${bg}, ${gradColor})` : undefined,
  };
}

/** Toggle-Button im „an"-Zustand: eigenes Aussehen statt LVGL-Default. */
const buttonStyle = computed(() => {
  const base = containerStyle.value;
  if (p.value.checkable === true && checkedEff.value && p.value.checked_bg_color) {
    return {
      ...base,
      backgroundColor: hexToRgba(p.value.checked_bg_color, p.value.checked_bg_opa ?? 100),
      backgroundImage: undefined,
    };
  }
  return base;
});

// Bild-Vorschau: Die URL wird per fetch geholt und als Blob angezeigt. Nötig, weil die
// Extension-Seite (moz-extension://) ein http-Kamerabild sonst als „Mixed Content" blockt –
// der privilegierte fetch mit Host-Berechtigung umgeht das (und CORS).
const imgError = ref(false);
const liveImageUrl = ref<string | null>(null);
let liveObjectUrl: string | null = null;
let liveTimer: ReturnType<typeof setInterval> | undefined;

/** Quell-URL des Bildes (online oder Datei-URL), sofern es eine http(s)-Adresse ist. */
const imgFetchUrl = computed<string | null>(() => {
  if (props.node.type !== 'image') return null;
  const src = String(p.value.img_source ?? '');
  const url = src === 'online' ? String(p.value.img_url ?? '') : src === 'file' ? String(p.value.img_file ?? '') : '';
  return /^https?:\/\//i.test(url) ? url : null;
});

/** Aktualisierungsintervall in ms aus img_update_interval (min. 2s, Standard 5s). */
const imgIntervalMs = computed(() => {
  const m = String(p.value.img_update_interval ?? '').match(/^(\d+)\s*(ms|s|min)?$/i);
  if (!m) return 5000;
  const n = Number(m[1]);
  const unit = (m[2] ?? 's').toLowerCase();
  const ms = unit === 'ms' ? n : unit === 'min' ? n * 60000 : n * 1000;
  return Math.max(2000, ms);
});

async function fetchLiveImage() {
  const url = imgFetchUrl.value;
  if (!url) return;
  // Ohne Host-Berechtigung scheitert der Abruf an CORS – Platzhalter zeigen; erlaubt wird im
  // Eigenschaften-Panel (HostAccessHint beim Bild-URL-Feld).
  if (!(await hasHostAccess([url]))) {
    imgError.value = true;
    return;
  }
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    if (liveObjectUrl) URL.revokeObjectURL(liveObjectUrl);
    liveObjectUrl = obj;
    liveImageUrl.value = obj;
    imgError.value = false;
  } catch {
    imgError.value = true;
  }
}

function stopLiveImage() {
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = undefined;
}

// Bei Änderung von Quelle/URL/Intervall neu laden; online-Bilder zusätzlich periodisch.
watch(
  () => [imgFetchUrl.value, String(p.value.img_source ?? ''), imgIntervalMs.value] as const,
  ([url, source]) => {
    stopLiveImage();
    imgError.value = false;
    if (!url) {
      liveImageUrl.value = null;
      return;
    }
    fetchLiveImage();
    if (source === 'online') liveTimer = setInterval(fetchLiveImage, imgIntervalMs.value);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  stopLiveImage();
  if (liveObjectUrl) URL.revokeObjectURL(liveObjectUrl);
});
const imgLabel = computed<string>(() => {
  const src = String(p.value.img_source ?? '');
  if (src === 'online') return String(p.value.img_url ?? t('img_online'));
  if (src === 'file') return String(p.value.img_file ?? t('img_file'));
  if (src === 'ref') return String(p.value.img_ref ?? t('img_ref'));
  return '';
});

const containerStyle = computed(() => ({
  ...surfaceBg(p.value.bg_color),
  borderRadius: p.value.radius != null ? `${p.value.radius}px` : undefined,
  borderWidth: p.value.border_width != null ? `${p.value.border_width}px` : undefined,
  borderColor: p.value.border_color as string | undefined,
  borderStyle: p.value.border_width ? 'solid' : undefined,
}));

function onPointerDown(ev: PointerEvent) {
  ev.stopPropagation();
  emit('select', props.node.id);
  emit('grab', props.node.id, ev);
}
</script>

<template>
  <div
    class="wv select-none"
    :class="[{ 'wv-selected': selected, 'wv-coselected': coSelected }, flexItem ? 'relative' : 'absolute']"
    :style="[boxStyle, dimInactive ? { opacity: '0.4', filter: 'grayscale(0.6)' } : {}, universalStyle]"
    draggable="false"
    @dragstart.prevent
    @pointerdown="onPointerDown"
  >
    <!-- Container / generisches Objekt (mit optionalem Flex-Layout) -->
    <div v-if="node.type === 'obj'" class="h-full w-full border-transparent" :style="containerStyle">
      <div class="h-full w-full" :class="flexStyle ? '' : 'relative'" :style="flexStyle ?? undefined">
        <WidgetView
          v-for="child in node.children"
          :key="child.id"
          :node="child"
          :selected-id="selectedId"
          :selected-ids="selectedIds"
          :flex-item="!!flexStyle"
          @select="(id) => emit('select', id)"
          @grab="(id, ev) => emit('grab', id, ev)"
          @resize="(id, dir, ev) => emit('resize', id, dir, ev)"
        />
      </div>
    </div>

    <!-- Label -->
    <div
      v-else-if="node.type === 'label'"
      class="flex h-full w-full items-center overflow-hidden whitespace-nowrap"
      :style="{
        color: p.text_color as string,
        fontSize: `${p.font_size ?? 16}px`,
        justifyContent: labelJustify,
        fontWeight: p.font_weight as string | number | undefined,
        opacity: p.text_opa != null ? Number(p.text_opa) / 100 : undefined,
        letterSpacing: p.text_letter_spacing != null ? `${p.text_letter_spacing}px` : undefined,
        lineHeight: p.text_line_space != null ? `${Number(p.text_line_space) + Number(p.font_size ?? 16)}px` : undefined,
        textDecoration: textDecoration(p.text_decor),
      }"
    >
      {{ displayText }}
    </div>

    <!-- Icon -->
    <div
      v-else-if="node.type === 'icon'"
      class="flex h-full w-full items-center justify-center leading-none"
      :style="{ color: p.text_color as string, fontSize: `${p.font_size ?? 28}px` }"
    >
      {{ p.text }}
    </div>

    <!-- Image: Online-URLs zeigt die Vorschau live, sonst Platzhalter mit Quelle -->
    <div
      v-else-if="node.type === 'image'"
      class="flex h-full w-full items-center justify-center overflow-hidden text-white/40"
      :style="containerStyle"
    >
      <img
        v-if="liveImageUrl"
        :src="liveImageUrl"
        class="h-full w-full"
        :style="{ objectFit: 'contain' }"
        draggable="false"
        @error="imgError = true"
        @load="imgError = false"
      />
      <div v-else class="flex flex-col items-center gap-0.5 px-1 text-center">
        <svg width="34%" height="34%" viewBox="0 0 24 24" fill="currentColor">
          <path d="m8.5 13.5l2.5 3l3.5-4.5l4.5 6H5m16 1V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2" />
        </svg>
        <span v-if="imgLabel" class="max-w-full truncate text-[9px] leading-tight">{{ imgLabel }}</span>
      </div>
    </div>

    <!-- Button -->
    <div
      v-else-if="node.type === 'button'"
      class="flex h-full w-full items-center justify-center px-2 text-center font-medium"
      :style="{
        ...buttonStyle,
        color: p.text_color as string,
        fontSize: `${p.font_size ?? 16}px`,
        fontWeight: p.font_weight as string | number | undefined,
      }"
    >
      {{ p.text }}
    </div>

    <!-- Slider -->
    <div v-else-if="node.type === 'slider'" class="flex h-full w-full items-center">
      <div class="relative h-full w-full rounded-full" :style="surfaceBg(p.bg_color)">
        <div class="absolute left-0 top-0 h-full rounded-full" :style="[{ width: pct + '%' }, surfaceBg(p.color, 'indicator')]" />
        <div
          class="absolute top-1/2 -translate-y-1/2"
          :style="{
            left: `calc(${pct}% - ${knobSize / 2}px)`,
            width: `${knobSize}px`,
            height: `${knobSize}px`,
            borderRadius: `${knobRadius}px`,
            backgroundColor: (p.knob_bg_color as string) || '#ffffff',
          }"
        />
      </div>
    </div>

    <!-- Bar -->
    <div v-else-if="node.type === 'bar'" class="flex h-full w-full items-center">
      <div class="relative h-full w-full overflow-hidden rounded-full" :style="surfaceBg(p.bg_color)">
        <div class="absolute left-0 top-0 h-full rounded-full" :style="[{ width: pct + '%' }, surfaceBg(p.color, 'indicator')]" />
      </div>
    </div>

    <!-- Arc / Meter (offener Bogen mit runden Enden; Winkelbereich via start_angle/end_angle) -->
    <div v-else-if="node.type === 'arc' || node.type === 'meter'" class="relative h-full w-full">
      <svg class="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" draggable="false">
        <circle
          v-if="arcGeom.full"
          cx="50"
          cy="50"
          :r="arcGeom.r"
          fill="none"
          :stroke="(p.bg_color as string) || '#374151'"
          :stroke-width="arcGeom.stroke"
        />
        <path
          v-else
          :d="arcTrackD"
          fill="none"
          :stroke="(p.bg_color as string) || '#374151'"
          :stroke-width="arcGeom.stroke"
          stroke-linecap="round"
        />
        <path
          v-if="pct > 0.5"
          :d="arcValueD"
          fill="none"
          :stroke="(p.color as string) || '#f59e0b'"
          :stroke-width="arcGeom.stroke"
          stroke-linecap="round"
        />
        <!-- Griff nur bei bedienbarem Arc (LVGL: adjustable); Ecken folgen knob_radius -->
        <rect
          v-if="arcKnob"
          :x="arcKnob.x"
          :y="arcKnob.y"
          :width="arcKnob.side"
          :height="arcKnob.side"
          :rx="arcKnob.rx"
          :ry="arcKnob.rx"
          :fill="(p.knob_bg_color as string) || (p.color as string) || '#f59e0b'"
          :stroke="p.knob_border_width ? ((p.knob_border_color as string) || 'none') : undefined"
          :stroke-width="p.knob_border_width ? Number(p.knob_border_width) / Math.max(1, Math.min(g.width, g.height)) * 100 : undefined"
        />
      </svg>
      <!-- Prozent-Overlay nur auf ausdrücklichen Wunsch (echte LVGL-Arcs haben keinen Text). -->
      <div
        v-if="p.show_value === true"
        class="absolute inset-0 flex items-center justify-center text-gray-300"
        :style="{ fontSize: `${p.font_size ?? 13}px` }"
      >
        {{ Math.round(pct) }}%
      </div>
    </div>

    <!-- Switch -->
    <div v-else-if="node.type === 'switch'" class="flex h-full w-full items-center">
      <div
        class="relative h-full w-full rounded-full transition-colors"
        :style="surfaceBg(checkedEff ? p.color : p.bg_color)"
      >
        <div
          class="absolute top-1/2 aspect-square -translate-y-1/2 transition-all"
          :style="[
            checkedEff ? { right: `${switchKnobInset}px` } : { left: `${switchKnobInset}px` },
            {
              height: `${switchKnobSize}px`,
              borderRadius: `${switchKnobRadius}px`,
              backgroundColor: (p.knob_bg_color as string) || '#ffffff',
            },
          ]"
        />
      </div>
    </div>

    <!-- Checkbox -->
    <div v-else-if="node.type === 'checkbox'" class="flex h-full w-full items-center gap-2">
      <div
        class="flex h-5 w-5 shrink-0 items-center justify-center"
        :style="{
          backgroundColor: checkedEff ? ((p.color as string) || '#2563eb') : 'transparent',
          border: `2px solid ${(p.color as string) || '#2563eb'}`,
          borderRadius: `${p.indicator_radius ?? 4}px`,
        }"
      >
        <span v-if="checkedEff" class="text-xs text-white">✓</span>
      </div>
      <span class="truncate" :style="{ color: p.text_color as string }">{{ p.text }}</span>
    </div>

    <!-- LED -->
    <div v-else-if="node.type === 'led'" class="flex h-full w-full items-center justify-center">
      <div
        class="h-full w-full rounded-full"
        :style="{
          backgroundColor: p.color as string,
          opacity: ledOpacity,
          boxShadow: ledOpacity > 0.5 ? `0 0 12px 2px ${p.color}` : 'none',
        }"
      />
    </div>

    <!-- Dropdown -->
    <div
      v-else-if="node.type === 'dropdown'"
      class="flex h-full w-full items-center justify-between px-2"
      :style="{ ...containerStyle, color: p.text_color as string }"
    >
      <span class="truncate">{{ p.text }}</span>
      <span class="opacity-70">▾</span>
    </div>

    <!-- Textarea -->
    <div
      v-else-if="node.type === 'textarea'"
      class="h-full w-full overflow-hidden px-2 py-1 text-left text-sm"
      :style="{ ...containerStyle, color: p.text_color as string }"
    >
      <span v-if="p.text">{{ p.text }}</span>
      <span v-else class="text-gray-500">{{ t('canvas_text_placeholder') }}</span>
    </div>

    <!-- Spinner -->
    <div v-else-if="node.type === 'spinner'" class="flex h-full w-full items-center justify-center">
      <svg
        class="wv-spin h-full w-full"
        viewBox="0 0 100 100"
        :style="{ animationDuration: spinnerDuration }"
      >
        <circle
          cx="50" cy="50" :r="spinnerGeom.r"
          fill="none" stroke="rgba(255,255,255,0.15)" :stroke-width="spinnerGeom.stroke"
        />
        <circle
          cx="50" cy="50" :r="spinnerGeom.r"
          fill="none" :stroke="(p.color as string) || '#60a5fa'" :stroke-width="spinnerGeom.stroke"
          :stroke-dasharray="`${spinnerGeom.dash} ${spinnerGeom.gap}`"
          :stroke-linecap="p.arc_rounded ? 'round' : 'butt'"
        />
      </svg>
    </div>

    <!-- Line -->
    <svg v-else-if="node.type === 'line'" :viewBox="lineGeom.viewBox" :style="lineGeom.style">
      <polyline
        :points="lineGeom.points"
        fill="none"
        :stroke="(p.color as string) || '#60a5fa'"
        :stroke-width="Number(p.line_width ?? 4)"
        :stroke-linecap="p.line_rounded ? 'round' : 'butt'"
        :stroke-linejoin="p.line_rounded ? 'round' : 'miter'"
      />
    </svg>

    <!-- QR Code (Platzhalter) -->
    <div
      v-else-if="node.type === 'qrcode'"
      class="h-full w-full"
      :style="{ backgroundColor: (p.light_color as string) || '#ffffff' }"
    >
      <svg v-if="qrMatrix" class="h-full w-full" :viewBox="`0 0 ${qrMatrix.n} ${qrMatrix.n}`" shape-rendering="crispEdges">
        <rect
          v-for="(cell, i) in qrMatrix.cells" :key="i"
          :x="cell % qrMatrix.n" :y="Math.floor(cell / qrMatrix.n)" width="1" height="1"
          :fill="(p.dark_color as string) || '#000000'"
        />
      </svg>
    </div>

    <!-- Fallback -->
    <div v-else class="flex h-full w-full items-center justify-center text-xs text-gray-500" :style="containerStyle">
      {{ node.type }}
    </div>

    <!-- Kinder von Nicht-Container-Widgets (nur Container rendern oben; hier no-op) -->
    <template v-if="!isContainer(node.type) && node.children.length">
      <WidgetView
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        :selected-ids="selectedIds"
        @select="(id) => emit('select', id)"
        @grab="(id, ev) => emit('grab', id, ev)"
        @resize="(id, dir, ev) => emit('resize', id, dir, ev)"
      />
    </template>

    <!-- Resize-Griffe bei Auswahl -->
    <template v-if="selected">
      <div
        v-for="h in HANDLES"
        :key="h.dir"
        class="wv-handle"
        :style="h.style"
        @pointerdown="onHandleDown(h.dir, $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.wv {
  cursor: grab;
  /* MDI zuerst: Icon-Glyphen (ESPHome nutzt MDI) rendern via MDI-Font,
     normale Zeichen fallen per-Glyph auf die Sans-Schrift zurück. */
  font-family: 'Material Design Icons', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}
.wv:active {
  cursor: grabbing;
}
.wv-selected {
  outline: 1.5px solid #3b82f6;
  outline-offset: 1px;
  z-index: 10;
}
/* Mitglied der Mehrfachauswahl (nicht primär): dezent gestrichelt. */
.wv-coselected {
  outline: 1.5px dashed #60a5fa;
  outline-offset: 1px;
  z-index: 9;
}
.wv-handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #fff;
  border: 1.5px solid #3b82f6;
  border-radius: 2px;
  z-index: 20;
}
.wv-spin {
  animation: wv-rotate 0.9s linear infinite;
}
@keyframes wv-rotate {
  to {
    transform: rotate(360deg);
  }
}
</style>
