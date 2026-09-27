// Nachgebauter ESPHome device-builder für die E2E-Tests (CI hat kein echtes Gerät).
// Spricht dasselbe WS-Protokoll (siehe src/core/esphome/client.ts) und hat dieselbe
// Origin-Sperre wie das Original: fremder `Origin` → HTTP 403. So prüfen die Tests auch die
// Origin-Umschreibung (Firefox) bzw. den Relay-iframe (Chrome).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function startFakeEsphome(port = 36999, { serverVersion = 'fake-1.0' } = {}) {
  const configs = new Map(
    fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.yaml')).map((f) => [f, fs.readFileSync(path.join(FIXTURES, f), 'utf8')]),
  );
  const log = [];
  const jobs = new Map();
  let jobSeq = 0;
  // Fehlerpfade für Tests: nächster Firmware-Job schlägt fehl / Live-Prüfung meldet Fehler.
  const state = { failNextJob: false, validationErrors: [] };

  const server = http.createServer((req, res) => {
    // Wie der echte device-builder: jede Route liefert die SPA-Hülle (wichtig für den Relay-iframe).
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><title>ESPHome</title></head><body><div id="app">ESPHome</div></body></html>');
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const origin = req.headers.origin;
    const own = `http://${req.headers.host}`;
    if (origin && origin !== own) {
      log.push(`403 origin=${origin}`);
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    if (!req.url?.startsWith('/ws')) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ server_version: serverVersion, esphome_version: '2026.9.0', ha_addon: false, in_docker: false, requires_auth: false }));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      const { command, message_id, args = {} } = msg;
      log.push(command);
      const reply = (result) => ws.send(JSON.stringify({ message_id, result }));
      const fail = (code, details) => ws.send(JSON.stringify({ message_id, error_code: code, details }));
      switch (command) {
        case 'devices/list':
          return reply({
            configured: [...configs.keys()].map((c) => ({ name: c.replace('.yaml', ''), friendly_name: c.replace('.yaml', ''), configuration: c })),
            importable: [],
          });
        case 'devices/get_config':
          return configs.has(args.configuration) ? reply(configs.get(args.configuration)) : fail('NOT_FOUND', args.configuration);
        case 'devices/update_config':
          configs.set(args.configuration, args.content);
          return reply(null);
        case 'editor/validate_yaml':
          return reply({ yaml_errors: [], validation_errors: state.validationErrors });
        // Firmware-Jobs: Job-id zurück, der Build-Log kommt über follow_job als Event-Stream.
        case 'firmware/compile':
        case 'firmware/install': {
          if (!configs.has(args.configuration)) return fail('NOT_FOUND', args.configuration);
          const id = `job-${++jobSeq}`;
          jobs.set(id, { command, ...args, failed: state.failNextJob });
          state.failNextJob = false;
          return reply({ job_id: id });
        }
        case 'firmware/follow_job': {
          const job = jobs.get(args.job_id);
          if (!job) return fail('NOT_FOUND', args.job_id);
          const event = (name, data) => ws.send(JSON.stringify({ message_id, event: name, data }));
          const lines = job.command === 'firmware/install'
            ? [`INFO Uploading to ${job.port}`, 'INFO OTA successful']
            : ['INFO Reading configuration...', 'INFO Compiling app...', job.failed ? 'ERROR compile failed' : 'INFO Successfully compiled program.'];
          lines.forEach((l, i) => setTimeout(() => event('output', l), 50 * (i + 1)));
          setTimeout(() => event('result', job.failed
            ? { status: 'failed', exit_code: 1, error: 'compile failed' }
            : { status: 'completed', exit_code: 0, error: null }), 50 * (lines.length + 1));
          return;
        }
        default:
          return fail('UNKNOWN_COMMAND', command);
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${port}`,
        log,
        configs,
        state,
        // Hart beenden wie ein Neustart/Absturz: offene Sockets sofort trennen.
        close: () =>
          new Promise((r) => {
            for (const c of wss.clients) c.terminate();
            wss.close();
            server.closeAllConnections?.();
            server.close(() => r());
          }),
      }),
    );
  });
}

// Direkt gestartet: als eigenständiger Server (zum manuellen Ausprobieren).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const s = await startFakeEsphome(Number(process.env.PORT) || 36999);
  console.log(`fake ESPHome device-builder: ${s.url}`);
}
