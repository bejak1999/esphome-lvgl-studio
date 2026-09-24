import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDocumentStore } from './document';
import type { WidgetNode } from './types';

function card(): WidgetNode {
  return {
    id: 'card', type: 'obj', geometry: { x: 0, y: 0, width: 200, height: 200 },
    props: { radius: 20 },
    children: [
      { id: 'lbl', type: 'label', geometry: { x: 10, y: 20, width: 100, height: 30 }, props: { text: 'Hi', font_size: 16 }, children: [] },
    ],
  };
}

describe('document.reparent', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('verschiebt ein Widget in einen Container mit neuer relativer Position', () => {
    const doc = useDocumentStore();
    doc.pages = [{
      id: 's', name: 'S', width: 480, height: 320, bg_color: '#000',
      children: [
        { id: 'obj_1', type: 'obj', geometry: { x: 50, y: 40, width: 200, height: 150 }, props: {}, children: [] },
        { id: 'lbl_1', type: 'label', geometry: { x: 100, y: 80, width: 60, height: 20 }, props: { text: 'X' }, children: [] },
      ],
    }];
    doc.reparent('lbl_1', 'obj_1', 30, 20);
    const obj = doc.screen.children.find((n) => n.id === 'obj_1')!;
    expect(doc.screen.children.some((n) => n.id === 'lbl_1')).toBe(false); // nicht mehr top-level
    expect(obj.children[0].id).toBe('lbl_1');
    expect(obj.children[0].geometry).toMatchObject({ x: 30, y: 20 });
  });

  it('verschiebt nicht in einen eigenen Nachfahren', () => {
    const doc = useDocumentStore();
    doc.pages = [{
      id: 's', name: 'S', width: 480, height: 320, bg_color: '#000',
      children: [
        { id: 'obj_1', type: 'obj', geometry: { x: 0, y: 0, width: 200, height: 150 }, props: {},
          children: [{ id: 'obj_2', type: 'obj', geometry: { x: 10, y: 10, width: 80, height: 80 }, props: {}, children: [] }] },
      ],
    }];
    doc.reparent('obj_1', 'obj_2', 0, 0); // ungültig → keine Änderung
    expect(doc.screen.children[0].id).toBe('obj_1');
  });
});

describe('document Mehrfachauswahl & dirty', () => {
  beforeEach(() => setActivePinia(createPinia()));

  function twoWidgets() {
    const doc = useDocumentStore();
    doc.pages = [{
      id: 's', name: 'S', width: 480, height: 320, bg_color: '#000',
      children: [
        { id: 'a', type: 'obj', geometry: { x: 10, y: 10, width: 50, height: 50 }, props: {}, children: [] },
        { id: 'b', type: 'obj', geometry: { x: 100, y: 100, width: 50, height: 50 }, props: {}, children: [] },
      ],
    }];
    return doc;
  }

  it('Strg-Klick schaltet IDs in der Mehrfachauswahl um', () => {
    const doc = twoWidgets();
    doc.select('a');
    doc.select('b', true); // additiv
    expect(doc.selectedIds).toEqual(['a', 'b']);
    expect(doc.selectedId).toBe('b');
    doc.select('a', true); // a wieder abwählen
    expect(doc.selectedIds).toEqual(['b']);
  });

  it('setGroupPositions verschiebt alle markierten um dasselbe Delta', () => {
    const doc = twoWidgets();
    doc.select('a');
    doc.select('b', true);
    doc.setGroupPositions({ a: { x: 10, y: 10 }, b: { x: 100, y: 100 } }, 5, -5);
    expect(doc.screen.children[0].geometry).toMatchObject({ x: 15, y: 5 });
    expect(doc.screen.children[1].geometry).toMatchObject({ x: 105, y: 95 });
  });

  it('removeSelection entfernt alle markierten Widgets', () => {
    const doc = twoWidgets();
    doc.select('a');
    doc.select('b', true);
    doc.removeSelection();
    expect(doc.screen.children).toHaveLength(0);
    expect(doc.selectedIds).toEqual([]);
  });

  it('dirty: Mutation setzt dirty, markSaved/importYaml setzen es zurück', () => {
    const doc = twoWidgets();
    doc.markSaved();
    expect(doc.dirty).toBe(false);
    doc.updateGeometry('a', { x: 99 });
    expect(doc.dirty).toBe(true);
    doc.markSaved();
    expect(doc.dirty).toBe(false);
  });
});

describe('document Seiten (pages)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('addPage legt eine Seite an, wechselt hin und hält die Displaygröße', () => {
    const doc = useDocumentStore();
    doc.setScreenProp({ width: 135, height: 240 });
    const id = doc.addPage();
    expect(doc.pages).toHaveLength(2);
    expect(doc.activePage).toBe(1);
    expect(doc.screen.id).toBe(id);
    expect(doc.screen.width).toBe(135);
    expect(doc.screen.height).toBe(240);
  });

  it('Widgets landen auf der aktiven Seite und IDs bleiben dokumentweit eindeutig', () => {
    const doc = useDocumentStore();
    const a = doc.addWidget('label', 0, 0);
    doc.addPage();
    const b = doc.addWidget('label', 0, 0);
    expect(a).not.toBe(b);
    expect(doc.pages[0].children.map((n) => n.id)).toEqual([a]);
    expect(doc.pages[1].children.map((n) => n.id)).toEqual([b]);
  });

  it('removePage entfernt die Seite, die letzte bleibt erhalten', () => {
    const doc = useDocumentStore();
    doc.addPage();
    doc.removePage(1);
    expect(doc.pages).toHaveLength(1);
    doc.removePage(0); // letzte Seite darf nicht weg
    expect(doc.pages).toHaveLength(1);
  });

  it('renamePage zieht Navigations-Aktionen auf die neue id mit', () => {
    const doc = useDocumentStore();
    doc.addPage(); // page_2
    doc.setActivePage(0);
    const btn = doc.addWidget('button', 0, 0);
    doc.updateProps(btn, { page_action: 'show:page_2' });
    doc.renamePage(1, 'Einstellungen', 'settings_page');
    expect(doc.pages[1].id).toBe('settings_page');
    expect(doc.pages[0].children[0].props.page_action).toBe('show:settings_page');
  });

  it('undo stellt auch gelöschte Seiten wieder her', () => {
    const doc = useDocumentStore();
    doc.addPage();
    expect(doc.pages).toHaveLength(2);
    doc.removePage(1);
    expect(doc.pages).toHaveLength(1);
    doc.undo();
    expect(doc.pages).toHaveLength(2);
  });
});

describe('document.resizeScale', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('setzt neue Geometrie und skaliert den Teilbaum proportional mit', () => {
    const doc = useDocumentStore();
    doc.pages = [{ id: 's', name: 'S', width: 480, height: 320, bg_color: '#000', children: [card()] }];
    const orig = JSON.parse(JSON.stringify(doc.screen.children[0].children)) as WidgetNode[];

    doc.resizeScale('card', { x: 0, y: 0, width: 300, height: 300 }, 1.5, orig);

    const node = doc.screen.children[0];
    expect(node.geometry).toEqual({ x: 0, y: 0, width: 300, height: 300 });
    const child = node.children[0];
    expect(child.geometry).toEqual({ x: 15, y: 30, width: 150, height: 45 });
    expect(child.props.font_size).toBe(24);
  });
});
