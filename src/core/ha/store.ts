import { defineStore } from 'pinia';
import { fetchEntities, type HaEntity } from './client';
import { tr } from '@/shared/i18n';
import { hasHostAccess, hostLabel, requestHostAccess } from '@/shared/hostAccess';

// Injection-Keys für die Entity-Reflexion (Editor-Canvas → WidgetView-Vorschau).
export const ENTITY_STATES_KEY = 'lvglEntityStates';
export const ENTITY_VALUES_KEY = 'lvglEntityValues';

/** Live-Wert eines Entities für die Vorschau: Anzeige-Text + numerischer Wert + Einheit. */
export interface EntityValue {
  state: string;
  num: number | null;
  unit: string;
}

/** Einheit eines Entities (unit_of_measurement, sonst % bei Prozent-Domains). */
export function entityUnit(e: HaEntity): string {
  const u = e.attributes?.unit_of_measurement;
  if (typeof u === 'string' && u) return u;
  if (e.domain === 'fan' || e.domain === 'cover') return '%';
  return '';
}

// Domains, deren numerischer Wert in einem Attribut steckt (nicht im State).
const NUMERIC_ATTRIBUTE: Record<string, string> = {
  fan: 'percentage',
  cover: 'current_position',
  light: 'brightness',
  media_player: 'volume_level',
};

/** Numerischen Wert eines Entities bestimmen (State oder domain-abhängiges Attribut). */
export function entityNumericValue(e: HaEntity): number | null {
  const attrKey = NUMERIC_ATTRIBUTE[e.domain];
  if (attrKey && e.attributes && e.attributes[attrKey] != null) {
    const n = Number(e.attributes[attrKey]);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(e.state);
  return Number.isFinite(n) ? n : null;
}

// Zustände, die als „inaktiv/aus" gelten; alles andere (on, open, playing, heat …) ist aktiv.
const INACTIVE_STATES = new Set(['off', 'closed', 'unavailable', 'unknown', 'idle', 'standby', 'none', 'false', '0', '']);

/** Deutet einen HA-/ESPHome-State als boolean „aktiv" (für die Widget-Vorschau). */
export function isEntityActive(state?: string): boolean {
  if (state == null) return false;
  const s = state.trim().toLowerCase();
  if (INACTIVE_STATES.has(s)) return false;
  const n = Number(s);
  if (!Number.isNaN(n)) return n > 0;
  return true;
}

export const useHaStore = defineStore('ha', {
  state: () => ({
    entities: [] as HaEntity[],
    loading: false,
    error: '',
  }),

  getters: {
    entityIds(state): string[] {
      return state.entities.map((e) => e.entity_id);
    },
  },

  actions: {
    /** @param interactive true aus einem Klick („Entities laden") → fehlende Berechtigung erfragen. */
    async load(baseUrl: string, token: string, interactive = false) {
      if (!baseUrl || !token) {
        this.error = tr('err_ha_missing');
        return;
      }
      // Synchron vor dem ersten await (Nutzeraktion) anfragen bzw. nur prüfen.
      const access = interactive ? requestHostAccess([baseUrl]) : hasHostAccess([baseUrl]);
      if (!(await access)) {
        this.error = tr('err_host_access_ha', { host: hostLabel(baseUrl) });
        return;
      }
      this.loading = true;
      this.error = '';
      try {
        this.entities = await fetchEntities(baseUrl, token);
      } catch (e) {
        this.error = (e as Error).message;
      } finally {
        this.loading = false;
      }
    },
  },
});
