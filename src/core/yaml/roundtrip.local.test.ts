/**
 * Rundlauf gegen ECHTE Geräte-Configs: Laden + unverändert Exportieren darf das YAML nicht
 * verändern (Kommentare, Lambdas, !secret, Formatierung, nicht verwaltete Komponenten).
 *
 * Die Configs liegen nur lokal (enthalten Schlüssel) – ohne sie wird der Test übersprungen:
 *   Ordner `.roundtrip/` (gitignored) oder Umgebungsvariable ROUNDTRIP_DIR.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPinia, setActivePinia } from 'pinia';
import { isMap, isSeq, parseDocument, type YAMLMap } from 'yaml';
import { useDocumentStore } from '../lvgl/document';

const dir = process.env.ROUNDTRIP_DIR ?? '.roundtrip';
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : [];

/** Erste abweichende Zeilen – als lesbare Fehlermeldung. */
function firstDiff(a: string, b: string): string {
  const x = a.split('\n');
  const y = b.split('\n');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return `Zeile ${i + 1}:\n  vorher: ${JSON.stringify(x[i])}\n  nachher: ${JSON.stringify(y[i])}`;
  }
  return '';
}

/**
 * Die vom Editor verwalteten Bereiche (lvgl, Fonts, Bilder) entfernen und den Rest
 * normalisiert ausgeben – dieser Teil darf sich durch Bearbeiten im Editor nie ändern.
 * Automatisch erzeugte HA-Bindungs-Sensoren (`…__state`) zählen ebenfalls zum Editor.
 */
function unmanaged(text: string): string {
  const doc = parseDocument(text);
  for (const k of ['lvgl', 'font', 'image', 'online_image', 'http_request']) doc.delete(k);
  for (const pair of (doc.contents as YAMLMap | null)?.items ?? []) {
    if (isSeq(pair.value)) {
      pair.value.items = pair.value.items.filter((it) => !(isMap(it) && /__state$/.test(String(it.get('id') ?? ''))));
    }
  }
  return doc.toString({ lineWidth: 0 });
}

describe.skipIf(!files.length)('Rundlauf echter Configs (lokal)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  for (const f of files) {
    it(`${f}: Laden → Exportieren ist verlustfrei`, () => {
      const original = readFileSync(join(dir, f), 'utf8');
      const doc = useDocumentStore();
      doc.importYaml(original);
      const out = doc.exportedYaml;
      expect(firstDiff(original, out), 'erste Abweichung').toBe('');
    });

    it(`${f}: nach einer Widget-Änderung bleibt alles Nicht-LVGL inhaltlich gleich`, () => {
      const original = readFileSync(join(dir, f), 'utf8');
      const doc = useDocumentStore();
      doc.importYaml(original);
      const first = doc.pages.flatMap((p) => p.children)[0];
      if (first) doc.updateGeometry(first.id, { x: first.geometry.x + 1 });
      else doc.addWidget('label', 10, 10); // Config ohne LVGL: ersten Widget anlegen
      const out = doc.exportedYaml;
      expect(out).not.toBe(original); // der Engine-Pfad wurde wirklich durchlaufen
      expect(firstDiff(unmanaged(original), unmanaged(out))).toBe('');
    });

    it(`${f}: zweiter Rundlauf ist stabil (idempotent)`, () => {
      const doc = useDocumentStore();
      doc.importYaml(readFileSync(join(dir, f), 'utf8'));
      const once = doc.exportedYaml;
      doc.importYaml(once);
      expect(firstDiff(once, doc.exportedYaml)).toBe('');
    });
  }
});
