import type { ConfigVar, SchemaBody, SchemaField } from './types';

/**
 * Extrahiert aus dem geladenen `lvgl.json`-Schema die gültigen Config-Keys pro Widget.
 *
 * Aufbau des Schemas:
 *   lvgl.schemas.WIDGET_TYPES.schema.config_vars.<widget>.schema.config_vars   → widget-spezifisch
 *   lvgl.schemas.STYLE_SCHEMA.schema.config_vars                                → gemeinsame Style-Keys
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySchema = any;

function lvglRoot(schema: AnySchema): AnySchema | null {
  if (!schema) return null;
  return schema.lvgl ?? schema;
}

function fieldsFromConfigVars(cv: Record<string, ConfigVar> | undefined): SchemaField[] {
  if (!cv) return [];
  return Object.entries(cv).map(([name, def]) => ({
    name,
    required: def?.key === 'Required',
    type: def?.type,
    docs: typeof def?.docs === 'string' ? def.docs : undefined,
  }));
}

/** Gemeinsame Style-Felder (bg_color, radius, border_width, align, …). */
export function getStyleFields(schema: AnySchema): SchemaField[] {
  const root = lvglRoot(schema);
  const body: SchemaBody | undefined = root?.schemas?.STYLE_SCHEMA?.schema;
  return fieldsFromConfigVars(body?.config_vars);
}

/** Rohes Widget-Schema (config_vars) eines Widget-Typs, oder null wenn unbekannt. */
function widgetConfigVars(schema: AnySchema, widgetType: string): Record<string, ConfigVar> | null {
  const root = lvglRoot(schema);
  const widgets = root?.schemas?.WIDGET_TYPES?.schema?.config_vars;
  const entry = widgets?.[widgetType];
  if (!entry) return null;
  return entry.schema?.config_vars ?? {};
}

/**
 * Alle gültigen Felder eines Widgets (widget-spezifisch + Style), oder `null`,
 * wenn der Widget-Typ dem Schema unbekannt ist (dann keine Validierung).
 */
export function getWidgetFields(schema: AnySchema, widgetType: string): SchemaField[] | null {
  const cv = widgetConfigVars(schema, widgetType);
  if (cv === null) return null;
  const own = fieldsFromConfigVars(cv);
  const style = getStyleFields(schema);
  const seen = new Set(own.map((f) => f.name));
  const merged = [...own];
  for (const f of style) if (!seen.has(f.name)) merged.push(f);
  return merged;
}

/** Set aller gültigen Key-Namen eines Widgets (für schnelle Prüfung). */
export function getKnownWidgetKeys(schema: AnySchema, widgetType: string): Set<string> | null {
  const fields = getWidgetFields(schema, widgetType);
  return fields ? new Set(fields.map((f) => f.name)) : null;
}

/** Liste aller im Schema bekannten Widget-Typen. */
export function getWidgetTypes(schema: AnySchema): string[] {
  const root = lvglRoot(schema);
  const widgets = root?.schemas?.WIDGET_TYPES?.schema?.config_vars;
  return widgets ? Object.keys(widgets) : [];
}
