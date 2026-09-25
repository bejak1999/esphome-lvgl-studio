import { browser } from 'wxt/browser';

/**
 * Host-Berechtigungen zur Laufzeit – statt pauschal „alle Websites" bei der Installation.
 *
 * Die Extension spricht Geräte im Heimnetz an, deren Adressen erst der Nutzer einträgt
 * (ESPHome, Home Assistant, Kamera-Bilder, Addon-Quellen). Diese Hosts stehen im Manifest nur
 * als *optionale* Berechtigung; der Zugriff wird pro Host erfragt, sobald der Nutzer ihn
 * braucht (Speichern der Einstellungen, „Verbinden", „Entities laden" …).
 *
 * Wichtig: `permissions.request` funktioniert nur direkt aus einer Nutzeraktion. Deshalb muss
 * `requestHostAccess` im Klick-Handler SYNCHRON (vor jedem `await`) aufgerufen werden.
 */

/** Hosts mit offenem CORS bzw. fester Manifest-Berechtigung – brauchen keine Anfrage. */
const NO_REQUEST_NEEDED = new Set([
  'openrouter.ai',
  'raw.githubusercontent.com',
  'nominatim.openstreetmap.org',
  'schema.esphome.io',
]);

export interface AccessOptions {
  /** Firefox: zusätzlich ws/wss (für die Origin-Umschreibung des ESPHome-WebSockets). */
  websocket?: boolean;
}

/** Match-Patterns für die angegebenen URLs (ohne Port – Patterns gelten für alle Ports). */
export function hostPatterns(urls: (string | undefined | null)[], opts: AccessOptions = {}): string[] {
  const out = new Set<string>();
  for (const raw of urls) {
    if (!raw?.trim()) continue;
    let u: URL;
    try {
      u = new URL(raw.trim());
    } catch {
      continue;
    }
    if (!/^(https?|wss?):$/.test(u.protocol) || NO_REQUEST_NEEDED.has(u.hostname)) continue;
    const secure = u.protocol === 'https:' || u.protocol === 'wss:';
    out.add(`${secure ? 'https' : 'http'}://${u.hostname}/*`);
    // Firefox: Der WebSocket-Handshake (Origin-Umschreibung per webRequest) braucht die
    // Berechtigung auch für das ws-Schema. Chrome kennt ws-Patterns nicht und lehnt sie ab.
    if (opts.websocket && import.meta.env.BROWSER === 'firefox') out.add(`${secure ? 'wss' : 'ws'}://${u.hostname}/*`);
  }
  return [...out];
}

/** Hostname für Meldungen („192.168.1.10"). */
export function hostLabel(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Ist der Zugriff auf alle angegebenen Hosts bereits erlaubt? */
export async function hasHostAccess(urls: (string | undefined | null)[], opts: AccessOptions = {}): Promise<boolean> {
  const origins = hostPatterns(urls, opts);
  if (!origins.length) return true;
  try {
    return await browser.permissions.contains({ origins });
  } catch {
    return false;
  }
}

/**
 * Zugriff erfragen. MUSS synchron aus einem Klick-/Tasten-Handler aufgerufen werden (vor dem
 * ersten `await`), sonst verweigert der Browser die Anfrage. Liefert true, wenn (bereits)
 * erlaubt. Bereits erteilte Hosts zeigen keinen Dialog.
 */
export function requestHostAccess(urls: (string | undefined | null)[], opts: AccessOptions = {}): Promise<boolean> {
  const origins = hostPatterns(urls, opts);
  if (!origins.length) return Promise.resolve(true);
  // Abgelehnt/fehlgeschlagen (z. B. Firefox ohne echte Nutzereingabe – auch wenn der Zugriff
  // längst erteilt ist): dann zählt, ob er bereits besteht.
  const fallback = () => hasHostAccess(urls, opts);
  try {
    return browser.permissions.request({ origins }).then((ok) => ok || fallback(), fallback);
  } catch {
    return fallback();
  }
}
