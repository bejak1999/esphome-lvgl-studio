/**
 * Persistenz der Addon-Instanzen **im Geräte-YAML**.
 *
 * Warum dort und nicht im Browser-Speicher? Das YAML ist die Quelle der Wahrheit: es
 * liegt auf dem device-builder und wird von dort geladen. Steht die Instanz-Information
 * mit im YAML, findet man seine Addons auf jedem Rechner wieder – und ESPHome ignoriert
 * Kommentare komplett.
 *
 * Format (eine Zeile je Instanz, am Anfang der Datei):
 * ```yaml
 * # lvgl-studio-addons (automatisch verwaltet – nicht von Hand ändern)
 * # lvgl-studio-addon: {"iid":"a_1","addon":"studio.frigate-camera",…}
 * ```
 */

import type { AddonInstance } from './types';

const MARKER = 'lvgl-studio-addon:';
const BANNER = '# lvgl-studio-addons (automatisch verwaltet – nicht von Hand ändern)';
const LINE_RE = /^\s*#\s*lvgl-studio-addon:\s*(\{.*\})\s*$/;
const BANNER_RE = /^\s*#\s*lvgl-studio-addons(\s|\()/;

/** Plausibilitätsprüfung – kaputte Zeilen sollen den Import nicht verhindern. */
function isInstance(v: unknown): v is Partial<AddonInstance> & { iid: string; addon: string } {
  if (!v || typeof v !== 'object') return false;
  const i = v as Partial<AddonInstance>;
  return typeof i.iid === 'string' && typeof i.addon === 'string';
}

/** Liest alle Addon-Instanzen aus einem YAML-Text. */
export function readInstances(yamlText: string): AddonInstance[] {
  if (!yamlText.includes(MARKER)) return [];
  const out: AddonInstance[] = [];
  for (const line of yamlText.split('\n')) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    try {
      const v = JSON.parse(m[1]) as unknown;
      if (!isInstance(v)) continue;
      out.push({
        page: '',
        config: {},
        widgetIds: {},
        ...v,
      });
    } catch {
      // unlesbare Zeile überspringen
    }
  }
  return out;
}

/** Entfernt alle von uns verwalteten Kommentarzeilen. */
export function stripInstances(yamlText: string): string {
  const lines = yamlText.split('\n').filter((l) => !LINE_RE.test(l) && !BANNER_RE.test(l));
  // führende Leerzeilen, die dadurch entstehen können, wegräumen
  while (lines.length && lines[0].trim() === '') lines.shift();
  return lines.join('\n');
}

/** Schreibt die Instanz-Zeilen an den Anfang des YAML (vorhandene werden ersetzt). */
export function writeInstances(yamlText: string, instances: AddonInstance[]): string {
  const body = stripInstances(yamlText);
  if (!instances.length) return body;
  const header = [BANNER, ...instances.map((i) => `# ${MARKER} ${JSON.stringify(i)}`), ''].join('\n');
  return header + body;
}
