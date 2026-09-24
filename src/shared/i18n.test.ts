import { describe, it, expect } from 'vitest';
import { translations } from './i18n';

const en = translations.en as Record<string, string>;
const de = translations.de as Record<string, string>;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Übersetzungen', () => {
  it('EN und DE haben exakt dieselben Keys', () => {
    expect(Object.keys(de).filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(en).filter((k) => !(k in de))).toEqual([]);
  });

  it('kein Text ist leer', () => {
    expect(Object.entries(en).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
    expect(Object.entries(de).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });

  it('Platzhalter ({name}) stimmen in beiden Sprachen überein', () => {
    const bad = Object.keys(en).filter((k) => placeholders(en[k]).join() !== placeholders(de[k] ?? '').join());
    expect(bad).toEqual([]);
  });
});
