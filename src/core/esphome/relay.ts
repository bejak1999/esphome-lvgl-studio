import { browser } from 'wxt/browser';
import type { WebSocketLike, WsFactory } from './client';

/**
 * Chrome: WebSocket-Relay über einen unsichtbaren iframe auf dem ESPHome-Host.
 *
 * Der device-builder lehnt WS-Handshakes mit fremdem `Origin` (chrome-extension://…) mit 403
 * ab. Anders als Firefox (webRequestBlocking, siehe background.ts) kann Chrome den Header nicht
 * umschreiben: declarativeNetRequest-`modifyHeaders` greift bei WebSocket-Handshakes nicht
 * (nachgemessen mit Chrome 153 – fetch wird umgeschrieben, WS nicht).
 *
 * Lösung: Ein iframe lädt `<esphome>/__lvgl_studio_relay` (der device-builder liefert für jeden
 * Pfad seine SPA aus). Dort läuft das zur Laufzeit registrierte Content-Script
 * `esphome-relay.content.ts`, öffnet den WebSocket mit der Origin des Hosts selbst und
 * reicht alles per postMessage an die Extension-Seite durch.
 */

export const RELAY_PATH = '/__lvgl_studio_relay';
const SCRIPT_ID = 'esphome-ws-relay';

/** Nachrichtenformat zwischen Extension-Seite und Relay-Content-Script. */
export type RelayMsg =
  | { __lvglRelay: true; type: 'open' | 'error' }
  | { __lvglRelay: true; type: 'close'; code?: number }
  | { __lvglRelay: true; type: 'message'; data: string }
  | { __lvglRelay: true; type: 'send'; data: string };

interface ScriptingApi {
  getRegisteredContentScripts(filter?: { ids?: string[] }): Promise<{ id: string; matches?: string[] }[]>;
  registerContentScripts(scripts: unknown[]): Promise<void>;
  updateContentScripts(scripts: unknown[]): Promise<void>;
}

/** Registriert das Relay-Script für genau diesen Host (idempotent, auch bei parallelen Seiten). */
async function ensureRelayScript(origin: string): Promise<void> {
  const scripting = (browser as unknown as { scripting?: ScriptingApi }).scripting;
  if (!scripting) throw new Error('scripting-API nicht verfügbar');
  const def = {
    id: SCRIPT_ID,
    // Ports sind in Chrome-Match-Patterns erlaubt; der Pfad beschränkt das Script auf den iframe.
    matches: [`${origin}${RELAY_PATH}*`],
    js: ['content-scripts/esphome-relay.js'],
    allFrames: true,
    runAt: 'document_start',
  };
  const existing = await scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (existing.length) {
    if (existing[0].matches?.[0] !== def.matches[0]) await scripting.updateContentScripts([def]);
    return;
  }
  try {
    await scripting.registerContentScripts([def]);
  } catch {
    // Parallel von einer anderen Seite (Sidebar/Editor) registriert → nur aktualisieren.
    await scripting.updateContentScripts([def]);
  }
}

/** WsFactory, die den Socket über den Relay-iframe aufbaut. */
export const relayWsFactory: WsFactory = (wsUrl) => {
  const httpUrl = new URL(wsUrl.replace(/^ws/i, 'http'));
  const origin = httpUrl.origin;

  let iframe: HTMLIFrameElement | null = null;
  const queue: string[] = [];

  const sock: WebSocketLike = {
    readyState: 0, // CONNECTING
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    send(data: string) {
      if (sock.readyState !== 1 || !iframe?.contentWindow) {
        queue.push(data);
        return;
      }
      iframe.contentWindow.postMessage({ __lvglRelay: true, type: 'send', data } satisfies RelayMsg, origin);
    },
    close() {
      if (sock.readyState === 3) return;
      iframe?.contentWindow?.postMessage({ __lvglRelay: true, type: 'close' } satisfies RelayMsg, origin);
      finish();
    },
  };

  function finish(code?: number) {
    if (sock.readyState === 3) return;
    sock.readyState = 3; // CLOSED
    window.removeEventListener('message', onMessage);
    iframe?.remove();
    iframe = null;
    sock.onclose?.({ code });
  }

  function onMessage(ev: MessageEvent) {
    if (ev.origin !== origin || !iframe || ev.source !== iframe.contentWindow) return;
    const msg = ev.data as RelayMsg | undefined;
    if (!msg?.__lvglRelay) return;
    switch (msg.type) {
      case 'open':
        sock.readyState = 1; // OPEN
        sock.onopen?.({});
        for (const d of queue.splice(0)) sock.send(d);
        break;
      case 'message':
        sock.onmessage?.({ data: msg.data });
        break;
      case 'error':
        sock.onerror?.({});
        break;
      case 'close':
        finish(msg.code);
        break;
    }
  }

  window.addEventListener('message', onMessage);
  ensureRelayScript(origin)
    .then(() => {
      if (sock.readyState === 3) return;
      iframe = document.createElement('iframe');
      iframe.src = `${origin}${RELAY_PATH}?ws=${encodeURIComponent(httpUrl.pathname + httpUrl.search)}`;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.tabIndex = -1;
      iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;pointer-events:none';
      document.body.appendChild(iframe);
    })
    .catch((err) => {
      console.warn('[esphome] Relay-Registrierung fehlgeschlagen', err);
      sock.onerror?.({});
      finish();
    });

  return sock;
};
