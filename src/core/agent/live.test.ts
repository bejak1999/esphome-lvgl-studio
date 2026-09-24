/* Manueller Live-Harness gegen die echte OpenRouter-API. Läuft NUR, wenn OR_KEY gesetzt ist.
 * Ausführen: OR_KEY=... OR_MODEL=xiaomi/mimo-v2.5 npx vitest run src/core/agent/live.test.ts
 * (Node hat kein CORS → echtes Schema/Docs von schema.esphome.io / GitHub nutzbar.) */
import { describe, it, expect } from 'vitest';
import { OpenRouterClient } from './openrouter';
import { runAgent, SYSTEM_PROMPT, type StepEvent } from './loop';
import { TOOL_DEFS, type AgentContext } from './tools';
import { fetchLvglSchema, fetchSchemaFile } from '../schema/client';
import { validateYaml } from '../schema/validate';
import { fetchComponentDoc } from '../docs/client';

const KEY = process.env.OR_KEY;
const MODEL = process.env.OR_MODEL || 'xiaomi/mimo-v2.5';
const MODE = process.env.OR_MODE || 'build';
const PROMPT =
  process.env.OR_PROMPT ||
  (MODE === 'modify'
    ? 'Ändere die Hintergrundfarbe des Buttons btn_licht auf grün.'
    : 'Erstelle mir am unteren Displayrand eine Navigationsleiste mit 4 Buttons mit gleichem Abstand. Icons: Home, Licht (Glühbirne), Klima (Thermometer), Einstellungen (Zahnrad).');

// Vorhandene Config mit Automation + Lambda (für den Erhaltungstest).
const INITIAL = `lvgl:
  pages:
    - id: main
      widgets:
        - button:
            id: btn_licht
            x: 20
            y: 20
            width: 120
            height: 44
            bg_color: 0x2563EB
            widgets:
              - label:
                  id: btn_licht_lbl
                  text: "Licht"
            on_click:
              - homeassistant.service:
                  service: light.toggle
                  data:
                    entity_id: light.wohnzimmer
`;

describe.runIf(KEY)('LIVE Agent', () => {
  it(
    'baut das angeforderte Layout',
    async () => {
      const lvglSchema = await fetchLvglSchema('dev');
      let yaml = MODE === 'modify' ? INITIAL : '';
      const steps: StepEvent[] = [];
      const ctx: AgentContext = {
        getYaml: () => yaml,
        setYaml: (y) => {
          yaml = y;
        },
        validateStatic: () =>
          validateYaml(yaml, lvglSchema).map((i) => ({ message: i.message, where: i.widgetId })),
        getComponentSchema: (c) => fetchSchemaFile(c, 'dev'),
        getComponentDoc: (c) => fetchComponentDoc(c),
        listComponents: async () => ['lvgl', 'wifi', 'font', 'display'],
        listEntities: () => ['light.wohnzimmer', 'sensor.temp'],
        getScreenInfo: () => ({ width: 480, height: 320 }),
      };

      const client = new OpenRouterClient({ apiKey: KEY! });
      const { final } = await runAgent({
        llm: client,
        model: MODEL,
        system: SYSTEM_PROMPT,
        history: [{ role: 'user', content: PROMPT }],
        tools: TOOL_DEFS,
        ctx,
        maxSteps: 10,
        onStep: (e) => {
          steps.push(e);
          if (e.kind === 'tool_call') console.log('  🔧', e.name, JSON.stringify(e.args).slice(0, 120));
          else if (e.kind === 'tool_result') console.log('  ↳', e.result.slice(0, 200).replace(/\n/g, ' '));
          else if (e.kind === 'assistant' && e.text) console.log('  💬', e.text.slice(0, 200));
          else if (e.kind === 'error') console.log('  ❌', e.message);
        },
      });

      console.log('\n===== FINAL ANTWORT =====\n', final);
      console.log('\n===== ERZEUGTES YAML =====\n', yaml);

      // Heuristische Prüfungen
      const emojiCount = (yaml.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || []).length;
      const mdiEscapes = (yaml.match(/\\U000F[0-9A-Fa-f]{4}/g) || []).length;
      const materialSymbols = /Material.?Symbols/i.test(yaml);
      console.log('\n===== CHECKS =====');
      console.log('Emojis im YAML:', emojiCount, '| MDI-Escapes:', mdiEscapes, '| Material-Symbols:', materialSymbols);
      console.log('Buttons:', (yaml.match(/- button:/g) || []).length);
      console.log('validateStatic am Ende:', JSON.stringify(ctx.validateStatic()));
      if (MODE === 'modify') {
        console.log('ERHALT on_click:', yaml.includes('light.toggle'));
        console.log('ERHALT entity_id:', yaml.includes('light.wohnzimmer'));
        console.log('btn_licht noch da:', yaml.includes('btn_licht'));
      }

      expect(yaml.length).toBeGreaterThan(0);
    },
    180000,
  );
});
