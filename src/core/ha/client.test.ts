import { describe, it, expect } from 'vitest';
import { fetchEntities } from './client';

function mockFetch(states: unknown, ok = true, status = 200) {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const fn = async (url: string, init?: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init?.headers });
    return { ok, status, json: async () => states };
  };
  return { fn, calls };
}

describe('HA fetchEntities', () => {
  it('parst Entities, leitet Domain ab und sortiert', async () => {
    const { fn, calls } = mockFetch([
      { entity_id: 'sensor.temp', state: '21.5', attributes: { friendly_name: 'Temperatur' } },
      { entity_id: 'light.schlafzimmer', state: 'on', attributes: { friendly_name: 'Schlafzimmer' } },
    ]);
    const entities = await fetchEntities('http://ha:8123/', 'TKN', fn);

    expect(calls[0].url).toBe('http://ha:8123/api/states');
    expect(calls[0].headers?.Authorization).toBe('Bearer TKN');
    // sortiert: light.* vor sensor.*
    expect(entities.map((e) => e.entity_id)).toEqual(['light.schlafzimmer', 'sensor.temp']);
    expect(entities[0].domain).toBe('light');
    expect(entities[1].friendly_name).toBe('Temperatur');
  });

  it('wirft bei HTTP-Fehler', async () => {
    const { fn } = mockFetch([], false, 401);
    await expect(fetchEntities('http://ha:8123', 'bad', fn)).rejects.toThrow(/401/);
  });
});
