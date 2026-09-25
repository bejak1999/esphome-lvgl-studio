import { defineStore } from 'pinia';
import { browser } from 'wxt/browser';
import type { Screen, WidgetNode } from '../lvgl/types';
import type { DashboardTemplate, Template, WidgetTemplate } from './types';
import { BUILTIN_WIDGET_TEMPLATES } from './builtins';

const STORAGE_KEY = 'templates';

function newId(): string {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const useTemplatesStore = defineStore('templates', {
  state: () => ({
    user: [] as Template[],
    loaded: false,
  }),

  getters: {
    dashboards(state): DashboardTemplate[] {
      return state.user.filter((t): t is DashboardTemplate => t.kind === 'dashboard');
    },
    widgets(state): WidgetTemplate[] {
      return [...BUILTIN_WIDGET_TEMPLATES, ...state.user.filter((t): t is WidgetTemplate => t.kind === 'widget')];
    },
  },

  actions: {
    async load() {
      const res = await browser.storage.local.get(STORAGE_KEY);
      this.user = (res[STORAGE_KEY] as Template[] | undefined) ?? [];
      this.loaded = true;
    },

    async persist() {
      await browser.storage.local.set({ [STORAGE_KEY]: JSON.parse(JSON.stringify(this.user)) });
    },

    async saveDashboard(name: string, screen: Screen) {
      const tpl: DashboardTemplate = {
        id: newId(),
        name: name.trim() || 'Dashboard',
        kind: 'dashboard',
        screen: JSON.parse(JSON.stringify(screen)),
        createdAt: Date.now(),
      };
      this.user.push(tpl);
      await this.persist();
      return tpl;
    },

    async saveWidget(name: string, node: WidgetNode) {
      const tpl: WidgetTemplate = {
        id: newId(),
        name: name.trim() || 'Widget',
        kind: 'widget',
        node: JSON.parse(JSON.stringify(node)),
        createdAt: Date.now(),
      };
      this.user.push(tpl);
      await this.persist();
      return tpl;
    },

    async remove(id: string) {
      this.user = this.user.filter((t) => t.id !== id);
      await this.persist();
    },

    /** Exportiert eine Vorlage als JSON-String (zum Teilen). */
    exportJson(id: string): string | null {
      const all = [...this.user, ...BUILTIN_WIDGET_TEMPLATES];
      const tpl = all.find((t) => t.id === id);
      return tpl ? JSON.stringify(tpl, null, 2) : null;
    },

    /** Importiert eine oder mehrere Vorlagen aus JSON (Objekt oder Liste). Liefert die Anzahl. */
    async importJson(text: string): Promise<number> {
      const parsed = JSON.parse(text) as Template | Template[];
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const valid = list.filter(
        (t) => t && (t.kind === 'widget' ? !!(t as WidgetTemplate).node : t.kind === 'dashboard' && !!(t as DashboardTemplate).screen),
      );
      if (!valid.length) throw new Error('no templates');
      for (const tpl of valid) {
        tpl.id = newId();
        tpl.builtin = false;
        this.user.push(tpl);
      }
      await this.persist();
      return valid.length;
    },

    /** Alle eigenen Vorlagen als JSON (Sicherung / Übertragen in einen anderen Browser). */
    exportUserJson(): string {
      return JSON.stringify(this.user, null, 2);
    },
  },
});
