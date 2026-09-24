import type { ToolDef } from './openrouter';
import { ICONS, ICON_CATEGORIES } from '../lvgl/icons';

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
        'Liefert die gültigen Konfigurations-Keys einer ESPHome-Komponente (aktuelle Version). Nutze dies, bevor du Config für eine Komponente schreibst.',
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
        'Liefert die aktuelle ESPHome-Dokumentation (Markdown) einer Komponente – inkl. Beispiele. Nutze dies für unbekannte Hardware/Displays.',
      parameters: {
        type: 'object',
        properties: { component: { type: 'string' } },
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

/** Extrahiert eine kompakte Key-Liste aus einem Komponenten-Schema (spart Tokens). */
export function summarizeComponentSchema(schema: unknown, component: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = schema as any;
  const root = s?.[component] ?? s;
  const cv = root?.schemas?.CONFIG_SCHEMA?.schema?.config_vars;
  if (cv && typeof cv === 'object') {
    const lines = Object.entries(cv).map(([k, v]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const def = v as any;
      return `- ${k}${def?.key === 'Required' ? ' (required)' : ''}${def?.type ? `: ${def.type}` : ''}`;
    });
    return `Config-Keys für '${component}':\n${lines.join('\n')}`;
  }
  return JSON.stringify(schema).slice(0, 4000);
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
      try {
        const schema = await ctx.getComponentSchema(comp);
        return summarizeComponentSchema(schema, comp);
      } catch (e) {
        return `Fehler beim Laden des Schemas für '${comp}': ${(e as Error).message}`;
      }
    }

    case 'get_component_doc': {
      const comp = String(args.component ?? '');
      const doc = await ctx.getComponentDoc(comp);
      if (!doc) return `Keine Doku für '${comp}' gefunden.`;
      return doc.markdown.slice(0, 6000);
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
