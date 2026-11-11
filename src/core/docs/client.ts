/**
 * Lädt ESPHome-Dokumentation als Kontext für die KI (M5) und für Hilfe-Links.
 *
 * Quelle: Repo `esphome/esphome.io` (Branch `current`, Astro/Starlight, MDX).
 *   Roh:    https://raw.githubusercontent.com/esphome/esphome.io/current/src/content/docs/<path>
 *   Seite:  https://esphome.io/components/<component>/
 *
 * raw.githubusercontent.com ist CORS-offen und funktioniert überall.
 */

export const DOCS_RAW_BASE =
  'https://raw.githubusercontent.com/esphome/esphome.io/current/src/content/docs';
export const DOCS_SITE = 'https://esphome.io';

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

const cache = new Map<string, string>();

/** Öffentliche Doku-Seite einer Komponente. */
export function docsPageUrl(component: string): string {
  return `${DOCS_SITE}/components/${component}/`;
}

/** Zentrale Doku-Pfade für LVGL (Kontext für die KI). */
export const LVGL_DOC_PATHS = [
  'components/lvgl/index.mdx',
  'components/lvgl/widgets.mdx',
  'components/lvgl/layouts.mdx',
];

/** Entfernt Frontmatter und `import …`-Zeilen, damit reiner Doku-Text bleibt. */
export function stripMdx(src: string): string {
  let s = src;
  const fm = s.match(/^---\n[\s\S]*?\n---\n/);
  if (fm) s = s.slice(fm[0].length);
  return s
    .split('\n')
    .filter((line) => !/^\s*import\s.+from\s.+;?\s*$/.test(line))
    .join('\n')
    .trim();
}

/** Pfade, die bereits 404 geliefert haben – nicht bei jedem Tool-Aufruf erneut anfragen. */
const missing = new Set<string>();

async function fetchRaw(path: string, fetchImpl: FetchLike): Promise<string | null> {
  if (cache.has(path)) return cache.get(path)!;
  if (missing.has(path)) return null;
  const res = await fetchImpl(`${DOCS_RAW_BASE}/${path}`);
  if (!res.ok) {
    if (res.status === 404) missing.add(path);
    return null;
  }
  const text = await res.text();
  cache.set(path, text);
  return text;
}

/**
 * Plattform-Domänen: Deren Plattformen liegen in der Doku unter `components/<domäne>/<plattform>.mdx`
 * (z. B. `display/mipi_dsi.mdx`, `touchscreen/gt911.mdx`). Reihenfolge = Priorität bei Mehrdeutigkeit.
 */
export const PLATFORM_DOMAINS = [
  'display',
  'touchscreen',
  'sensor',
  'binary_sensor',
  'text_sensor',
  'light',
  'output',
  'switch',
  'button',
  'number',
  'select',
  'text',
  'fan',
  'climate',
  'cover',
  'lock',
  'valve',
  'media_player',
  'speaker',
  'microphone',
  'audio_dac',
  'time',
  'update',
  'ota',
  'event',
  'datetime',
  'alarm_control_panel',
];

/** Kandidaten-Pfade direkt aus dem Namen (`lvgl`, `display/mipi_dsi`, `display.mipi_dsi`, `mipi_dsi.display`). */
function directCandidates(component: string): string[] {
  const parts = component.split('/').filter(Boolean);
  const out: string[] = [];
  const add = (p: string) => {
    out.push(`components/${p}.mdx`, `components/${p}/index.mdx`);
  };
  if (parts.length >= 2) {
    add(parts.join('/'));
    if (parts.length === 2) add(`${parts[1]}/${parts[0]}`);
  } else {
    add(parts[0] ?? '');
  }
  return out;
}

/**
 * Holt die Doku einer Komponente. Versucht `components/<c>.mdx` und `components/<c>/index.mdx`;
 * bei Plattformen (z. B. `mipi_dsi`, `gt911`) danach `components/<domäne>/<c>.mdx` für alle
 * bekannten Domänen. Akzeptiert auch `display/mipi_dsi`, `display.mipi_dsi` und `mipi_dsi.display`.
 * Gibt bereinigten Markdown-Text zurück (oder null, wenn nicht gefunden).
 */
export async function fetchComponentDoc(
  component: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ path: string; markdown: string } | null> {
  const name = component.trim().toLowerCase().replace(/\.mdx$/, '').replace(/^components\//, '').replace(/\./g, '/');
  if (!name) return null;

  for (const path of directCandidates(name)) {
    const raw = await fetchRaw(path, fetchImpl);
    if (raw != null) return { path, markdown: stripMdx(raw) };
  }

  if (name.includes('/')) return null;
  // Plattform-Suche parallel (sonst ~27 sequentielle Requests); Treffer nach Domänen-Priorität.
  const paths = PLATFORM_DOMAINS.map((d) => `components/${d}/${name}.mdx`);
  const results = await Promise.allSettled(paths.map((p) => fetchRaw(p, fetchImpl)));
  for (let i = 0; i < paths.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value != null) return { path: paths[i], markdown: stripMdx(r.value) };
  }
  return null;
}

/** Nur für Tests. */
export function _clearDocsCache() {
  cache.clear();
  missing.clear();
}
