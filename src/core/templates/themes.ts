import type { WidgetNode } from '../lvgl/types';

/**
 * Farb-Themes für die eingebauten Vorlagen.
 *
 * Die Vorlagen sind mit einer festen Quell-Palette gebaut. Beim Einfügen wird jede Farbe nach
 * ihrer ROLLE umgerechnet:
 *   - dunkle Flächen      → Flächen-Abstufung des Themes (nach relativer Helligkeit)
 *   - Grau-/Weißtöne      → Text-Abstufung des Themes
 *   - Akzente (Grün, Blau …) → Akzentfarbe derselben Familie im Theme, Helligkeitsversatz bleibt
 *   - eingefärbte Flächen (z. B. dunkles Rot hinter einem Alarm) → Akzent des Themes auf Fläche
 * Dazu skaliert das Theme die Rundungen. Text auf farbigen Knöpfen bleibt kontrastreich.
 */

export type AccentFamily = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'violet' | 'pink';

export interface TemplateTheme {
  id: string;
  name: { en: string; de: string };
  /** Flächen von dunkel/hinten nach vorne: Seite, Karte, erhöht, stärker erhöht, Rahmen/Spur. */
  surfaces: [string, string, string, string, string];
  /** Text von stark nach schwach: Haupttext, Sekundär, gedämpft, sehr schwach. */
  text: [string, string, string, string];
  /** Text auf gefüllten Akzentflächen (Knöpfe). */
  onAccent: string;
  accents: Record<AccentFamily, string>;
  /** Faktor für Rundungen (Kreise bleiben Kreise). */
  radiusScale: number;
}

export const TEMPLATE_THEMES: TemplateTheme[] = [
  {
    id: 'nord',
    name: { en: 'Nord', de: 'Nord' },
    surfaces: ['#242933', '#2e3440', '#3b4252', '#434c5e', '#4c566a'],
    text: ['#eceff4', '#d8dee9', '#a3adbf', '#7b8499'],
    onAccent: '#2e3440',
    accents: {
      red: '#bf616a', orange: '#d08770', yellow: '#ebcb8b', green: '#a3be8c',
      cyan: '#88c0d0', blue: '#81a1c1', violet: '#b48ead', pink: '#c895bf',
    },
    radiusScale: 0.85,
  },
  {
    id: 'slate',
    name: { en: 'Slate & Teal', de: 'Schiefer & Petrol' },
    surfaces: ['#0f141a', '#161d26', '#1c2531', '#232e3c', '#33404f'],
    text: ['#eef2f6', '#b4bfcc', '#7d8a99', '#566372'],
    onAccent: '#0b1015',
    accents: {
      red: '#e5616b', orange: '#ee8a4c', yellow: '#e8b54a', green: '#56c28a',
      cyan: '#4fd1c5', blue: '#2fb3c9', violet: '#8d7fe8', pink: '#e56b9f',
    },
    radiusScale: 0.6,
  },
  {
    id: 'indigo',
    name: { en: 'Indigo Night', de: 'Indigo-Nacht' },
    surfaces: ['#0d0b1a', '#15122a', '#1c1836', '#241f44', '#342d5c'],
    text: ['#f1efff', '#bdb6e0', '#8a82b3', '#5e5787'],
    onAccent: '#ffffff',
    accents: {
      red: '#ff6b8a', orange: '#ff9f5a', yellow: '#ffd166', green: '#5ee6a8',
      cyan: '#67e8f9', blue: '#7c8cff', violet: '#b18cff', pink: '#f472d0',
    },
    radiusScale: 1.25,
  },
  {
    id: 'daylight',
    name: { en: 'Daylight', de: 'Tageslicht' },
    surfaces: ['#eef1f5', '#ffffff', '#f6f7f9', '#e9edf2', '#d3d9e1'],
    text: ['#111827', '#374151', '#6b7280', '#9ca3af'],
    onAccent: '#ffffff',
    accents: {
      red: '#dc2626', orange: '#ea580c', yellow: '#d97706', green: '#059669',
      cyan: '#0891b2', blue: '#2563eb', violet: '#7c3aed', pink: '#db2777',
    },
    radiusScale: 1,
  },
];

export const DEFAULT_TEMPLATE_THEME = 'nord';

export function themeById(id: string | undefined): TemplateTheme | undefined {
  return TEMPLATE_THEMES.find((t) => t.id === id);
}

// ── Farbmathematik ───────────────────────────────────────────────────────────

type Hsl = [h: number, s: number, l: number];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function toHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}
function fromHsl([h, s, l]: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function familyOf(h: number): AccentFamily {
  if (h < 15 || h >= 345) return 'red';
  if (h < 38) return 'orange';
  if (h < 65) return 'yellow';
  if (h < 165) return 'green';
  if (h < 195) return 'cyan';
  if (h < 245) return 'blue';
  if (h < 295) return 'violet';
  return 'pink';
}

/** Referenz-Helligkeiten der Quell-Palette (siehe builtins.ts). */
const SRC_SURFACE_L = [0.086, 0.115, 0.135, 0.165, 0.25]; // #0b1220 … #374151
const SRC_TEXT_L = [1, 0.9, 0.64, 0.43]; // #ffffff, #e5e7eb, #9ca3af, #6b7280
/** Quell-Grundton je Akzentfamilie (daran wird der Helligkeitsversatz gemessen). */
const SRC_ACCENT_L: Record<AccentFamily, number> = {
  red: toHsl('#ef4444')[2], orange: toHsl('#f97316')[2], yellow: toHsl('#f59e0b')[2], green: toHsl('#10b981')[2],
  cyan: toHsl('#22d3ee')[2], blue: toHsl('#3b82f6')[2], violet: toHsl('#8b5cf6')[2], pink: toHsl('#ec4899')[2],
};

/** Wert zwischen zwei Stufen einer Rampe (anchors aufsteigend oder absteigend). */
function onRamp(l: number, anchors: number[], stops: string[]): string {
  const asc = anchors[0] < anchors[anchors.length - 1];
  const a = asc ? anchors : [...anchors].reverse();
  const s = asc ? stops : [...stops].reverse();
  if (l <= a[0]) return s[0];
  for (let i = 1; i < a.length; i++) {
    if (l <= a[i]) return mix(s[i - 1], s[i], (l - a[i - 1]) / (a[i] - a[i - 1]));
  }
  return s[s.length - 1];
}

export type ColorRole = 'surface' | 'text' | 'accent' | 'tint';

export function colorRole(hex: string): ColorRole {
  const [h, s, l] = toHsl(hex);
  const slate = h >= 200 && h <= 235; // die Grundflächen der Quelle sind blaugrau
  if (l < 0.3 && (s < 0.35 || slate)) return 'surface';
  if (l < 0.3) return 'tint';
  if (s < 0.3 || (slate && s < 0.4 && l > 0.55)) return 'text';
  return 'accent';
}

/** Eine einzelne Quellfarbe im Theme. */
export function mapColor(hex: string, theme: TemplateTheme): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const [h, , l] = toHsl(hex);
  switch (colorRole(hex)) {
    case 'surface':
      return onRamp(l, SRC_SURFACE_L, theme.surfaces);
    case 'text':
      return onRamp(l, SRC_TEXT_L, theme.text);
    case 'tint': {
      // Dunkel eingefärbte Fläche: Akzent der Familie leicht über die Kartenfläche legen.
      const accent = theme.accents[familyOf(h)];
      return mix(theme.surfaces[1], accent, clamp01(0.14 + (l - 0.08) * 0.8));
    }
    case 'accent': {
      const fam = familyOf(h);
      const [th, ts, tl] = toHsl(theme.accents[fam]);
      return fromHsl([th, ts, clamp01(tl + (l - SRC_ACCENT_L[fam]) * 0.8)]);
    }
  }
}

const COLOR_KEY = /(^|_)color$/;
const RADIUS_KEY = /(^|_)radius$/;

/** Vorlage (tiefe Kopie) ins Theme umfärben. Ohne Theme bleibt sie unverändert. */
export function applyTemplateTheme(node: WidgetNode, theme: TemplateTheme | undefined): WidgetNode {
  const copy = JSON.parse(JSON.stringify(node)) as WidgetNode;
  if (!theme) return copy;
  const walk = (n: WidgetNode) => {
    const p = n.props as Record<string, unknown>;
    const ownBg = typeof p.bg_color === 'string' ? p.bg_color : undefined;
    const onFilledAccent = !!ownBg && colorRole(ownBg) === 'accent';
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'string' && COLOR_KEY.test(k)) {
        // Heller Text auf gefülltem Akzent (Knopf): theme-eigene Kontrastfarbe statt Text-Rampe.
        p[k] = k === 'text_color' && onFilledAccent && colorRole(v) === 'text' && toHsl(v)[2] > 0.8 ? theme.onAccent : mapColor(v, theme);
      } else if (typeof v === 'number' && RADIUS_KEY.test(k) && v > 0) {
        const half = Math.min(n.geometry.width, n.geometry.height) / 2;
        p[k] = v >= half - 1 ? v : Math.round(Math.min(half, v * theme.radiusScale));
      }
    }
    n.children.forEach(walk);
  };
  walk(copy);
  return copy;
}
