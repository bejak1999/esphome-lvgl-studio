import { describe, expect, it } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { boxForLinePoints, fitLinePointsToBox, linePointsBBox, parseLinePoints } from './line';
import { useDocumentStore } from './document';

describe('Line-Punkte ↔ Box', () => {
  it('liest Punkte in verschiedenen Schreibweisen', () => {
    expect(parseLinePoints('0,0 160,0')).toEqual([[0, 0], [160, 0]]);
    expect(parseLinePoints('[[0, 0], [20, 30]]')).toEqual([[0, 0], [20, 30]]);
    expect(parseLinePoints('')).toEqual([]);
  });

  it('skaliert beim Verkleinern der Box mit', () => {
    expect(fitLinePointsToBox('0,2 160,2', 80, 4)).toBe('0,2 80,2');
  });

  it('legt achsenlose Linien mittig in die Box (nicht an die Oberkante)', () => {
    // Waagerechte Linie: y-Spanne ist 0 → mittig statt y=0.
    expect(fitLinePointsToBox('0,0 160,0', 100, 10)).toBe('0,5 100,5');
  });

  it('führt den Rahmen nach, wenn Punkte eingetippt werden', () => {
    const fit = boxForLinePoints('10,10 50,40')!;
    expect(fit.points).toBe('0,0 40,30'); // auf den Ursprung normalisiert
    expect(fit).toMatchObject({ width: 40, height: 30 });
  });

  it('bbox braucht mindestens zwei Punkte', () => {
    expect(linePointsBBox(parseLinePoints('5,5'))).toBeNull();
  });
});

describe('Line im Dokument', () => {
  it('ändert beim Resize wirklich die Länge', () => {
    setActivePinia(createPinia());
    const doc = useDocumentStore();
    doc.addWidget('line');
    const node = doc.screen.children.at(-1)!;
    expect(node.props.points).toBe('0,2 160,2');

    doc.updateGeometry(node.id, { width: 60 });
    // Vorher blieb `points` unverändert – die Linie war immer gleich lang.
    expect(node.props.points).toBe('0,2 60,2');
  });

  it('lässt andere Widgets beim Resize unangetastet', () => {
    setActivePinia(createPinia());
    const doc = useDocumentStore();
    doc.addWidget('label');
    const node = doc.screen.children.at(-1)!;
    const before = { ...node.props };
    doc.updateGeometry(node.id, { width: 60 });
    expect(node.props).toEqual(before);
  });
});
