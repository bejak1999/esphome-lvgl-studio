import type { ExtMessage, ExtResponse } from '@/shared/messaging';

/**
 * Background Service Worker.
 * M0: Health-Check-Ping + Sidebar-Öffnen per Toolbar-Klick (Chrome side_panel-Verhalten).
 * Später: zentrale WS-Verbindungen zu ESPHome/HA, Doc-/Schema-Cache, Fetch-Proxy.
 */
export default defineBackground(() => {
  // Chrome: Klick auf das Toolbar-Icon öffnet das Side-Panel.
  // (Firefox toggelt die Sidebar über sidebar_action automatisch.)
  if (import.meta.env.BROWSER === 'chrome') {
    // @ts-expect-error sidePanel ist Chrome-spezifisch und nicht in allen Typen vorhanden.
    browser.sidePanel
      ?.setPanelBehavior?.({ openPanelOnActionClick: true })
      .catch((err: unknown) => console.warn('sidePanel setPanelBehavior failed', err));
  }

  setupEsphomeOriginRewrite();
  setupToolbarSidebarToggle();

  browser.runtime.onMessage.addListener((message: unknown) => {
    const msg = message as ExtMessage | undefined;
    if (msg?.type === 'ping') {
      return Promise.resolve<ExtResponse>({ type: 'pong', at: Date.now() });
    }
    return undefined;
  });
});

/**
 * Firefox: Klick auf das Toolbar-Icon öffnet/schließt die Sidebar. `browser_action` und
 * `sidebar_action` sind getrennt – ohne diesen Handler bleibt die Sidebar nach dem X zu.
 */
function setupToolbarSidebarToggle() {
  if (import.meta.env.BROWSER !== 'firefox') return;
  const b = browser as unknown as {
    browserAction?: { onClicked?: { addListener: (cb: () => void) => void } };
    sidebarAction?: { toggle?: () => void; open?: () => void };
  };
  b.browserAction?.onClicked?.addListener(() => {
    b.sidebarAction?.toggle?.();
  });
}

/** Liest den konfigurierten ESPHome-Host aus den Einstellungen (leer, wenn keiner gesetzt). */
async function readEsphomeUrl(): Promise<URL | null> {
  try {
    const { settings } = await browser.storage.local.get('settings');
    const url = (settings as { esphome?: { url?: string } } | undefined)?.esphome?.url ?? '';
    return url ? new URL(url) : null;
  } catch {
    return null;
  }
}

/**
 * Firefox (MV2): Schreibt den `Origin`-Header des WebSocket-Handshakes zur konfigurierten
 * device-builder-Instanz auf deren eigene Origin um. Der device-builder weist sonst
 * Cross-Origin-Handshakes (Origin `moz-extension://…`) mit 403 ab. Durch das Setzen von
 * `Origin: http(s)://<host:port>` greift dessen Same-Origin-Ausnahme (`origin_matches_host`).
 * Wirkt ausschließlich auf den vom Nutzer eingestellten ESPHome-Host.
 *
 * Chrome kann das nicht (declarativeNetRequest greift nicht bei WS-Handshakes) und nutzt
 * stattdessen den Relay-iframe aus core/esphome/relay.ts.
 */
function setupEsphomeOriginRewrite() {
  if (import.meta.env.BROWSER !== 'firefox') return;
  const wr = (browser as unknown as { webRequest?: typeof browser.webRequest }).webRequest;
  if (!wr?.onBeforeSendHeaders) return;

  let esphomeHost = '';
  const refresh = async () => {
    esphomeHost = (await readEsphomeUrl())?.host ?? '';
  };
  refresh();
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) refresh();
  });

  wr.onBeforeSendHeaders.addListener(
    (details) => {
      try {
        const u = new URL(details.url);
        if (!esphomeHost || u.host !== esphomeHost) return {};
        const scheme = u.protocol === 'wss:' ? 'https:' : 'http:';
        const desiredOrigin = `${scheme}//${u.host}`;
        const headers = (details.requestHeaders ?? []).filter(
          (h) => h.name.toLowerCase() !== 'origin',
        );
        headers.push({ name: 'Origin', value: desiredOrigin });
        return { requestHeaders: headers };
      } catch {
        return {};
      }
    },
    { urls: ['ws://*/*', 'wss://*/*'], types: ['websocket'] },
    ['blocking', 'requestHeaders'],
  );
}
