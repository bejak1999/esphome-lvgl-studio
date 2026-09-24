/**
 * Typen für den offiziellen ESPHome-JSON-Schema-Dump
 * (Quelle: https://schema.esphome.io/<version>/<component>.json, erzeugt von
 * `build_language_schema.py`, auch von esphome-vscode genutzt).
 */

export interface ConfigVar {
  key?: 'Required' | 'Optional';
  type?: string;
  default?: string | number | boolean;
  docs?: string;
  /** Verschachteltes Schema (bei `type: "schema"`). */
  schema?: SchemaBody;
  /** Aufzählungswerte (bei `type: "enum"`). */
  values?: unknown;
  use_id_type?: string;
  [k: string]: unknown;
}

export interface SchemaBody {
  config_vars?: Record<string, ConfigVar>;
  extends?: string[];
  [k: string]: unknown;
}

/** Ein aufbereitetes, für UI/Validierung nutzbares Feld. */
export interface SchemaField {
  name: string;
  required: boolean;
  type?: string;
  docs?: string;
}

export interface SchemaIssue {
  level: 'error' | 'warning' | 'info';
  widgetId?: string;
  widgetType?: string;
  key?: string;
  message: string;
}
