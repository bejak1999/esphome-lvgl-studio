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
    // Host-Zugriff: fest nur schema.esphome.io (sendet keine CORS-Header). Alle Geräte im
    // Heimnetz (ESPHome, Home Assistant, Kamera-Bilder, Addon-Quellen) sind OPTIONAL und werden
    // pro Host zur Laufzeit erfragt (src/shared/hostAccess.ts) – keine „alle Websites"-Warnung
    // bei der Installation.
    // ACHTUNG: `ws://`/`wss://` sind NUR in Firefox gültige Match-Patterns (dort nötig für die
    // Origin-Umschreibung per webRequest). Chrome verwirft sie mit „URL pattern is malformed".
    host_permissions: [
      'https://schema.esphome.io/*',
      // Nur für die E2E-Tests (E2E_HOSTS=1): den lokalen Test-Server vorab erlauben, weil
      // automatisierte Browser den Berechtigungsdialog nicht bestätigen können.
      ...(process.env.E2E_HOSTS === '1'
        ? ['http://127.0.0.1/*', 'http://10.255.255.1/*', ...(browser === 'firefox' ? ['ws://127.0.0.1/*'] : [])]
        : []),
    ],
    ...(browser === 'chrome'
      ? { optional_host_permissions: ['http://*/*', 'https://*/*'] }
      : { optional_permissions: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }),
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
