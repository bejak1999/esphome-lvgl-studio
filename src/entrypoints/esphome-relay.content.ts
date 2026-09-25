import type { RelayMsg } from '@/core/esphome/relay';

/**
 * Chrome-only WS-Relay (Gegenstück zu core/esphome/relay.ts).
 *
 * Läuft im unsichtbaren iframe `<esphome>/__lvgl_studio_relay`, das die Extension-Seite
 * einbettet. Der WebSocket entsteht hier mit der Origin des ESPHome-Hosts, daher akzeptiert
 * der device-builder den Handshake. Registriert wird das Script erst zur Laufzeit – und nur
 * für den eingestellten Host.
 */
export default defineContentScript({
  // Keine `matches` hier: WXT würde sie sonst als feste Host-Berechtigung ins Manifest
  // übernehmen. Registriert wird zur Laufzeit für genau den eingestellten Host (relay.ts).
  registration: 'runtime',
  include: ['chrome'],
  allFrames: true,
  runAt: 'document_start',
  main() {
    const extOrigin = new URL(browser.runtime.getURL('/')).origin;
    // Nur als iframe direkt in einer Seite DIESER Extension aktiv – nie in normalen Tabs.
    if (window.top === window || location.ancestorOrigins?.[0] !== extOrigin) return;

    // Die SPA des device-builders gar nicht erst laden – wir brauchen nur die Origin.
    window.stop();

    const wsPath = new URLSearchParams(location.search).get('ws') || '/ws';
    const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${scheme}//${location.host}${wsPath}`);
    const post = (m: RelayMsg) => window.parent.postMessage(m, extOrigin);

    ws.onopen = () => post({ __lvglRelay: true, type: 'open' });
    ws.onerror = () => post({ __lvglRelay: true, type: 'error' });
    ws.onclose = (ev) => post({ __lvglRelay: true, type: 'close', code: ev.code });
    ws.onmessage = (ev) => post({ __lvglRelay: true, type: 'message', data: String(ev.data) });

    window.addEventListener('message', (ev) => {
      if (ev.source !== window.parent || ev.origin !== extOrigin) return;
      const msg = ev.data as RelayMsg | undefined;
      if (!msg?.__lvglRelay) return;
      if (msg.type === 'send' && ws.readyState === WebSocket.OPEN) ws.send(msg.data);
      else if (msg.type === 'close') ws.close();
    });
  },
});
