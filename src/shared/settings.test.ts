import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { fakeBrowser } from 'wxt/testing';
import { useSettingsStore } from './settings';

describe('KI-Übernahme-Modus', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    setActivePinia(createPinia());
  });

  it('ist standardmäßig „bestätigen“', async () => {
    const s = useSettingsStore();
    await s.load();
    expect(s.settings.ai.applyMode).toBe('confirm');
  });

  it('bleibt nach Neustart erhalten und speichert keine anderen ungespeicherten Eingaben mit', async () => {
    const s = useSettingsStore();
    await s.load();
    s.settings.esphome.url = 'http://nicht-gespeichert:6052'; // ungespeicherte Formular-Eingabe
    await s.saveApplyMode('auto');

    setActivePinia(createPinia()); // „Neustart“
    const fresh = useSettingsStore();
    await fresh.load();
    expect(fresh.settings.ai.applyMode).toBe('auto');
    expect(fresh.settings.esphome.url).toBe('');
  });

  it('ältere gespeicherte Einstellungen ohne das Feld bekommen den Standard', async () => {
    await fakeBrowser.storage.local.set({ settings: { ai: { apiKey: 'x', model: 'm', baseUrl: 'b', contextLength: 0 } } });
    const s = useSettingsStore();
    await s.load();
    expect(s.settings.ai.applyMode).toBe('confirm');
  });
});
