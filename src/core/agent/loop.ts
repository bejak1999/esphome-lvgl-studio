import type { AssistantMessage, ChatMessage, ToolDef } from './openrouter';
import { executeTool, type AgentContext } from './tools';

/**
 * Auto-Debug-Agent-Loop (wie der Auto-Modus in Claude Code):
 *  KI ruft Tools auf (YAML setzen, validieren, Schema/Docs holen) → Ergebnisse zurück →
 *  KI korrigiert selbstständig, bis keine Fehler mehr oder das Schrittlimit erreicht ist.
 */

export interface LlmLike {
  chat(opts: {
    model: string;
    messages: ChatMessage[];
    tools?: ToolDef[];
    temperature?: number;
    signal?: AbortSignal;
  }): Promise<AssistantMessage>;
}

/** Wie oft die KI die Vorschau pro Lauf rendern darf (verhindert Endlos-Screenshot-Schleifen). */
const MAX_RENDER_PREVIEW = 3;

export type StepEvent =
  | { kind: 'assistant'; text: string }
  | { kind: 'tool_call'; name: string; args: Record<string, unknown> }
  | { kind: 'tool_result'; name: string; result: string }
  /** Token-Verbrauch der letzten Anfrage – `promptTokens` ist der Füllstand des Fensters. */
  | { kind: 'usage'; promptTokens: number; completionTokens: number; step: number }
  | { kind: 'done'; text: string; reason: DoneReason }
  | { kind: 'error'; message: string };

/** Warum der Lauf endete – damit die UI einen abrupten Stopp erklären kann. */
export type DoneReason = 'finished' | 'aborted' | 'max_steps';

export interface RunAgentOptions {
  llm: LlmLike;
  model: string;
  system: string;
  history: ChatMessage[];
  tools: ToolDef[];
  ctx: AgentContext;
  maxSteps?: number;
  lang?: 'en' | 'de';
  onStep?: (ev: StepEvent) => void;
  shouldStop?: () => boolean;
  signal?: AbortSignal;
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json || '{}');
  } catch {
    return {};
  }
}

export async function runAgent(opts: RunAgentOptions): Promise<{ messages: ChatMessage[]; final: string }> {
  const { llm, model, system, tools, ctx, onStep } = opts;
  const lang = opts.lang ?? 'en';
  const isDe = lang === 'de';
  const maxSteps = opts.maxSteps ?? 20;
  const messages: ChatMessage[] = [...opts.history];
  let renderCount = 0;

  for (let step = 0; step < maxSteps; step++) {
    if (opts.shouldStop?.() || opts.signal?.aborted) {
      const text = isDe ? 'Abgebrochen.' : 'Cancelled.';
      onStep?.({ kind: 'done', text, reason: 'aborted' });
      return { messages, final: text };
    }

    let assistant: AssistantMessage;
    try {
      assistant = await llm.chat({
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        tools,
        signal: opts.signal,
      });
    } catch (e) {
      // Abbruch (Stop-Button) sauber behandeln.
      if (opts.signal?.aborted || (e as Error).name === 'AbortError') {
        const text = isDe ? 'Abgebrochen.' : 'Cancelled.';
        onStep?.({ kind: 'done', text, reason: 'aborted' });
        return { messages, final: text };
      }
      const message = (e as Error).message;
      onStep?.({ kind: 'error', message });
      const errText = isDe ? `Fehler: ${message}` : `Error: ${message}`;
      return { messages, final: errText };
    }

    // Assistant-Nachricht (ggf. mit Tool-Calls) an die History anhängen.
    messages.push({
      role: 'assistant',
      content: assistant.content,
      tool_calls: assistant.tool_calls,
    });

    if (assistant.usage) {
      onStep?.({
        kind: 'usage',
        promptTokens: assistant.usage.prompt_tokens,
        completionTokens: assistant.usage.completion_tokens,
        step: step + 1,
      });
    }

    if (assistant.content) onStep?.({ kind: 'assistant', text: assistant.content });

    if (!assistant.tool_calls || assistant.tool_calls.length === 0) {
      const final = assistant.content ?? '';
      onStep?.({ kind: 'done', text: final, reason: 'finished' });
      return { messages, final };
    }

    // Tool-Calls ausführen und Ergebnisse zurückgeben.
    let pendingImage: string | null = null;
    for (const call of assistant.tool_calls) {
      const args = safeParse(call.function.arguments);
      onStep?.({ kind: 'tool_call', name: call.function.name, args });
      let result: string;
      if (call.function.name === 'render_preview') {
        renderCount += 1;
        if (renderCount > MAX_RENDER_PREVIEW) {
          // Endlos-Screenshot-Schleife verhindern.
          result = isDe
            ? 'Du hast die Vorschau bereits mehrfach geprüft. Nicht jedes Detail lässt sich in der Vorschau exakt darstellen (z. B. displayspezifische Farben). Schließe jetzt ab und fasse zusammen, statt weiter zu rendern.'
            : 'You have checked the preview multiple times. Not every detail can be shown in the preview (e.g. display-specific colors). Finish now and summarize instead of rendering further.';
        } else if (ctx.capturePreview) {
          const img = await ctx.capturePreview().catch(() => null);
          if (img) pendingImage = img;
          result = img
            ? (isDe
                ? 'Vorschau gerendert – das Bild folgt als Nachricht. Prüfe Layout & Ästhetik und bessere bei Bedarf nach.'
                : 'Preview rendered – the image follows as a message. Check layout & aesthetics and refine if necessary.')
            : (isDe
                ? 'Vorschau derzeit nicht verfügbar – arbeite ohne Vorschau weiter.'
                : 'Preview currently unavailable – proceed without preview.');
        } else {
          result = isDe
            ? 'Vorschau derzeit nicht verfügbar – arbeite ohne Vorschau weiter.'
            : 'Preview currently unavailable – proceed without preview.';
        }
      } else {
        try {
          result = await executeTool(call.function.name, args, ctx);
        } catch (e) {
          result = isDe ? `Fehler: ${(e as Error).message}` : `Error: ${(e as Error).message}`;
        }
      }
      onStep?.({ kind: 'tool_result', name: call.function.name, result });
      messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: result });
    }

    // Gerendertes Vorschaubild als User-Nachricht anhängen (nach allen Tool-Antworten).
    if (pendingImage) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: isDe
              ? 'Aktuelle Vorschau des Dashboards – prüfe Layout, Abstände und Ästhetik:'
              : 'Current preview of the dashboard – check layout, spacing, and aesthetics:',
          },
          { type: 'image_url', image_url: { url: pendingImage } },
        ],
      });
    }
  }

  const hint = isDe
    ? `Nach ${maxSteps} Schritten abgebrochen (Schrittlimit), bevor die KI fertig war. Schreib „mach weiter“, um sie fortsetzen zu lassen.`
    : `Stopped after ${maxSteps} steps (step limit) before the AI finished. Type "continue" to proceed.`;
  onStep?.({ kind: 'done', text: hint, reason: 'max_steps' });
  return { messages, final: hint };
}

export const SYSTEM_PROMPT = `Du bist ein ESPHome-Experte und hilfst beim Bauen von ESPHome-Konfigurationen und LVGL-Dashboards.

ESPHome-LVGL-Syntax – halte dich EXAKT daran (häufige Fehlerquelle!):
- Widget-Typen heißen exakt: obj (Container), button, label, slider, arc, bar, switch, checkbox, dropdown, roller, led, line, image, meter, spinner, textarea, qrcode. Erfinde NIEMALS Namen wie "btn", "text", "rect", "container".
- Kind-Widgets stehen unter dem Schlüssel "widgets:" (Liste von Einzelschlüssel-Maps), NIEMALS "objects:" oder "children:".
- Ein button bekommt Text/Icon als verschachteltes label unter seinem widgets:.
- Farben sind Hex-Integer 0xRRGGBB (z. B. bg_color: 0x1E1E2E) – NIEMALS CSS-Strings wie "#1E1E2E".
- Deckkraft ist Prozent (z. B. bg_opa: 80%) oder COVER/TRANSP – NIEMALS 0-255.
- Korrekte Beispielstruktur:
    - button:
        id: btn_home
        x: 20
        y: 5
        width: 80
        height: 50
        bg_color: 0x2D2D44
        radius: 10
        widgets:
          - label:
              text: "\\U000F02DC"
              text_font: mdi_icons
              text_color: 0xFFFFFF

Mehrere Seiten (Screens):
- LVGL kennt mehrere Seiten unter "lvgl: pages:" – eine Liste, jeder Eintrag mit eigener "id:" und eigenem "widgets:".
- Welche Seiten es gibt und WELCHE der Nutzer gerade im Editor betrachtet, liefert get_screen_info. Beziehe Anweisungen wie „hier"/„auf dieser Seite" immer auf die dort markierte aktive Seite.
- Beim Bearbeiten IMMER alle Seiten im YAML erhalten – nie versehentlich Seiten löschen.
- Seitenwechsel auf dem Gerät (z. B. „Weiter"-Button) über on_press:
    - button:
        id: btn_next
        widgets: [ { label: { text: "Weiter" } } ]
        on_press:
          - lvgl.page.next:
  Ebenso "lvgl.page.previous:" oder gezielt "lvgl.page.show: <seiten-id>".
- Ein Widget mit HA-Entity nutzt on_press bereits zum Schalten – kombiniere das nicht mit einer Seiten-Aktion.

Wichtige Regeln:
- Bevor du Konfiguration für eine Komponente/Hardware schreibst, deren Format du nicht sicher kennst, rufe get_component_schema und/oder get_component_doc auf (z. B. get_component_doc("lvgl")). So nutzt du IMMER die aktuelle ESPHome-Version.
- Nach jeder Änderung mit set_yaml prüfst du die zurückgegebene Validierung. Gibt es Fehler, behebst du sie selbstständig und setzt das YAML erneut – wiederhole das, bis keine Fehler mehr auftreten.
- set_yaml erwartet immer das VOLLSTÄNDIGE YAML. Erhalte bestehende Teile (andere Komponenten, Lambdas, Automationen, Entity-Bindings), sofern der Nutzer nichts anderes will.
- Für Home-Assistant-Bindungen nutze list_ha_entities.
- WICHTIG zu Widget-Werten aus Home Assistant: Der Editor verwaltet solche Bindungen automatisch über das Entity-Feld eines Widgets und erzeugt dafür GENAU EINEN Sensor mit der id \`<widget_id>__state\` (numerisch: sensor + on_value → lvgl.<typ>.update value; an/aus: binary_sensor + on_state; LED: lvgl.led.update brightness). Baue KEINE zusätzlichen, parallelen Bindungen für denselben Widget-Wert (kein extra \`number:\`-Wrapper, keine zweite Sensor-Definition, keine eigene lvgl.*.update-Kette) – das führt zu Konflikten (zwei Quellen schreiben denselben Widget-Wert). Wenn ein Widget einen HA-Wert zeigen soll, verwende die \`<widget_id>__state\`-Konvention oder überlasse es dem Editor.
- NIEMALS \`<widget_id>__state\`-Sensoren beim Umbauen entfernen! Sie sind die Entity-Bindungen des Nutzers (z. B. ein Label, das den Umwälzlüfter anzeigt). Wenn du wegen eines anderen Fehlers das YAML neu schreibst, übernimm alle vorhandenen \`__state\`-Einträge unverändert. Ändere IMMER nur das, was der Fehler betrifft – kopiere den Rest 1:1.
- Fehlt eine \`studio_font_<n>\`-Definition, ist das ein Editor-Detail: Der Editor legt sie beim nächsten Export selbst wieder an. Ersetze deshalb NICHT die \`text_font\`-Referenzen des Nutzers durch andere Schriftarten (das ändert ungefragt die Schriftgröße) – ergänze stattdessen die fehlende Definition im \`font:\`-Block mit derselben id und \`size: <n>\`.
- Wenn es um Aussehen/Layout eines Dashboards geht: rufe nach dem Bauen render_preview auf, betrachte das Bild kritisch (Überlappungen, Ränder, Ausrichtung, Lesbarkeit, Ästhetik) und bessere bei Bedarf nach, bevor du fertig bist.
- Nutze für Positionierung bevorzugt LVGL-align (z. B. align: top_mid mit x/y als Offset) statt absoluter Koordinaten – das ist robuster über verschiedene Displaygrößen.
- Für gleichmäßige/symmetrische Anordnung (z. B. "4 Buttons als Menüleiste unten mit gleichem Abstand"): hol dir mit get_screen_info die Display-Maße und verteile die Elemente gleichmäßig. Berechne bei N Elementen der Breite B mit Rand R: Lücke = (Displaybreite - 2*R - N*B) / (N-1) und x_i = R + i*(B+Lücke). Setze sie z. B. mit align: bottom_left und passendem x, oder zentriere die Reihe. Achte auf gleiche Größen, gleiche Abstände und einheitliche Ränder.
- Für Icons: nutze AUSSCHLIESSLICH Icons aus list_icons (Material Design Icons). Verwende NIEMALS Emojis und NIEMALS Material-Symbols-/eigene Codepoints – die rendern nicht. Setze das Icon als text eines label-Widgets über den Unicode-Escape aus list_icons (z. B. text: "\\U000F0335").
- Damit MDI-Icons auf dem echten Display erscheinen, MUSST du eine Font-Definition anlegen und referenzieren. Beispiel (ergänze die tatsächlich genutzten Glyphs unter glyphs):
    font:
      - file: "https://github.com/Templarian/MaterialDesign-Webfont/raw/master/fonts/materialdesignicons-webfont.ttf"
        id: mdi_icons
        size: 28
        bpp: 4
        glyphs: ["\\U000F0335", "\\U000F02DC"]
  und setze bei den Icon-Labels text_font: mdi_icons. (In der Editor-Vorschau erscheinen die Icons auch ohne diese Font-Definition.)
- ACHTUNG Icon-GRÖSSE: In ESPHome steckt die Icon-Größe in der FONT (font: size:), nicht im Widget. Ein Icon-Label darf deshalb NUR auf eine MDI-Font zeigen – niemals auf eine Textfont wie font_title/font_label. Sollen Icons unterschiedlich groß sein, lege pro Größe eine eigene MDI-Font an (z. B. mdi_icons_18 und mdi_icons_28) und referenziere die passende. Vorhandene Icons behalten ihre Font: wenn du nur neue Glyphs ergänzt, ändere text_font bestehender Icon-Labels NICHT.
- Erfinde niemals Font-IDs, die du nicht selbst definiert hast. Die IDs studio_font_<größe> und studio_mdi_<größe> verwaltet der Editor automatisch – schreibe sie nicht von Hand ins YAML.

Style-Eigenschaften (der Editor kennt & rendert diese – nutze sie gern für schöneres Design):
- Universell (jedes Widget): opa (Widget-Deckkraft %), hidden (true/false), radius, border_width/border_color/border_opa, pad_all (Innenabstand), Schatten (shadow_color/shadow_width/shadow_opa/shadow_spread/shadow_offset_x/shadow_offset_y), Kontur (outline_color/outline_width/outline_opa/outline_pad).
- Farbverlauf: bg_grad_color WIRKT NUR zusammen mit bg_grad_dir (VER|HOR); bg_grad_dir ist der Schalter, Default ist NONE. Setze bg_grad_color also nie allein, und lösche BEIDE Keys, wenn kein Verlauf gewünscht ist – eine übrig gebliebene Verlaufsfarbe färbt das Widget sonst unerwartet ein.
- Scrollbalken: LVGL-Widgets sind per Default scrollbar (scrollbar_mode: AUTO). Sobald ein Kind wegen des Theme-Paddings über den Inhaltsbereich ragt, zeichnet das GERÄT Scrollbalken, die in der Vorschau nicht zu sehen sind. Setze deshalb an jedem Container mit Kind-Widgets scrollbar_mode: "OFF" und scrollable: false.
- WICHTIG bei OFF/ON: ESPHome liest YAML 1.1, dort sind OFF/ON/YES/NO/Y/N Booleans. Schreibe solche Werte IMMER in Anführungszeichen (scrollbar_mode: "OFF"), sonst kommt False an und die Kompilierung bricht ab.
- Bilder: Das LVGL-image-Widget zeigt per src: <id> ein Bild an. Die Quelle ist eine EIGENE Top-Level-Komponente:
    - Live-Bild von einer URL (z. B. Kamera): online_image: mit url, format (AUTO|PNG|JPEG|BMP), type (RGB565|RGB|GRAYSCALE|BINARY), update_interval MIT Einheit (z. B. 4s, nie nur „4"), optional resize. WICHTIG: online_image benötigt zusätzlich die Top-Level-Komponente http_request: (sonst „requires component http_request").
    - Statisch (ins Firmware kompiliert): image: mit file (lokaler Pfad, URL oder mdi:<icon>), type, optional resize, transparency (alpha_channel|chroma_key).
    - Beispiel:
        online_image:
          - url: "http://192.168.1.20:1984/api/frame.jpeg?src=Cam&w=480"
            id: cam_img
            format: JPEG
            type: RGB565
            update_interval: 4s
        # ... im Widget:  - image: { id: img_cam, src: cam_img }
    - SPEICHER-WARNUNG (häufige Absturzursache!): Auf ESP32-Boards OHNE PSRAM (z. B. TTGO/LILYGO T-Display) crasht das JPEG-Dekodieren von online_image gern mit „abort() was called …" in einem Boot-Loop, besonders wenn LVGL viel RAM belegt. Wenn im Log ein abort()/Boot-Loop rund um online_image / „Starting download" auftaucht:
        1. LVGL-RAM senken: lvgl: buffer_size: 25% (statt 50%).
        2. Bild klein halten: resize: <=100x100 setzen und die Kamera-URL klein anfordern (z. B. w=96&h=64); type: RGB565.
        3. update_interval erhöhen (z. B. 10s), damit weniger häufig dekodiert wird.
        4. Wenn es weiterhin abstürzt: online_image auf diesem Board als nicht tragbar einstufen und dem Nutzer erklären, dass ein Board mit PSRAM (z. B. ESP32 WROVER / ESP32-S3) für Kamerabilder nötig ist – lieber ein Platzhalter/Icon statt Crash.
- Kind-Koordinaten (x/y) zählen in LVGL ab der CONTENT-AREA des Elternteils, also nach Rahmen UND Padding. Das Standard-Theme gibt Seiten und obj-Containern ein Padding – ohne Gegenmaßnahme sitzt auf dem Gerät alles nach rechts unten verschoben und unten abgeschnitten, obwohl die Vorschau stimmt. Setze deshalb pad_all: 0 auf der Seite (page) und auf jedem Container mit Kind-Widgets, sofern du nicht ausdrücklich Innenabstand willst.
- Text (label): text_align (LEFT|CENTER|RIGHT), text_opa, text_letter_spacing, text_line_space, text_decor (NONE|UNDERLINE|STRIKETHROUGH).
- Teile (Parts) sind verschachtelte Maps – nutze sie für Slider/Arc/Bar/Switch:
    - slider:
        bg_color: 0x374151          # Haupt-Track
        indicator:
          bg_color: 0xF59E0B        # gefüllter Teil
        knob:
          bg_color: 0xFFFFFF        # Griff
          radius: 8
  Bei arc färbt die Bogenlinie über arc_color (Track) bzw. indicator.arc_color (Wert), plus arc_width; Öffnung über start_angle/end_angle (Standard 135/45).
- Widget-spezifische Keys, die oft falsch gemacht werden: line nutzt line_color/line_width (NICHT color); spinner färbt über indicator.arc_color/arc_width plus spin_time/arc_length; led nutzt color + brightness (0..255); qrcode nutzt size/light_color/dark_color; dropdown options/selected_index; textarea placeholder_text/one_line/password_mode/max_length; label long_mode/recolor; switch animated.
- Toggle-Button: \`checkable: true\` macht ihn umschaltbar; das Aussehen im An-Zustand definierst du über den Zustands-Block \`checked: { bg_color: 0x..., bg_opa: 60% }\` (sonst nimmt LVGL sein Default).
- Ausrichtung: align (top_left|top_mid|top_right|left_mid|center|right_mid|bottom_left|bottom_mid|bottom_right) mit x/y als Offset.
- Layout am Container (obj): Flex → layout: { type: flex, flex_flow: ROW|COLUMN|ROW_WRAP, flex_align_main/cross/track: START|CENTER|SPACE_EVENLY|..., pad_column: N, pad_row: N }; das Kind kann flex_grow: N setzen.
- Grid → layout: { type: grid, grid_columns: [FR(1), FR(1), CONTENT], grid_rows: [FR(1), 40px], pad_column: N, pad_row: N }; jedes Kind platziert sich mit grid_cell_column_pos / grid_cell_row_pos (0-basiert) und optional grid_cell_column_span / grid_cell_row_span.
- Teile (Parts) können eigene Style-Props haben, auch Rahmen/Schatten: z. B. knob: { bg_color, radius, border_width, shadow_width } oder indicator: { bg_color, radius }.
- Fasse am Ende kurz zusammen, was du getan hast (in der Sprache des Nutzers).`;

export function getSystemPrompt(lang: 'en' | 'de' = 'en'): string {
  if (lang === 'de') {
    return SYSTEM_PROMPT + '\n\nWICHTIGE SPRACHANWEISUNG: Antworte dem Nutzer AUSSCHLIESSLICH auf Deutsch. Fasse am Ende kurz auf Deutsch zusammen, was du getan hast.';
  }
  return SYSTEM_PROMPT + '\n\nCRITICAL LANGUAGE DIRECTIVE: The user has selected ENGLISH as their interface language. You MUST respond to the user strictly in ENGLISH for all explanations, summaries, and conversational responses. All text you output MUST be in ENGLISH.';
}

