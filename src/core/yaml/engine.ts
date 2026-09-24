import { parseDocument, isMap, isSeq, YAMLMap, YAMLSeq, Scalar, type Document } from 'yaml';
import type { Screen, WidgetNode, WidgetProps, WidgetType } from '../lvgl/types';
import { CATALOG_BY_TYPE } from '../lvgl/catalog';
import {
  TYPE_MAP, UNIVERSAL_PROPS, TEXT_PROPS, TEXT_TYPES, PART_SUFFIXES, partSuffixes, STYLEABLE_PARTS, NO_SHADOW, NO_GRADIENT,
  YAML_TO_TYPE, type PropKind, type PropMap,
} from './mapping';

import { espColorToHex, hexToEspInt } from './colors';

/** Die Indicator-Füllfarbe wird über das `color`-Prop gemappt, nicht über indicator_bg_color. */
const INDICATOR_SKIP = new Set(['bg_color']);

/**
 * Strukturerhaltende YAML-Engine.
 *
 * - `yamlToScreen(text)`  → Editor-Modell + normalisiertes YAML (mit injizierten IDs).
 * - `screenToYaml(screen, baseYaml)` → YAML, das das Modell widerspiegelt, aber alle
 *   nicht vom Editor verwalteten Inhalte des `baseYaml` erhält (Lambdas, Automationen,
 *   Kommentare, andere Komponenten, unbekannte Widget-Typen).
 */

// ---------- Hilfsfunktionen für YAML-Knoten -------------------------------

function firstKey(item: unknown): string | null {
  if (!isMap(item) || item.items.length === 0) return null;
  const k = item.items[0].key;
  return k instanceof Scalar ? String(k.value) : String(k);
}

function innerOf(item: unknown): YAMLMap | null {
  const key = firstKey(item);
  if (!key || !isMap(item)) return null;
  const inner = item.get(key);
  return isMap(inner) ? inner : null;
}

function numOr(v: unknown, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function getSeq(map: YAMLMap, key: string): YAMLSeq | null {
  const v = map.get(key);
  return isSeq(v) ? v : null;
}

function ensureSeqAt(map: YAMLMap, key: string): YAMLSeq {
  const existing = getSeq(map, key);
  if (existing) return existing;
  const seq = new YAMLSeq();
  map.set(key, seq);
  return seq;
}

function setColor(map: YAMLMap, key: string, hex: string) {
  const sc = new Scalar(hexToEspInt(hex));
  sc.format = 'HEX';
  map.set(key, sc);
}

/**
 * Schreibt einen String immer in Anführungszeichen. ESPHome liest YAML 1.1, dort sind
 * `OFF`/`ON`/`NO`/`YES` Booleans – `scrollbar_mode: OFF` würde sonst als `False`
 * ankommen und die Kompilierung abbrechen.
 */
/** Werte, die YAML 1.1 (und damit ESPHome) als Boolean liest statt als String. */
function isYaml11Bool(s: string): boolean {
  return /^(y|n|yes|no|on|off|true|false)$/i.test(s);
}

function setQuoted(map: YAMLMap, key: string, value: string) {
  const sc = new Scalar(value);
  sc.type = Scalar.QUOTE_DOUBLE;
  map.set(key, sc);
}

/**
 * Linien-Punkte: Modell `"0,0 160,0"` → YAML-Liste von [x, y]-Paaren.
 * `points` ist für das line-Widget PFLICHT (sonst: „'points' is a required option").
 */
function setPoints(map: YAMLMap, key: string, value: string) {
  const pairs = parsePoints(value);
  if (!pairs.length) return;
  const seq = new YAMLSeq();
  for (const [x, y] of pairs) {
    const pt = new YAMLSeq();
    pt.flow = true; // kompakt: - [0, 0]
    pt.items.push(new Scalar(x), new Scalar(y));
    seq.items.push(pt);
  }
  map.set(key, seq);
}

/** `"0,0 160,4"` (oder `"0 0, 160 4"`) → [[0,0],[160,4]]. */
function parsePoints(value: string): [number, number][] {
  const nums = String(value ?? '').match(/-?\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 4) return [];
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([Number(nums[i]), Number(nums[i + 1])]);
  return out;
}

/** YAML-Punkteliste → `"0,0 160,4"` fürs Modell. */
function pointsToString(raw: unknown): string {
  if (!isSeq(raw)) return '';
  const parts: string[] = [];
  for (const it of (raw as YAMLSeq).items) {
    if (isSeq(it)) {
      const [a, b] = (it as YAMLSeq).items.map((s) => Number(String((s as Scalar)?.value ?? s)));
      if (Number.isFinite(a) && Number.isFinite(b)) parts.push(`${a},${b}`);
    }
  }
  return parts.join(' ');
}

function setSeq(map: YAMLMap, key: string, arr: string[]) {
  const seq = new YAMLSeq();
  for (const a of arr) seq.items.push(new Scalar(String(a)));
  map.set(key, seq);
}

function convertIn(kind: PropKind, raw: unknown): unknown {
  switch (kind) {
    case 'color':
      return espColorToHex(raw);
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'percent': {
      // ESPHome-Deckkraft kann Zahl, "50%", "COVER" oder "TRANSP" sein.
      const s = String(raw).trim().toUpperCase();
      if (s === 'COVER') return 100;
      if (s === 'TRANSP') return 0;
      const n = s.endsWith('%') ? parseFloat(s) : Number(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'list':
      return isSeq(raw) ? (raw.toJSON() as unknown[]).map((x) => String(x)) : [];
    case 'points': {
      const s = pointsToString(raw);
      return s || undefined;
    }
    case 'bool':
      return raw === true || String(raw).toLowerCase() === 'true';
    default:
      return String(raw);
  }
}

// ---------- Export: Modell → YAML (erhaltend) -----------------------------

/** Schreibt einen verwalteten Prop-Key auf `inner` (typgerecht). */
function writeManagedProp(inner: YAMLMap, pm: PropMap, v: unknown) {
  if (pm.kind === 'bool') {
    if (pm.defaultTrue) {
      // LVGL-Default true → nur `false` trägt Information; unbekannt (null) = Key weglassen.
      if (v === false) inner.set(pm.yaml, false);
      else if (v === true) inner.delete(pm.yaml);
      return;
    }
    if (v === true) inner.set(pm.yaml, true);
    else inner.delete(pm.yaml); // false/leer → Key entfernen (kein Rauschen)
    return;
  }
  if (v == null || v === '') return;
  if (pm.kind === 'color') setColor(inner, pm.yaml, String(v));
  else if (pm.kind === 'percent') {
    const n = Number(v);
    if (Number.isFinite(n)) inner.set(pm.yaml, `${Math.round(n)}%`);
  } else if (pm.kind === 'number') {
    const n = Number(v);
    if (Number.isFinite(n)) inner.set(pm.yaml, n);
  } else if (pm.kind === 'points') setPoints(inner, pm.yaml, String(v));
  else if (pm.kind === 'list') setSeq(inner, pm.yaml, (v as string[]) ?? []);
  else if (isYaml11Bool(String(v))) setQuoted(inner, pm.yaml, String(v));
  else inner.set(pm.yaml, String(v));
}

/** Setzt die vom Editor verwalteten Keys auf `inner`; lässt alle anderen Keys unberührt. */
/**
 * Schreibt width/height. War die Größe ursprünglich relativ (`100%`, `SIZE_CONTENT`) und
 * hat der Nutzer sie nicht verändert, bleibt die ursprüngliche Angabe erhalten.
 */
function writeSize(inner: YAMLMap, key: string, px: number, raw: unknown, rawPx: unknown) {
  if (typeof raw === 'string' && raw) {
    const resolved = Number(rawPx);
    // Kein aufgelöster Pixelwert (z. B. SIZE_CONTENT) → immer die Originalangabe behalten.
    if (!Number.isFinite(resolved) || resolved === px) {
      inner.set(key, raw);
      return;
    }
  }
  inner.set(key, px);
}

function updateInner(inner: YAMLMap, node: WidgetNode) {
  inner.set('id', node.id);
  inner.set('x', node.geometry.x);
  inner.set('y', node.geometry.y);
  // Relative Größen (z. B. "100%", SIZE_CONTENT) unverändert lassen, solange der Nutzer
  // sie im Editor nicht angefasst hat – sonst würde aus responsiv eine feste Pixelzahl.
  writeSize(inner, 'width', node.geometry.width, node.props.width_raw, node.props.width_raw_px);
  writeSize(inner, 'height', node.geometry.height, node.props.height_raw, node.props.height_raw_px);

  const tm = TYPE_MAP[node.type];
  for (const pm of [...tm.props, ...UNIVERSAL_PROPS]) {
    writeManagedProp(inner, pm, node.props[pm.prop]);
  }

  // Die Richtung ist der Schalter für den Verlauf (LVGL-Default: NONE). Ohne sie wird der
  // Verlauf komplett entfernt – sonst bliebe eine einmal gesetzte Verlaufsfarbe für immer
  // hängen, weil ein Farbfeld nie „leer" sein kann.
  const gradDir = String(node.props.bg_grad_dir ?? '').toUpperCase();
  if (gradDir !== 'VER' && gradDir !== 'HOR') {
    inner.delete('bg_grad_color');
    inner.delete('bg_grad_dir');
  }

  // Beim QR-Code ist `size` die tatsächlich gezeichnete Kantenlänge – nicht width/height.
  // Ohne Abgleich erscheint er auf dem Gerät in einer anderen Größe als im Editor.
  if (node.type === 'qrcode') {
    inner.set('size', Math.max(1, Math.min(node.geometry.width, node.geometry.height)));
  }

  // Schatten ergäbe bei diesen Formen immer einen Kasten um Bogen/Bahn/Häkchen – wir
  // bieten ihn nicht an UND räumen vorhandene Keys weg (Altbestand aus früheren Ständen).
  if (NO_SHADOW.has(node.type)) {
    for (const k of ['shadow_color', 'shadow_width', 'shadow_opa', 'shadow_spread', 'shadow_offset_x', 'shadow_offset_y']) {
      inner.delete(k);
    }
  }
  if (NO_GRADIENT.has(node.type)) {
    inner.delete('bg_grad_color');
    inner.delete('bg_grad_dir');
  }

  // Container ohne ausdrückliche Vorgabe scrollen nicht. LVGL ist per Default scrollbar mit
  // scrollbar_mode AUTO; zusammen mit dem Padding des Standard-Themes ragt schon ein bündig
  // platziertes Kind aus dem Inhaltsbereich und das Gerät zeichnet Scrollbalken, die die
  // Editor-Vorschau nie zeigen kann.
  if (node.children.length) {
    if (node.props.scrollbar_mode == null) setQuoted(inner, 'scrollbar_mode', 'OFF');
    if (node.props.scrollable == null) inner.set('scrollable', false);
    // LVGL misst Kind-Koordinaten ab der Content-Area (also NACH Padding), CSS im Editor
    // dagegen ab der Border-Box. Ohne ausdrückliches Padding würde das Theme-Padding alle
    // Kinder auf dem Gerät verschieben – deshalb hier auf 0 festnageln.
    if (node.props.pad_all == null) inner.set('pad_all', 0);
  }
  // Verlauf auf den Indicator (Regler-Füllung) legen statt auf den Hintergrund (Slider/Bar).
  if ((node.type === 'slider' || node.type === 'bar') && node.props.grad_part === 'indicator') {
    const gc = inner.get('bg_grad_color');
    if (gc != null) {
      let ind = inner.get('indicator');
      if (!isMap(ind)) {
        ind = new YAMLMap();
        inner.set('indicator', ind);
      }
      (ind as YAMLMap).set('bg_grad_color', gc);
      const gd = inner.get('bg_grad_dir');
      if (gd != null) (ind as YAMLMap).set('bg_grad_dir', gd);
      inner.delete('bg_grad_color');
      inner.delete('bg_grad_dir');
    }
  }
  // Bei gesetzter Breite eine Farbe erzwingen (sonst nimmt LVGL eine unerwartete Default-Farbe).
  if (inner.get('shadow_width') != null && inner.get('shadow_color') == null) setColor(inner, 'shadow_color', '#000000');
  if (inner.get('outline_width') != null && inner.get('outline_color') == null) setColor(inner, 'outline_color', '#000000');

  // Feature 4: Ausrichtung (align) im Elternelement.
  if (typeof node.props.align === 'string' && node.props.align) inner.set('align', node.props.align);
  else if (node.props.align === '') inner.delete('align');
  // Feature 4: Layout (Flex/Grid) inkl. Row/Col-Gap.
  writeLayout(inner, node.props.layout as Record<string, unknown> | undefined);

  if (tm.defaults) {
    for (const [k, dv] of Object.entries(tm.defaults)) {
      if (inner.get(k) == null) inner.set(k, dv);
    }
  }

  if (node.type === 'arc' || node.type === 'meter') applyArcStyle(inner, node);
  if (node.type === 'spinner') applySpinnerStyle(inner, node);
  // Toggle-Button: eigenes Aussehen im `checked`-Zustand (sonst nimmt LVGL sein Default-Rot).
  if (node.type === 'button' && node.props.checkable === true) {
    const cc = node.props.checked_bg_color;
    const co = Number(node.props.checked_bg_opa);
    if (cc || Number.isFinite(co)) {
      let ck = inner.get('checked');
      if (!isMap(ck)) {
        ck = new YAMLMap();
        inner.set('checked', ck);
      }
      if (cc) setColor(ck as YAMLMap, 'bg_color', String(cc));
      if (Number.isFinite(co)) (ck as YAMLMap).set('bg_opa', `${Math.round(co)}%`);
    }
  }
  // Anfangszustand von Switch/Checkbox. ACHTUNG: `checked:` ist auf Widget-Ebene ein
  // STYLE-Block (Dictionary) für den Aktiv-Zustand – ein `checked: true` dort führt zu
  // „expected a dictionary". Der Zustand gehört unter `state:`.
  if (node.type === 'switch' || node.type === 'checkbox') {
    const st = inner.get('state');
    if (node.props.checked === true) {
      let m = st;
      if (!isMap(m)) {
        m = new YAMLMap();
        inner.set('state', m);
      }
      (m as YAMLMap).set('checked', true);
    } else if (isMap(st)) {
      (st as YAMLMap).delete('checked');
      if ((st as YAMLMap).items.length === 0) inner.delete('state');
    }
  }
  if (TEXT_TYPES.has(node.type)) for (const pm of TEXT_PROPS) writeManagedProp(inner, pm, node.props[pm.prop]);
  // Feature 1: Füllfarbe (Indicator) für Balken-artige Widgets + Knob.
  if (['slider', 'bar', 'switch', 'checkbox'].includes(node.type) && node.props.color) {
    setPartColor(inner, 'indicator', 'bg_color', String(node.props.color));
    // Switch/Checkbox sind ZUSTANDS-Widgets: Sichtbar ist der Indicator im „checked"-
    // Zustand, und dafür setzt das LVGL-Theme eine eigene Farbe. Ohne den checked-Block
    // überschreibt das Theme unsere Farbe – auf dem Gerät bliebe sie wirkungslos.
    if (node.type === 'switch' || node.type === 'checkbox') {
      const ind = inner.get('indicator') as YAMLMap;
      let ck = ind.get('checked');
      if (!isMap(ck)) {
        ck = new YAMLMap();
        ind.set('checked', ck);
      }
      setColor(ck as YAMLMap, 'bg_color', String(node.props.color));
    }
  }
  // Stylebare Parts (indicator/knob). Beim Indicator bleibt bg_color dem `color`-Prop vorbehalten.
  for (const part of STYLEABLE_PARTS[node.type] ?? []) {
    applyPart(inner, node, part, part === 'indicator' ? INDICATOR_SKIP : undefined);
  }
  // Slider/Switch: Knopf standardmäßig weiß (LVGL-Default wäre Theme-Blau; Editor zeigt weiß).
  if (node.type === 'slider' || node.type === 'switch') {
    let k = inner.get('knob');
    if (!isMap(k)) {
      k = new YAMLMap();
      inner.set('knob', k);
    }
    const km = k as YAMLMap;
    if (km.get('bg_color') == null && km.get('bg_opa') == null) setColor(km, 'bg_color', '#ffffff');
  }

  if (tm.textAsChildLabel) {
    ensureButtonLabel(inner, node);
  } else if (node.children.length) {
    reconcile(ensureSeqAt(inner, 'widgets'), node.children);
  } else {
    // Nur verwaltete, gelöschte Kinder entfernen – unbekannte bleiben erhalten.
    const existing = getSeq(inner, 'widgets');
    if (existing) reconcile(existing, []);
  }
}

/**
 * Arc/Meter-Stil: Bogenfarben auf die RICHTIGEN LVGL-Keys mappen (arc_color am
 * Hauptteil = Track, indicator.arc_color = Wert), damit das Gerät die Editor-Farben
 * zeigt. `bg_color`/`color` sind hier die Modell-Props (Track/Wert), nicht die Box.
 */
function applyArcStyle(inner: YAMLMap, node: WidgetNode) {
  const p = node.props;
  const aw = typeof p.arc_width === 'number' ? p.arc_width : undefined;
  if (aw != null) inner.set('arc_width', aw);
  for (const k of ['start_angle', 'end_angle'] as const) {
    if (typeof p[k] === 'number') inner.set(k, p[k] as number);
  }
  if (p.bg_color) setColor(inner, 'arc_color', String(p.bg_color));
  // Indicator (Wert) muss dieselbe Breite wie der Track bekommen, sonst wirkt er dicker.
  if (p.color || aw != null) {
    let ind = inner.get('indicator');
    if (!isMap(ind)) {
      ind = new YAMLMap();
      inner.set('indicator', ind);
    }
    if (p.color) setColor(ind as YAMLMap, 'arc_color', String(p.color));
    if (aw != null) (ind as YAMLMap).set('arc_width', aw);
  }
}

/** Feature 4: Schreibt das Layout (type/flow/align/gaps) auf `inner`, erhält unbekannte Keys. */
function writeLayout(inner: YAMLMap, layout: Record<string, unknown> | undefined) {
  const type = layout?.type != null ? String(layout.type) : '';
  if (!type || type.toLowerCase() === 'none') {
    inner.delete('layout');
    return;
  }
  let m = inner.get('layout');
  if (!isMap(m)) {
    m = new YAMLMap();
    inner.set('layout', m);
  }
  const lm = m as YAMLMap;
  lm.set('type', type);
  for (const k of ['flex_flow', 'flex_align_main', 'flex_align_cross', 'flex_align_track'] as const) {
    const v = layout?.[k];
    if (v != null && v !== '') lm.set(k, String(v));
  }
  for (const k of ['pad_column', 'pad_row'] as const) {
    const n = Number(layout?.[k]);
    if (Number.isFinite(n)) lm.set(k, n);
  }
  // Grid-Templates: im Modell komma-getrennter String → YAML-Liste (FR(1), CONTENT, 100px).
  for (const k of ['grid_columns', 'grid_rows'] as const) {
    const raw = layout?.[k];
    const parts = typeof raw === 'string'
      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
      : Array.isArray(raw) ? (raw as unknown[]).map((s) => String(s)) : [];
    if (type.toLowerCase() === 'grid' && parts.length) setSeq(lm, k, parts);
    else lm.delete(k);
  }
}

/**
 * Spinner: Farbe/Breite laufen in LVGL über den `indicator`-Part (arc_color/arc_width),
 * nicht über die Widget-Ebene – sonst kommt am Gerät nichts an.
 */
function applySpinnerStyle(inner: YAMLMap, node: WidgetNode) {
  const p = node.props;
  const aw = typeof p.arc_width === 'number' ? p.arc_width : undefined;
  if (!p.color && aw == null) return;
  let ind = inner.get('indicator');
  if (!isMap(ind)) {
    ind = new YAMLMap();
    inner.set('indicator', ind);
  }
  const im = ind as YAMLMap;
  if (p.color) setColor(im, 'arc_color', String(p.color));
  if (aw != null) im.set('arc_width', aw);
}

/** Setzt einen Farb-Key auf einer (ggf. neu erzeugten) Part-Map (z. B. indicator/knob). */
function setPartColor(inner: YAMLMap, part: string, key: string, hex: string) {
  let m = inner.get(part);
  if (!isMap(m)) {
    m = new YAMLMap();
    inner.set(part, m);
  }
  setColor(m as YAMLMap, key, hex);
}

/** Feature 1: Style-Props eines Parts (knob/indicator) in verschachtelte Map schreiben. */
function applyPart(inner: YAMLMap, node: WidgetNode, part: string, skip?: Set<string>) {
  let m: YAMLMap | null = null;
  for (const pm of partSuffixes(node.type, part)) {
    if (skip?.has(pm.prop)) continue;
    const v = node.props[`${part}_${pm.prop}`];
    if (v == null || v === '') continue;
    if (!m) {
      const ex = inner.get(part);
      m = isMap(ex) ? (ex as YAMLMap) : new YAMLMap();
      if (!isMap(ex)) inner.set(part, m);
    }
    writeManagedProp(m, pm, v);
  }
}

/** Feature 1: Part-Style-Props (knob/indicator) aus verschachtelter Map ins Modell lesen. */
function readPart(inner: YAMLMap, type: WidgetType, part: string, props: WidgetProps, skip?: Set<string>) {
  const m = inner.get(part);
  if (!isMap(m)) return;
  for (const pm of partSuffixes(type, part)) {
    if (skip?.has(pm.prop)) continue;
    const raw = (m as YAMLMap).get(pm.yaml);
    if (raw == null) continue;
    const cv = convertIn(pm.kind, raw);
    if (cv !== undefined) props[`${part}_${pm.prop}`] = cv as never;
  }
}

/** Verwaltet das verschachtelte Label eines Buttons (Text als Kind-Widget). */
function ensureButtonLabel(inner: YAMLMap, node: WidgetNode) {
  const wseq = ensureSeqAt(inner, 'widgets');
  const lblId = node.id + '__lbl';
  let lblInner: YAMLMap | null = null;
  for (const it of wseq.items) {
    if (firstKey(it) === 'label') {
      const im = innerOf(it);
      if (im && String(im.get('id')) === lblId) {
        lblInner = im;
        break;
      }
    }
  }
  if (!lblInner) {
    lblInner = new YAMLMap();
    const item = new YAMLMap();
    item.set('label', lblInner);
    wseq.items.push(item);
  }
  lblInner.set('id', lblId);
  if (node.props.text != null) lblInner.set('text', String(node.props.text));
  if (node.props.text_color != null) setColor(lblInner, 'text_color', String(node.props.text_color));
  // Text-Style des Buttons aufs verschachtelte Label schreiben.
  for (const pm of TEXT_PROPS) writeManagedProp(lblInner, pm, node.props[pm.prop]);
}

function createItem(node: WidgetNode): YAMLMap {
  const inner = new YAMLMap();
  updateInner(inner, node);
  const item = new YAMLMap();
  item.set(TYPE_MAP[node.type].yaml, inner);
  return item;
}

/**
 * Gleicht eine `widgets`-Sequenz mit den Modell-Kindern ab:
 * - vorhandene (per `id`) Knoten werden aktualisiert (nur verwaltete Keys),
 * - fehlende Modell-Widgets werden neu erzeugt,
 * - im Modell gelöschte, bekannte Widgets werden entfernt,
 * - unbekannte Widget-Typen und id-lose Knoten bleiben erhalten.
 */
function reconcile(seq: YAMLSeq, children: WidgetNode[]) {
  const original = seq.items.slice();
  const byId = new Map<string, YAMLMap>();
  for (const it of original) {
    const key = firstKey(it);
    if (!key || !(key in YAML_TO_TYPE)) continue;
    const inner = innerOf(it);
    const id = inner?.get('id');
    if (id != null) byId.set(String(id), it as YAMLMap);
  }

  const matched = new Set<unknown>();
  const result: unknown[] = [];

  for (const child of children) {
    const it = byId.get(child.id);
    if (it) {
      const inner = innerOf(it)!;
      updateInner(inner, child);
      matched.add(it);
      result.push(it);
    } else {
      result.push(createItem(child));
    }
  }

  for (const it of original) {
    if (matched.has(it)) continue;
    const key = firstKey(it);
    const known = !!key && key in YAML_TO_TYPE;
    if (!known) {
      result.push(it); // unbekannter Widget-Typ → erhalten
      continue;
    }
    const inner = innerOf(it);
    const id = inner?.get('id');
    if (id == null) {
      result.push(it); // bekannt, aber ohne id → nicht verwaltbar, erhalten
      continue;
    }
    // bekannt + id + nicht im Modell → gelöscht → weglassen
  }

  seq.items = result as YAMLSeq['items'];
}

/** `lvgl.pages`-Sequenz, falls vorhanden. */
function getPagesSeq(doc: Document): YAMLSeq | null {
  const lvgl = doc.get('lvgl');
  if (!isMap(lvgl)) return null;
  const pages = (lvgl as YAMLMap).get('pages');
  return isSeq(pages) ? (pages as YAMLSeq) : null;
}

/** Map der Seite `i` (für Seiten-Hintergrund/-id), falls vorhanden. */
function getPageMap(doc: Document, i = 0): YAMLMap | null {
  const pages = getPagesSeq(doc);
  if (pages && pages.items.length > i && isMap(pages.items[i])) return pages.items[i] as YAMLMap;
  return null;
}
const getFirstPageMap = (doc: Document) => getPageMap(doc, 0);

/** Anzahl der Seiten im Dokument (mindestens 1 – auch bei `lvgl.widgets` ohne pages). */
function pageCount(doc: Document): number {
  const pages = getPagesSeq(doc);
  return pages && pages.items.length ? pages.items.length : 1;
}

/** Widgets-Sequenz aller Seiten (für dokumentweite Läufe: Fonts, Bindings, Bilder …). */
function allWidgetSeqs(doc: Document): YAMLSeq[] {
  const out: YAMLSeq[] = [];
  const n = pageCount(doc);
  for (let i = 0; i < n; i++) {
    const s = getWidgetsSeq(doc, i);
    if (s) out.push(s);
  }
  return out;
}

/**
 * Überführt die einseitige Form (`lvgl.widgets:`) in `lvgl.pages:`. Nötig, sobald es mehr
 * als eine Seite gibt: ESPHome erlaubt NICHT beides gleichzeitig – und ohne Migration
 * blieben die vorhandenen Widgets in `lvgl.widgets` hängen (wären also verschwunden).
 */
function migrateToPages(doc: Document, firstPageId = 'main_page') {
  const lvgl = doc.get('lvgl');
  if (!isMap(lvgl)) return;
  const lv = lvgl as YAMLMap;
  if (isSeq(lv.get('pages'))) return; // schon in Seitenform
  const top = lv.get('widgets');
  const pages = new YAMLSeq();
  const p0 = new YAMLMap();
  p0.set('id', firstPageId);
  p0.set('widgets', isSeq(top) ? (top as YAMLSeq) : new YAMLSeq());
  pages.items.push(p0);
  lv.set('pages', pages);
  lv.delete('widgets');
}

/** Stellt sicher, dass Seite `i` existiert, und liefert deren `widgets`-Sequenz. */
function ensureWidgetsSeq(doc: Document, i = 0, pageId?: string): YAMLSeq {
  let lvgl = doc.get('lvgl');
  if (!isMap(lvgl)) {
    lvgl = new YAMLMap();
    doc.set('lvgl', lvgl);
  }
  const lv = lvgl as YAMLMap;

  // Einseitige Alt-Form ohne `pages:` – nur für Seite 0 beibehalten.
  const topW = lv.get('widgets');
  if (i === 0 && !isSeq(lv.get('pages')) && isSeq(topW)) return topW as YAMLSeq;

  let pages = lv.get('pages');
  if (!isSeq(pages)) {
    pages = new YAMLSeq();
    lv.set('pages', pages);
  }
  const pseq = pages as YAMLSeq;
  while (pseq.items.length <= i) {
    const p = new YAMLMap();
    const idx = pseq.items.length;
    p.set('id', idx === 0 ? 'main_page' : `page_${idx + 1}`);
    p.set('widgets', new YAMLSeq());
    pseq.items.push(p);
  }
  const page = pseq.items[i] as YAMLMap;
  if (pageId && page.get('id') == null) page.set('id', pageId);
  let w = page.get('widgets');
  if (!isSeq(w)) {
    w = new YAMLSeq();
    page.set('widgets', w);
  }
  return w as YAMLSeq;
}

// ---------- Entity-Bindung (HA) ------------------------------------------

/** HA-Entities haben einen Domain-Punkt (light.x); ansonsten lokale Komponente. */
function isHaEntity(entity: string): boolean {
  return entity.includes('.');
}

/** Widget-Typen, die bei Bindung zusätzlich per Klick umschalten sollen. */
const INTERACTIVE_TYPES = new Set(['button', 'switch']);
/** Status-anzeigende Widgets → binary_sensor. Buttons NICHT (die sind Aktionen, kein Status). */
const CHECKABLE_TYPES = new Set(['switch', 'led', 'checkbox']);
/** Numerische Widgets → sensor + typspezifische value-Update-Aktion. */
const NUMERIC_TYPES = new Set(['arc', 'bar', 'slider']);
/** LVGL-Update-Aktion je Widget-Typ (lvgl.widget.update kennt kein `value`!). */
const VALUE_UPDATE_ACTION: Record<string, string> = {
  arc: 'lvgl.arc.update',
  bar: 'lvgl.bar.update',
  slider: 'lvgl.slider.update',
};

/** `!lambda '<body>'`-Skalar bauen. */
function lambdaScalar(body: string): Scalar {
  const l = new Scalar(body);
  l.tag = '!lambda';
  l.type = Scalar.QUOTE_SINGLE;
  return l;
}

/** Mehrzeiliges Lambda als Block-Skalar (`|-`) – lesbar und ohne Escaping-Fallen. */
function blockLambda(body: string): Scalar {
  const l = new Scalar(body);
  l.type = Scalar.BLOCK_LITERAL;
  return l;
}

/** Sammelt alle Widget-Inner-Maps (rekursiv) per id + zugehörigem Widget-Typ. */
function collectInnerById(seq: YAMLSeq | null, acc: Map<string, { inner: YAMLMap; type: string }>) {
  if (!seq) return;
  for (const it of seq.items) {
    const inner = innerOf(it);
    const id = inner?.get('id');
    const type = firstKey(it);
    if (inner && id != null && type) acc.set(String(id), { inner, type });
    const w = inner?.get('widgets');
    if (isSeq(w)) collectInnerById(w as YAMLSeq, acc);
  }
}

/** Erkennt unser generiertes Toggle-`on_press` (um es beim Entkoppeln zu entfernen). */
function isOurTogglePress(op: unknown): boolean {
  if (!isSeq(op) || op.items.length !== 1) return false;
  const it = op.items[0];
  if (!isMap(it)) return false;
  const act = it.get('homeassistant.action');
  return isMap(act) && String(act.get('action')) === 'homeassistant.toggle';
}

/** on_press-Aktion: HA-Entity per Klick umschalten. */
function buildTogglePress(doc: Document, entity: string): unknown {
  return doc.createNode([
    { 'homeassistant.action': { action: 'homeassistant.toggle', data: { entity_id: entity } } },
  ]);
}

/**
 * binary_sensor `<id>__state`: spiegelt den An/Aus-Zustand zurück. LED nutzt
 * `lvgl.led.update` (Helligkeit), Switch/Checkbox `lvgl.widget.update` (state.checked).
 */
function buildBinaryState(doc: Document, widgetId: string, entity: string, type: string): YAMLMap {
  if (type === 'led') {
    // Schlicht an/aus – kein Helligkeitsverlauf. `lvgl.led.update: brightness` hat sich
    // als unzuverlässig erwiesen (Prozent-/Rohwert-Semantik), deshalb die eindeutigen
    // LVGL-Aufrufe lv_led_on/lv_led_off direkt per Lambda.
    const entry = doc.createNode({
      platform: 'homeassistant',
      id: `${widgetId}__state`,
      entity_id: entity,
      internal: true,
      on_state: [{ lambda: null }],
    }) as YAMLMap;
    const step = (entry.get('on_state') as YAMLSeq).items[0] as YAMLMap;
    step.set('lambda', blockLambda(`if (x) lv_led_on(id(${widgetId}));\nelse lv_led_off(id(${widgetId}));`));
    return entry;
  }
  const entry = doc.createNode({
    platform: 'homeassistant',
    id: `${widgetId}__state`,
    entity_id: entity,
    on_state: [{ 'lvgl.widget.update': { id: widgetId, state: { checked: null } } }],
  }) as YAMLMap;
  const upd = ((entry.get('on_state') as YAMLSeq).items[0] as YAMLMap).get('lvgl.widget.update') as YAMLMap;
  (upd.get('state') as YAMLMap).set('checked', lambdaScalar('return x;'));
  return entry;
}

// HA-Domains, deren numerischer Wert in einem Attribut steckt (nicht im State).
const NUMERIC_ATTRIBUTE: Record<string, string> = {
  fan: 'percentage',
  cover: 'current_position',
  light: 'brightness',
  media_player: 'volume_level',
};

/** Attribut für die numerische Bindung, falls die Domain den Wert nicht im State führt. */
function numericAttribute(entity: string): string | null {
  return NUMERIC_ATTRIBUTE[entity.split('.')[0]] ?? null;
}

/** sensor `<id>__state`: spiegelt einen numerischen Wert zurück (typspezifische value-Aktion). */
function buildNumericState(
  doc: Document,
  widgetId: string,
  entity: string,
  type: string,
  max = 100,
  decimals = 1,
): YAMLMap {
  const attr = numericAttribute(entity);
  const spec: Record<string, unknown> = { platform: 'homeassistant', id: `${widgetId}__state`, entity_id: entity };
  if (attr) spec.attribute = attr; // z. B. fan.percentage / cover.current_position

  // Ein Label zeigt den Wert als TEXT an (nicht als Widget-Wert) – wie in der Vorschau.
  if (type === 'label') {
    spec.on_value = [{ 'lvgl.label.update': { id: widgetId, text: null } }];
    const entry = doc.createNode(spec) as YAMLMap;
    const upd = ((entry.get('on_value') as YAMLSeq).items[0] as YAMLMap).get('lvgl.label.update') as YAMLMap;
    const d = Number.isFinite(decimals) ? Math.max(0, Math.round(decimals)) : 1;
    upd.set('text', lambdaScalar(`return str_sprintf("%.${d}f", x);`));
    return entry;
  }

  const action = VALUE_UPDATE_ACTION[type] ?? 'lvgl.arc.update';
  spec.on_value = [{ [action]: { id: widgetId, value: null } }];
  const entry = doc.createNode(spec) as YAMLMap;
  const upd = ((entry.get('on_value') as YAMLSeq).items[0] as YAMLMap).get(action) as YAMLMap;
  // Licht-brightness ist 0..255 → auf den Widget-Maximalwert skalieren.
  const body = attr === 'brightness' ? `return (int)(x * ${max} / 255.0);` : 'return (int) x;';
  upd.set('value', lambdaScalar(body));
  return entry;
}

/**
 * Schlüssel, die wir in `<id>__state`-Sensoren selbst erzeugen. Beim Abgleich werden
 * genau diese neu geschrieben – alles andere (eigene filters, name, …) bleibt stehen.
 */
const MANAGED_STATE_KEYS = ['platform', 'entity_id', 'internal', 'attribute', 'on_state', 'on_value'];

/**
 * Übernimmt den frisch gebauten Stand in einen bestehenden Eintrag. Ohne das behielte ein
 * einmal geschriebener Sensor seine Aktion für immer – Korrekturen an der erzeugten Logik
 * (z. B. an der LED-Schaltung) erreichten nur neu angelegte Widgets.
 */
function refreshStateEntry(entry: YAMLMap, fresh: YAMLMap) {
  for (const key of MANAGED_STATE_KEYS) entry.delete(key);
  for (const item of fresh.items) {
    const key = String((item.key as Scalar).value);
    if (MANAGED_STATE_KEYS.includes(key)) entry.set(key, item.value);
  }
}

/**
 * Gleicht eine top-level Sensor-Sektion (`binary_sensor`/`sensor`) mit den gewünschten
 * `<id>__state`-Einträgen ab: aktualisiert/erstellt sie, entfernt verwaiste (eigene
 * Namenskonvention; fremde Sensoren bleiben) und löscht die Sektion, wenn sie leer wird.
 */
function syncStateSection(
  doc: Document,
  key: string,
  desired: Map<string, string>,
  build: (doc: Document, widgetId: string, entity: string) => YAMLMap,
) {
  let s = doc.get(key);
  const hasStale = isSeq(s) && (s as YAMLSeq).items.some((it) => {
    const id = isMap(it) ? it.get('id') : null;
    return id != null && /__state$/.test(String(id));
  });
  if (desired.size === 0 && !hasStale) return; // keine leere Sektion anlegen

  if (!isSeq(s)) {
    s = new YAMLSeq();
    doc.set(key, s);
  }
  const seq = s as YAMLSeq;
  const existing = new Map<string, YAMLMap>();
  for (const it of seq.items) {
    if (isMap(it) && it.get('id') != null) existing.set(String(it.get('id')), it);
  }
  for (const [sid, ent] of desired) {
    const fresh = build(doc, sid.replace(/__state$/, ''), ent);
    const ex = existing.get(sid);
    if (ex) refreshStateEntry(ex, fresh); // erzeugte Logik neu schreiben, Fremdes behalten
    else seq.items.push(fresh);
  }
  seq.items = seq.items.filter((it) => {
    const id = isMap(it) ? it.get('id') : null;
    const str = id != null ? String(id) : '';
    return !(/__state$/.test(str) && !desired.has(str));
  });
  if (seq.items.length === 0) doc.delete(key);
}

// ---------- Bildquellen (image / online_image) ----------------------------

/** Von uns verwaltete Bild-Komponenten tragen diese id-Endung (`<widgetId>__img`). */
const IMG_SUFFIX = '__img';

/** Alle image-Widgets im Modellbaum. */
function eachImageNode(children: WidgetNode[], cb: (n: WidgetNode) => void) {
  for (const n of children) {
    if (n.type === 'image') cb(n);
    if (n.children.length) eachImageNode(n.children, cb);
  }
}

/** Läuft alle Widget-Maps (einer Seite oder aller Seiten) ab und ruft cb(inner, id, key) auf. */
function forEachWidgetMap(
  seq: YAMLSeq | YAMLSeq[] | null,
  cb: (inner: YAMLMap, id: string, key: string) => void,
) {
  if (!seq) return;
  if (Array.isArray(seq)) {
    for (const s of seq) forEachWidgetMap(s, cb);
    return;
  }
  for (const it of seq.items) {
    if (!isMap(it)) continue;
    const key = String((it as YAMLMap).items[0]?.key ?? '');
    const inner = innerOf(it);
    if (!inner) continue;
    const id = inner.get('id');
    if (id != null) cb(inner, String(id), key);
    const w = inner.get('widgets');
    if (isSeq(w)) forEachWidgetMap(w as YAMLSeq, cb);
  }
}

/** Sorgt für eine Zeiteinheit: „4" → „4s" (ESPHome braucht eine Einheit). */
function normalizeInterval(v: unknown): string {
  const s = String(v ?? '').trim() || '60s';
  return /^\d+$/.test(s) ? `${s}s` : s;
}

/**
 * `format` ist bei `online_image` PFLICHT und lässt nur BMP/JPEG/JPG/PNG zu – ein
 * früher hier erzeugtes `AUTO` bricht die Kompilierung ab
 * („Unknown value 'AUTO', valid options are 'BMP', 'JPEG', 'PNG', 'JPG'").
 * Ohne (gültige) Angabe raten wir anhand der URL und fallen auf PNG zurück.
 */
const IMAGE_FORMATS = new Set(['BMP', 'JPEG', 'JPG', 'PNG']);

function normalizeImageFormat(wanted: unknown, url: unknown): string {
  const w = String(wanted ?? '').trim().toUpperCase();
  if (IMAGE_FORMATS.has(w)) return w;
  const u = String(url ?? '').toLowerCase();
  // Query-String abschneiden – die Endung steht im Pfad (…/latest.jpg?h=180).
  const path = u.split('?')[0];
  if (/\.(jpe?g)$/.test(path) || /(^|[?&])format=(image\/)?jpe?g/.test(u)) return 'JPEG';
  if (/\.bmp$/.test(path)) return 'BMP';
  return 'PNG';
}

/**
 * `RGBA` gibt es als Bildtyp nicht mehr (ESPHome verweist selbst auf
 * „'type: RGB' and 'transparency: alpha_channel'"). Wir bilden das automatisch ab,
 * damit ältere Konfigurationen und Addons weiter kompilieren.
 */
const IMAGE_TYPES = new Set(['BINARY', 'GRAYSCALE', 'RGB565', 'RGB']);

function normalizeImageType(wanted: unknown): { type: string; alpha: boolean } {
  const t = String(wanted ?? '').trim().toUpperCase();
  if (t === 'RGBA') return { type: 'RGB565', alpha: true };
  return { type: IMAGE_TYPES.has(t) ? t : 'RGB565', alpha: false };
}

/** Transparenz-Wert eines Bildes (`RGBA` erzwingt den Alpha-Kanal). */
function imageTransparency(n: WidgetNode): string {
  const { alpha } = normalizeImageType(n.props.img_type);
  const explicit = String(n.props.img_transparency ?? '').trim();
  return alpha && !explicit ? 'alpha_channel' : explicit;
}

/**
 * `buffer_size` von `online_image` (Streaming-Download-Puffer, ESPHome-Default 64 KB).
 * Dieser Puffer wird als C++-Member-Objekt angelegt und ist damit VOR `setup()` (also vor
 * Display-/WLAN-Init) dauerhaft reserviert – auf Boards ohne PSRAM kann das allein schon
 * den RAM für den Display-Framebuffer knapp machen, besonders mit mehreren Online-Bildern
 * (z. B. Karte + Regenradar). Nur schreiben, wenn explizit gesetzt – sonst gilt ESPHomes
 * eigener Default unverändert.
 */
function imageBufferSize(n: WidgetNode): number | undefined {
  const v = Number(n.props.img_buffer_size);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
}

function buildOnlineImage(doc: Document, n: WidgetNode, sid: string): YAMLMap {
  const m = new YAMLMap();
  // URL immer quoten – Query-Strings (?src=…&w=480) enthalten YAML-Sonderzeichen.
  setQuoted(m, 'url', String(n.props.img_url ?? ''));
  m.set('id', sid);
  m.set('format', normalizeImageFormat(n.props.img_format, n.props.img_url));
  m.set('type', normalizeImageType(n.props.img_type).type);
  m.set('update_interval', normalizeInterval(n.props.img_update_interval));
  if (n.props.img_resize) m.set('resize', String(n.props.img_resize));
  // Transparenz gilt auch für online_image (Standard OPAQUE) – ohne sie deckt ein
  // PNG-Overlay (z. B. Regenradar) das Bild darunter komplett ab.
  const transparency = imageTransparency(n);
  if (transparency) m.set('transparency', transparency);
  const bufferSize = imageBufferSize(n);
  if (bufferSize != null) m.set('buffer_size', bufferSize);
  return m;
}

function buildFileImage(doc: Document, n: WidgetNode, sid: string): YAMLMap {
  const m = new YAMLMap();
  setQuoted(m, 'file', String(n.props.img_file ?? ''));
  m.set('id', sid);
  m.set('type', normalizeImageType(n.props.img_type).type);
  if (n.props.img_resize) m.set('resize', String(n.props.img_resize));
  const transparency = imageTransparency(n);
  if (transparency) m.set('transparency', transparency);
  return m;
}

/** Aktualisiert die von uns verwalteten Felder eines bestehenden Bild-Eintrags (Rest bleibt). */
function updateImageEntry(entry: YAMLMap, n: WidgetNode, online: boolean) {
  if (online) {
    setQuoted(entry, 'url', String(n.props.img_url ?? ''));
    entry.set('format', normalizeImageFormat(n.props.img_format, n.props.img_url));
    entry.set('update_interval', normalizeInterval(n.props.img_update_interval));
    const bufferSize = imageBufferSize(n);
    if (bufferSize != null) entry.set('buffer_size', bufferSize);
    else entry.delete('buffer_size');
  } else {
    setQuoted(entry, 'file', String(n.props.img_file ?? ''));
  }
  entry.set('type', normalizeImageType(n.props.img_type).type);
  if (n.props.img_resize) entry.set('resize', String(n.props.img_resize));
  else entry.delete('resize');
  const transparency = imageTransparency(n);
  if (transparency) entry.set('transparency', transparency);
  else entry.delete('transparency');
}

/** Gleicht eine Bild-Sektion (`online_image`/`image`) mit den gewünschten `__img`-Einträgen ab. */
function syncImageSection(
  doc: Document,
  key: string,
  desired: Map<string, WidgetNode>,
  online: boolean,
) {
  let s = doc.get(key);
  const hasStale = isSeq(s) && (s as YAMLSeq).items.some((it) => {
    const id = isMap(it) ? it.get('id') : null;
    return id != null && String(id).endsWith(IMG_SUFFIX);
  });
  if (desired.size === 0 && !hasStale) return;
  if (!isSeq(s)) {
    s = new YAMLSeq();
    doc.set(key, s);
  }
  const seq = s as YAMLSeq;
  const existing = new Map<string, YAMLMap>();
  for (const it of seq.items) {
    if (isMap(it) && it.get('id') != null) existing.set(String(it.get('id')), it);
  }
  for (const [sid, n] of desired) {
    const ex = existing.get(sid);
    if (ex) updateImageEntry(ex, n, online);
    else seq.items.push(online ? buildOnlineImage(doc, n, sid) : buildFileImage(doc, n, sid));
  }
  // verwaiste `__img`-Einträge entfernen (fremde Bilder bleiben unangetastet)
  seq.items = seq.items.filter((it) => {
    const id = isMap(it) ? it.get('id') : null;
    const str = id != null ? String(id) : '';
    return !(str.endsWith(IMG_SUFFIX) && !desired.has(str));
  });
  if (seq.items.length === 0) doc.delete(key);
}

/**
 * Erzeugt aus der Bildquellen-Konfiguration der image-Widgets die passenden Top-Level-
 * Komponenten (`online_image:` für Live-URLs, `image:` für statische Dateien/MDI) und
 * setzt `src` am Widget. Referenziert der Nutzer ein eigenes, bereits vorhandenes Bild
 * (img_source = 'ref'), wird nur `src` gesetzt und nichts generiert.
 */
function applyImageSources(doc: Document, children: WidgetNode[]) {
  const online = new Map<string, WidgetNode>();
  const files = new Map<string, WidgetNode>();
  const srcById = new Map<string, string>();
  const imageIds = new Set<string>();
  eachImageNode(children, (n) => {
    imageIds.add(n.id);
    const source = String(n.props.img_source ?? '');
    const sid = `${n.id}${IMG_SUFFIX}`;
    if (source === 'online' && n.props.img_url) {
      online.set(sid, n);
      srcById.set(n.id, sid);
    } else if (source === 'file' && n.props.img_file) {
      files.set(sid, n);
      srcById.set(n.id, sid);
    } else if (source === 'ref' && n.props.img_ref) {
      srcById.set(n.id, String(n.props.img_ref));
    }
  });
  syncImageSection(doc, 'online_image', online, true);
  syncImageSection(doc, 'image', files, false);
  // online_image benötigt die Komponente http_request (sonst schlägt der Build fehl).
  if (online.size && doc.get('http_request') == null) doc.set('http_request', new YAMLMap());
  forEachWidgetMap(allWidgetSeqs(doc), (inner, id, key) => {
    if (key !== 'image') return;
    const src = srcById.get(id);
    if (src) inner.set('src', src);
    else if (imageIds.has(id)) {
      // Keine Quelle mehr → nur unseren eigenen (verwaisten) `__img`-Verweis lösen.
      const cur = inner.get('src');
      if (cur != null && String(cur).endsWith(IMG_SUFFIX)) inner.delete('src');
    }
  });
}

/** Liest Bildquellen aus `online_image`/`image` + `src` der Widgets zurück ins Modell. */
function collectImageSources(doc: Document): Map<string, Partial<WidgetProps>> {
  const byWidget = new Map<string, Partial<WidgetProps>>();
  const readSection = (key: string, online: boolean) => {
    const s = doc.get(key);
    if (!isSeq(s)) return;
    for (const it of (s as YAMLSeq).items) {
      if (!isMap(it)) continue;
      const id = it.get('id');
      if (id == null || !String(id).endsWith(IMG_SUFFIX)) continue;
      const wid = String(id).slice(0, -IMG_SUFFIX.length);
      const props: Partial<WidgetProps> = {
        img_source: online ? 'online' : 'file',
        img_type: it.get('type') != null ? String(it.get('type')) : 'RGB565',
      };
      if (online) {
        props.img_url = it.get('url') != null ? String(it.get('url')) : '';
        props.img_format = it.get('format') != null ? String(it.get('format')) : 'PNG';
        props.img_update_interval = it.get('update_interval') != null ? String(it.get('update_interval')) : '60s';
        const bufferSize = Number(it.get('buffer_size'));
        if (Number.isFinite(bufferSize) && bufferSize > 0) props.img_buffer_size = bufferSize;
      } else {
        props.img_file = it.get('file') != null ? String(it.get('file')) : '';
      }
      if (it.get('transparency') != null) props.img_transparency = String(it.get('transparency'));
      if (it.get('resize') != null) props.img_resize = String(it.get('resize'));
      byWidget.set(wid, props);
    }
  };
  readSection('online_image', true);
  readSection('image', false);
  // `src` der image-Widgets: verweist es auf ein fremdes Bild → als Referenz führen.
  forEachWidgetMap(allWidgetSeqs(doc), (inner, id, key) => {
    if (key !== 'image') return;
    const src = inner.get('src');
    if (src == null) return;
    if (byWidget.has(id)) return; // von uns verwaltet, schon gelesen
    if (!String(src).endsWith(IMG_SUFFIX)) byWidget.set(id, { img_source: 'ref', img_ref: String(src) });
  });
  return byWidget;
}

// ---------- Meter: scales/indicators ---------------------------------------

/**
 * Ein `meter` ohne `scales:` zeichnet auf dem Gerät nur einen leeren Kreis (genau das
 * Symptom: weiße Scheibe statt Gauge). ESPHome verlangt mindestens eine Skala mit
 * `range_from`/`range_to` und darin `indicators:`. Das bauen wir hier aus dem Modell –
 * eine vorhandene, selbst gepflegte `scales:`-Struktur bleibt unangetastet.
 */
function applyMeterScales(doc: Document, children: WidgetNode[]) {
  const meters = new Map<string, WidgetNode>();
  const walk = (nodes: WidgetNode[]) => {
    for (const n of nodes) {
      if (n.type === 'meter') meters.set(n.id, n);
      walk(n.children);
    }
  };
  walk(children);
  if (!meters.size) return;

  forEachWidgetMap(allWidgetSeqs(doc), (inner, id, key) => {
    if (key !== 'meter') return;
    const n = meters.get(id);
    if (!n) return;
    // Eigene/handgepflegte Skalen nicht überschreiben – nur unsere erzeugte ergänzen.
    const existing = inner.get('scales');
    if (isSeq(existing) && (existing as YAMLSeq).items.length) {
      const first = (existing as YAMLSeq).items[0];
      if (isMap(first) && (first as YAMLMap).get('id') !== `${id}__scale`) return;
    }
    const min = Number.isFinite(Number(n.props.min_value)) ? Number(n.props.min_value) : 0;
    const max = Number.isFinite(Number(n.props.max_value)) ? Number(n.props.max_value) : 100;
    const val = Number.isFinite(Number(n.props.value)) ? Number(n.props.value) : 0;
    const color = String(n.props.color ?? '#f59e0b');
    // Im Editor ist bg_color die Farbe der TRACK-Bahn (nicht ein Hintergrund-Kreis).
    const trackColor = String(n.props.bg_color ?? '#374151');
    const arcWidth = Number(n.props.arc_width);
    const width = Number.isFinite(arcWidth) && arcWidth > 0 ? Math.round(arcWidth) : 10;

    /** Ein Bogen-Indikator (abgerundete Enden wie in der Vorschau). */
    const mkArc = (aid: string, col: string, from: number, to: number): YAMLMap => {
      const arc = new YAMLMap();
      arc.set('id', aid);
      setColor(arc, 'color', col);
      arc.set('width', width);
      arc.set('r_mod', 0);
      arc.set('rounded', true);
      arc.set('start_value', from);
      arc.set('end_value', to);
      return arc;
    };

    // Reihenfolge = Zeichenreihenfolge: erst die graue Bahn, dann der Wert darüber.
    const indicators = new YAMLSeq();
    for (const arc of [
      mkArc(`${id}__track`, trackColor, min, max),
      mkArc(`${id}__value`, color, min, val),
    ]) {
      const item = new YAMLMap();
      item.set('arc', arc);
      indicators.items.push(item);
    }

    // Ohne das zeichnet LVGL den Meter-Hintergrund als gefüllten Kreis (die „weiße Scheibe").
    inner.set('bg_opa', '0%');
    if (inner.get('border_width') == null) inner.set('border_width', 0);

    const scale = new YAMLMap();
    scale.set('id', `${id}__scale`);
    scale.set('range_from', Number.isFinite(min) ? min : 0);
    scale.set('range_to', Number.isFinite(max) ? max : 100);
    scale.set('angle_range', Number(n.props.angle_range ?? 270));
    scale.set('rotation', Number(n.props.rotation ?? 135));
    scale.set('indicators', indicators);

    const scales = new YAMLSeq();
    scales.items.push(scale);
    inner.set('scales', scales);
  });
}

/** Liest die von uns erzeugte Meter-Skala zurück (Wertebereich/Wert/Farbe/Breite). */
function collectMeterScales(doc: Document): Map<string, Partial<WidgetProps>> {
  const out = new Map<string, Partial<WidgetProps>>();
  forEachWidgetMap(allWidgetSeqs(doc), (inner, id, key) => {
    if (key !== 'meter') return;
    const scales = inner.get('scales');
    if (!isSeq(scales) || !(scales as YAMLSeq).items.length) return;
    const scale = (scales as YAMLSeq).items[0];
    if (!isMap(scale)) return;
    const s = scale as YAMLMap;
    const props: Partial<WidgetProps> = {};
    if (s.get('range_from') != null) props.min_value = Number(s.get('range_from'));
    if (s.get('range_to') != null) props.max_value = Number(s.get('range_to'));
    if (s.get('angle_range') != null) props.angle_range = Number(s.get('angle_range'));
    if (s.get('rotation') != null) props.rotation = Number(s.get('rotation'));
    const inds = s.get('indicators');
    if (isSeq(inds)) {
      for (const it of (inds as YAMLSeq).items) {
        if (!isMap(it)) continue;
        const a = (it as YAMLMap).get('arc');
        if (!isMap(a)) continue;
        const am = a as YAMLMap;
        const aid = am.get('id') != null ? String(am.get('id')) : '';
        const isTrack = aid === `${id}__track`;
        if (am.get('width') != null) props.arc_width = Number(am.get('width'));
        if (isTrack) {
          // Die Bahn liefert die Hintergrundfarbe des Editors.
          if (am.get('color') != null) props.bg_color = espColorToHex(am.get('color'));
          continue;
        }
        if (am.get('color') != null) props.color = espColorToHex(am.get('color'));
        if (am.get('end_value') != null) props.value = Number(am.get('end_value'));
      }
    }
    out.set(id, props);
  });
  return out;
}

// ---------- Seiten-Navigation (page_action) -------------------------------

/**
 * Baut die `on_press`-Aktion für einen Navigations-Button. Bewusst im Block-Stil und
 * ohne explizites `null` – also `- lvgl.page.next:` wie in der ESPHome-Doku.
 */
function buildPageAction(_doc: Document, action: string): YAMLSeq | null {
  const mk = (key: string, value: unknown = null): YAMLSeq => {
    const item = new YAMLMap();
    const v = new Scalar(value);
    if (value === null) v.value = null;
    item.set(key, v);
    item.flow = false;
    const seq = new YAMLSeq();
    seq.flow = false;
    seq.items.push(item);
    return seq;
  };
  if (action === 'next') return mk('lvgl.page.next');
  if (action === 'prev') return mk('lvgl.page.previous');
  if (action.startsWith('show:')) {
    const id = action.slice(5);
    if (id) return mk('lvgl.page.show', id);
  }
  return null;
}

/** Liest eine Navigations-Aktion aus einem `on_press`-Block zurück (sonst ''). */
function readPageAction(inner: YAMLMap): string {
  const op = inner.get('on_press');
  if (!isSeq(op)) return '';
  for (const it of (op as YAMLSeq).items) {
    if (!isMap(it)) continue;
    const key = String((it as YAMLMap).items[0]?.key ?? '');
    if (key === 'lvgl.page.next') return 'next';
    if (key === 'lvgl.page.previous') return 'prev';
    if (key === 'lvgl.page.show') return `show:${String((it as YAMLMap).get('lvgl.page.show') ?? '')}`;
  }
  return '';
}

/** True, wenn `on_press` ausschließlich eine von uns erzeugte Seiten-Aktion enthält. */
function isOnlyPageAction(inner: YAMLMap): boolean {
  const op = inner.get('on_press');
  if (!isSeq(op)) return false;
  const items = (op as YAMLSeq).items;
  return items.length === 1 && isMap(items[0]) &&
    String((items[0] as YAMLMap).items[0]?.key ?? '').startsWith('lvgl.page.');
}

/**
 * Schreibt Seiten-Navigation (`page_action`) als `on_press` an die Widgets. Widgets mit
 * Entity-Bindung bleiben unangetastet – dort gehört `on_press` der Entity-Steuerung.
 */
function applyPageActions(doc: Document, children: WidgetNode[]) {
  const desired = new Map<string, string>();
  const seen = new Set<string>();
  const walk = (nodes: WidgetNode[]) => {
    for (const n of nodes) {
      seen.add(n.id);
      const a = String(n.props.page_action ?? '');
      if (a && !n.entity) desired.set(n.id, a);
      walk(n.children);
    }
  };
  walk(children);

  forEachWidgetMap(allWidgetSeqs(doc), (inner, id) => {
    if (!seen.has(id)) return;
    const want = desired.get(id);
    if (want) {
      const node = buildPageAction(doc, want);
      if (node) inner.set('on_press', node);
    } else if (isOnlyPageAction(inner)) {
      // Aktion wurde entfernt → unseren (alleinigen) Nav-Block wieder abräumen.
      inner.delete('on_press');
    }
  });
}

// ---------- Lokale (Nicht-HA-)Entities ------------------------------------

/** Top-Level-Sektionen, in denen lokale Komponenten (per id) gesucht werden. */
const LOCAL_SECTIONS = ['switch', 'light', 'fan', 'cover', 'binary_sensor', 'sensor', 'number'] as const;
/** Lokale Komponenten, die sich per Klick umschalten lassen. */
const LOCAL_TOGGLEABLE = new Set<string>(['switch', 'light', 'fan']);
/** Trigger je Komponententyp, über den der Zustand zurück ins Widget gespiegelt wird. */
const LOCAL_TRIGGERS: Record<string, string[]> = {
  switch: ['on_turn_on', 'on_turn_off'],
  light: ['on_turn_on', 'on_turn_off'],
  fan: ['on_turn_on', 'on_turn_off'],
  binary_sensor: ['on_state'],
  sensor: ['on_value'],
  number: ['on_value'],
};

/** Sucht eine lokale Komponente per id und liefert Sektion + Map. */
function findLocalComponent(doc: Document, id: string): { section: string; map: YAMLMap } | null {
  for (const section of LOCAL_SECTIONS) {
    const seq = doc.get(section);
    if (!isSeq(seq)) continue;
    for (const it of (seq as YAMLSeq).items) {
      if (isMap(it) && String(it.get('id') ?? '') === id) return { section, map: it as YAMLMap };
    }
  }
  return null;
}

/** True, wenn diese Aktion ein `lvgl.*.update` auf genau dieses Widget ist. */
function actionTargetsWidget(item: unknown, widgetId: string): boolean {
  if (!isMap(item)) return false;
  for (const pair of (item as YAMLMap).items) {
    const k = pair.key instanceof Scalar ? String(pair.key.value) : String(pair.key);
    if (/^lvgl\.\w+\.update$/.test(k) && isMap(pair.value) && String((pair.value as YAMLMap).get('id')) === widgetId) {
      return true;
    }
  }
  return false;
}

/** Setzt unsere Aktion in einem Komponenten-Trigger (ersetzt die alte für dieses Widget). */
function setComponentAction(comp: YAMLMap, trigger: string, widgetId: string, action: unknown | null) {
  let seq = comp.get(trigger);
  if (!isSeq(seq)) {
    if (action == null) return;
    seq = new YAMLSeq();
    comp.set(trigger, seq);
  }
  const s = seq as YAMLSeq;
  s.items = s.items.filter((it) => !actionTargetsWidget(it, widgetId));
  if (action != null) s.items.push(action as never);
  if (s.items.length === 0) comp.delete(trigger);
}

/**
 * Verdrahtet lokale (ESPHome-eigene) Komponenten mit Widgets: Klick schaltet die
 * Komponente, und deren Zustand wird über ihre Trigger zurück ins Widget gespiegelt.
 */
function applyLocalBindings(
  doc: Document,
  children: WidgetNode[],
  innerById: Map<string, { inner: YAMLMap; type: string }>,
) {
  const bound: WidgetNode[] = [];
  const walk = (nodes: WidgetNode[]) => {
    for (const n of nodes) {
      if (n.entity && !isHaEntity(n.entity)) bound.push(n);
      walk(n.children);
    }
  };
  walk(children);
  const boundIds = new Set(bound.map((n) => n.id));

  // Verwaiste Aktionen entfernen: Widgets, die nicht (mehr) lokal gebunden sind.
  for (const [wid] of innerById) {
    if (boundIds.has(wid)) continue;
    for (const section of LOCAL_SECTIONS) {
      const seq = doc.get(section);
      if (!isSeq(seq)) continue;
      for (const it of (seq as YAMLSeq).items) {
        if (!isMap(it)) continue;
        // Die HA-verwalteten `<id>__state`-Sensoren gehören nicht uns → nicht anfassen.
        const cid = String((it as YAMLMap).get('id') ?? '');
        if (/__state$/.test(cid)) continue;
        for (const trig of LOCAL_TRIGGERS[section] ?? []) setComponentAction(it as YAMLMap, trig, wid, null);
      }
    }
  }

  for (const n of bound) {
    const comp = findLocalComponent(doc, n.entity!);
    const rec = innerById.get(n.id);
    if (!comp || !rec) continue;
    const wtype = rec.type;

    // 1) Klick schaltet die lokale Komponente.
    if (INTERACTIVE_TYPES.has(wtype) && LOCAL_TOGGLEABLE.has(comp.section)) {
      rec.inner.set('on_press', doc.createNode([{ [`${comp.section}.toggle`]: n.entity }]));
    }

    // 2) Zustand der Komponente → Widget.
    const upd = (body: Record<string, unknown>, action = 'lvgl.widget.update') =>
      doc.createNode({ [action]: { id: n.id, ...body } });

    if (NUMERIC_TYPES.has(wtype) && (comp.section === 'sensor' || comp.section === 'number')) {
      const act = doc.createNode({ [VALUE_UPDATE_ACTION[wtype]]: { id: n.id, value: null } }) as YAMLMap;
      (act.get(VALUE_UPDATE_ACTION[wtype]) as YAMLMap).set('value', lambdaScalar('return (int) x;'));
      setComponentAction(comp.map, 'on_value', n.id, act);
    } else if (comp.section === 'binary_sensor') {
      const act = doc.createNode({ 'lvgl.widget.update': { id: n.id, state: { checked: null } } }) as YAMLMap;
      ((act.get('lvgl.widget.update') as YAMLMap).get('state') as YAMLMap).set('checked', lambdaScalar('return x;'));
      setComponentAction(comp.map, 'on_state', n.id, act);
    } else if (LOCAL_TOGGLEABLE.has(comp.section)) {
      // Status spiegeln nur, wo es sichtbar ist: LED (Helligkeit), Schalt-Widgets bzw.
      // ein Button NUR im Toggle-Modus (sonst zeichnet LVGL sein Default-Checked-Rot).
      const reflects = wtype === 'led' || CHECKABLE_TYPES.has(wtype) || (wtype === 'button' && n.props.checkable === true);
      const on = !reflects ? null
        : wtype === 'led' ? upd({ brightness: 100 }, 'lvgl.led.update') : upd({ state: { checked: true } });
      const off = !reflects ? null
        : wtype === 'led' ? upd({ brightness: 0 }, 'lvgl.led.update') : upd({ state: { checked: false } });
      setComponentAction(comp.map, 'on_turn_on', n.id, on);
      setComponentAction(comp.map, 'on_turn_off', n.id, off);
    }
  }
}

/**
 * Schreibt für alle HA-gebundenen Widgets die ESPHome-Bindung ins Dokument:
 * Status-Sensor (`<id>__state`, binary_sensor für schaltbare / sensor für numerische
 * Widgets) + optional on_press-Umschalten. Idempotent; räumt verwaiste Einträge auf.
 */
function applyEntityBindings(doc: Document, children: WidgetNode[]) {
  const bound: WidgetNode[] = [];
  const walk = (nodes: WidgetNode[]) => {
    for (const n of nodes) {
      if (n.entity && isHaEntity(n.entity)) bound.push(n);
      walk(n.children);
    }
  };
  walk(children);

  const innerById = new Map<string, { inner: YAMLMap; type: string }>();
  for (const s of allWidgetSeqs(doc)) collectInnerById(s, innerById);
  const boundIds = new Set(bound.map((n) => n.id));

  // on_press-Umschalten für interaktive gebundene Widgets.
  for (const n of bound) {
    const rec = innerById.get(n.id);
    if (rec && INTERACTIVE_TYPES.has(rec.type)) rec.inner.set('on_press', buildTogglePress(doc, n.entity!));
  }
  // Verwaistes on_press entfernen, wenn ein interaktives Widget nicht mehr gebunden ist.
  for (const [id, rec] of innerById) {
    if (!INTERACTIVE_TYPES.has(rec.type) || boundIds.has(id)) continue;
    if (isOurTogglePress(rec.inner.get('on_press'))) rec.inner.delete('on_press');
  }

  // Gewünschte Status-Sensoren nach Widget-Typ auf die passende Sektion verteilen.
  const desiredBinary = new Map<string, string>();
  const desiredNumeric = new Map<string, string>();
  const numericType = new Map<string, string>(); // stateId → Widget-Typ (für die value-Aktion)
  const numericMax = new Map<string, number>(); // stateId → max_value (für brightness-Skalierung)
  const binaryType = new Map<string, string>(); // stateId → Widget-Typ (led vs. checked)
  const numericDecimals = new Map<string, number>(); // stateId → Nachkommastellen (Label-Text)
  for (const n of bound) {
    const type = innerById.get(n.id)?.type ?? n.type;
    // Label zeigt den Wert als Text – wie in der Vorschau. Ohne diesen Zweig ging die
    // Bindung verloren (kein Sensor exportiert → beim nächsten Import verschwunden).
    if (NUMERIC_TYPES.has(type) || type === 'label') {
      desiredNumeric.set(`${n.id}__state`, n.entity!);
      numericType.set(`${n.id}__state`, type);
      const mx = Number(n.props.max_value);
      numericMax.set(`${n.id}__state`, Number.isFinite(mx) ? mx : 100);
      const dec = Number(n.props.decimals);
      numericDecimals.set(`${n.id}__state`, Number.isFinite(dec) ? dec : 1);
    } else if (CHECKABLE_TYPES.has(type) || (type === 'button' && n.props.checkable === true)) {
      // Button spiegelt nur im Toggle-Modus (dann ist das checked-Aussehen selbst definiert).
      desiredBinary.set(`${n.id}__state`, n.entity!);
      binaryType.set(`${n.id}__state`, type);
    }
  }
  syncStateSection(
    doc,
    'binary_sensor',
    desiredBinary,
    (d, wid, ent) => buildBinaryState(d, wid, ent, binaryType.get(`${wid}__state`) ?? 'switch'),
  );
  syncStateSection(
    doc,
    'sensor',
    desiredNumeric,
    (d, wid, ent) =>
      buildNumericState(
        d, wid, ent,
        numericType.get(`${wid}__state`) ?? 'arc',
        numericMax.get(`${wid}__state`),
        numericDecimals.get(`${wid}__state`),
      ),
  );

  // Lokale (ESPHome-eigene) Komponenten separat verdrahten.
  applyLocalBindings(doc, children, innerById);
}

/** Liest die Entity-Bindungen aus den `<id>__state`-Sensoren zurück: Widget-id → entity_id. */
function collectEntityBindings(doc: Document): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, evKey] of [['binary_sensor', 'on_state'], ['sensor', 'on_value']] as const) {
    const seq = doc.get(key);
    if (!isSeq(seq)) continue;
    for (const it of (seq as YAMLSeq).items) {
      if (!isMap(it)) continue;
      const id = it.get('id');
      if (id == null || !/__state$/.test(String(id))) continue;
      const ent = it.get('entity_id');
      if (ent == null) continue;
      let targetId = String(id).replace(/__state$/, '');
      const ev = it.get(evKey);
      if (isSeq(ev) && ev.items.length && isMap(ev.items[0])) {
        // Aktion kann lvgl.widget.update ODER typspezifisch (lvgl.arc.update, …) sein.
        const action = ev.items[0] as YAMLMap;
        for (const pair of action.items) {
          const k = pair.key instanceof Scalar ? String(pair.key.value) : String(pair.key);
          if (/^lvgl\.\w+\.update$/.test(k) && isMap(pair.value) && (pair.value as YAMLMap).get('id') != null) {
            targetId = String((pair.value as YAMLMap).get('id'));
            break;
          }
        }
      }
      map.set(targetId, String(ent));
    }
  }
  // Lokale Bindungen zurücklesen: Komponente mit lvgl.*.update-Aktion → Widget-Entity = deren id.
  for (const section of LOCAL_SECTIONS) {
    const seq = doc.get(section);
    if (!isSeq(seq)) continue;
    for (const comp of (seq as YAMLSeq).items) {
      if (!isMap(comp)) continue;
      const compId = (comp as YAMLMap).get('id');
      // `<id>__state` sind die HA-verwalteten Sensoren – die wurden oben schon gelesen.
      if (compId == null || /__state$/.test(String(compId))) continue;
      for (const trig of LOCAL_TRIGGERS[section] ?? []) {
        const acts = (comp as YAMLMap).get(trig);
        if (!isSeq(acts)) continue;
        for (const it of (acts as YAMLSeq).items) {
          if (!isMap(it)) continue;
          for (const pair of (it as YAMLMap).items) {
            const k = pair.key instanceof Scalar ? String(pair.key.value) : String(pair.key);
            if (/^lvgl\.\w+\.update$/.test(k) && isMap(pair.value)) {
              const wid = (pair.value as YAMLMap).get('id');
              if (wid != null) map.set(String(wid), String(compId));
            }
          }
        }
      }
    }
  }

  // Button-Bindung aus dem on_press-Toggle zurücklesen (Buttons haben keinen __state-Sensor).
  const walkPress = (seq: YAMLSeq | null) => {
    if (!seq) return;
    for (const it of seq.items) {
      const inner = innerOf(it);
      if (!inner) continue;
      const op = inner.get('on_press');
      const id = inner.get('id');
      if (id != null && isSeq(op) && op.items.length && isMap(op.items[0])) {
        const first = op.items[0] as YAMLMap;
        // HA: homeassistant.action → data.entity_id
        const act = first.get('homeassistant.action');
        const ent = isMap(act) ? (act as YAMLMap).get('data') : null;
        const entId = isMap(ent) ? (ent as YAMLMap).get('entity_id') : null;
        if (entId != null) map.set(String(id), String(entId));
        else {
          // Lokal: `<sektion>.toggle: <component_id>`
          for (const pair of first.items) {
            const k = pair.key instanceof Scalar ? String(pair.key.value) : String(pair.key);
            const m = k.match(/^(\w+)\.toggle$/);
            if (m && LOCAL_TOGGLEABLE.has(m[1]) && pair.value != null) {
              const v = pair.value instanceof Scalar ? String(pair.value.value) : String(pair.value);
              if (v) map.set(String(id), v);
            }
          }
        }
      }
      const w = inner.get('widgets');
      if (isSeq(w)) walkPress(w as YAMLSeq);
    }
  };
  for (const s of allWidgetSeqs(doc)) walkPress(s);
  return map;
}

// ---------- MDI-Font-Glyphen automatisch mitführen -----------------------

/** True, wenn der Codepoint im MDI-Bereich liegt (Plane 15 PUA, U+F0000..U+FFFFF). */
function isMdiCodepoint(cp: number): boolean {
  return cp >= 0xf0000 && cp <= 0xfffff;
}

const MDI_DEFAULT_FILE =
  'https://github.com/Templarian/MaterialDesign-Webfont/raw/master/fonts/materialdesignicons-webfont.ttf';

interface MdiFont { map: YAMLMap; id: string; size: number }

/** True, wenn diese Font-Definition die MDI-Webfont lädt. */
function isMdiFontMap(it: YAMLMap): boolean {
  const file = String(it.get('file') ?? '').toLowerCase();
  const id = String(it.get('id') ?? '').toLowerCase();
  return file.includes('materialdesign') || file.includes('mdi') || id.includes('mdi');
}

/** Alle MDI-Font-Definitionen (es kann pro Icon-Größe eine geben). */
function findMdiFonts(doc: Document): MdiFont[] {
  const fonts = doc.get('font');
  if (!isSeq(fonts)) return [];
  const out: MdiFont[] = [];
  for (const it of (fonts as YAMLSeq).items) {
    if (!isMap(it) || !isMdiFontMap(it)) continue;
    // ESPHome-Default für font.size ist 20.
    out.push({ map: it, id: String(it.get('id') ?? ''), size: Number(it.get('size')) || 20 });
  }
  return out;
}

/** Hängt fehlende Glyphen an die `glyphs`-Liste einer Font an. */
function addGlyphs(font: YAMLMap, glyphs: Set<string>) {
  let seq = font.get('glyphs');
  if (!isSeq(seq)) {
    seq = new YAMLSeq();
    font.set('glyphs', seq);
  }
  const gseq = seq as YAMLSeq;
  const have = new Set(gseq.items.map((g) => (g instanceof Scalar ? String(g.value) : String(g))));
  for (const ch of glyphs) {
    if (have.has(ch)) continue;
    const s = new Scalar(ch);
    s.type = Scalar.QUOTE_DOUBLE; // wie die bestehenden Glyphen quotieren
    gseq.items.push(s);
    have.add(ch);
  }
}

/**
 * Sorgt dafür, dass MDI-Icons am echten Gerät in der **richtigen Größe** rendern.
 *
 * ESPHome backt die Icon-Größe in die Font-Ressource (`font: size:`), nicht ins Widget.
 * Ein Icon-Label braucht daher zwingend eine MDI-Font *mit passender Größe*:
 *  - zeigt ein Icon-Label auf eine Nicht-MDI-Font (z. B. weil die KI dort eine Textfont
 *    eingetragen hat), wird es auf eine vorhandene MDI-Font umgebogen – sonst rendert das
 *    Gerät □ oder Winzlinge;
 *  - nur wenn die Größe im Editor *tatsächlich geändert* wurde (Modellgröße ≠ Größe der
 *    aktuell referenzierten Font), wird eine MDI-Font dieser Größe erzeugt
 *    (`studio_mdi_<size>`). Ohne diesen Vergleich würden die Katalog-Defaults, die beim
 *    Import immer gesetzt sind, jedem Icon eine neue Größe aufzwingen;
 *  - die benutzten Glyphen landen in genau der Font, die das Label auch verwendet.
 */
function ensureMdiFonts(doc: Document, fontSizeById: Map<string, number>) {
  const mdiFonts = findMdiFonts(doc);
  const byId = new Map(mdiFonts.map((f) => [f.id, f]));
  const bySize = new Map<number, MdiFont>();
  for (const f of mdiFonts) if (f.size && !bySize.has(f.size)) bySize.set(f.size, f);
  const fallback = mdiFonts[0] ?? null;
  const baseFile = fallback ? String(fallback.map.get('file') ?? MDI_DEFAULT_FILE) : MDI_DEFAULT_FILE;
  const docFontSizes = parseFontSizes(doc); // alle Fonts (auch Textfonts) → Größe

  const fontSeq = isSeq(doc.get('font')) ? (doc.get('font') as YAMLSeq) : null;
  const created = new Map<number, MdiFont>();
  const glyphsPerFont = new Map<string, Set<string>>(); // Font-id → benutzte Glyphen
  const usedStudio = new Set<string>();

  /** Liefert die MDI-Font der gewünschten Größe und legt sie bei Bedarf an. */
  const mdiForSize = (size: number): MdiFont => {
    const hit = bySize.get(size) ?? created.get(size);
    if (hit) return hit;
    const seqM = fontSeq ?? new YAMLSeq();
    if (!fontSeq) doc.set('font', seqM);
    const id = `studio_mdi_${size}`;
    const map = doc.createNode({ file: baseFile, id, size, bpp: 4 }) as YAMLMap;
    seqM.items.push(map);
    const f: MdiFont = { map, id, size };
    created.set(size, f);
    byId.set(id, f);
    return f;
  };

  const walk = (seq: YAMLSeq | null) => {
    if (!seq) return;
    for (const it of seq.items) {
      const inner = innerOf(it);
      if (!inner) continue;
      const t = inner.get('text');
      if (typeof t === 'string') {
        const glyphs = new Set<string>();
        for (const ch of t) {
          const cp = ch.codePointAt(0);
          if (cp != null && isMdiCodepoint(cp)) glyphs.add(ch);
        }
        if (glyphs.size) {
          const wid = inner.get('id');
          const wanted = wid != null ? fontSizeById.get(String(wid)) : undefined;
          const current = inner.get('text_font');
          const currentId = current != null ? String(current) : '';
          const currentMdi = byId.get(currentId);
          // Nur eine im Editor wirklich geänderte Größe erzwingt eine neue Font.
          const currentSize = docFontSizes.get(currentId);
          const resized = wanted != null && currentSize != null && Math.round(wanted) !== currentSize;
          // Reihenfolge wichtig: Ist eine Größe gewünscht, gewinnt sie IMMER. Vorher fiel ein
          // neues Icon (noch ohne text_font) auf irgendeine vorhandene MDI-Font zurück –
          // das Icon war auf dem Gerät dann z. B. 22px statt der eingestellten 32px.
          // mdiForSize nutzt eine passende vorhandene Font wieder, legt sonst eine an.
          const target =
            resized ? mdiForSize(Math.round(wanted!))
            : currentMdi ?? (wanted != null ? mdiForSize(Math.round(wanted)) : fallback ?? mdiForSize(20));
          if (currentId !== target.id) inner.set('text_font', target.id);
          if (/^studio_mdi_\d+$/.test(target.id)) usedStudio.add(target.id);
          const acc = glyphsPerFont.get(target.id) ?? new Set<string>();
          for (const ch of glyphs) acc.add(ch);
          glyphsPerFont.set(target.id, acc);
        }
      }
      const w = inner.get('widgets');
      if (isSeq(w)) walk(w as YAMLSeq);
    }
  };
  for (const s of allWidgetSeqs(doc)) walk(s);

  for (const [id, glyphs] of glyphsPerFont) {
    const f = byId.get(id);
    if (f) addGlyphs(f.map, glyphs);
  }

  // Verwaiste automatisch erzeugte MDI-Fonts wieder entfernen.
  const seqM = isSeq(doc.get('font')) ? (doc.get('font') as YAMLSeq) : null;
  if (seqM) {
    seqM.items = seqM.items.filter((it) => {
      const id = isMap(it) ? String(it.get('id') ?? '') : '';
      return !(/^studio_mdi_\d+$/.test(id) && !usedStudio.has(id));
    });
  }
}

// ---------- Schriftgrößen → text_font-Ressourcen ------------------------------

/** Sammelt font_size je (nested) Text-Widget-id aus dem Modell (Button → <id>__lbl). */
function collectFontSizes(nodes: WidgetNode[], acc: Map<string, number>) {
  for (const n of nodes) {
    const fs = Number(n.props.font_size);
    if (Number.isFinite(fs)) {
      if (n.type === 'button') acc.set(`${n.id}__lbl`, fs);
      else if (n.type === 'label' || n.type === 'icon' || n.type === 'checkbox') acc.set(n.id, fs);
    }
    collectFontSizes(n.children, acc);
  }
}

/**
 * Bildet die px-Schriftgröße des Editors auf eine `text_font`-Ressource ab, damit die
 * Größe am Gerät passt: vorhandene (Nicht-MDI-)Fonts mit gleicher Größe werden
 * wiederverwendet, fehlende als `studio_font_<size>` automatisch erzeugt.
 */
function applyFontMapping(doc: Document, fontSizeById: Map<string, number>) {
  if (fontSizeById.size === 0) return;
  const fonts = doc.get('font');
  const fontSeq = isSeq(fonts) ? (fonts as YAMLSeq) : null;

  const sizeToId = new Map<number, string>(); // vorhandene Nicht-MDI-Fonts (Größe → id)
  let baseFile = 'gfonts://Roboto';
  if (fontSeq) {
    for (const it of fontSeq.items) {
      if (!isMap(it)) continue;
      const file = String(it.get('file') ?? '').toLowerCase();
      const isMdi = file.includes('materialdesign') || file.includes('mdi');
      const size = Number(it.get('size'));
      const id = it.get('id');
      if (isMdi || id == null) continue;
      if (it.get('file') != null) baseFile = String(it.get('file'));
      if (Number.isFinite(size)) sizeToId.set(size, String(id));
    }
  }

  const docFontSizes = parseFontSizes(doc); // alle Fonts (auch MDI) → Größe
  const neededStudio = new Map<number, string>(); // Größe → studio_font_<size>
  const idForSize = (size: number): string => {
    const existing = sizeToId.get(size);
    if (existing) return existing;
    const id = `studio_font_${size}`;
    neededStudio.set(size, id);
    return id;
  };

  // text_font an den Widgets setzen (nur ohne bereits gesetzte Font, z. B. nicht bei MDI-Icons).
  const walk = (seq: YAMLSeq | null) => {
    if (!seq) return;
    for (const it of seq.items) {
      const inner = innerOf(it);
      if (!inner) continue;
      const id = inner.get('id');
      const size = id != null ? fontSizeById.get(String(id)) : undefined;
      if (size != null) {
        const cur = inner.get('text_font');
        const curId = cur != null ? String(cur) : '';
        const curSize = docFontSizes.get(curId);
        // Font setzen, wenn noch keine da ist ODER die eingestellte Größe von der
        // aktuellen Font abweicht. Ohne den zweiten Fall blieb eine im Editor geänderte
        // Schriftgröße wirkungslos – das Label behielt einfach seine alte Font.
        if (!curId || (curSize != null && Math.round(size) !== curSize)) {
          inner.set('text_font', idForSize(Math.round(size)));
        }
      }
      // WICHTIG: Auch bereits gesetzte studio_font_*-Referenzen als „noch benutzt" melden.
      // Sonst räumt die Bereinigung unten die Definition weg, obwohl ein Widget sie noch
      // referenziert → „Couldn't find ID 'studio_font_18'" beim Kompilieren.
      const cur = inner.get('text_font');
      const m = cur != null ? String(cur).match(/^studio_font_(\d+)$/) : null;
      if (m) neededStudio.set(Number(m[1]), m[0]);
      const w = inner.get('widgets');
      if (isSeq(w)) walk(w as YAMLSeq);
    }
  };
  for (const s of allWidgetSeqs(doc)) walk(s);

  // studio_font_<size>-Definitionen anlegen/aufräumen (idempotent).
  if (!fontSeq && neededStudio.size === 0) return;
  const seqM = fontSeq ?? new YAMLSeq();
  if (!fontSeq && neededStudio.size) doc.set('font', seqM);
  const existingIds = new Set(seqM.items.map((it) => (isMap(it) ? String(it.get('id')) : '')));
  for (const [size, id] of neededStudio) {
    if (!existingIds.has(id)) seqM.items.push(doc.createNode({ file: baseFile, id, size }) as YAMLMap);
  }
  // nicht mehr genutzte studio_font_* entfernen
  const usedStudio = new Set(neededStudio.values());
  seqM.items = seqM.items.filter((it) => {
    const id = isMap(it) ? String(it.get('id')) : '';
    return !(/^studio_font_\d+$/.test(id) && !usedStudio.has(id));
  });
}

/** Export einer einzelnen Seite (Kurzform von {@link screensToYaml}). */
export function screenToYaml(screen: Screen, baseYaml = ''): string {
  return screensToYaml([screen], baseYaml);
}

/**
 * Export ALLER Seiten (LVGL `pages:`) auf das Basis-YAML. Nicht verwaltete Inhalte
 * (Lambdas, Automationen, andere Komponenten) bleiben erhalten.
 */
export function screensToYaml(pages: Screen[], baseYaml = ''): string {
  const doc = parseDocument(baseYaml);
  const list = pages.length ? pages : [];
  const allChildren: WidgetNode[] = [];

  // Mehrere Seiten brauchen zwingend die `pages:`-Form (sonst stünde `lvgl.widgets`
  // daneben → ungültige Config und die alten Widgets wären nicht mehr zugeordnet).
  if (list.length > 1) migrateToPages(doc, list[0].id || 'main_page');

  list.forEach((screen, i) => {
    const seq = ensureWidgetsSeq(doc, i, screen.id);
    reconcile(seq, screen.children);
    const page = getPageMap(doc, i);
    if (page) {
      // Seiten-`id` aus dem Modell führen (Navigations-Aktionen verweisen darauf).
      if (screen.id) page.set('id', screen.id);
      if (screen.bg_color) setColor(page, 'bg_color', screen.bg_color);
      // Auch die Seite hat Theme-Padding und würde sonst ALLE Widgets verschieben; die
      // Editor-Bühne beginnt dagegen exakt bei 0/0. (Nur Style-Properties sind auf einer
      // Seite erlaubt – Widget-Optionen wie scrollbar_mode gehören hier NICHT hin.)
      if (page.get('pad_all') == null) page.set('pad_all', 0);
    }
    allChildren.push(...screen.children);
  });

  // Überzählige Seiten entfernen (das Modell ist maßgeblich – es hat alle importiert).
  const pseq = getPagesSeq(doc);
  if (pseq && list.length && pseq.items.length > list.length) {
    pseq.items = pseq.items.slice(0, list.length);
  }

  applyEntityBindings(doc, allChildren);
  applyImageSources(doc, allChildren);
  applyPageActions(doc, allChildren);
  applyMeterScales(doc, allChildren);
  // Reihenfolge wichtig: erst die Größen aus dem Modell sammeln, damit die Icons eine
  // MDI-Font *ihrer* Größe bekommen; danach die Textfonts für den Rest.
  const fontSizeById = new Map<string, number>();
  collectFontSizes(allChildren, fontSizeById);
  ensureMdiFonts(doc, fontSizeById);
  applyFontMapping(doc, fontSizeById);
  return doc.toString();
}

// ---------- Import: YAML → Modell -----------------------------------------

function firstDisplay(doc: Document): YAMLMap | null {
  const disp = doc.get('display');
  if (isSeq(disp) && disp.items.length && isMap(disp.items[0])) return disp.items[0] as YAMLMap;
  if (isMap(disp)) return disp;
  return null;
}

/** True, wenn die `rotation` eines Knotens 90 oder 270 ist (Grad-Symbol wird toleriert). */
function rotationIsOdd(node: YAMLMap | null): boolean {
  const rot = node ? parseInt(String(node.get('rotation') ?? '0'), 10) || 0 : 0;
  return rot === 90 || rot === 270;
}

/** Extrahiert "BREITExHÖHE" aus einem String (z. B. "320x480" oder "TTGO TDisplay 135x240"). */
function parseWxH(s: string): { w: number; h: number } | null {
  const m = s.match(/(\d+)\s*[x×]\s*(\d+)/i);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

/** Native Panel-Auflösung: aus `dimensions` (String/Map) oder aus dem `model`-Namen. */
function parseDisplayNative(disp: YAMLMap | null): { w: number; h: number } | null {
  if (!disp) return null;
  const dims = disp.get('dimensions');
  if (typeof dims === 'string') {
    const p = parseWxH(dims);
    if (p) return p;
  } else if (isMap(dims)) {
    const w = Number(dims.get('width')) || 0;
    const h = Number(dims.get('height')) || 0;
    if (w && h) return { w, h };
  }
  const model = disp.get('model');
  if (typeof model === 'string') {
    const p = parseWxH(model);
    if (p) return p;
  }
  return null;
}

/**
 * Bestimmt die Canvas-Größe: native Display-Auflösung (aus dimensions/model), gedreht per
 * Gesamt-Rotation (Display-Rotation XOR LVGL-Rotation) > Widget-Ausdehnung > Default 480×320.
 */
function detectScreenSize(doc: Document, children: WidgetNode[]): { width: number; height: number } {
  const disp = firstDisplay(doc);
  const native = parseDisplayNative(disp);
  if (native) {
    const lvgl = doc.get('lvgl');
    // Sowohl display.rotation als auch lvgl.rotation drehen das LVGL-Koordinatensystem.
    const swap = rotationIsOdd(disp) !== rotationIsOdd(isMap(lvgl) ? (lvgl as YAMLMap) : null);
    return swap ? { width: native.h, height: native.w } : { width: native.w, height: native.h };
  }

  let w = 0;
  let h = 0;
  for (const n of children) {
    w = Math.max(w, n.geometry.x + n.geometry.width);
    h = Math.max(h, n.geometry.y + n.geometry.height);
  }
  if (w >= 100 && h >= 100) {
    return { width: Math.ceil(w / 10) * 10, height: Math.ceil(h / 10) * 10 };
  }
  return { width: 480, height: 320 };
}

/** Widgets-Sequenz der Seite `i` (fällt bei einseitigen Configs auf `lvgl.widgets` zurück). */
function getWidgetsSeq(doc: Document, i = 0): YAMLSeq | null {
  const lvgl = doc.get('lvgl');
  if (!isMap(lvgl)) return null;
  const pages = lvgl.get('pages');
  if (isSeq(pages) && pages.items.length > i && isMap(pages.items[i])) {
    const w = (pages.items[i] as YAMLMap).get('widgets');
    if (isSeq(w)) return w as YAMLSeq;
    return null;
  }
  if (i > 0) return null;
  const topW = lvgl.get('widgets');
  return isSeq(topW) ? (topW as YAMLSeq) : null;
}

function collectIds(seq: YAMLSeq | null, acc: Set<string>) {
  if (!seq) return;
  for (const it of seq.items) {
    const inner = innerOf(it);
    const id = inner?.get('id');
    if (id != null) acc.add(String(id));
    const w = inner?.get('widgets');
    if (isSeq(w)) collectIds(w as YAMLSeq, acc);
  }
}

function genId(type: WidgetType, used: Set<string>): string {
  const prefix = CATALOG_BY_TYPE[type]?.prefix ?? type;
  let n = 1;
  while (used.has(`${prefix}_${n}`)) n += 1;
  return `${prefix}_${n}`;
}

/** Liest `lvgl.style_definitions` in eine Map id → Style-Map (für Style-Referenzen). */
function parseStyleDefinitions(doc: Document): Map<string, YAMLMap> {
  const map = new Map<string, YAMLMap>();
  const lvgl = doc.get('lvgl');
  if (!isMap(lvgl)) return map;
  const defs = lvgl.get('style_definitions');
  if (!isSeq(defs)) return map;
  for (const it of defs.items) {
    if (isMap(it)) {
      const id = it.get('id');
      if (id != null) map.set(String(id), it);
    }
  }
  return map;
}

/** IDs der `styles`-Referenz eines Widgets (String oder Liste). */
function styleIdsOf(inner: YAMLMap): string[] {
  const s = inner.get('styles');
  if (typeof s === 'string') return [s];
  if (isSeq(s)) {
    return s.items
      .map((it) => (it instanceof Scalar ? String(it.value) : String(it)))
      .filter(Boolean);
  }
  return [];
}

/** Wert eines Keys: erst inline am Widget, sonst aus den referenzierten Styles. */
function resolveRaw(inner: YAMLMap, styleIds: string[], styleMap: Map<string, YAMLMap>, yamlKey: string): unknown {
  const inline = inner.get(yamlKey);
  if (inline != null) return inline;
  for (const sid of styleIds) {
    const v = styleMap.get(sid)?.get(yamlKey);
    if (v != null) return v;
  }
  return null;
}

/** Font-Definitionen (id → size) für die text_font → font_size-Rückabbildung. */
function parseFontSizes(doc: Document): Map<string, number> {
  const map = new Map<string, number>();
  const fonts = doc.get('font');
  if (isSeq(fonts)) {
    for (const it of (fonts as YAMLSeq).items) {
      if (!isMap(it)) continue;
      const id = it.get('id');
      const size = Number(it.get('size'));
      if (id != null && Number.isFinite(size)) map.set(String(id), size);
    }
  }
  return map;
}

function buildNode(item: unknown, used: Set<string>, styleMap: Map<string, YAMLMap>, fontSizes: Map<string, number>): WidgetNode | null {
  const key = firstKey(item);
  if (!key || !(key in YAML_TO_TYPE)) return null; // unbekannter Typ → nicht ins Modell
  const type = YAML_TO_TYPE[key];
  const inner = innerOf(item);
  if (!inner) return null;

  const rawId = inner.get('id');
  const id = rawId == null ? genId(type, used) : String(rawId);
  if (rawId == null) inner.set('id', id); // ID ins Dokument injizieren, damit Round-Trip stabil bleibt
  used.add(id);

  const styleIds = styleIdsOf(inner);
  const cat = CATALOG_BY_TYPE[type];
  const geometry = {
    x: numOr(inner.get('x'), 0),
    y: numOr(inner.get('y'), 0),
    width: numOr(inner.get('width'), cat.defaultSize.width),
    height: numOr(inner.get('height'), cat.defaultSize.height),
  };

  const props: WidgetProps = { ...cat.defaultProps() };

  // Nicht-numerische Größen (z. B. "100%", SIZE_CONTENT) merken, damit sie beim Export
  // unverändert zurückgeschrieben werden. Sonst würde aus `width: 100%` eine feste
  // Pixelzahl (der Katalog-Default) – die responsive Angabe wäre dauerhaft zerstört.
  const rawW = inner.get('width');
  const rawH = inner.get('height');
  if (rawW != null && !Number.isFinite(Number(rawW))) props.width_raw = String(rawW);
  if (rawH != null && !Number.isFinite(Number(rawH))) props.height_raw = String(rawH);
  const tm = TYPE_MAP[type];
  for (const pm of [...tm.props, ...UNIVERSAL_PROPS]) {
    // Wert erst inline, dann aus referenzierten style_definitions.
    const raw = resolveRaw(inner, styleIds, styleMap, pm.yaml);
    if (raw == null) continue;
    const cv = convertIn(pm.kind, raw);
    if (cv !== undefined) props[pm.prop] = cv as never;
  }
  // Arc/Meter-Bogenfarben & -form aus den echten LVGL-Keys lesen (Fallback: alte bg_color-Keys).
  if (type === 'arc' || type === 'meter') {
    const track = inner.get('arc_color') ?? inner.get('bg_color');
    if (track != null) props.bg_color = espColorToHex(track);
    const indMap = inner.get('indicator');
    const indColor = isMap(indMap) ? (indMap.get('arc_color') ?? indMap.get('bg_color')) : null;
    if (indColor != null) props.color = espColorToHex(indColor);
    for (const k of ['arc_width', 'start_angle', 'end_angle'] as const) {
      const v = inner.get(k);
      if (v != null && Number.isFinite(Number(v))) props[k] = Number(v);
    }
  }

  // Toggle-Button: checked-Zustands-Style zurücklesen.
  if (type === 'button') {
    const ck = inner.get('checked');
    if (isMap(ck)) {
      const cm = ck as YAMLMap;
      if (cm.get('bg_color') != null) props.checked_bg_color = espColorToHex(cm.get('bg_color'));
      const co = convertIn('percent', cm.get('bg_opa'));
      if (co !== undefined && cm.get('bg_opa') != null) props.checked_bg_opa = co as number;
    }
  }

  // Anfangszustand von Switch/Checkbox aus `state: { checked: … }` zurücklesen.
  if (type === 'switch' || type === 'checkbox') {
    const st = inner.get('state');
    if (isMap(st)) props.checked = (st as YAMLMap).get('checked') === true;
  }

  // Stylebare Parts (indicator/knob) zurücklesen; Indicator-Füllfarbe kommt aus `color`.
  for (const part of STYLEABLE_PARTS[type] ?? []) {
    readPart(inner, type, part, props, part === 'indicator' ? INDICATOR_SKIP : undefined);
  }

  // Spinner: Farbe/Breite aus dem indicator-Part zurücklesen.
  if (type === 'spinner') {
    const ind = inner.get('indicator');
    if (isMap(ind)) {
      const im = ind as YAMLMap;
      if (im.get('arc_color') != null) props.color = espColorToHex(im.get('arc_color'));
      const aw = im.get('arc_width');
      if (aw != null && Number.isFinite(Number(aw))) props.arc_width = Number(aw);
    }
  }

  // Feature 1/3: Text-Style, Füllfarbe (Indicator) und Knob zurücklesen.
  if (TEXT_TYPES.has(type)) {
    for (const pm of TEXT_PROPS) {
      const raw = resolveRaw(inner, styleIds, styleMap, pm.yaml);
      if (raw == null) continue;
      const cv = convertIn(pm.kind, raw);
      if (cv !== undefined) props[pm.prop] = cv as never;
    }
    // text_font → font_size (px) zurückabbilden.
    const tf = inner.get('text_font');
    if (tf != null && fontSizes.has(String(tf))) props.font_size = fontSizes.get(String(tf));
  }
  if (['slider', 'bar', 'switch'].includes(type)) {
    const ind = inner.get('indicator');
    if (isMap(ind) && (ind as YAMLMap).get('bg_color') != null) {
      props.color = espColorToHex((ind as YAMLMap).get('bg_color'));
    }
    // Verlauf im Indicator → grad_part=indicator ins Modell heben.
    if (isMap(ind) && (ind as YAMLMap).get('bg_grad_color') != null) {
      props.grad_part = 'indicator';
      props.bg_grad_color = espColorToHex((ind as YAMLMap).get('bg_grad_color'));
      const gd = (ind as YAMLMap).get('bg_grad_dir');
      if (gd != null) props.bg_grad_dir = String(gd);
    }
  }

  // `align` fürs Rendering übernehmen (bleibt beim Export als unverwalteter Key erhalten).
  const align = resolveRaw(inner, styleIds, styleMap, 'align');
  if (typeof align === 'string') props.align = align;

  // `layout` (Flex/Grid) fürs Rendering übernehmen (unverwaltet → bleibt beim Export erhalten).
  const layout = inner.get('layout');
  if (isMap(layout)) {
    const seqToCsv = (k: string) => {
      const v = layout.get(k);
      if (!isSeq(v)) return undefined;
      return (v as YAMLSeq).items
        .map((it) => (it instanceof Scalar ? String(it.value) : String(it)))
        .join(', ');
    };
    props.layout = {
      type: layout.get('type') != null ? String(layout.get('type')) : '',
      flex_flow: layout.get('flex_flow') != null ? String(layout.get('flex_flow')) : undefined,
      flex_align_main: layout.get('flex_align_main') != null ? String(layout.get('flex_align_main')) : undefined,
      flex_align_cross: layout.get('flex_align_cross') != null ? String(layout.get('flex_align_cross')) : undefined,
      flex_align_track: layout.get('flex_align_track') != null ? String(layout.get('flex_align_track')) : undefined,
      pad_column: layout.get('pad_column'),
      pad_row: layout.get('pad_row'),
      grid_columns: seqToCsv('grid_columns'),
      grid_rows: seqToCsv('grid_rows'),
    };
  }

  let children: WidgetNode[] = [];
  if (tm.textAsChildLabel) {
    // Text aus verschachteltem Label ins Button-Prop heben; Label nicht als Kind zeigen.
    const w = inner.get('widgets');
    if (isSeq(w)) {
      const lbl = (w as YAMLSeq).items.find((it) => firstKey(it) === 'label');
      const im = lbl ? innerOf(lbl) : null;
      if (im) {
        if (im.get('text') != null) props.text = String(im.get('text'));
        if (im.get('text_color') != null) props.text_color = espColorToHex(im.get('text_color'));
        const tf = im.get('text_font');
        if (tf != null && fontSizes.has(String(tf))) props.font_size = fontSizes.get(String(tf));
        // Text-Style des Labels ins Button-Modell heben.
        for (const pm of TEXT_PROPS) {
          const raw = im.get(pm.yaml);
          if (raw == null) continue;
          const cv = convertIn(pm.kind, raw);
          if (cv !== undefined) props[pm.prop] = cv as never;
        }
        im.set('id', id + '__lbl'); // normalisieren, damit der Export denselben Knoten trifft
      }
    }
  } else {
    const w = inner.get('widgets');
    if (isSeq(w)) {
      children = (w as YAMLSeq).items
        .map((it) => buildNode(it, used, styleMap, fontSizes))
        .filter((n): n is WidgetNode => n !== null);
    }
  }

  return { id, type, geometry, props, children };
}

/** Ein Widget-Knoten wie im YAML vorgefunden (Typ, id, gesetzte Keys) – rekursiv. */
export interface WidgetKeyInfo {
  type: string;
  id?: string;
  keys: string[];
}

function walkWidgets(seq: YAMLSeq | null, out: WidgetKeyInfo[]) {
  if (!seq) return;
  for (const it of seq.items) {
    const type = firstKey(it);
    const inner = innerOf(it);
    if (!type || !inner) continue;
    const keys = inner.items.map((p) =>
      p.key instanceof Scalar ? String(p.key.value) : String(p.key),
    );
    const id = inner.get('id');
    out.push({ type, id: id != null ? String(id) : undefined, keys });
    walkWidgets(getSeq(inner, 'widgets'), out);
  }
}

/** Listet alle (auch verschachtelten) LVGL-Widgets eines YAML mit ihren gesetzten Keys. */
export function listWidgets(text: string): WidgetKeyInfo[] {
  const doc = parseDocument(text);
  const out: WidgetKeyInfo[] = [];
  for (const s of allWidgetSeqs(doc)) walkWidgets(s, out);
  return out;
}

/** Import einer einzelnen (der ersten) Seite – Kurzform von {@link yamlToScreens}. */
export function yamlToScreen(text: string): { screen: Screen; yaml: string } {
  const { pages, yaml } = yamlToScreens(text);
  return { screen: pages[0], yaml };
}

/** Importiert ALLE LVGL-Seiten (`pages:`) als Editor-Modell. */
export function yamlToScreens(text: string): { pages: Screen[]; yaml: string } {
  const doc = parseDocument(text);
  const styleMap = parseStyleDefinitions(doc);
  const fontSizes = parseFontSizes(doc);

  // IDs dokumentweit sammeln, damit generierte IDs seitenübergreifend eindeutig bleiben.
  const used = new Set<string>();
  const seqs = allWidgetSeqs(doc);
  for (const s of seqs) collectIds(s, used);

  const n = Math.max(1, seqs.length);
  const pages: Screen[] = [];
  const allChildren: WidgetNode[] = [];
  for (let i = 0; i < n; i++) {
    const seq = getWidgetsSeq(doc, i);
    const children = seq
      ? seq.items.map((it) => buildNode(it, used, styleMap, fontSizes)).filter((c): c is WidgetNode => c !== null)
      : [];
    allChildren.push(...children);
    const pageMap = getPageMap(doc, i);
    const pageId = pageMap?.get('id');
    const bg = pageMap?.get('bg_color');
    pages.push({
      id: pageId != null ? String(pageId) : i === 0 ? 'main_page' : `page_${i + 1}`,
      name: pageId != null ? String(pageId) : `Seite ${i + 1}`,
      width: 0, // wird unten gesetzt (Displaygröße gilt für alle Seiten)
      height: 0,
      bg_color: bg != null ? espColorToHex(bg) : '#111827',
      children,
    });
  }

  // Entity-Bindungen aus den `__state`-Sensoren zurück ins Modell übernehmen.
  const bindings = collectEntityBindings(doc);
  const imgSources = collectImageSources(doc);
  const pageActions = collectPageActions(doc);
  const meterScales = collectMeterScales(doc);
  const applyBack = (nodes: WidgetNode[]) => {
    for (const nd of nodes) {
      const e = bindings.get(nd.id);
      if (e) nd.entity = e;
      if (nd.type === 'image') {
        const cfg = imgSources.get(nd.id);
        if (cfg) nd.props = { ...nd.props, ...cfg };
      }
      if (nd.type === 'meter') {
        const cfg = meterScales.get(nd.id);
        if (cfg) nd.props = { ...nd.props, ...cfg };
      }
      const pa = pageActions.get(nd.id);
      if (pa) nd.props = { ...nd.props, page_action: pa };
      applyBack(nd.children);
    }
  };
  for (const p of pages) applyBack(p.children);

  const { width, height } = detectScreenSize(doc, allChildren);
  for (const p of pages) {
    p.width = width;
    p.height = height;
    resolveRelativeSizes(p.children, width, height);
  }
  return { pages, yaml: doc.toString() };
}

/**
 * Rechnet prozentuale Größen (`width: 100%`) in Pixel um – relativ zum Elternteil bzw.
 * zur Seite. Der berechnete Wert wird zusätzlich gemerkt (`*_raw_px`), damit der Export
 * erkennt, ob der Nutzer die Größe im Editor wirklich geändert hat.
 */
function resolveRelativeSizes(nodes: WidgetNode[], parentW: number, parentH: number) {
  for (const n of nodes) {
    const pct = (raw: unknown, base: number): number | null => {
      const m = String(raw ?? '').trim().match(/^(-?\d+(?:\.\d+)?)\s*%$/);
      return m ? Math.round((Number(m[1]) / 100) * base) : null;
    };
    const w = pct(n.props.width_raw, parentW);
    if (w != null) {
      n.geometry.width = w;
      n.props.width_raw_px = w;
    }
    const h = pct(n.props.height_raw, parentH);
    if (h != null) {
      n.geometry.height = h;
      n.props.height_raw_px = h;
    }
    if (n.children.length) resolveRelativeSizes(n.children, n.geometry.width, n.geometry.height);
  }
}

/** Liest die Seiten-Navigations-Aktionen (`on_press: lvgl.page.*`) zurück: Widget-id → Aktion. */
function collectPageActions(doc: Document): Map<string, string> {
  const map = new Map<string, string>();
  forEachWidgetMap(allWidgetSeqs(doc), (inner, id) => {
    const a = readPageAction(inner);
    if (a) map.set(id, a);
  });
  return map;
}
