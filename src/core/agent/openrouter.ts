/**
 * OpenRouter-Client (OpenAI-kompatible Chat-Completions-API).
 * Unterstützt Tool-Calling (Function Calling) und Vision (Bild-Eingabe).
 */

export interface TextPart {
  type: 'text';
  text: string;
}
export interface ImagePart {
  type: 'image_url';
  image_url: { url: string };
}
/** Datei-Anhang (z. B. PDF) – von manchen OpenRouter-Modellen unterstützt. */
export interface FilePart {
  type: 'file';
  file: { filename: string; file_data: string };
}
export type ContentPart = TextPart | ImagePart | FilePart;

export interface Attachment {
  name: string;
  /** MIME-Typ, z. B. 'image/png' oder 'application/pdf'. */
  type: string;
  /** data:-URL des Inhalts (für Bilder & PDFs). */
  dataUrl?: string;
  /** Klartext-Inhalt (für Textdateien – wird direkt in die Nachricht eingebettet). */
  text?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
  signal?: AbortSignal;
}

/** Token-Verbrauch einer Anfrage (OpenRouter liefert das je Antwort mit). */
export interface Usage {
  /** Tokens im gesendeten Kontext – das ist der „Füllstand" des Fensters. */
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface AssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: ToolCall[];
  usage?: Usage;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }>;

export interface ModelInfo {
  id: string;
  name?: string;
  /** Größe des Kontextfensters in Tokens (für die Füllstandsanzeige). */
  context_length?: number;
  architecture?: { input_modalities?: string[]; modality?: string };
}

/** True, wenn das Modell Bild-Eingabe unterstützt (für Vision / render_preview). */
export function supportsImageInput(m: ModelInfo): boolean {
  const im = m.architecture?.input_modalities;
  if (Array.isArray(im)) return im.includes('image');
  const mod = m.architecture?.modality;
  return typeof mod === 'string' && mod.includes('image');
}

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export class OpenRouterClient {
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(private config: OpenRouterConfig) {
    this.baseUrl = (config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    // Wichtig: `fetch` an globalThis binden. Als Objekt-Methode aufgerufen wäre `this`
    // der Client → "'fetch' called on an object that does not implement interface Window".
    this.fetchImpl = config.fetchImpl ?? ((url, init) => fetch(url, init as RequestInit));
  }

  async chat(opts: ChatOptions): Promise<AssistantMessage> {
    // Enthält irgendeine Nachricht einen PDF-file-Part? Dann das (kostenlose) file-parser-
    // Plugin aktivieren, damit auch Modelle ohne native PDF-Unterstützung den Text bekommen.
    const hasFilePart = opts.messages.some(
      (m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'file'),
    );
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: opts.messages,
      tools: opts.tools,
      temperature: opts.temperature ?? 0.2,
    };
    if (hasFilePart) {
      body.plugins = [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }];
    }

    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://esphome-lvgl-studio.local',
        'X-Title': 'ESPHome LVGL Studio',
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: AssistantMessage }[];
      usage?: Partial<Usage>;
      error?: { message?: string };
    };
    if (data.error) throw new Error(`OpenRouter: ${data.error.message}`);
    const message = data.choices?.[0]?.message;
    if (!message) throw new Error('OpenRouter: leere Antwort');
    const u = data.usage;
    return {
      role: 'assistant',
      content: message.content ?? null,
      tool_calls: message.tool_calls,
      usage: u
        ? {
            prompt_tokens: Number(u.prompt_tokens) || 0,
            completion_tokens: Number(u.completion_tokens) || 0,
            total_tokens: Number(u.total_tokens) || 0,
          }
        : undefined,
    };
  }

  /** Liste der verfügbaren Modelle (für das Dropdown in den Einstellungen). */
  async listModels(): Promise<ModelInfo[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenRouter /models HTTP ${res.status}`);
    const data = (await res.json()) as { data?: ModelInfo[] };
    return (data.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      context_length: m.context_length,
      architecture: m.architecture,
    }));
  }
}

/**
 * Baut eine User-Nachricht mit Text + Anhängen:
 *  - Bilder → image_url (Vision),
 *  - PDFs → file-Part (per file-parser-Plugin ausgewertet),
 *  - Textdateien → direkt als Text in die Nachricht eingebettet (kein „file"-Part! Der
 *    file-Kanal ist nur für PDFs; eine Textdatei als file führt beim Provider zu HTTP 400).
 */
export function userMessageWithAttachments(text: string, attachments: Attachment[] = []): ChatMessage {
  if (!attachments.length) return { role: 'user', content: text };

  // Textdateien vorne in den Textblock einbetten.
  let combinedText = text;
  for (const a of attachments) {
    if (a.text != null) {
      combinedText += `\n\n--- Datei: ${a.name} ---\n${a.text}\n--- Ende ${a.name} ---`;
    }
  }

  const binary = attachments.filter((a) => a.text == null && a.dataUrl);
  if (!binary.length) return { role: 'user', content: combinedText };

  const parts: ContentPart[] = [{ type: 'text', text: combinedText }];
  for (const a of binary) {
    if (a.type.startsWith('image/')) {
      parts.push({ type: 'image_url', image_url: { url: a.dataUrl! } });
    } else {
      parts.push({ type: 'file', file: { filename: a.name, file_data: a.dataUrl! } });
    }
  }
  return { role: 'user', content: parts };
}
