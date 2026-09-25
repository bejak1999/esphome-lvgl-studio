import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { fakeBrowser } from 'wxt/testing';
import { useTemplatesStore } from './store';
import { BUILTIN_WIDGET_TEMPLATES } from './builtins';

describe('Vorlagen importieren/exportieren', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    setActivePinia(createPinia());
  });

  it('Liste importieren → eigene Vorlagen (nicht eingebaut), Export gibt sie zurück', async () => {
    const store = useTemplatesStore();
    await store.load();
    const list = BUILTIN_WIDGET_TEMPLATES.slice(0, 3).map((t) => ({ ...t, name: `${t.name} (Original)`, category: 'Meine Vorlagen' }));
    expect(await store.importJson(JSON.stringify(list))).toBe(3);
    expect(store.user.every((t) => !t.builtin && !t.id.startsWith('b_'))).toBe(true);
    expect(JSON.parse(store.exportUserJson())).toHaveLength(3);
  });

  it('einzelnes Objekt geht weiterhin, Unsinn wird abgelehnt', async () => {
    const store = useTemplatesStore();
    await store.load();
    expect(await store.importJson(JSON.stringify(BUILTIN_WIDGET_TEMPLATES[0]))).toBe(1);
    await expect(store.importJson('[{"foo":1}]')).rejects.toThrow();
  });
});
