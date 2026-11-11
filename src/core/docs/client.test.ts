import { describe, it, expect, beforeEach } from 'vitest';
import { DOCS_RAW_BASE, _clearDocsCache, fetchComponentDoc } from './client';

/** Fake-Fetch über eine Menge existierender Doku-Pfade; zählt die Anfragen. */
function fakeDocs(existing: Record<string, string>) {
  const requested: string[] = [];
  const fetchImpl = async (url: string) => {
    const path = url.slice(DOCS_RAW_BASE.length + 1);
    requested.push(path);
    const body = existing[path];
    return { ok: body != null, status: body != null ? 200 : 404, text: async () => body ?? '' };
  };
  return { fetchImpl, requested };
}

describe('fetchComponentDoc', () => {
  beforeEach(() => _clearDocsCache());

  it('findet normale Komponenten direkt', async () => {
    const { fetchImpl } = fakeDocs({ 'components/wifi.mdx': '# WiFi' });
    expect(await fetchComponentDoc('wifi', fetchImpl)).toEqual({ path: 'components/wifi.mdx', markdown: '# WiFi' });
  });

  it('findet Plattformen unter ihrer Domäne (mipi_dsi → display/mipi_dsi.mdx)', async () => {
    const { fetchImpl } = fakeDocs({
      'components/display/mipi_dsi.mdx': '# MIPI DSI',
      'components/touchscreen/gt911.mdx': '# GT911',
    });
    expect((await fetchComponentDoc('mipi_dsi', fetchImpl))?.path).toBe('components/display/mipi_dsi.mdx');
    expect((await fetchComponentDoc('gt911', fetchImpl))?.path).toBe('components/touchscreen/gt911.mdx');
  });

  it.each(['display/mipi_dsi', 'display.mipi_dsi', 'mipi_dsi.display', 'components/display/mipi_dsi.mdx'])(
    'akzeptiert die Schreibweise %s',
    async (name) => {
      const { fetchImpl } = fakeDocs({ 'components/display/mipi_dsi.mdx': '# MIPI DSI' });
      expect((await fetchComponentDoc(name, fetchImpl))?.markdown).toBe('# MIPI DSI');
    },
  );

  it('fragt bekannte 404-Pfade nicht erneut an', async () => {
    const { fetchImpl, requested } = fakeDocs({});
    expect(await fetchComponentDoc('gibtsnicht', fetchImpl)).toBeNull();
    const first = requested.length;
    expect(first).toBeGreaterThan(2);
    expect(await fetchComponentDoc('gibtsnicht', fetchImpl)).toBeNull();
    expect(requested.length).toBe(first);
  });
});
