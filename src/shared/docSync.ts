import { watch } from 'vue';
import { browser } from 'wxt/browser';
import { useDocumentStore } from '@/core/lvgl/document';
import { useEsphomeStore } from '@/core/esphome/store';
import type { Screen } from '@/core/lvgl/types';
import type { AddonInstance } from '@/core/addons/types';

/**
 * Live-Synchronisation des Arbeitsdokuments (+ aktuelles Gerät) zwischen Sidebar und
 * Editor-Tab über `browser.storage.local`. Beide Seiten haben eigene Pinia-Instanzen;
 * dieser Kanal hält Modell und Vorschau/Canvas seitenübergreifend in Sync.
 */

const KEY = 'workingDoc';
const PAGE_ID = Math.random().toString(36).slice(2);

interface WorkingDoc {
  source: string;
  device: string;
  /** Alle LVGL-Seiten + die aktuell betrachtete (ältere Stände hatten nur `screen`). */
  pages?: Screen[];
  activePage?: number;
  screen?: Screen;
  baseYaml: string;
  /** Im Dokument platzierte Addon-Instanzen (siehe core/addons/). */
  addons?: AddonInstance[];
  sourceYaml?: string;
  sourceModel?: string;
  at: number;
}

export function useDocSync() {
  const doc = useDocumentStore();
  const esphome = useEsphomeStore();
  let applying = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function persist() {
    if (applying) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const payload: WorkingDoc = {
        source: PAGE_ID,
        device: esphome.currentConfiguration,
        pages: JSON.parse(JSON.stringify(doc.pages)),
        activePage: doc.activePage,
        baseYaml: doc.baseYaml,
        addons: JSON.parse(JSON.stringify(doc.addons)),
        // Originaltext + Fingerabdruck, damit auch die Gegenseite unverändert exakt exportiert.
        sourceYaml: doc.sourceYaml,
        sourceModel: doc.sourceModel,
        at: Date.now(),
      };
      browser.storage.local.set({ [KEY]: payload }).catch(() => {});
    }, 250);
  }

  function apply(v: WorkingDoc) {
    applying = true;
    try {
      if (v.device) esphome.currentConfiguration = v.device;
      // `screen` = Altformat (eine Seite); `pages` = aktuelles Mehrseiten-Format.
      const pages = v.pages ?? (v.screen ? [v.screen] : null);
      if (pages?.length) {
        doc.pages = pages;
        doc.activePage = Math.min(v.activePage ?? 0, pages.length - 1);
      }
      doc.baseYaml = v.baseYaml ?? '';
      doc.addons = v.addons ?? [];
      // Fehlt der Originaltext (älterer Stand), gilt das Dokument einfach als bearbeitet.
      doc.sourceYaml = v.sourceYaml ?? '';
      doc.sourceModel = v.sourceModel ?? '';
      doc.selectedId = null;
    } finally {
      // kurz warten, damit der eigene watch die Anwendung nicht sofort re-persistiert
      setTimeout(() => {
        applying = false;
      }, 60);
    }
  }

  // Eigene Änderungen (KI, Gerätewechsel, Editor-Bearbeitung) persistieren.
  watch(
    () => [doc.pages, doc.activePage, doc.baseYaml, doc.addons, esphome.currentConfiguration],
    persist,
    { deep: true },
  );

  // Änderungen der jeweils anderen Seite übernehmen.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[KEY]) return;
    const v = changes[KEY].newValue as WorkingDoc | undefined;
    if (!v || v.source === PAGE_ID) return;
    apply(v);
  });
}
