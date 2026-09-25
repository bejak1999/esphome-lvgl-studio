import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { hasHostAccess, hostPatterns, requestHostAccess } from './hostAccess';

describe('hostPatterns', () => {
  it('ein Pattern pro Host, ohne Port und Pfad', () => {
    const p = hostPatterns(['http://192.168.1.10:6052/', 'http://192.168.1.10:8123', 'https://ha.example.org/api']);
    expect(p).toContain('http://192.168.1.10/*');
    expect(p).toContain('https://ha.example.org/*');
    expect(p.filter((x) => x.startsWith('http'))).toHaveLength(2);
  });

  it('überspringt leere/ungültige URLs und Hosts ohne Anfrage-Bedarf', () => {
    expect(hostPatterns(['', '  ', undefined, null, 'kein url', 'file:///x'])).toEqual([]);
    expect(hostPatterns(['https://openrouter.ai/api/v1', 'https://schema.esphome.io/dev/x.json'])).toEqual([]);
  });

  it('wss/ws werden auf den passenden http(s)-Host abgebildet', () => {
    expect(hostPatterns(['ws://10.0.0.5:6052/ws'])).toContain('http://10.0.0.5/*');
    expect(hostPatterns(['wss://esphome.local/ws'])).toContain('https://esphome.local/*');
  });
});

describe('hasHostAccess / requestHostAccess', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fakeBrowser.reset();
  });

  it('ohne nötige Anfrage sofort true (ohne permissions-API)', async () => {
    const spy = vi.spyOn(fakeBrowser.permissions, 'request');
    expect(await requestHostAccess(['https://openrouter.ai/api/v1', ''])).toBe(true);
    expect(await hasHostAccess([''])).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('abgelehnte oder fehlerhafte Anfrage → false statt Ausnahme', async () => {
    vi.spyOn(fakeBrowser.permissions, 'request').mockRejectedValue(new Error('must be called during a user gesture'));
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValueOnce(false);
    expect(await requestHostAccess(['http://10.0.0.5:6052'])).toBe(false);
    vi.spyOn(fakeBrowser.permissions, 'contains').mockRejectedValue(new Error('x'));
    expect(await hasHostAccess(['http://10.0.0.5:6052'])).toBe(false);
  });

  it('fragt nur die fehlenden Hosts mit den richtigen Patterns an', async () => {
    const spy = vi.spyOn(fakeBrowser.permissions, 'request').mockResolvedValue(true);
    expect(await requestHostAccess(['http://10.0.0.5:6052', 'http://10.0.0.6:8123'])).toBe(true);
    expect(spy.mock.calls[0][0].origins).toEqual(expect.arrayContaining(['http://10.0.0.5/*', 'http://10.0.0.6/*']));
  });

  it('Anfrage ohne Nutzereingabe scheitert, Zugriff besteht aber schon → true', async () => {
    vi.spyOn(fakeBrowser.permissions, 'request').mockRejectedValue(new Error('may only be called from a user input handler'));
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(true);
    expect(await requestHostAccess(['http://10.0.0.5:6052'])).toBe(true);
  });
});
