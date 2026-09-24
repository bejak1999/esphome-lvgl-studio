/**
 * Farb-Konvertierung zwischen Editor-Modell (`#RRGGBB`) und ESPHome (`0xRRGGBB`).
 */

const NAMED: Record<string, string> = {
  white: '#FFFFFF',
  black: '#000000',
  red: '#FF0000',
  green: '#00FF00',
  blue: '#0000FF',
  yellow: '#FFFF00',
  orange: '#FFA500',
  gray: '#808080',
  grey: '#808080',
  silver: '#C0C0C0',
};

/** ESPHome-Farbwert (Hex-Int, `0x…`, `#…` oder Name) → `#RRGGBB`. */
export function espColorToHex(v: unknown): string {
  if (typeof v === 'number') {
    return '#' + (v & 0xffffff).toString(16).padStart(6, '0').toUpperCase();
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^0x[0-9a-fA-F]+$/.test(s)) {
      return '#' + (parseInt(s, 16) & 0xffffff).toString(16).padStart(6, '0').toUpperCase();
    }
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      const [r, g, b] = [s[1], s[2], s[3]];
      return ('#' + r + r + g + g + b + b).toUpperCase();
    }
    const named = NAMED[s.toLowerCase()];
    if (named) return named;
  }
  return '#000000';
}

/** `#RRGGBB` → Integer (für einen HEX-formatierten YAML-Scalar `0xRRGGBB`). */
export function hexToEspInt(hex: string): number {
  const s = String(hex).replace('#', '');
  const n = parseInt(s, 16);
  return Number.isFinite(n) ? n & 0xffffff : 0;
}
