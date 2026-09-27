import { browser } from 'wxt/browser';

/**
 * Firefox-Einwilligung zur Datenübertragung („data_collection_permissions", Firefox ≥ 140).
 *
 * Laut Mozilla muss jede Übertragung an einen fremden Dienst deklariert werden. Bei uns sind
 * alle Kategorien OPTIONAL und werden erst vor der ersten Übertragung erfragt:
 * - `personalCommunications`: der KI-Agent schickt Chat-Nachrichten, das Dashboard-YAML und
 *   Vorschaubilder an den eingestellten KI-Dienst (OpenRouter).
 * - `locationInfo`: die Karten-Auswahl der Addons lädt Kacheln des gezeigten Gebiets (CARTO)
 *   und schickt eingegebene Adressen an die OSM-Suche (Nominatim).
 * Wer die Funktion nie nutzt, wird nie gefragt.
 *
 * Chrome kennt kein solches Browser-Verfahren (Angabe erfolgt im Store-Formular) → immer true.
 * Wie bei Host-Berechtigungen gilt: `request…Consent` synchron im Klick-/Tasten-Handler aufrufen.
 */
type Category = 'personalCommunications' | 'locationInfo';

type DataPermissions = {
  request(p: { data_collection: string[] }): Promise<boolean>;
  getAll(): Promise<{ data_collection?: string[] }>;
};
const perms = () => browser.permissions as unknown as DataPermissions;

async function hasConsent(category: Category): Promise<boolean> {
  if (import.meta.env.BROWSER !== 'firefox') return true;
  try {
    const all = await perms().getAll();
    // Kein `data_collection` im Ergebnis = Firefox ohne eingebaute Einwilligung → nichts zu tun.
    return !all.data_collection || all.data_collection.includes(category);
  } catch {
    return false;
  }
}

function requestConsent(category: Category): Promise<boolean> {
  if (import.meta.env.BROWSER !== 'firefox') return Promise.resolve(true);
  // Ohne echte Nutzereingabe lehnt Firefox die Anfrage ab – dann zählt eine frühere Zustimmung.
  const fallback = () => hasConsent(category);
  try {
    return perms()
      .request({ data_collection: [category] })
      .then((ok) => ok || fallback(), fallback);
  } catch {
    return fallback();
  }
}

export const hasAiConsent = () => hasConsent('personalCommunications');
export const requestAiConsent = () => requestConsent('personalCommunications');
export const hasMapConsent = () => hasConsent('locationInfo');
export const requestMapConsent = () => requestConsent('locationInfo');
