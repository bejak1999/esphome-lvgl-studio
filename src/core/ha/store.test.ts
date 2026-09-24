import { describe, it, expect } from 'vitest';
import { isEntityActive } from './store';

describe('isEntityActive', () => {
  it('behandelt aus-/leere/unbekannte Zustände als inaktiv', () => {
    for (const s of ['off', 'closed', 'unavailable', 'unknown', 'idle', 'standby', 'none', 'false', '0', '', undefined]) {
      expect(isEntityActive(s)).toBe(false);
    }
  });

  it('behandelt on-artige Zustände als aktiv', () => {
    for (const s of ['on', 'open', 'home', 'playing', 'heat', 'cool', 'ON', 'Open']) {
      expect(isEntityActive(s)).toBe(true);
    }
  });

  it('deutet Zahlen > 0 als aktiv', () => {
    expect(isEntityActive('23.5')).toBe(true);
    expect(isEntityActive('0')).toBe(false);
    expect(isEntityActive('-1')).toBe(false);
  });
});
