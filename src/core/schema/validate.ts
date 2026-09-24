import type { SchemaField, SchemaIssue } from './types';
import { getWidgetFields } from './lvgl';
import { listWidgets } from '../yaml/engine';
import { tr } from '@/shared/i18n';

/** Keys, die auf jedem LVGL-Widget erlaubt sind, unabhängig vom Schema-Detail. */
const UNIVERSAL = new Set(['id', 'widgets', 'state', 'styles', 'style', 'group', 'skip', 'layout']);

function isAllowed(key: string, known: Set<string>): boolean {
  if (UNIVERSAL.has(key)) return true;
  if (key.startsWith('on_')) return true; // Automations-Trigger (on_press, on_value, …)
  return known.has(key);
}

/** Prüft die gesetzten Keys eines einzelnen Widgets gegen seine Schema-Felder. */
export function validateWidgetKeys(
  widgetType: string,
  usedKeys: string[],
  fields: SchemaField[],
  widgetId?: string,
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  const known = new Set(fields.map((f) => f.name));

  for (const key of usedKeys) {
    if (!isAllowed(key, known)) {
      issues.push({
        level: 'warning',
        widgetId,
        widgetType,
        key,
        message: tr('val_unknown_key', { key, type: widgetType }),
      });
    }
  }

  for (const f of fields) {
    if (f.required && !usedKeys.includes(f.name)) {
      issues.push({
        level: 'info',
        widgetId,
        widgetType,
        key: f.name,
        message: `Pflichtfeld '${f.name}' fehlt bei '${widgetType}'.`,
      });
    }
  }

  return issues;
}

/**
 * Validiert ein komplettes ESPHome-YAML gegen das geladene LVGL-Schema.
 * Unbekannte Widget-Typen (nicht im Schema) werden übersprungen, nicht bemängelt.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateYaml(text: string, schema: any): SchemaIssue[] {
  const widgets = listWidgets(text);
  const issues: SchemaIssue[] = [];
  for (const w of widgets) {
    const fields = getWidgetFields(schema, w.type);
    if (fields === null) continue; // Typ dem Schema unbekannt → keine Aussage
    issues.push(...validateWidgetKeys(w.type, w.keys, fields, w.id));
  }
  return issues;
}
