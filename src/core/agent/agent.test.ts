import { describe, it, expect } from 'vitest';
import { runAgent, type LlmLike, type StepEvent } from './loop';
import { executeTool, schemaFileName, summarizeComponentSchema, type AgentContext } from './tools';
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

describe('Leere Endantwort (Reasoning-Modelle)', () => {
  it('fragt einmal nach und liefert dann die Zusammenfassung', async () => {
    const script: AssistantMessage[] = [
      { role: 'assistant', content: '', tool_calls: undefined },
      { role: 'assistant', content: 'WLAN und API ergänzt.', tool_calls: undefined },
    ];
    const steps: StepEvent[] = [];
    const { final, messages } = await runAgent({
      llm: new ScriptedLlm(script),
      model: 'test',
      system: 'sys',
      history: [{ role: 'user', content: 'los' }],
      tools: TOOL_DEFS,
      ctx: makeCtx(),
      lang: 'de',
      onStep: (e) => steps.push(e),
    });
    expect(final).toBe('WLAN und API ergänzt.');
    // Die leere Assistant-Nachricht landet NICHT im Verlauf (manche Provider lehnen sie ab).
    expect(messages.map((m) => m.role)).toEqual(['user', 'user', 'assistant']);
    expect((steps.find((s) => s.kind === 'done') as Extract<StepEvent, { kind: 'done' }>).reason).toBe('finished');
  });

  it('endet nicht stumm, wenn das Modell zweimal leer antwortet', async () => {
    const empty: LlmLike = { async chat() { return { role: 'assistant', content: null }; } };
    const steps: StepEvent[] = [];
    const { final } = await runAgent({
      llm: empty,
      model: 'test',
      system: 'sys',
      history: [{ role: 'user', content: 'los' }],
      tools: TOOL_DEFS,
      ctx: makeCtx(),
      lang: 'de',
      onStep: (e) => steps.push(e),
    });
    const done = steps.find((s) => s.kind === 'done') as Extract<StepEvent, { kind: 'done' }>;
    expect(done.reason).toBe('empty');
    expect(final).toContain('ohne Antwort');
  });
});

describe('Tools', () => {
  it('get_component_doc liefert Markdown', async () => {
    const ctx = makeCtx();
    const out = await executeTool('get_component_doc', { component: 'ili9xxx' }, ctx);
    expect(out).toContain('# ili9xxx');
  });

  it('get_component_doc blättert lange Dokus per offset und sucht per query', async () => {
    const long = 'A'.repeat(7000) + ' model: JC4880P443 ' + 'B'.repeat(7000);
    const ctx = { ...makeCtx(), getComponentDoc: async () => ({ path: 'components/display/mipi_dsi.mdx', markdown: long }) };
    const first = await executeTool('get_component_doc', { component: 'display/mipi_dsi' }, ctx);
    expect(first).toContain('Zeichen 0–6000 von');
    expect(first).toContain('offset: 6000');
    expect(first).not.toContain('JC4880P443');

    const second = await executeTool('get_component_doc', { component: 'display/mipi_dsi', offset: 6000 }, ctx);
    expect(second).toContain('JC4880P443');

    const hit = await executeTool('get_component_doc', { component: 'display/mipi_dsi', query: 'jc4880p443' }, ctx);
    expect(hit).toContain('JC4880P443');
    expect(hit.length).toBeLessThan(2000);

    const miss = await executeTool('get_component_doc', { component: 'display/mipi_dsi', query: 'XYZ123' }, ctx);
    expect(miss).toContain('nicht vor');
  });

  it('get_component_doc gibt bei fehlender Doku einen Hinweis auf Plattform-Pfade', async () => {
    const ctx = { ...makeCtx(), getComponentDoc: async () => null };
    const out = await executeTool('get_component_doc', { component: 'foo' }, ctx);
    expect(out).toContain('display/mipi_dsi');
  });

  it('get_component_schema lädt Plattform-Schemas unter dem Plattformnamen', async () => {
    let requested = '';
    const ctx = {
      ...makeCtx(),
      async getComponentSchema(c: string) {
        requested = c;
        return {
          'mipi_dsi.display': {
            schemas: {
              CONFIG_SCHEMA: {
                schema: {
                  config_vars: {
                    model: { key: 'Required', type: 'enum', values: { CUSTOM: null, JC4880P443: null } },
                    dimensions: { key: 'Optional', schema: { config_vars: { width: { key: 'Required' }, height: { key: 'Required' } } } },
                    color_depth: { key: 'Optional', type: 'enum', default: '16', values: { '16': null, '24': null } },
                  },
                },
              },
            },
          },
        };
      },
    };
    const out = await executeTool('get_component_schema', { component: 'display.mipi_dsi' }, ctx);
    expect(requested).toBe('mipi_dsi');
    expect(out).toContain("Plattform unter 'display:'");
    expect(out).toContain('model (required): enum [CUSTOM, JC4880P443]');
    expect(out).toContain('dimensions { width (required), height (required) }');
    expect(out).toContain('(default: 16)');
  });

  it('schemaFileName normalisiert Plattform-Schreibweisen', () => {
    expect(schemaFileName('mipi_dsi')).toBe('mipi_dsi');
    expect(schemaFileName('display.mipi_dsi')).toBe('mipi_dsi');
    expect(schemaFileName('display/mipi_dsi')).toBe('mipi_dsi');
    expect(schemaFileName('gt911.touchscreen')).toBe('gt911');
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

  /** Fetch, der nie antwortet, aber auf das Abort-Signal reagiert (wie das echte fetch). */
  const hangingFetch = async (_url: string, init: { signal?: AbortSignal }) =>
    new Promise<never>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });

  it('bricht eine hängende Anfrage nach dem Zeitlimit mit klarer Meldung ab', async () => {
    const client = new OpenRouterClient({ apiKey: 'k', fetchImpl: hangingFetch, timeoutMs: 20 });
    await expect(client.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/Zeitüberschreitung/);
  });

  it('lässt einen Stop des Nutzers ein AbortError bleiben', async () => {
    const client = new OpenRouterClient({ apiKey: 'k', fetchImpl: hangingFetch, timeoutMs: 10_000 });
    const ctrl = new AbortController();
    const p = client.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
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
