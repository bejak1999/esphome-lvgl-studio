import { describe, it, expect } from 'vitest';
import { runAgent, type LlmLike, type StepEvent } from './loop';
import { executeTool, summarizeComponentSchema, type AgentContext } from './tools';
import { TOOL_DEFS } from './tools';
import { OpenRouterClient, supportsImageInput, userMessageWithAttachments, type ContentPart } from './openrouter';
import type { AssistantMessage } from './openrouter';

/** Mock-Modell, das vorprogrammierte Antworten in Reihenfolge liefert. */
class ScriptedLlm implements LlmLike {
  private i = 0;
  constructor(private script: AssistantMessage[]) {}
  async chat(): Promise<AssistantMessage> {
    return this.script[this.i++] ?? { role: 'assistant', content: 'ende', tool_calls: undefined };
  }
}

function makeCtx(): AgentContext & { yaml: string } {
  const ctx = {
    yaml: '',
    getYaml() {
      return this.yaml;
    },
    setYaml(y: string) {
      this.yaml = y;
    },
    validateStatic() {
      return this.yaml.includes('bg_colr')
        ? [{ message: "Unbekannter Key 'bg_colr'", where: 'btn_1' }]
        : [];
    },
    async getComponentSchema() {
      return {};
    },
    async getComponentDoc(c: string) {
      return { path: `components/${c}.mdx`, markdown: `# ${c}\nBeispiel-Doku.` };
    },
    async listComponents() {
      return ['lvgl', 'wifi'];
    },
    listEntities() {
      return ['light.schlafzimmer'];
    },
    getScreenInfo() {
      return { width: 480, height: 320 };
    },
  };
  return ctx;
}

describe('Auto-Debug-Loop', () => {
  it('korrigiert fehlerhaftes YAML selbstständig, bis die Validierung sauber ist', async () => {
    const bad = 'lvgl:\n  pages:\n    - widgets:\n        - button: { id: btn_1, bg_colr: 0xFF0000 }';
    const good = 'lvgl:\n  pages:\n    - widgets:\n        - button: { id: btn_1, bg_color: 0xFF0000 }';

    const script: AssistantMessage[] = [
      // 1) schreibt fehlerhaftes YAML
      { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'set_yaml', arguments: JSON.stringify({ yaml: bad }) } }] },
      // 2) sieht den Fehler → korrigiert
      { role: 'assistant', content: null, tool_calls: [{ id: 'b', type: 'function', function: { name: 'set_yaml', arguments: JSON.stringify({ yaml: good }) } }] },
      // 3) fertig
      { role: 'assistant', content: 'Fertig – Button-Farbe gesetzt.', tool_calls: undefined },
    ];

    const ctx = makeCtx();
    const steps: StepEvent[] = [];
    const { final } = await runAgent({
      llm: new ScriptedLlm(script),
      model: 'test',
      system: 'sys',
      history: [{ role: 'user', content: 'Mach den Button rot.' }],
      tools: TOOL_DEFS,
      ctx,
      onStep: (e) => steps.push(e),
    });

    expect(final).toBe('Fertig – Button-Farbe gesetzt.');
    expect(ctx.yaml).toBe(good); // korrigiert
    expect(ctx.yaml).not.toContain('bg_colr');
    // Es gab zwei set_yaml-Aufrufe und mindestens ein Fehler-Ergebnis dazwischen.
    const toolCalls = steps.filter((s) => s.kind === 'tool_call');
    expect(toolCalls).toHaveLength(2);
    const results = steps.filter((s) => s.kind === 'tool_result') as Extract<StepEvent, { kind: 'tool_result' }>[];
    expect(results[0].result).toContain('bg_colr'); // erster Versuch meldete den Fehler
    expect(results[1].result).toContain('keine Fehler'); // zweiter Versuch sauber
  });

  // `lang` steuert die Nutzer-Texte des Loops (Default: 'en') – beide Sprachen prüfen,
  // damit ein weiterer i18n-Umbau nicht wieder unbemerkt eine Sprache kaputt macht.
  it.each([
    { lang: undefined, expected: 'Cancelled.' },
    { lang: 'en' as const, expected: 'Cancelled.' },
    { lang: 'de' as const, expected: 'Abgebrochen.' },
  ])('respektiert shouldStop (Abbruch, lang=$lang)', async ({ lang, expected }) => {
    const ctx = makeCtx();
    const { final } = await runAgent({
      llm: new ScriptedLlm([]),
      model: 'test',
      system: 'sys',
      history: [],
      tools: TOOL_DEFS,
      ctx,
      lang,
      shouldStop: () => true,
    });
    expect(final).toBe(expected);
  });

  it('meldet den Token-Verbrauch je Schritt weiter', async () => {
    const script: AssistantMessage[] = [
      {
        role: 'assistant',
        content: 'Fertig.',
        tool_calls: undefined,
        usage: { prompt_tokens: 12345, completion_tokens: 67, total_tokens: 12412 },
      },
    ];
    const steps: StepEvent[] = [];
    await runAgent({
      llm: new ScriptedLlm(script),
      model: 'test',
      system: 'sys',
      history: [],
      tools: TOOL_DEFS,
      ctx: makeCtx(),
      onStep: (e) => steps.push(e),
    });
    const usage = steps.find((s) => s.kind === 'usage') as Extract<StepEvent, { kind: 'usage' }>;
    expect(usage.promptTokens).toBe(12345);
    expect(usage.completionTokens).toBe(67);
  });

  it.each([
    { lang: 'de' as const, needles: ['Schrittlimit', 'mach weiter'] },
    { lang: 'en' as const, needles: ['step limit', 'continue'] },
  ])('erklärt den Abbruch beim Schrittlimit (lang=$lang)', async ({ lang, needles }) => {
    // Modell, das endlos Tool-Calls produziert → läuft ins Limit.
    const looping: LlmLike = {
      async chat() {
        return {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'x', type: 'function', function: { name: 'get_screen_info', arguments: '{}' } }],
        };
      },
    };
    const steps: StepEvent[] = [];
    const { final } = await runAgent({
      llm: looping,
      model: 'test',
      system: 'sys',
      history: [],
      tools: TOOL_DEFS,
      ctx: makeCtx(),
      maxSteps: 3,
      lang,
      onStep: (e) => steps.push(e),
    });
    const done = steps.find((s) => s.kind === 'done') as Extract<StepEvent, { kind: 'done' }>;
    expect(done.reason).toBe('max_steps');
    for (const needle of needles) expect(final).toContain(needle);
  });

  it('gibt den vollen Verlauf inkl. Tool-Calls zurück (Kontext für Folgebefehle)', async () => {
    const script: AssistantMessage[] = [
      { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'get_screen_info', arguments: '{}' } }] },
      { role: 'assistant', content: 'Das Display ist 480×320.', tool_calls: undefined },
    ];
    const { messages } = await runAgent({
      llm: new ScriptedLlm(script),
      model: 'test',
      system: 'sys',
      history: [{ role: 'user', content: 'Wie groß ist das Display?' }],
      tools: TOOL_DEFS,
      ctx: makeCtx(),
    });
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(messages[2].content).toContain('480');
  });
});

describe('Tools', () => {
  it('get_component_doc liefert Markdown', async () => {
    const ctx = makeCtx();
    const out = await executeTool('get_component_doc', { component: 'ili9xxx' }, ctx);
    expect(out).toContain('# ili9xxx');
  });

  it('summarizeComponentSchema listet Config-Keys', () => {
    const schema = {
      wifi: { schemas: { CONFIG_SCHEMA: { schema: { config_vars: { ssid: { key: 'Required' }, password: { key: 'Optional' } } } } } },
    };
    const out = summarizeComponentSchema(schema, 'wifi');
    expect(out).toContain('ssid (required)');
    expect(out).toContain('password');
  });
});

describe('supportsImageInput (Vision-Filter)', () => {
  it('erkennt Bild-Eingabe über input_modalities und modality', () => {
    expect(supportsImageInput({ id: 'a', architecture: { input_modalities: ['text', 'image'] } })).toBe(true);
    expect(supportsImageInput({ id: 'b', architecture: { modality: 'text+image->text' } })).toBe(true);
    expect(supportsImageInput({ id: 'c', architecture: { input_modalities: ['text'] } })).toBe(false);
    expect(supportsImageInput({ id: 'd' })).toBe(false);
  });
});

describe('OpenRouterClient', () => {
  it('baut die Anfrage korrekt und parst die Antwort', async () => {
    let captured: { url: string; body: string } | null = null;
    const fakeFetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
      captured = { url, body: init.body ?? '' };
      return {
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Hallo!' } }] }),
      };
    };
    const client = new OpenRouterClient({ apiKey: 'k', fetchImpl: fakeFetch });
    const msg = await client.chat({ model: 'anthropic/claude-3.7-sonnet', messages: [{ role: 'user', content: 'hi' }] });

    expect(msg.content).toBe('Hallo!');
    expect(captured!.url).toContain('/chat/completions');
    expect(JSON.parse(captured!.body).model).toBe('anthropic/claude-3.7-sonnet');
    // Ohne PDF kein file-parser-Plugin.
    expect(JSON.parse(captured!.body).plugins).toBeUndefined();
  });

  it('aktiviert das file-parser-Plugin nur bei einem PDF-Anhang', async () => {
    let body = '';
    const fakeFetch = async (_url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
      body = init.body ?? '';
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }) };
    };
    const client = new OpenRouterClient({ apiKey: 'k', fetchImpl: fakeFetch });
    await client.chat({
      model: 'm',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'sieh dir das Datenblatt an' },
        { type: 'file', file: { filename: 'ds.pdf', file_data: 'data:application/pdf;base64,AAAA' } },
      ] }],
    });
    const parsed = JSON.parse(body);
    expect(parsed.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'pdf-text' } }]);
  });
});

describe('userMessageWithAttachments', () => {
  it('bettet Textdateien als Klartext ein (kein file-Part → kein 400)', () => {
    const msg = userMessageWithAttachments('erklär das', [
      { name: 'notiz.txt', type: 'text/plain', text: 'GPIO5 ist belegt' },
    ]);
    // Nur Text → content bleibt ein String, kein Parts-Array.
    expect(typeof msg.content).toBe('string');
    expect(msg.content).toContain('notiz.txt');
    expect(msg.content).toContain('GPIO5 ist belegt');
  });

  it('mischt Text (eingebettet) mit Bild (image_url) und PDF (file)', () => {
    const msg = userMessageWithAttachments('los', [
      { name: 'a.txt', type: 'text/plain', text: 'inhalt' },
      { name: 'b.png', type: 'image/png', dataUrl: 'data:image/png;base64,AAAA' },
      { name: 'c.pdf', type: 'application/pdf', dataUrl: 'data:application/pdf;base64,BBBB' },
    ]);
    expect(Array.isArray(msg.content)).toBe(true);
    const parts = msg.content as ContentPart[];
    const textPart = parts.find((p) => p.type === 'text') as { text: string };
    expect(textPart.text).toContain('inhalt'); // Textdatei eingebettet
    expect(parts.some((p) => p.type === 'image_url')).toBe(true);
    expect(parts.some((p) => p.type === 'file')).toBe(true);
    // Textdatei darf NICHT als file-Part auftauchen.
    expect(parts.filter((p) => p.type === 'file')).toHaveLength(1);
  });
});
