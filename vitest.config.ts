import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

// WXT-Plugin: gleiche Aliase wie im Build (`@/…`) und ein Fake-`browser` für Code,
// der (indirekt) wxt/browser importiert – z. B. über i18n → settings.
export default defineConfig({
  // Cast wie in wxt.config.ts: WXT bündelt eine eigene Vite-Version (Typ-Mismatch rein nominell).
  plugins: [WxtVitest() as never],
});
