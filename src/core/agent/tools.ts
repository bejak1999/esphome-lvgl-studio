import type { ToolDef } from './openrouter';
import { ICONS, ICON_CATEGORIES } from '../lvgl/icons';
import { PLATFORM_DOMAINS } from '../docs/client';

/**
 * Werkzeuge des KI-Agenten. Die Definitionen (JSON-Schema) gehen an das Modell;
 * die Ausführung läuft über einen injizierten `AgentContext` (testbar, entkoppelt).
 */

export interface AgentIssue {
  message: string;
  where?: string;
}

export interface AgentContext {
  getYaml(): string;
  /**
   * Übernimmt neues YAML. Im Bestätigungs-Modus liefert die UI ein Promise, das erst
   * auflöst, wenn der Nutzer entschieden hat (`false` = abgelehnt).
   */
  setYaml(yaml: string): void | Promise<boolean>;
  /** Statische Schema-Validierung (offline). */
  validateStatic(): AgentIssue[];
  /** Live-Validierung gegen die verbundene ESPHome-Instanz (falls verbunden). */
  validateLive?(): Promise<AgentIssue[]>;
  getComponentSchema(component: string): Promise<unknown>;
  getComponentDoc(component: string): Promise<{ path: string; markdown: string } | null>;
  listComponents(): Promise<string[]>;
  listEntities(): string[];
  /** Display-Maße für symmetrische/gleichmäßige Anordnung. */
  getScreenInfo(): {
    width: number;
    height: number;
    /** LVGL-Seiten (`pages:`) mit id/Name/Widget-Anzahl. */
    pages?: { id: string; name: string; widgets: number }[];
    /** Index der Seite, die der Nutzer im Editor gerade betrachtet. */
    activePage?: number;
  };
  /** Rendert die aktuelle Vorschau als PNG-data-URL (für die visuelle Selbstprüfung der KI). */
  capturePreview?(): Promise<string | null>;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_yaml',
      description: 'Gibt das aktuelle ESPHome-YAML des Projekts zurück.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_yaml',
      description:
        'Ersetzt das gesamte ESPHome-YAML des Projekts. Gibt anschließend Validierungshinweise zurück. Immer das vollständige YAML übergeben.',
      parameters: {
        type: 'object',
        properties: { yaml: { type: 'string', description: 'Das komplette neue YAML.' } },
        required: ['yaml'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate',
      description:
        'Validiert das aktuelle YAML (statisch gegen das Schema und – falls verbunden – live gegen die ESPHome-Instanz). Gibt gefundene Fehler zurück.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_component_schema',
      description:
        'Liefert die gültigen Konfigurations-Keys einer ESPHome-Komponente (aktuelle Version) inkl. erlaubter Enum-Werte. Funktioniert auch für Plattformen (z. B. "mipi_dsi", "gt911"). Nutze dies, bevor du Config für eine Komponente schreibst.',
      parameters: {
        type: 'object',
        properties: { component: { type: 'string', description: "z. B. 'lvgl', 'ili9xxx', 'wifi'." } },
        required: ['component'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_component_doc',
      description:
        'Liefert die aktuelle ESPHome-Dokumentation (Markdown) einer Komponente – inkl. Beispiele. Nutze dies für unbekannte Hardware/Displays. Plattformen gehen auch als "<domäne>/<plattform>" (z. B. "display/mipi_dsi", "touchscreen/gt911"). Lange Dokus kommen in Abschnitten: weiterblättern mit offset, oder mit query gezielt nach einem Stichwort suchen (z. B. ein Panel-Modell).',
      parameters: {
        type: 'object',
        properties: {
          component: { type: 'string', description: "z. B. 'lvgl', 'wifi', 'display/mipi_dsi', 'esp32_hosted'." },
          offset: { type: 'integer', description: 'Optional: Startzeichen für den nächsten Abschnitt einer langen Doku.' },
          query: { type: 'string', description: 'Optional: liefert nur die Stellen rund um dieses Stichwort (z. B. "JC4880P443").' },
        },
        required: ['component'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_ha_entities',
      description: 'Listet die verfügbaren Home-Assistant-Entities (für Bindungen).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_screen_info',
      description:
        'Liefert die Display-Maße (Breite×Höhe in px). Nutze das für symmetrische Layouts und gleichmäßige Abstände.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_icons',
      description:
        'Liefert verfügbare MDI-Icons (Name + Unicode-Escape) nach Kategorie. Setze ein Icon als text eines label/icon-Widgets, z. B. text: "\\U000F0335".',
      parameters: {
        type: 'object',
        properties: { category: { type: 'string', description: 'Optional: nur eine Kategorie.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_preview',
      description:
        'Rendert die aktuelle Dashboard-Vorschau als Bild, damit du Layout, Positionierung, Abstände und Ästhetik visuell prüfen und bei Bedarf nachbessern kannst. Rufe dies nach dem Bauen/Ändern auf.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

function fmtIssues(issues: AgentIssue[]): string {
  if (!issues.length) return 'OK – keine Fehler gefunden.';
  return issues.map((i) => `- ${i.where ? i.where + ': ' : ''}${i.message}`).join('\n');
}

/** Maximal so viele Enum-Werte pro Key ausgeben (z. B. die Panel-Liste von mipi_dsi `model`). */
const MAX_ENUM_VALUES = 80;

/** Eine Key-Zeile: Name, required, Typ, Enum-Werte, verschachtelte Keys. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fmtConfigVar(name: string, def: any): string {
  let line = `- ${name}${def?.key === 'Required' ? ' (required)' : ''}`;
  if (def?.type) line += `: ${def.type}`;
  if (def?.type === 'enum' && def.values && typeof def.values === 'object') {
    const vals = Object.keys(def.values);
    const shown = vals.slice(0, MAX_ENUM_VALUES).join(', ');
    line += ` [${shown}${vals.length > MAX_ENUM_VALUES ? `, … (+${vals.length - MAX_ENUM_VALUES})` : ''}]`;
  }
  if (def?.default !== undefined && typeof def.default !== 'object') line += ` (default: ${def.default})`;
  const sub = def?.schema?.config_vars;
  if (sub && typeof sub === 'object') {
    const keys = Object.entries(sub).map(([k, v]) => `${k}${(v as { key?: string })?.key === 'Required' ? ' (required)' : ''}`);
    line += ` { ${keys.join(', ')} }`;
  }
  return line;
}

/**
 * Extrahiert eine kompakte Key-Liste aus einem Komponenten-Schema (spart Tokens).
 * Plattform-Komponenten stehen im Schema-Dump unter `<plattform>.<domäne>`
 * (z. B. `mipi_dsi.display`, `gt911.touchscreen`) – die werden mit ausgewertet.
 */
export function summarizeComponentSchema(schema: unknown, component: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = schema as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: [string, any][] = [];
  if (s && typeof s === 'object') {
    if (s[component]) entries.push([component, s[component]]);
    for (const [k, v] of Object.entries(s)) if (k.startsWith(`${component}.`)) entries.push([k, v]);
  }
  if (!entries.length) entries.push([component, s]);

  const sections: string[] = [];
  for (const [key, root] of entries) {
    const cv = root?.schemas?.CONFIG_SCHEMA?.schema?.config_vars;
    if (!cv || typeof cv !== 'object') continue;
    const dot = key.indexOf('.');
    const header =
      dot > 0
        ? `Config-Keys für '${key.slice(0, dot)}' als Plattform unter '${key.slice(dot + 1)}:' (YAML: ${key.slice(dot + 1)}: - platform: ${key.slice(0, dot)}):`
        : `Config-Keys für '${key}':`;
    sections.push(`${header}\n${Object.entries(cv).map(([k, v]) => fmtConfigVar(k, v)).join('\n')}`);
  }
  if (sections.length) return sections.join('\n\n');
  return JSON.stringify(schema).slice(0, 4000);
}

/**
 * Bildet den Namen auf die Schema-Datei ab: `display.mipi_dsi`, `display/mipi_dsi` und
 * `mipi_dsi.display` → `mipi_dsi` (schema.esphome.io legt Plattformen unter dem Plattformnamen ab).
 */
export function schemaFileName(component: string): string {
  const parts = component.trim().toLowerCase().split(/[./]/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? '';
  const nonDomain = parts.filter((p) => !PLATFORM_DOMAINS.includes(p));
  return nonDomain[0] ?? parts[parts.length - 1];
}

/** Zeichen pro Doku-Abschnitt, den die KI auf einmal bekommt. */
export const DOC_CHUNK = 6000;
/** Kontext um einen Suchtreffer in der Doku (Zeichen je Seite). */
const DOC_QUERY_CONTEXT = 700;
const DOC_QUERY_MAX_HITS = 8;

/** Liefert die Abschnitte um alle Treffer von `query` (zusammengeführt, wenn sie sich überlappen). */
export function docQuerySnippets(markdown: string, query: string): string | null {
  const q = query.toLowerCase();
  const hay = markdown.toLowerCase();
  const ranges: [number, number][] = [];
  for (let i = hay.indexOf(q); i !== -1 && ranges.length < 50; i = hay.indexOf(q, i + q.length)) {
    const start = Math.max(0, i - DOC_QUERY_CONTEXT);
    const end = Math.min(markdown.length, i + q.length + DOC_QUERY_CONTEXT);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1]) last[1] = end;
    else ranges.push([start, end]);
  }
  if (!ranges.length) return null;
  const shown = ranges.slice(0, DOC_QUERY_MAX_HITS);
  const out = shown.map(([a, b]) => `[Zeichen ${a}–${b}]\n${markdown.slice(a, b)}`).join('\n\n---\n\n');
  return ranges.length > shown.length ? `${out}\n\n(… ${ranges.length - shown.length} weitere Fundstellen)` : out;
}

/** Führt einen Tool-Aufruf aus und liefert das Ergebnis als String (Tool-Message-Content). */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentContext,
): Promise<string> {
  switch (name) {
    case 'get_current_yaml':
      return ctx.getYaml() || '(leer)';

    case 'set_yaml': {
      const yaml = String(args.yaml ?? '');
      const accepted = await ctx.setYaml(yaml);
      if (accepted === false) {
        return 'Der Nutzer hat diese Änderung ABGELEHNT. Das YAML wurde nicht übernommen. Wende sie nicht unverändert erneut an – frage nach, was stattdessen gewünscht ist.';
      }
      const staticIssues = ctx.validateStatic();
      const liveIssues = ctx.validateLive ? await ctx.validateLive() : [];
      const all = [...staticIssues, ...liveIssues];
      return `YAML übernommen.\nValidierung:\n${fmtIssues(all)}`;
    }

    case 'validate': {
      const staticIssues = ctx.validateStatic();
      const liveIssues = ctx.validateLive ? await ctx.validateLive() : [];
      return fmtIssues([...staticIssues, ...liveIssues]);
    }

    case 'get_component_schema': {
      const comp = String(args.component ?? '');
      const file = schemaFileName(comp);
      try {
        const schema = await ctx.getComponentSchema(file);
        return summarizeComponentSchema(schema, file);
      } catch (e) {
        return `Fehler beim Laden des Schemas für '${comp}': ${(e as Error).message}`;
      }
    }

    case 'get_component_doc': {
      const comp = String(args.component ?? '');
      const doc = await ctx.getComponentDoc(comp);
      if (!doc) {
        return `Keine Doku für '${comp}' gefunden. Plattformen liegen unter ihrer Domäne – versuche z. B. 'display/mipi_dsi' oder 'touchscreen/gt911'.`;
      }
      const md = doc.markdown;
      const total = md.length;
      const query = typeof args.query === 'string' ? args.query.trim() : '';
      if (query) {
        const hits = docQuerySnippets(md, query);
        return hits
          ? `Quelle: ${doc.path} (${total} Zeichen) – Fundstellen für „${query}":\n\n${hits}`
          : `Quelle: ${doc.path} (${total} Zeichen) – „${query}" kommt in dieser Doku nicht vor.`;
      }
      const offset = Math.max(0, Math.min(total, Math.floor(Number(args.offset) || 0)));
      const end = Math.min(total, offset + DOC_CHUNK);
      let out = `Quelle: ${doc.path} (Zeichen ${offset}–${end} von ${total})\n\n${md.slice(offset, end)}`;
      if (end < total) {
        out += `\n\n[… gekürzt. Weiter mit get_component_doc(component: "${comp}", offset: ${end}) oder gezielt mit query: "<Stichwort>".]`;
      }
      return out;
    }

    case 'list_ha_entities': {
      const ents = ctx.listEntities();
      return ents.length ? ents.join('\n') : '(keine Entities geladen)';
    }

    case 'get_screen_info': {
      const s = ctx.getScreenInfo();
      let out = `Display: ${s.width}×${s.height} px. Ursprung oben-links, +x nach rechts, +y nach unten.`;
      if (s.pages?.length) {
        const list = s.pages
          .map((p, i) => `  [${i}] id: ${p.id} · „${p.name}" · ${p.widgets} Widgets${i === s.activePage ? '   ← der Nutzer schaut GERADE auf diese Seite' : ''}`)
          .join('\n');
        out += `\nLVGL-Seiten (${s.pages.length}):\n${list}`;
        if (s.pages.length > 1) {
          out += '\nSeitenwechsel auf dem Gerät: on_press mit "lvgl.page.next:", "lvgl.page.previous:" oder "lvgl.page.show: <seiten-id>".';
        }
      }
      return out;
    }

    case 'list_icons': {
      const cat = String(args.category ?? '');
      const cats = cat ? [cat] : ICON_CATEGORIES;
      const lines: string[] = [];
      for (const c of cats) {
        const items = ICONS.filter((i) => i.category === c);
        if (!items.length) continue;
        lines.push(`## ${c}`);
        lines.push(
          items
            .map((i) => `${i.name} = \\U${i.code.toString(16).toUpperCase().padStart(8, '0')}`)
            .join(', '),
        );
      }
      return lines.join('\n');
    }

    default:
      return `Unbekanntes Tool: ${name}`;
  }
}
