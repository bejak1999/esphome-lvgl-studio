import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { fakeBrowser } from 'wxt/testing';
import { findLambdas } from './apply';
import { useAddonsStore } from './store';

const base = { id: 'test.addon', name: 'Test', version: '1.0.0', widgets: [{ key: 'l', type: 'label' }] };

describe('findLambdas', () => {
  it('findet !lambda-Werte, lambda:-Keys und lambda im YAML-Fragment', () => {
    expect(findLambdas({ ...base, widgets: [{ key: 'l', type: 'label', props: { text: '!lambda return "x";' } }] })).toHaveLength(1);
    expect(findLambdas({ ...base, actions: [{ lambda: 'id(relay).turn_on();' }] })).toHaveLength(1);
    expect(findLambdas({ ...base, yaml: 'interval:\n  - interval: 1s\n    then:\n      - lambda: |-\n          id(x) += 1;\n' })[0]).toContain('id(x) += 1');
  });

  it('ignoriert harmlose Inhalte (auch das Wort in normalem Text)', () => {
    expect(findLambdas(base)).toEqual([]);
    expect(findLambdas({ ...base, description: 'Kein lambdaausdruck hier', yaml: 'sensor:\n  - platform: template\n' })).toEqual([]);
  });

  it('mitgelieferte Beispiele: Ergebnis ist stabil', () => {
    for (const f of readdirSync('docs/examples').filter((x) => x.endsWith('.json'))) {
      const m = JSON.parse(readFileSync(`docs/examples/${f}`, 'utf8'));
      expect(Array.isArray(findLambdas(m)), f).toBe(true);
    }
  });
});

describe('Installation mit Lambda', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    setActivePinia(createPinia());
  });
  const withLambda = JSON.stringify({ ...base, yaml: 'script:\n  - id: s\n    then:\n      - lambda: "id(x).publish_state(1);"\n' });

  it('wird erst nach Bestätigung installiert', async () => {
    const store = useAddonsStore();
    await store.load();
    expect(await store.installFromJson(withLambda)).toEqual([]);
    expect(store.pendingLambda?.snippets.length).toBe(1);
    expect(store.installed).toHaveLength(0);
    await store.confirmPendingLambda();
    expect(store.pendingLambda).toBeNull();
    expect(store.installed.map((a) => a.manifest.id)).toEqual(['test.addon']);
  });

  it('Abbrechen installiert nichts', async () => {
    const store = useAddonsStore();
    await store.load();
    await store.installFromJson(withLambda);
    store.cancelPendingLambda();
    expect(store.installed).toHaveLength(0);
  });

  it('Addons ohne Lambda werden wie bisher direkt installiert', async () => {
    const store = useAddonsStore();
    await store.load();
    await store.installFromJson(JSON.stringify(base));
    expect(store.pendingLambda).toBeNull();
    expect(store.installed).toHaveLength(1);
  });
});
