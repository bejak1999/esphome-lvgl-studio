import { describe, it, expect } from 'vitest';
import { DeviceBuilderClient, deriveWsUrl, type WebSocketLike } from './client';

class MockWs implements WebSocketLike {
  readyState = 1;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  sent: Record<string, unknown>[] = [];

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.onclose?.({});
  }
  push(obj: unknown) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  lastId(): string {
    return this.sent[this.sent.length - 1].message_id as string;
  }
}

describe('deriveWsUrl', () => {
  it('wandelt http-Basis in ws/ws-Pfad um', () => {
    expect(deriveWsUrl('http://192.168.178.110:36052')).toBe('ws://192.168.178.110:36052/ws');
    expect(deriveWsUrl('https://esphome.local:6052/')).toBe('wss://esphome.local:6052/ws');
    expect(deriveWsUrl('http://host:6052/ws')).toBe('ws://host:6052/ws');
  });
});

describe('DeviceBuilderClient', () => {
  function make() {
    const mock = new MockWs();
    const client = new DeviceBuilderClient('http://dev:36052', { wsFactory: () => mock });
    return { mock, client };
  }

  it('connect löst mit ServerInfo (esphome_version) auf', async () => {
    const { mock, client } = make();
    const p = client.connect();
    mock.push({ server_version: '1.2.3', esphome_version: '2026.6.0', requires_auth: false });
    const info = await p;
    expect(info.esphome_version).toBe('2026.6.0');
    expect(client.serverInfo?.esphome_version).toBe('2026.6.0');
  });

  it('send korreliert per message_id und löst mit result auf', async () => {
    const { mock, client } = make();
    const cp = client.connect();
    mock.push({ esphome_version: '2026.6.0' });
    await cp;

    const rp = client.validateYaml('dev.yaml', 'lvgl:\n');
    const sent = mock.sent[mock.sent.length - 1];
    expect(sent.command).toBe('editor/validate_yaml');
    expect((sent.args as Record<string, unknown>).content).toBe('lvgl:\n');

    mock.push({ message_id: mock.lastId(), result: { yaml_errors: [], validation_errors: [] } });
    const res = await rp;
    expect(res.validation_errors).toEqual([]);
  });

  it('send lehnt bei ErrorMessage ab', async () => {
    const { mock, client } = make();
    const cp = client.connect();
    mock.push({ esphome_version: '2026.6.0' });
    await cp;

    const rp = client.send('firmware/compile', { configuration: 'x.yaml' });
    mock.push({ message_id: mock.lastId(), error_code: 'UNKNOWN_COMMAND', details: 'nope' });
    await expect(rp).rejects.toThrow(/UNKNOWN_COMMAND/);
  });

  it('compileAndWait streamt output-Zeilen und löst bei result (completed) auf', async () => {
    const { mock, client } = make();
    const cp = client.connect();
    mock.push({ esphome_version: '2026.6.0' });
    await cp;

    const lines: string[] = [];
    const p = client.compileAndWait('dev.yaml', (l) => lines.push(l));

    // firmware/compile → Job zurückgeben
    const compileMsg = mock.sent[mock.sent.length - 1];
    expect(compileMsg.command).toBe('firmware/compile');
    mock.push({ message_id: compileMsg.message_id, result: { job_id: 'job1' } });
    await new Promise((r) => setTimeout(r, 0)); // follow_job-Subscribe abwarten

    const followMsg = mock.sent[mock.sent.length - 1];
    expect(followMsg.command).toBe('firmware/follow_job');
    const fid = followMsg.message_id as string;
    mock.push({ message_id: fid, event: 'output', data: 'Compiling...' });
    mock.push({ message_id: fid, event: 'output', data: 'Linking...' });
    mock.push({ message_id: fid, event: 'result', data: { status: 'completed', exit_code: 0, error: null } });

    const res = await p;
    expect(res.success).toBe(true);
    expect(res.status).toBe('completed');
    expect(lines).toEqual(['Compiling...', 'Linking...']);
  });

  it('installAndWait sendet firmware/install mit port und löst bei completed auf', async () => {
    const { mock, client } = make();
    const cp = client.connect();
    mock.push({ esphome_version: '2026.6.0' });
    await cp;

    const lines: string[] = [];
    const p = client.installAndWait('dev.yaml', 'dev.local', (l) => lines.push(l));

    const installMsg = mock.sent[mock.sent.length - 1];
    expect(installMsg.command).toBe('firmware/install');
    expect((installMsg.args as Record<string, unknown>).port).toBe('dev.local');
    mock.push({ message_id: installMsg.message_id, result: { job_id: 'job1' } });
    await new Promise((r) => setTimeout(r, 0));

    const fid = mock.sent[mock.sent.length - 1].message_id as string;
    mock.push({ message_id: fid, event: 'output', data: 'Uploading...' });
    mock.push({ message_id: fid, event: 'result', data: { status: 'completed', exit_code: 0, error: null } });

    const res = await p;
    expect(res.success).toBe(true);
    expect(lines).toEqual(['Uploading...']);
  });

  it('downloadUrl baut die .bin-URL aus Basis + configuration', () => {
    const { client } = make();
    expect(client.downloadUrl('lilygo-display.yaml')).toBe(
      'http://dev:36052/download.bin?configuration=lilygo-display.yaml',
    );
  });

  it('compileAndWait meldet Fehlschlag bei result (failed)', async () => {
    const { mock, client } = make();
    const cp = client.connect();
    mock.push({ esphome_version: '2026.6.0' });
    await cp;

    const p = client.compileAndWait('dev.yaml', () => {});
    const compileMsg = mock.sent[mock.sent.length - 1];
    mock.push({ message_id: compileMsg.message_id, result: { id: 'job2' } });
    await new Promise((r) => setTimeout(r, 0));
    const fid = mock.sent[mock.sent.length - 1].message_id as string;
    mock.push({ message_id: fid, event: 'result', data: { status: 'failed', exit_code: 1, error: 'boom' } });

    const res = await p;
    expect(res.success).toBe(false);
    expect(res.error).toBe('boom');
  });

  it('Verbindungsabbruch: meldet onClose, lehnt neue Anfragen sofort ab, bricht Jobs ab', async () => {
    const mock = new MockWs();
    let lost = 0;
    const client = new DeviceBuilderClient('http://dev:36052', { wsFactory: () => mock, onClose: () => lost++ });
    const p = client.connect();
    mock.push({ server_version: '1', esphome_version: '2026.9.0' });
    await p;
    const job = client.compileAndWait('a.yaml', () => {});
    mock.push({ message_id: mock.lastId(), result: { job_id: 'j1' } });
    await Promise.resolve();
    mock.readyState = 3;
    mock.onclose?.({});
    await expect(job).rejects.toThrow();
    expect(lost).toBe(1);
    await expect(client.listDevices()).rejects.toThrow();
  });

  it('gewolltes Trennen ist kein Verbindungsabbruch', async () => {
    const mock = new MockWs();
    let lost = 0;
    const client = new DeviceBuilderClient('http://dev:36052', { wsFactory: () => mock, onClose: () => lost++ });
    const p = client.connect();
    mock.push({ server_version: '1', esphome_version: '2026.9.0' });
    await p;
    client.close();
    expect(lost).toBe(0);
  });

  it('Schließen vor der ServerInfo (z. B. 403) lehnt connect sofort ab', async () => {
    const mock = new MockWs();
    const client = new DeviceBuilderClient('http://dev:36052', { wsFactory: () => mock });
    const p = client.connect(60000);
    mock.onclose?.({});
    await expect(p).rejects.toThrow();
  });
});
