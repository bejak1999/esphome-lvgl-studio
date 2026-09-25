import { defineStore } from 'pinia';
import { browser } from 'wxt/browser';

/**
 * Code-Versionshistorie pro Gerät. Vor riskanten Änderungen (KI-Lauf, Gerät speichern)
 * und auf Wunsch manuell wird ein YAML-Snapshot abgelegt, den man später wiederherstellen
 * kann – falls die KI oder man selbst etwas kaputtgemacht hat. Persistiert in
 * browser.storage.local, damit die Historie einen Neustart übersteht.
 */
export interface CodeVersion {
  id: string;
  /** Zeitstempel (ms). */
  at: number;
  /** Kurzbeschreibung, z. B. „vor KI-Änderung" oder „manuell". */
  label: string;
  /** Vollständiges ESPHome-YAML dieses Stands. */
  yaml: string;
}

const MAX_VERSIONS = 40;
const keyFor = (device: string) => `versions:${device || '_scratch'}`;

export const useVersionStore = defineStore('versions', {
  state: () => ({
    device: '' as string,
    versions: [] as CodeVersion[],
    loaded: false,
  }),
  getters: {
    /** Neueste zuerst. */
    ordered(state): CodeVersion[] {
      return [...state.versions].sort((a, b) => b.at - a.at);
    },
  },
  actions: {
    /** Historie für ein Gerät laden (bei Gerätewechsel erneut aufrufen). */
    async load(device: string) {
      this.device = device;
      const res = await browser.storage.local.get(keyFor(device));
      this.versions = (res[keyFor(device)] as CodeVersion[] | undefined) ?? [];
      this.loaded = true;
    },
    /**
     * Speichern mit Rückfallebene: Ist der Speicher voll (Chrome: 10 MB für die Extension),
     * werden die ältesten Stände dieses Geräts verworfen. Klappt es auch dann nicht, wird der
     * Verlauf nur im Speicher gehalten – ein Verlaufseintrag darf NIE das Speichern aufs Gerät
     * oder einen KI-Lauf blockieren (beide legen vorher einen Snapshot an).
     */
    async _persist() {
      const key = keyFor(this.device);
      for (;;) {
        try {
          await browser.storage.local.set({ [key]: JSON.parse(JSON.stringify(this.versions)) });
          return;
        } catch (e) {
          if (this.versions.length <= 1) {
            console.warn('[versions] Verlauf konnte nicht gespeichert werden', e);
            return;
          }
          // this.versions ist aufsteigend nach Zeit sortiert → vorne liegen die ältesten.
          this.versions.splice(0, Math.ceil(this.versions.length / 4));
        }
      }
    },
    /**
     * Neuen Snapshot ablegen. Ist das YAML mit dem jüngsten identisch, passiert nichts
     * (kein Rauschen). Gibt die neue Version zurück (oder null, wenn übersprungen).
     */
    async snapshot(yaml: string, label: string): Promise<CodeVersion | null> {
      if (!yaml.trim()) return null;
      const latest = this.ordered[0];
      if (latest && latest.yaml === yaml) return null;
      const v: CodeVersion = {
        id: `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        at: Date.now(),
        label,
        yaml,
      };
      this.versions.push(v);
      // Ältestes zuerst wegwerfen, wenn das Limit überschritten ist.
      this.versions.sort((a, b) => a.at - b.at);
      while (this.versions.length > MAX_VERSIONS) this.versions.shift();
      await this._persist();
      return v;
    },
    async removeVersion(id: string) {
      this.versions = this.versions.filter((v) => v.id !== id);
      await this._persist();
    },
    async clearAll() {
      this.versions = [];
      await this._persist();
    },
    get(id: string): CodeVersion | undefined {
      return this.versions.find((v) => v.id === id);
    },
  },
});
