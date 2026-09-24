import { defineStore } from 'pinia';
import { fetchLvglSchema, DEFAULT_SCHEMA_VERSION } from './client';
import { validateYaml } from './validate';
import { getWidgetTypes } from './lvgl';
import type { SchemaIssue } from './types';

/**
 * Hält das geladene LVGL-Schema und liefert Schema-basierte Validierung.
 * Das Schema wird bei Bedarf von schema.esphome.io geladen (in der Extension via
 * Host-Permissions ohne CORS-Problem) und im Speicher gehalten.
 */
export const useSchemaStore = defineStore('schema', {
  state: () => ({
    lvglSchema: null as unknown,
    version: DEFAULT_SCHEMA_VERSION,
    loading: false,
    error: '' as string,
  }),

  getters: {
    loaded(state): boolean {
      return state.lvglSchema != null;
    },
    widgetTypes(state): string[] {
      return state.lvglSchema ? getWidgetTypes(state.lvglSchema) : [];
    },
  },

  actions: {
    async loadLvgl(version = DEFAULT_SCHEMA_VERSION) {
      if (this.lvglSchema && this.version === version) return;
      this.loading = true;
      this.error = '';
      try {
        this.lvglSchema = await fetchLvglSchema(version);
        this.version = version;
      } catch (e) {
        this.error = (e as Error).message;
      } finally {
        this.loading = false;
      }
    },

    /** Direkt setzen (Tests / vorab geladenes Schema). */
    setSchema(schema: unknown, version = DEFAULT_SCHEMA_VERSION) {
      this.lvglSchema = schema;
      this.version = version;
      this.error = '';
    },

    /** Validiert das übergebene YAML gegen das geladene Schema. */
    validate(yaml: string): SchemaIssue[] {
      if (!this.lvglSchema) return [];
      return validateYaml(yaml, this.lvglSchema);
    },
  },
});
