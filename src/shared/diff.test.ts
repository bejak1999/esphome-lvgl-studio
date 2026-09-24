import { describe, it, expect } from 'vitest';
import { diffLines } from './diff';

describe('diffLines', () => {
  it('zählt hinzugefügte und entfernte Zeilen', () => {
    const a = 'a\nb\nc';
    const b = 'a\nB\nc\nd';
    const d = diffLines(a, b);
    expect(d.removed).toBe(1); // b
    expect(d.added).toBe(2); // B, d
  });

  it('kürzt lange unveränderte Blöcke mit einer Lücke', () => {
    const base = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');
    const changed = base.replace('line 15', 'CHANGED 15');
    const d = diffLines(base, changed, 2);
    expect(d.lines.some((l) => l.type === 'gap')).toBe(true);
    expect(d.lines.length).toBeLessThan(30); // gekürzt
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
  });

  it('leerer Diff bei identischem Text', () => {
    const d = diffLines('x\ny', 'x\ny');
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
  });
});
