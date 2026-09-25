/**
 * Auswertung eines Addon-Manifests: Kontext aufbauen, Outputs berechnen, Widgets und
 * YAML-Fragment auflösen, Manifeste validieren.
 *
 * Alles hier ist **pur** (keine Stores, kein DOM) – damit gut testbar und in Sidebar,
 * Editor und Tests identisch nutzbar.
 */

import type { WidgetType } from '../lvgl/types';
import { CATALOG_BY_TYPE } from '../lvgl/catalog';
import type {
  AddonInstance,
  AddonManifest,
  Condition,
  FieldSpec,
  OutputSpec,
  ResolvedWidget,
  WidgetSpec,
} from './types';
import { ADDON_API_VERSION, ADDON_ID_PREFIX, ADDON_ROOT_KEY } from './types';
import { calc, getPath, render, renderNumber, renderValue } from './template';
import type { TemplateContext } from './template';
import { computeBBox, formatBBoxSWNE, formatBBoxWSEN } from './geo';
import { tr } from '@/shared/i18n';

/**
 * Tiefe Kopie eines Werts aus dem Manifest.
 *
 * Bewusst NICHT `structuredClone`: Manifeste liegen im Pinia-Store, ihre Werte sind also
 * reaktive Proxies – und `structuredClone` wirft darauf `DataCloneError`. Das ließ das
 * Anlegen einer Instanz (und damit das Konfig-Popup) kommentarlos scheitern.
 */
function clone<T>(v: T): T {
  return v == null || typeof v !== 'object' ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Standardwerte aller Felder (auch versteckter – dann bleibt das Template auswertbar). */
export function defaultConfig(fields: FieldSpec[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.kind === 'note') continue;
    out[f.key] = f.default !== undefined ? clone(f.default) : defaultForKind(f);
  }
  return out;
}

function defaultForKind(f: FieldSpec): unknown {
  switch (f.kind) {
    case 'number':
    case 'slider':
      return f.min ?? 0;
    case 'checkbox':
      return false;
    case 'color':
      return '#ff0000';
    case 'size':
      return { width: 200, height: 150 };
    case 'map':
      // Mitte Deutschlands als neutraler Startpunkt (wie im Esp32Weather-Webtool).
      return { lat: 51.1657, lon: 10.4515, zoom: 6, spanKm: f.spanKm?.default ?? 30 };
    case 'select':
      return f.options?.[0]?.value ?? '';
    default:
      return '';
  }
}

/** Fehlende Schlüssel aus den Defaults ergänzen (nach Addon-Updates mit neuen Feldern). */
export function withDefaults(
  fields: FieldSpec[] = [],
  config: Record<string, unknown> = {},
): Record<string, unknown> {
  const base = defaultConfig(fields);
  const out = { ...base, ...config };
  // Verschachtelte Objekt-Werte (size/map) einzeln auffüllen.
  for (const f of fields) {
    const d = base[f.key];
    const v = out[f.key];
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      out[f.key] = { ...(d as object), ...(v && typeof v === 'object' ? (v as object) : {}) };
    }
  }
  return out;
}

/** Prüft eine `visibleIf`-Bedingung. Pfade ohne Punkt beziehen sich auf `config.`. */
export function testCondition(cond: Condition | undefined, ctx: TemplateContext): boolean {
  if (!cond) return true;
  const path = cond.key.includes('.') ? cond.key : `config.${cond.key}`;
  const v = getPath(ctx, path);
  if (cond.equals !== undefined) return v === cond.equals;
  if (cond.not !== undefined) return v !== cond.not;
  if (cond.in) return cond.in.includes(v);
  if (cond.truthy !== undefined) return cond.truthy ? !!v : !v;
  return !!v;
}

/** Berechnet alle `outputs` in Deklarationsreihenfolge (spätere sehen frühere als `out.*`). */
export function computeOutputs(
  specs: OutputSpec[] = [],
  ctx: TemplateContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const full = { ...ctx, out };
  for (const s of specs) {
    switch (s.kind) {
      case 'template':
        out[s.key] = render(s.value, full);
        break;
      case 'calc': {
        const n = calc(s.expr, full);
        out[s.key] = s.digits != null ? Number(n.toFixed(s.digits)) : n;
        break;
      }
      case 'switch': {
        const key = render(s.on.includes('{{') ? s.on : `{{ ${s.on} }}`, full);
        const tpl = s.cases[key] ?? s.fallback ?? '';
        out[s.key] = render(tpl, full);
        break;
      }
      case 'bbox': {
        const box = computeBBox(
          renderNumber(s.lat, full),
          renderNumber(s.lon, full),
          renderNumber(s.spanKm, full, 10),
          renderNumber(s.width, full, 1),
          renderNumber(s.height, full, 1),
        );
        out[s.key] =
          s.order === 'swne' ? formatBBoxSWNE(box, s.digits ?? 6) : formatBBoxWSEN(box, s.digits ?? 6);
        break;
      }
    }
  }
  return out;
}

/**
 * Vollständiger Auswertungskontext einer Instanz:
 * `config` (Instanz-Konfiguration), `settings` (Installations-Einstellungen),
 * `out` (abgeleitete Werte), `iid` (Instanz-id) und `addon` (Manifest-Metadaten).
 */
export function buildContext(
  manifest: AddonManifest,
  instance: Pick<AddonInstance, 'iid' | 'config'> & { widgetIds?: Record<string, string> },
  settings: Record<string, unknown> = {},
): TemplateContext {
  const config = withDefaults(manifest.fields, instance.config);
  const settingValues = withDefaults(manifest.settings, settings);
  const base: TemplateContext = {
    config,
    settings: settingValues,
    iid: instance.iid,
    // Erzeugte Widget-ids (`{{ widgets.<key> }}`) – erst nach dem Anlegen gefüllt,
    // deshalb wird das YAML-Fragment zweistufig gerendert (siehe useAddons.apply).
    widgets: instance.widgetIds ?? {},
    addon: { id: manifest.id, name: manifest.name, version: manifest.version },
  };
  const out = computeOutputs(manifest.outputs, base);
  return { ...base, out };
}

/** Flacht den Widget-Baum eines Manifests unter Beachtung von `visibleIf` auf. */
function flattenSpecs(
  specs: WidgetSpec[] = [],
  ctx: TemplateContext,
  parentKey?: string,
  acc: { spec: WidgetSpec; parentKey?: string }[] = [],
): { spec: WidgetSpec; parentKey?: string }[] {
  for (const s of specs) {
    if (!testCondition(s.visibleIf, ctx)) continue;
    acc.push({ spec: s, parentKey });
    if (s.children?.length) flattenSpecs(s.children, ctx, s.key, acc);
  }
  return acc;
}

/**
 * Umhüllt alle Top-Level-Widgets einer Instanz mit einem synthetischen, unsichtbaren
 * `obj`-Container (Schlüssel `ADDON_ROOT_KEY`), damit man die gesamte Instanz durch
 * Ziehen des Containers auf einmal verschieben kann – LVGL-Kindkoordinaten sind relativ
 * zum Elternteil, ein Drag des Containers bewegt daher automatisch alles Verschachtelte
 * mit (siehe `document.ts#applyAddonWidgets`, das den Container beim Rendern/Draggen
 * genauso behandelt wie jeden anderen `obj`).
 *
 * Bereits explizit verschachtelte Widgets (eigenes `children:` im Manifest) bleiben
 * unangetastet – nur was bisher lose auf der Seite gelandet wäre, wird gruppiert.
 */
function wrapInRoot(list: ResolvedWidget[]): ResolvedWidget[] {
  const topLevel = list.filter((w) => !w.parentKey);
  if (topLevel.length === 0) return list;

  const minX = Math.min(...topLevel.map((w) => w.x ?? 0));
  const minY = Math.min(...topLevel.map((w) => w.y ?? 0));
  const maxX = Math.max(...topLevel.map((w) => (w.x ?? 0) + (w.width ?? 0)));
  const maxY = Math.max(...topLevel.map((w) => (w.y ?? 0) + (w.height ?? 0)));

  const root: ResolvedWidget = {
    key: ADDON_ROOT_KEY,
    type: 'obj',
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    // Reines Transportmittel fürs gemeinsame Verschieben – unsichtbar und ohne eigene
    // Interaktion mit dem Scroll-/Rahmen-Verhalten von LVGL.
    props: { bg_opa: 0, border_width: 0, scrollable: false },
    sizeFromConfig: true,
  };

  const rebased = list.map((w) =>
    w.parentKey
      ? w
      : { ...w, parentKey: ADDON_ROOT_KEY, x: (w.x ?? 0) - minX, y: (w.y ?? 0) - minY },
  );
  return [root, ...rebased];
}

/** Löst die Widgets einer Instanz vollständig auf (alle Platzhalter ersetzt). */
export function resolveWidgets(manifest: AddonManifest, ctx: TemplateContext): ResolvedWidget[] {
  const flat = flattenSpecs(manifest.widgets, ctx).map(({ spec, parentKey }) => {
    const entry = CATALOG_BY_TYPE[spec.type as WidgetType];
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(spec.props ?? {})) props[k] = renderValue(v, ctx);
    const sizeFromConfig =
      typeof spec.width === 'string' && spec.width.includes('{{')
        ? true
        : typeof spec.height === 'string' && spec.height.includes('{{');
    return {
      key: spec.key,
      parentKey,
      type: spec.type,
      name: spec.name ? render(spec.name, ctx) : undefined,
      entity: spec.entity ? render(spec.entity, ctx).trim() : undefined,
      x: spec.x != null ? renderNumber(spec.x, ctx) : undefined,
      y: spec.y != null ? renderNumber(spec.y, ctx) : undefined,
      width: spec.width != null ? renderNumber(spec.width, ctx, entry?.defaultSize.width ?? 100) : undefined,
      height: spec.height != null ? renderNumber(spec.height, ctx, entry?.defaultSize.height ?? 100) : undefined,
      props,
      sizeFromConfig,
    };
  });
  return wrapInRoot(flat);
}

/** Rendert das Top-Level-YAML-Fragment des Addons (leer, wenn keines definiert ist). */
export function resolveYaml(manifest: AddonManifest, ctx: TemplateContext): string {
  if (!manifest.yaml) return '';
  return render(manifest.yaml, ctx).trim();
}

/** Rendert die Vorschau-URL des Popups. */
export function resolvePreviewUrl(manifest: AddonManifest, ctx: TemplateContext): string {
  if (!manifest.preview || manifest.preview.kind !== 'image') return '';
  const url = render(manifest.preview.url, ctx).trim();
  return /^https?:\/\//i.test(url) ? url : '';
}

// ---------------------------------------------------------------------------
// Validierung (wird beim Installieren angezeigt)
// ---------------------------------------------------------------------------

const FIELD_KINDS = new Set([
  'text', 'number', 'slider', 'select', 'remote-select', 'checkbox',
  'color', 'size', 'map', 'ha-entity', 'note',
]);

const OUTPUT_KINDS = new Set(['template', 'calc', 'switch', 'bbox']);

function validateFields(fields: unknown, where: string, errors: string[]): void {
  if (fields === undefined) return;
  if (!Array.isArray(fields)) {
    errors.push(tr('mf_must_list', { at: where }));
    return;
  }
  const keys = new Set<string>();
  fields.forEach((f, i) => {
    const at = `${where}[${i}]`;
    if (!f || typeof f !== 'object') {
      errors.push(tr('mf_must_object', { at }));
      return;
    }
    const spec = f as Partial<FieldSpec>;
    if (!spec.key) errors.push(tr('mf_key_missing', { at }));
    else if (keys.has(spec.key)) errors.push(tr('mf_key_dup', { at, key: spec.key }));
    else keys.add(spec.key);
    if (!spec.label) errors.push(tr('mf_label_missing', { at }));
    if (!spec.kind || !FIELD_KINDS.has(spec.kind)) {
      errors.push(tr('mf_unknown_kind', { at, kind: String(spec.kind), allowed: [...FIELD_KINDS].join(', ') }));
    }
    if (spec.kind === 'select' && !spec.options?.length) errors.push(tr('mf_select_options', { at }));
    if (spec.kind === 'remote-select' && !spec.url) errors.push(tr('mf_remote_url', { at }));
  });
}

/**
 * Prüft ein geparstes Manifest. Gibt eine Liste lesbarer Fehler zurück (leer = ok).
 * Zusätzlich werden Hinweise (`Hinweis:`) für Konventionsverstöße ausgegeben, die die
 * Installation nicht verhindern.
 */
/** Sprachneutrales Präfix für Hinweise, die die Installation nicht verhindern. */
export const HINT = 'ⓘ ';

export function validateManifest(input: unknown): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return [tr('mf_not_object')];
  }
  const m = input as Partial<AddonManifest>;

  if (!m.id) errors.push(tr('mf_id_missing'));
  else if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(m.id)) {
    errors.push(tr('mf_id_pattern'));
  }
  if (!m.name) errors.push(tr('mf_name_missing'));
  if (!m.version) errors.push(tr('mf_version_missing'));
  if (m.api != null && m.api !== ADDON_API_VERSION) {
    errors.push(tr('mf_api', { api: String(m.api), expected: ADDON_API_VERSION }));
  }

  validateFields(m.fields, 'fields', errors);
  validateFields(m.settings, 'settings', errors);

  if (m.outputs !== undefined) {
    if (!Array.isArray(m.outputs)) errors.push(tr('mf_must_list', { at: "'outputs'" }));
    else {
      m.outputs.forEach((o, i) => {
        const at = `outputs[${i}]`;
        if (!o || typeof o !== 'object') return errors.push(tr('mf_must_object', { at }));
        const spec = o as Partial<OutputSpec> & { kind?: string };
        if (!spec.key) errors.push(tr('mf_key_missing', { at }));
        if (!spec.kind || !OUTPUT_KINDS.has(spec.kind)) {
          errors.push(tr('mf_unknown_kind', { at, kind: String(spec.kind), allowed: [...OUTPUT_KINDS].join(', ') }));
        }
      });
    }
  }

  if (!Array.isArray(m.widgets) || m.widgets.length === 0) {
    errors.push(tr('mf_widgets_min'));
  } else {
    const keys = new Set<string>();
    const walk = (list: WidgetSpec[], path: string) => {
      list.forEach((w, i) => {
        const at = `${path}[${i}]`;
        if (!w || typeof w !== 'object') return errors.push(tr('mf_must_object', { at }));
        if (!w.key) errors.push(tr('mf_key_missing', { at }));
        else if (w.key === ADDON_ROOT_KEY) {
          errors.push(tr('mf_key_reserved', { at, key: ADDON_ROOT_KEY }));
        } else if (keys.has(w.key)) errors.push(tr('mf_key_dup', { at, key: w.key }));
        else keys.add(w.key);
        if (!w.type || !CATALOG_BY_TYPE[w.type as WidgetType]) {
          errors.push(tr('mf_widget_type', { at, type: String(w.type) }));
        }
        if (w.children?.length) walk(w.children, `${at}.children`);
      });
    };
    walk(m.widgets, 'widgets');
  }

  if (m.yaml !== undefined && typeof m.yaml !== 'string') errors.push(tr('mf_yaml_string'));
  if (typeof m.yaml === 'string' && m.yaml.includes('id:') && !m.yaml.includes(ADDON_ID_PREFIX)) {
    errors.push(HINT + tr('mf_yaml_ids', { prefix: ADDON_ID_PREFIX }));
  }
  if (m.preview && (m.preview as { kind?: string }).kind !== 'image') {
    errors.push(tr('mf_preview_kind'));
  }

  return errors;
}

/** True, wenn nur Hinweise (keine echten Fehler) vorliegen. */
export function onlyHints(errors: string[]): boolean {
  return errors.every((e) => e.startsWith(HINT));
}

/**
 * Findet Lambda-Code (C++, läuft später auf dem ESP) in einem Manifest: `!lambda`-Werte,
 * `lambda:`-Keys in Aktionen und `lambda:` im YAML-Fragment. Liefert kurze Ausschnitte für die
 * Sicherheitswarnung vor der Installation (leer = kein Lambda).
 */
export function findLambdas(manifest: unknown): string[] {
  const out: string[] = [];
  const clip = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 120);
  const walk = (v: unknown, key = '') => {
    if (out.length >= 5) return;
    if (typeof v === 'string') {
      if (key === 'lambda' || /!lambda\b/.test(v)) out.push(clip(v));
      else {
        // YAML-Fragment: `lambda: …` / `- lambda: |` inklusive der folgenden Zeilen
        const m = v.match(/(^|\n)[ \t-]*lambda\s*:[^\n]*(\n[ \t]+[^\n]*){0,3}/);
        if (m) out.push(clip(m[0]));
      }
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(manifest);
  return out;
}
