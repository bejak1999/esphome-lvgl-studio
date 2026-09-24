/**
 * Zusammenführen der `yaml`-Fragmente von Addons mit dem Geräte-YAML.
 *
 * Regeln (bewusst konservativ – der Nutzer bzw. sein Gerät hat immer Vorrang):
 *  - Fehlt ein Top-Level-Schlüssel, wird er komplett aus dem Fragment übernommen.
 *  - Bei zwei Maps werden nur **fehlende** Unterschlüssel ergänzt (bestehende Werte bleiben).
 *  - Bei zwei Listen gehören Einträge mit `id: addon_…` dem Addon: sie werden ersetzt bzw.
 *    ergänzt und beim Entfernen des Addons wieder aufgeräumt. Alle anderen Einträge bleiben
 *    unangetastet (identische werden nicht doppelt eingefügt).
 *
 * Wichtig: Gearbeitet wird auf der **Knoten-Ebene** (`parseDocument`), nicht über einfache
 * JS-Objekte. Nur so überleben ESPHome-Tags wie `!lambda` oder `!secret` den Export –
 * `parse()` würde sie stillschweigend zu normalen Strings machen.
 */

import { parseDocument, isMap, isSeq, isScalar, type Document, type Node, type YAMLMap, type YAMLSeq } from 'yaml';
import { ADDON_ID_PREFIX } from './types';

/** id eines Listeneintrags, sofern vorhanden. */
function itemId(item: unknown): string {
  if (isMap(item)) {
    const v = (item as YAMLMap).get('id');
    return v != null ? String(v) : '';
  }
  return '';
}

function isAddonId(id: string): boolean {
  return id.startsWith(ADDON_ID_PREFIX);
}

/** Sammelt alle `addon_…`-ids eines Fragments (rekursiv über Maps und Listen). */
function collectAddonIds(node: unknown, acc: Set<string>): void {
  if (isSeq(node)) {
    for (const it of (node as YAMLSeq).items) collectAddonIds(it, acc);
    return;
  }
  if (isMap(node)) {
    for (const pair of (node as YAMLMap).items) {
      const key = pair.key && isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
      const value = pair.value;
      if (key === 'id' && isScalar(value)) {
        const id = String(value.value ?? '');
        if (isAddonId(id)) acc.add(id);
      }
      collectAddonIds(value, acc);
    }
  }
}

/** Vergleichsform eines Knotens (zum Erkennen bereits vorhandener Einträge). */
function fingerprint(node: unknown): string {
  const json = (node as { toJSON?: () => unknown } | null)?.toJSON?.();
  return JSON.stringify(json ?? node);
}

function mergeMap(target: YAMLMap, source: YAMLMap): void {
  for (const pair of source.items) {
    const key = pair.key && isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
    if (target.get(key) == null) target.set(key, pair.value);
  }
}

function mergeSeq(target: YAMLSeq, source: YAMLSeq): void {
  const existingById = new Map<string, number>();
  target.items.forEach((it, i) => {
    const id = itemId(it);
    if (id) existingById.set(id, i);
  });
  const existing = new Set(target.items.map(fingerprint));

  for (const item of source.items) {
    const id = itemId(item);
    if (id && isAddonId(id)) {
      const at = existingById.get(id);
      if (at != null) target.items[at] = item;
      else target.items.push(item);
      continue;
    }
    // Fremde/id-lose Einträge nur ergänzen, wenn es sie nicht schon gibt.
    if (!existing.has(fingerprint(item))) target.items.push(item);
  }
}

/**
 * Führt die gerenderten Fragmente in `yamlText` ein und entfernt Addon-Einträge
 * (`id: addon_…`), die keine Instanz mehr beansprucht.
 */
export function applyAddonYaml(yamlText: string, fragments: string[]): string {
  const active = fragments.map((f) => f.trim()).filter(Boolean);
  // Schnellpfad: nichts zu tun und kein Altbestand → Text unverändert lassen.
  if (active.length === 0 && !yamlText.includes(`id: ${ADDON_ID_PREFIX}`)) return yamlText;

  const doc: Document = parseDocument(yamlText);
  const desired = new Set<string>();

  for (const frag of active) {
    let fragDoc: Document;
    try {
      fragDoc = parseDocument(frag);
      if (fragDoc.errors.length) continue; // kaputtes Fragment ignorieren, statt zu sprengen
    } catch {
      continue;
    }
    const contents = fragDoc.contents;
    if (!isMap(contents)) continue;
    collectAddonIds(contents, desired);

    for (const pair of (contents as YAMLMap).items) {
      const key = pair.key && isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
      const value = pair.value as Node | null;
      if (value == null) continue;
      const current = doc.get(key, true) as unknown;
      if (current == null) {
        doc.set(key, value);
        continue;
      }
      if (isMap(current) && isMap(value)) mergeMap(current as YAMLMap, value as YAMLMap);
      else if (isSeq(current) && isSeq(value)) mergeSeq(current as YAMLSeq, value as YAMLSeq);
      else if (isSeq(current) && isMap(value)) {
        const wrapper = { items: [value] } as unknown as YAMLSeq;
        mergeSeq(current as YAMLSeq, wrapper);
      }
      // Skalar gegen Struktur: nichts tun (der bestehende Wert gewinnt).
    }
  }

  // Verwaiste Addon-Einträge entfernen.
  const contents = doc.contents;
  if (isMap(contents)) {
    for (const pair of [...(contents as YAMLMap).items]) {
      const v = pair.value;
      if (!isSeq(v)) continue;
      const seq = v as YAMLSeq;
      const before = seq.items.length;
      seq.items = seq.items.filter((it) => {
        const id = itemId(it);
        return !(isAddonId(id) && !desired.has(id));
      });
      if (seq.items.length !== before && seq.items.length === 0) {
        const key = pair.key && isScalar(pair.key) ? String(pair.key.value) : String(pair.key);
        doc.delete(key);
      }
    }
  }

  return doc.toString();
}
