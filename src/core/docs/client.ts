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

async function fetchRaw(path: string, fetchImpl: FetchLike): Promise<string | null> {
  if (cache.has(path)) return cache.get(path)!;
  const res = await fetchImpl(`${DOCS_RAW_BASE}/${path}`);
  if (!res.ok) return null;
  const text = await res.text();
  cache.set(path, text);
  return text;
}

/**
 * Holt die Doku einer Komponente. Versucht `components/<c>.mdx`, dann `components/<c>/index.mdx`.
 * Gibt bereinigten Markdown-Text zurück (oder null, wenn nicht gefunden).
 */
export async function fetchComponentDoc(
  component: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ path: string; markdown: string } | null> {
  for (const path of [`components/${component}.mdx`, `components/${component}/index.mdx`]) {
    const raw = await fetchRaw(path, fetchImpl);
    if (raw != null) return { path, markdown: stripMdx(raw) };
  }
  return null;
}

/** Nur für Tests. */
export function _clearDocsCache() {
  cache.clear();
}
