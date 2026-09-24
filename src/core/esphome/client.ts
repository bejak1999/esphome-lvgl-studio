/**
 * WebSocket-Client für das ESPHome **device-builder** (früher „dashboard").
 *
 * Protokoll (aus esphome/device-builder, api/ws.py):
 *  - Client → Server:  { command: string, message_id: string, args: object }
 *  - Server → Client:
 *      ServerInfoMessage  { server_version, esphome_version, desktop_version, ha_addon, in_docker, requires_auth }
 *      ResultMessage      { message_id, result }
 *      ErrorMessage       { message_id, error_code, details }
 *      EventMessage       { message_id, event, data }
 *
 * Relevante Commands:
 *  - editor/validate_yaml { configuration, content }  → { yaml_errors[], validation_errors[] }
 *  - firmware/compile     { configuration }           → Job (result)
 *  - firmware/install     { configuration, port }     → Job
 *  - firmware/follow_job  { job_id }                  → Event-Stream (Build-Log)
 *  - firmware/cancel      { job_id }
 *
 * Hinweis: Browser-WebSockets können keinen Authorization-Header setzen. Bei aktivierter
 * Auth wird In-Band-Auth versucht; im typischen LAN-Standalone-Betrieb ist Auth aus.
 */

export interface ServerInfo {
  server_version?: string;
  esphome_version?: string;
  desktop_version?: string;
  ha_addon?: boolean;
  in_docker?: boolean;
  requires_auth?: boolean;
  [k: string]: unknown;
}

export interface DeviceInfo {
  name: string;
  friendly_name?: string;
  /** Dateiname der Config, z. B. "wohnzimmer.yaml". */
  configuration: string;
  address?: string;
  [k: string]: unknown;
}

export interface YamlValidationError {
  message: string;
  range?: { start_line: number; start_col: number; end_line: number; end_col: number };
}

export interface ValidationResult {
  yaml_errors: { message: string }[];
  validation_errors: YamlValidationError[];
}

/** Ergebnis eines Firmware-Jobs (compile/install). */
export interface JobResult {
  success: boolean;
  status: string;
  exitCode: number | null;
  error: string | null;
}

export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type WsFactory = (url: string) => WebSocketLike;

export interface ClientOptions {
  token?: string;
  wsFactory?: WsFactory;
}

/** Leitet die WS-URL aus der HTTP-Basis-URL ab (http→ws, https→wss, hängt /ws an). */
export function deriveWsUrl(httpUrl: string): string {
  let u = httpUrl.trim().replace(/\/+$/, '');
  u = u.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
  if (!/^wss?:/i.test(u)) u = 'ws://' + u;
  if (!/\/ws$/.test(u)) u += '/ws';
  return u;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class DeviceBuilderClient {
  private ws: WebSocketLike | null = null;
  private counter = 0;
  private pending = new Map<string, Pending>();
  private eventSubs = new Map<string, (event: string, data: unknown) => void>();
  private wsFactory: WsFactory;

  serverInfo: ServerInfo | null = null;

  constructor(
    private httpUrl: string,
    private opts: ClientOptions = {},
  ) {
    this.wsFactory = opts.wsFactory ?? ((url) => new WebSocket(url) as unknown as WebSocketLike);
  }

  private nextId(): string {
    this.counter += 1;
    return `${Date.now()}-${this.counter}`;
  }

  /** Verbindet und liefert die ServerInfo (inkl. esphome_version). */
  connect(timeoutMs = 8000): Promise<ServerInfo> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const url = deriveWsUrl(this.httpUrl);
      const ws = this.wsFactory(url);
      this.ws = ws;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error(`Timeout beim Verbinden mit ${url}`));
          ws.close();
        }
      }, timeoutMs);

      ws.onmessage = (ev) => {
        const msg = this.parse(ev.data);
        if (!msg) return;
        // ServerInfo: erste Nachricht ohne message_id, mit Versionsfeldern.
        if (!settled && msg.message_id == null && (msg.server_version != null || msg.esphome_version != null)) {
          settled = true;
          clearTimeout(timer);
          this.serverInfo = msg as ServerInfo;
          resolve(this.serverInfo);
          return;
        }
        this.dispatch(msg);
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`WebSocket-Fehler bei ${url}`));
        }
      };
      ws.onclose = () => {
        for (const p of this.pending.values()) p.reject(new Error('Verbindung geschlossen'));
        this.pending.clear();
        this.eventSubs.clear();
      };
    });
  }

  private parse(data: unknown): Record<string, unknown> | null {
    try {
      return typeof data === 'string' ? JSON.parse(data) : (data as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  private dispatch(msg: Record<string, unknown>) {
    const id = msg.message_id as string | undefined;
    if (msg.event != null && id != null) {
      this.eventSubs.get(id)?.(String(msg.event), msg.data);
      return;
    }
    if (id == null) return;
    const p = this.pending.get(id);
    if (!p) return;
    if (msg.error_code != null) {
      this.pending.delete(id);
      p.reject(new Error(`${msg.error_code}: ${JSON.stringify(msg.details ?? '')}`));
    } else if ('result' in msg) {
      this.pending.delete(id);
      p.resolve(msg.result);
    }
  }

  /** Sendet ein Command und wartet auf die ResultMessage. */
  send<T = unknown>(command: string, args: Record<string, unknown> = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws) return reject(new Error('Nicht verbunden'));
      const message_id = this.nextId();
      this.pending.set(message_id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ command, message_id, args }));
    });
  }

  /** Command mit Event-Stream (z. B. firmware/follow_job). Gibt cancel() zurück. */
  subscribe(
    command: string,
    args: Record<string, unknown>,
    onEvent: (event: string, data: unknown) => void,
  ): { messageId: string; cancel: () => void } {
    const message_id = this.nextId();
    this.eventSubs.set(message_id, onEvent);
    this.ws?.send(JSON.stringify({ command, message_id, args }));
    return {
      messageId: message_id,
      cancel: () => this.eventSubs.delete(message_id),
    };
  }

  validateYaml(configuration: string, content: string): Promise<ValidationResult> {
    return this.send<ValidationResult>('editor/validate_yaml', { configuration, content });
  }

  /**
   * Startet einen Firmware-Job (compile/install) und wartet auf den Abschluss.
   * Streamt Log-Zeilen über `onLine`. device-builder-Events: `output` (Log-Zeile),
   * `result` ({status, exit_code, error}).
   */
  private followJob(
    command: string,
    args: Record<string, unknown>,
    onLine: (line: string) => void,
    timeoutMs: number,
  ): Promise<JobResult> {
    return new Promise((resolve, reject) => {
      this.send<{ id?: string; job_id?: string }>(command, args)
        .then((job) => {
          const jobId = String(job?.job_id ?? job?.id ?? '');
          if (!jobId) return reject(new Error(`Kein Job-ID von ${command} erhalten`));

          const timer = setTimeout(() => {
            sub.cancel();
            reject(new Error(`Timeout bei ${command}`));
          }, timeoutMs);

          const sub = this.subscribe('firmware/follow_job', { job_id: jobId }, (event, data) => {
            if (event === 'output') {
              const line = typeof data === 'string' ? data : (data as { line?: string })?.line ?? '';
              if (line) onLine(line);
            } else if (event === 'result') {
              clearTimeout(timer);
              sub.cancel();
              const r = data as { status?: string; exit_code?: number | null; error?: string | null };
              resolve({
                success: r?.status === 'completed',
                status: r?.status ?? 'unknown',
                exitCode: r?.exit_code ?? null,
                error: r?.error ?? null,
              });
            }
          });
        })
        .catch(reject);
    });
  }

  /** Kompiliert eine Config und wartet auf den Abschluss (streamt das Build-Log). */
  compileAndWait(configuration: string, onLine: (line: string) => void, timeoutMs = 15 * 60 * 1000): Promise<JobResult> {
    return this.followJob('firmware/compile', { configuration }, onLine, timeoutMs);
  }

  /** Flasht eine Config auf ein Gerät (OTA/seriell) über `port` und wartet auf den Abschluss. */
  installAndWait(
    configuration: string,
    port: string,
    onLine: (line: string) => void,
    timeoutMs = 15 * 60 * 1000,
  ): Promise<JobResult> {
    return this.followJob('firmware/install', { configuration, port }, onLine, timeoutMs);
  }

  /** HTTP-URL zum Herunterladen der kompilierten Firmware (`.bin`) vom device-builder. */
  downloadUrl(configuration: string): string {
    const base = this.httpUrl.trim().replace(/\/+$/, '');
    return `${base}/download.bin?configuration=${encodeURIComponent(configuration)}`;
  }

  /** Listet alle konfigurierten (und importierbaren) Geräte des device-builder. */
  listDevices(): Promise<{ configured: DeviceInfo[]; importable: DeviceInfo[] }> {
    return this.send('devices/list');
  }

  /** Liest das YAML eines Geräts (Dateiname aus `configuration`). */
  getConfig(configuration: string): Promise<string> {
    return this.send<string>('devices/get_config', { configuration });
  }

  /** Speichert das YAML eines Geräts zurück. */
  updateConfig(configuration: string, content: string): Promise<void> {
    return this.send('devices/update_config', { configuration, content });
  }

  compile(configuration: string): Promise<unknown> {
    return this.send('firmware/compile', { configuration });
  }


  close() {
    this.ws?.close();
    this.ws = null;
  }
}
