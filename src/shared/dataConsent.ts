import { browser } from 'wxt/browser';

/**
 * Firefox-Einwilligung zur Datenübertragung („data_collection_permissions", Firefox ≥ 140).
 *
 * Der KI-Agent schickt Chat-Nachrichten, das Dashboard-YAML und Vorschaubilder an den
 * eingestellten KI-Dienst (OpenRouter). Laut Mozilla ist das eine Datenübertragung, die
 * deklariert werden muss – bei uns als OPTIONALE Kategorie `personalCommunications`, die vor dem
 * ersten KI-Aufruf erfragt wird. Wer die KI nie nutzt, wird nie gefragt.
 *
 * Chrome kennt kein solches Browser-Verfahren (Angabe erfolgt im Store-Formular) → immer true.
 * Wie bei Host-Berechtigungen gilt: `requestAiConsent` synchron im Klick-/Tasten-Handler aufrufen.
 */
const CATEGORY = 'personalCommunications';

type DataPermissions = {
  request(p: { data_collection: string[] }): Promise<boolean>;
  getAll(): Promise<{ data_collection?: string[] }>;
};
const perms = () => browser.permissions as unknown as DataPermissions;

export async function hasAiConsent(): Promise<boolean> {
  if (import.meta.env.BROWSER !== 'firefox') return true;
  try {
    const all = await perms().getAll();
    // Kein `data_collection` im Ergebnis = Firefox ohne eingebaute Einwilligung → nichts zu tun.
    return !all.data_collection || all.data_collection.includes(CATEGORY);
  } catch {
    return false;
  }
}

export function requestAiConsent(): Promise<boolean> {
  if (import.meta.env.BROWSER !== 'firefox') return Promise.resolve(true);
  // Ohne echte Nutzereingabe lehnt Firefox die Anfrage ab – dann zählt eine frühere Zustimmung.
  const fallback = () => hasAiConsent();
  try {
    return perms()
      .request({ data_collection: [CATEGORY] })
      .then((ok) => ok || fallback(), fallback);
  } catch {
    return fallback();
  }
}
