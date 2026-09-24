import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// wxt config: cross-browser MV3 (Firefox first, Chrome supported) Vue extension.
// Docs: https://wxt.dev

/** Logo-Größen aus src/public/icon/ (Quelle für Toolbar-, Sidebar- und Store-Icon). */
const ICONS = {
  16: 'icon/16.png',
  32: 'icon/32.png',
  48: 'icon/48.png',
  96: 'icon/96.png',
  128: 'icon/128.png',
};
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    // Cast: @tailwindcss/vite bringt eine eigene Vite-Version mit; der Typ-Mismatch
    // gegenüber der von WXT gebündelten Vite-Version ist rein nominell (Runtime ok).
    plugins: [tailwindcss() as never],
  }),
  manifest: ({ browser }) => ({
    name: 'ESPHome LVGL Studio',
    description:
      'Visueller LVGL-Dashboard-Editor für ESPHome mit KI-Agent (OpenRouter) und Auto-Debug-Loop.',
    // Host-Permissions erlauben direkten Zugriff (ohne CORS) auf ESPHome device-builder
    // und Home Assistant – beliebige Hosts/Ports, vom Nutzer in den Einstellungen gesetzt.
    //
    // Den Origin des WS-Handshakes muss die Extension anpassen, sonst lehnt der device-builder
    // ihn per Cross-Origin-Gate mit 403 ab. Die Wege dafür sind pro Browser verschieden:
    //   Firefox (MV2): webRequest + webRequestBlocking schreiben den Header um (background.ts)
    //   Chrome  (MV3): declarativeNetRequest greift bei WebSocket-Handshakes NICHT; stattdessen
    //                  öffnet ein zur Laufzeit registriertes Content-Script in einem iframe auf
    //                  dem ESPHome-Host den Socket (`scripting`, siehe core/esphome/relay.ts).
    permissions: [
      'storage',
      'tabs',
      ...(browser === 'chrome'
        ? ['sidePanel', 'scripting']
        : ['webRequest', 'webRequestBlocking']),
    ],
    // ACHTUNG: `ws://`/`wss://` sind NUR in Firefox gültige Match-Patterns. Chrome erlaubt
    // in Match-Patterns ausschließlich http, https, file und `*` – ein ws-Eintrag führt dort
    // zur Manifest-Warnung „URL pattern is malformed" und wird verworfen. Für WebSockets
    // genügt in Chrome ohnehin das http/https-Pattern desselben Hosts.
    host_permissions: [
      'http://*/*',
      'https://*/*',
      ...(browser === 'firefox' ? ['ws://*/*', 'wss://*/*'] : []),
    ],
    // `icons` erzeugt WXT automatisch aus src/public/icon/*.png; für den Toolbar-Button
    // muss das Icon ausdrücklich benannt werden. (Das Sidebar-Icon setzt der sidepanel-
    // Entrypoint selbst per <meta name="manifest.default_icon"> – WXT baut sidebar_action
    // aus dem Entrypoint und würde einen Wert von hier überschreiben.)
    action: {
      default_title: 'ESPHome LVGL Studio',
      default_icon: ICONS,
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'esphome-lvgl-studio@benni.local',
          strict_min_version: '109.0',
          data_collection_permissions: {
            required: ["none"]
          }
        }
      }
    })
  }),
});
