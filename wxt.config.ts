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
  // Quellcode-ZIP für die AMO-Prüfung: nur, was zum Bauen nötig ist. Demo-/Referenzmaterial
  // gehört nicht hinein – und die lokalen Geräte-Configs (.roundtrip, enthalten Schlüssel) nie.
  zip: {
    excludeSources: [
      '.roundtrip/**',
      '.env*',
      'Demo_Vorlagen/**',
      'Editor Demo/**',
      'screenshots/**',
      'lvgl-schema.json',
      'web-ext-artifacts/**',
    ],
  },
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    // Cast: @tailwindcss/vite bringt eine eigene Vite-Version mit; der Typ-Mismatch
    // gegenüber der von WXT gebündelten Vite-Version ist rein nominell (Runtime ok).
    plugins: [tailwindcss() as never],
  }),
  manifest: ({ browser }) => ({
    // Name/Beschreibung aus src/public/_locales (en = Standard, de) – Stores zeigen sie je Sprache.
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    // Den Origin des WS-Handshakes muss die Extension anpassen, sonst lehnt der device-builder
    // ihn per Cross-Origin-Gate mit 403 ab. Die Wege dafür sind pro Browser verschieden:
    //   Firefox (MV2): webRequest + webRequestBlocking schreiben den Header um (background.ts)
    //   Chrome  (MV3): declarativeNetRequest greift bei WebSocket-Handshakes NICHT; stattdessen
    //                  öffnet ein zur Laufzeit registriertes Content-Script in einem iframe auf
    //                  dem ESPHome-Host den Socket (`scripting`, siehe core/esphome/relay.ts).
    permissions: [
      'storage',
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
          // 140: erste Version mit data_collection_permissions (AMO-Pflichtfeld).
          strict_min_version: '140.0',
          data_collection_permissions: {
            required: ['none'],
          },
        },
        // Android kennt data_collection_permissions erst ab 142.
        gecko_android: {
          strict_min_version: '142.0',
        },
      },
    })
  }),
});
