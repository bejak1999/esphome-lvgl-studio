import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { fakeBrowser } from 'wxt/testing';
import { useVersionStore } from './versions';

describe('Versionsverlauf bei vollem Speicher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    fakeBrowser.reset();
    setActivePinia(createPinia());
  });

  it('verwirft die ältesten Stände statt zu scheitern', async () => {
    const v = useVersionStore();
    await v.load('dev.yaml');
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (now += 1000)); // eindeutige Zeitstempel
    for (let i = 0; i < 8; i++) await v.snapshot(`yaml: ${i}`, `s${i}`);
    // Ab jetzt passen höchstens 4 Stände in den Speicher.
    const orig = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local);
    vi.spyOn(fakeBrowser.storage.local, 'set').mockImplementation(async (items: Record<string, unknown>) => {
      const list = Object.values(items)[0] as unknown[];
      if (list.length > 4) throw new Error('QUOTA_BYTES quota exceeded');
      return orig(items);
    });
    await expect(v.snapshot('yaml: neu', 'neu')).resolves.not.toBeNull();
    expect(v.versions.length).toBeLessThanOrEqual(4);
    expect(v.ordered[0].label).toBe('neu'); // der neueste bleibt immer erhalten
  });

  it('wirft nie – auch wenn gar nichts mehr passt', async () => {
    const v = useVersionStore();
    await v.load('dev.yaml');
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(v.snapshot('yaml: x', 'x')).resolves.not.toBeNull();
  });
});
