/**
 * Lädt den offiziellen ESPHome-Schema-Dump von https://schema.esphome.io.
 *
 * URL-Struktur:  https://schema.esphome.io/<version>/<component>.json
 *   - `esphome.json`   → Index (core + Komponentenliste)
 *   - `<component>.json` → Schema einer Komponente (z. B. `lvgl.json`)
 *
 * Hinweis: schema.esphome.io sendet keine CORS-Header. Aus einer normalen Webseite
 * schlägt der Fetch daher fehl; die Extension umgeht dies per Host-Permissions.
 */

export const SCHEMA_BASE = 'https://schema.esphome.io';
export const DEFAULT_SCHEMA_VERSION = 'dev';

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const memoryCache = new Map<string, unknown>();

function cacheKey(version: string, component: string): string {
  return `${version}/${component}`;
}

export async function fetchSchemaFile(
  component: string,
  version = DEFAULT_SCHEMA_VERSION,
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  const key = cacheKey(version, component);
  const cached = memoryCache.get(key);
  if (cached) return cached;

  const url = `${SCHEMA_BASE}/${version}/${component}.json`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Schema ${url} → HTTP ${res.status}`);
  const data = await res.json();
  memoryCache.set(key, data);
  return data;
}

/** Index (esphome.json) mit core + Komponentenliste. */
export function fetchSchemaIndex(version = DEFAULT_SCHEMA_VERSION, fetchImpl: FetchLike = fetch) {
  return fetchSchemaFile('esphome', version, fetchImpl);
}

/** LVGL-Komponenten-Schema (lvgl.json). */
export function fetchLvglSchema(version = DEFAULT_SCHEMA_VERSION, fetchImpl: FetchLike = fetch) {
  return fetchSchemaFile('lvgl', version, fetchImpl);
}

/** Nur für Tests: In-Memory-Cache leeren. */
export function _clearSchemaCache() {
  memoryCache.clear();
}
