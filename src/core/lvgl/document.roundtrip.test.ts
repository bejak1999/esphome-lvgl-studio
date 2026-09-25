import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPinia, setActivePinia } from 'pinia';
import { useDocumentStore } from './document';

// Feste Test-Configs (auch Basis der E2E-Tests) – keine echten Zugangsdaten.
const DEMO = readFileSync('tests/e2e/fixtures/demo-display.yaml', 'utf8');
const SENSOR = readFileSync('tests/e2e/fixtures/sensor-node.yaml', 'utf8');

describe('Export erhält Configs', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('unverändert geöffnet → exakt der Originaltext', () => {
    const doc = useDocumentStore();
    doc.importYaml(DEMO);
    expect(doc.exportedYaml).toBe(DEMO);
  });

  it('Rückgängig bis zum Ausgangszustand → wieder exakt der Originaltext', () => {
    const doc = useDocumentStore();
    doc.importYaml(DEMO);
    doc.updateGeometry('lbl_1', { x: 99 });
    expect(doc.exportedYaml).not.toBe(DEMO);
    doc.undo();
    expect(doc.exportedYaml).toBe(DEMO);
  });

  it('Gerätewechsel per Sync: nie der Originaltext des vorherigen Geräts (gleiches Modell)', () => {
    // Editor hat A geöffnet; die Sidebar wechselt auf B – beide ohne Display, Modell identisch.
    const OTHER = SENSOR.replace('name: sensor-node', 'name: other-node').replace('GPIO4', 'GPIO5');
    const a = useDocumentStore();
    a.importYaml(SENSOR);
    setActivePinia(createPinia());
    const b = useDocumentStore();
    b.importYaml(OTHER);
    // so wie docSync.apply() den Stand der anderen Seite übernimmt
    a.pages = JSON.parse(JSON.stringify(b.pages));
    a.baseYaml = b.baseYaml;
    a.addons = [];
    expect(a.exportedYaml).not.toContain('name: sensor-node');
    expect(a.exportedYaml).toContain('name: other-node');
  });

  it('Config ohne Display bekommt keinen lvgl:-Block', () => {
    const doc = useDocumentStore();
    doc.importYaml(SENSOR);
    doc.addPage(); // Modell geändert, aber keine Widgets
    doc.removePage(1);
    expect(doc.exportedYaml).not.toMatch(/^lvgl:/m);
  });

  it('erst ein echtes Widget legt lvgl: an', () => {
    const doc = useDocumentStore();
    doc.importYaml(SENSOR);
    doc.addWidget('label', 10, 10);
    const out = doc.exportedYaml;
    expect(out).toMatch(/^lvgl:/m);
    expect(out).toContain('platform: dht'); // Rest bleibt erhalten
  });

  it('bearbeitet: Lambdas, !secret und Sensoren bleiben erhalten, lange Zeilen ungebrochen', () => {
    const doc = useDocumentStore();
    doc.importYaml(DEMO);
    doc.updateGeometry('btn_1', { x: 361 });
    const out = doc.exportedYaml;
    expect(out).toContain("text: !lambda 'return id(ha_time).now().strftime(\"%H:%M\");'");
    expect(out).toContain('password: !secret wifi_password');
    expect(out).toContain('entity_id: sensor.living_room_temperature');
    expect(out).toContain('x: 361');
  });
});
