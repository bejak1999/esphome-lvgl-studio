import { describe, it, expect } from 'vitest';
import { cloneWithNewIds, scaleWidgetTree } from '../lvgl/document';
import { BUILTIN_WIDGET_TEMPLATES } from './builtins';
import type { WidgetNode } from '../lvgl/types';

function collectIds(n: WidgetNode, acc: string[] = []): string[] {
  acc.push(n.id);
  n.children.forEach((c) => collectIds(c, acc));
  return acc;
}

describe('cloneWithNewIds', () => {
  it('vergibt frische, kollisionsfreie IDs und erhält Props/Entity', () => {
    const node: WidgetNode = {
      id: 'btn_1',
      type: 'button',
      geometry: { x: 0, y: 0, width: 100, height: 40 },
      props: { text: 'Hi', bg_color: '#2563EB' },
      entity: 'light.wohnzimmer',
      children: [
        { id: 'lbl_1', type: 'label', geometry: { x: 0, y: 0, width: 50, height: 20 }, props: { text: 'X' }, children: [] },
      ],
    };
    const used = new Set(['btn_1', 'lbl_1', 'btn_2']);
    const clone = cloneWithNewIds(node, used);

    const ids = collectIds(clone);
    // keine der neuen IDs kollidiert mit den vorhandenen
    expect(ids.some((id) => id === 'btn_1' || id === 'lbl_1' || id === 'btn_2')).toBe(false);
    // Props/Entity erhalten
    expect(clone.props.text).toBe('Hi');
    expect(clone.entity).toBe('light.wohnzimmer');
    expect(clone.children[0].props.text).toBe('X');
    // Original unverändert
    expect(node.id).toBe('btn_1');
  });
});

describe('scaleWidgetTree', () => {
  it('skaliert Geometrie und größenbezogene Props uniform (rekursiv)', () => {
    const node: WidgetNode = {
      id: 'obj_1',
      type: 'obj',
      geometry: { x: 0, y: 0, width: 400, height: 400 },
      props: { radius: 28, arc_width: 20 },
      children: [
        {
          id: 'lbl_1',
          type: 'label',
          geometry: { x: 60, y: 100, width: 280, height: 72 },
          props: { text: 'Hi', font_size: 64 },
          children: [],
        },
      ],
    };
    scaleWidgetTree(node, 0.5);
    expect(node.geometry).toEqual({ x: 0, y: 0, width: 200, height: 200 });
    expect(node.props.radius).toBe(14);
    expect(node.props.arc_width).toBe(10);
    expect(node.children[0].geometry).toEqual({ x: 30, y: 50, width: 140, height: 36 });
    expect(node.children[0].props.font_size).toBe(32);
  });

  it('hält die Schriftgröße auf mindestens 6px lesbar', () => {
    const node: WidgetNode = {
      id: 'lbl_1',
      type: 'label',
      geometry: { x: 0, y: 0, width: 100, height: 20 },
      props: { font_size: 12 },
      children: [],
    };
    scaleWidgetTree(node, 0.3);
    expect(node.props.font_size).toBe(6);
  });
});

describe('Built-in Widget-Vorlagen', () => {
  it('enthält verwendbare Vorlagen mit Knoten', () => {
    expect(BUILTIN_WIDGET_TEMPLATES.length).toBeGreaterThanOrEqual(4);
    for (const t of BUILTIN_WIDGET_TEMPLATES) {
      expect(t.kind).toBe('widget');
      expect(t.node).toBeTruthy();
      expect(t.node.type).toBeTruthy();
    }
  });
});
