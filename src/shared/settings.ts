import { defineStore } from 'pinia';
import { browser } from 'wxt/browser';

/**
 * Persistente Einstellungen der Extension.
 * Gespeichert unter browser.storage.local['settings'].
 */
export interface Settings {
  /** ESPHome device-builder / Dashboard */
  esphome: {
    /** Basis-URL inkl. Port, z. B. http://192.168.1.10:6052 */
    url: string;
    /** Optionales Session-/Zugriffstoken (falls Auth aktiv) */
    token: string;
  };
  /** Home Assistant (für Live-Entities) */
  ha: {
    /** Basis-URL, z. B. http://192.168.1.10:8123 */
    url: string;
    /** Long-Lived Access Token */
    token: string;
  };
  /** KI-Anbindung (OpenRouter-kompatibel) */
  ai: {
    apiKey: string;
    model: string;
    baseUrl: string;
    /** Kontextfenster des gewählten Modells in Tokens (für die Füllstandsanzeige). */
    contextLength: number;
    /**
     * Wie KI-Änderungen am YAML übernommen werden: 'confirm' = erst Diff zeigen und bestätigen
     * lassen (Standard), 'auto' = sofort übernehmen.
     */
    applyMode: 'confirm' | 'auto';
  };
  /** ESPHome-Schema/Docs */
  schema: {
    /** Schema-Version auf schema.esphome.io (z. B. 'dev' oder '2026.6.0'). */
    version: string;
  };
  /** UI language: 'en' (default) or 'de'. */
  language: 'en' | 'de';
}

export const DEFAULT_SETTINGS: Settings = {
  esphome: { url: '', token: '' },
  ha: { url: '', token: '' },
  ai: {
    apiKey: '',
    // Gültiges, tool- & vision-fähiges Standardmodell (per Dropdown änderbar).
    model: 'google/gemini-2.0-flash-001',
    baseUrl: 'https://openrouter.ai/api/v1',
    contextLength: 0, // 0 = unbekannt, wird beim Laden der Modell-Liste gefüllt
    applyMode: 'confirm',
  },
  schema: { version: 'dev' },
  language: 'en',
};

const STORAGE_KEY = 'settings';

/** Tiefe Zusammenführung von Defaults + gespeicherten Werten (eine Ebene Nesting genügt hier). */
function mergeWithDefaults(saved: Partial<Settings> | undefined): Settings {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!saved) return base;
  return {
    esphome: { ...base.esphome, ...(saved.esphome ?? {}) },
    ha: { ...base.ha, ...(saved.ha ?? {}) },
    ai: { ...base.ai, ...(saved.ai ?? {}) },
    schema: { ...base.schema, ...(saved.schema ?? {}) },
    language: saved.language ?? base.language,
  };
}

let liveSyncAdded = false;

/** `<html lang>` passend zur UI-Sprache (Screenreader, Silbentrennung). */
function applyDocumentLanguage(lang: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: structuredClone(DEFAULT_SETTINGS),
    loaded: false,
    savedAt: 0,
  }),
  actions: {
    async load() {
      const res = await browser.storage.local.get(STORAGE_KEY);
      this.settings = mergeWithDefaults(res[STORAGE_KEY] as Partial<Settings> | undefined);
      this.loaded = true;
      applyDocumentLanguage(this.settings.language);

      // Über Seitengrenzen hinweg synchron halten: Speichert z. B. die Options-Seite
      // einen neuen API-Key, aktualisiert sich die (bereits offene) Sidebar automatisch.
      if (!liveSyncAdded) {
        liveSyncAdded = true;
        browser.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes[STORAGE_KEY]) {
            this.settings = mergeWithDefaults(changes[STORAGE_KEY].newValue as Partial<Settings> | undefined);
            applyDocumentLanguage(this.settings.language);
          }
        });
      }
    },
    /**
     * Einzelne Einstellung sofort dauerhaft ändern, OHNE andere (evtl. noch nicht bestätigte)
     * Eingaben aus einem offenen Einstellungsformular mitzuspeichern.
     */
    async saveApplyMode(mode: Settings['ai']['applyMode']) {
      this.settings.ai.applyMode = mode;
      const res = await browser.storage.local.get(STORAGE_KEY);
      const stored = mergeWithDefaults(res[STORAGE_KEY] as Partial<Settings> | undefined);
      stored.ai.applyMode = mode;
      await browser.storage.local.set({ [STORAGE_KEY]: stored });
    },
    async save() {
      // Plain-Objekt (kein Proxy) in den Storage schreiben.
      const plain = JSON.parse(JSON.stringify(this.settings)) as Settings;
      await browser.storage.local.set({ [STORAGE_KEY]: plain });
      this.savedAt = Date.now();
    },
  },
});
