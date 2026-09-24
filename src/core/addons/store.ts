import { defineStore } from 'pinia';
import { browser } from 'wxt/browser';
import type { AddonManifest, InstalledAddon } from './types';
import { onlyHints, validateManifest, withDefaults } from './apply';
import { tr } from '@/shared/i18n';

/**
 * Verwaltung der installierten Addons.
 *
 * Es gibt **keine vorinstallierten Addons**: alles, was hier auftaucht, hat der Nutzer
 * selbst installiert (URL, Datei oder eingefügtes JSON). Die Manifest-Kopie wird
 * mitgespeichert, damit ein Addon auch ohne Netz funktioniert.
 */

const STORAGE_KEY = 'addons';

interface Persisted {
  /** Installierte Addons (mit Manifest-Kopie). */
  installed: InstalledAddon[];
  /** Addon-id → `settings`-Werte. */
  settings: Record<string, Record<string, unknown>>;
  /** Addon-id → false, wenn deaktiviert. */
  disabled: Record<string, boolean>;
}

function emptyState(): Persisted {
  return { installed: [], settings: {}, disabled: {} };
}

let liveSyncAdded = false;

export const useAddonsStore = defineStore('addons', {
  state: () => ({
    ...emptyState(),
    loaded: false,
    /** Letzter Installationsfehler (für die Anzeige in den Einstellungen). */
    error: '' as string,
    busy: false,
  }),

  getters: {
    /** Alle installierten Addons inkl. aufgefüllter Settings-Werte. */
    all(state): InstalledAddon[] {
      return state.installed.map((a) => ({
        ...a,
        settings: withDefaults(a.manifest.settings, state.settings[a.manifest.id] ?? {}),
        enabled: state.disabled[a.manifest.id] !== true,
      }));
    },

    /** Nur aktive Addons – das ist die Liste im Editor-Panel. */
    enabled(): InstalledAddon[] {
      return (this.all as InstalledAddon[]).filter((a) => a.enabled);
    },
  },

  actions: {
    async load() {
      const res = await browser.storage.local.get(STORAGE_KEY);
      const saved = res[STORAGE_KEY] as Partial<Persisted> | undefined;
      this.installed = saved?.installed ?? [];
      this.settings = saved?.settings ?? {};
      this.disabled = saved?.disabled ?? {};
      this.loaded = true;

      // Wie bei den Einstellungen: Änderungen auf einer Seite (Options) sollen in einer
      // offenen anderen (Editor/Sidebar) sofort ankommen.
      if (!liveSyncAdded) {
        liveSyncAdded = true;
        browser.storage.onChanged.addListener((changes, area) => {
          if (area !== 'local' || !changes[STORAGE_KEY]) return;
          const v = changes[STORAGE_KEY].newValue as Partial<Persisted> | undefined;
          this.installed = v?.installed ?? [];
          this.settings = v?.settings ?? {};
          this.disabled = v?.disabled ?? {};
        });
      }
    },

    async persist() {
      const plain: Persisted = JSON.parse(
        JSON.stringify({ installed: this.installed, settings: this.settings, disabled: this.disabled }),
      );
      await browser.storage.local.set({ [STORAGE_KEY]: plain });
    },

    /** Manifest per id (mitgeliefert oder installiert). */
    manifest(id: string): AddonManifest | null {
      return (this.all as InstalledAddon[]).find((a) => a.manifest.id === id)?.manifest ?? null;
    },

    /** Eintrag per id. */
    entry(id: string): InstalledAddon | null {
      return (this.all as InstalledAddon[]).find((a) => a.manifest.id === id) ?? null;
    },

    /** `settings`-Werte eines Addons (mit Defaults aufgefüllt). */
    settingsFor(id: string): Record<string, unknown> {
      const m = this.manifest(id);
      return withDefaults(m?.settings, this.settings[id] ?? {});
    },

    async saveSettings(id: string, values: Record<string, unknown>) {
      this.settings[id] = JSON.parse(JSON.stringify(values));
      await this.persist();
    },

    async setEnabled(id: string, enabled: boolean) {
      if (enabled) delete this.disabled[id];
      else this.disabled[id] = true;
      await this.persist();
    },

    /**
     * Installiert ein Addon aus einem JSON-Text. Gibt die gefundenen Probleme zurück
     * (leer = erfolgreich). Reine „Hinweis:"-Meldungen verhindern die Installation nicht.
     */
    async installFromJson(
      text: string,
      source: InstalledAddon['source'] = 'json',
      sourceUrl?: string,
    ): Promise<string[]> {
      this.error = '';
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        const msg = tr('addon_bad_json', { msg: (e as Error).message });
        this.error = msg;
        return [msg];
      }
      const problems = validateManifest(parsed);
      if (problems.length && !onlyHints(problems)) {
        this.error = problems[0];
        return problems;
      }
      const manifest = parsed as AddonManifest;
      const entry: InstalledAddon = {
        manifest,
        settings: {},
        source,
        sourceUrl,
        installedAt: Date.now(),
        enabled: true,
      };
      const at = this.installed.findIndex((a) => a.manifest.id === manifest.id);
      if (at >= 0) this.installed[at] = { ...entry, settings: this.installed[at].settings };
      else this.installed.push(entry);
      delete this.disabled[manifest.id];
      await this.persist();
      return problems; // ggf. nur Hinweise
    },

    /** Lädt ein Manifest von einer URL und installiert es. */
    async installFromUrl(url: string): Promise<string[]> {
      this.busy = true;
      this.error = '';
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          const msg = tr('addon_download_http', { status: res.status });
          this.error = msg;
          return [msg];
        }
        return await this.installFromJson(await res.text(), 'url', url);
      } catch (e) {
        const msg = tr('addon_download_failed', { msg: (e as Error).message });
        this.error = msg;
        return [msg];
      } finally {
        this.busy = false;
      }
    },

    /** Holt ein per URL installiertes Addon erneut von seiner Quelle. */
    async updateFromSource(id: string): Promise<string[]> {
      const entry = this.installed.find((a) => a.manifest.id === id);
      if (!entry?.sourceUrl) return [tr('addon_no_source')];
      return this.installFromUrl(entry.sourceUrl);
    },

    async uninstall(id: string) {
      this.installed = this.installed.filter((a) => a.manifest.id !== id);
      delete this.settings[id];
      delete this.disabled[id];
      await this.persist();
    },

    /** Manifest eines installierten Addons als JSON (zum Teilen/Sichern). */
    exportJson(id: string): string | null {
      const m = this.manifest(id);
      return m ? JSON.stringify(m, null, 2) : null;
    },
  },
});
