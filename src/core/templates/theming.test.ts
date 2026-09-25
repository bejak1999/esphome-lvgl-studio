import { describe, it, expect } from 'vitest';
import { BUILTIN_WIDGET_TEMPLATES } from './builtins';
import { TEMPLATE_THEMES, applyTemplateTheme, colorRole, mapColor, themeById, DEFAULT_TEMPLATE_THEME } from './themes';
import { ICON_SWAP, TEXTS, localizeTemplate } from './content';
import { MDI_ALL } from '../lvgl/mdiAll';
import type { WidgetNode } from '../lvgl/types';

const walk = (n: WidgetNode, cb: (n: WidgetNode) => void) => {
  cb(n);
  n.children.forEach((c) => walk(c, cb));
};
const allTexts = new Set<string>();
for (const t of BUILTIN_WIDGET_TEMPLATES) {
  walk(t.node, (n) => {
    const p = n.props as Record<string, unknown>;
    for (const v of [p.text, p.placeholder_text, ...(Array.isArray(p.options) ? p.options : [])]) if (typeof v === 'string') allTexts.add(v);
  });
}

describe('Vorlagen-Inhalte', () => {
  it('jeder Tabelleneintrag kommt in den Vorlagen vor (keine Tippfehler/Leichen)', () => {
    expect(Object.keys(TEXTS).filter((k) => !allTexts.has(k))).toEqual([]);
  });
  it('alle Ersatz-Icons existieren in der gebündelten MDI-Schrift', () => {
    const codes = new Set(MDI_ALL.map(([, c]) => c));
    expect(Object.values(ICON_SWAP).filter((c) => !codes.has(c))).toEqual([]);
  });
  it('Deutsch ersetzt die englischen Beispieltexte', () => {
    const t = BUILTIN_WIDGET_TEMPLATES.find((x) => x.id === 'b_scene_launcher')!;
    const texts: string[] = [];
    walk(localizeTemplate(t.node, 'de'), (n) => typeof n.props.text === 'string' && texts.push(n.props.text as string));
    expect(texts).toContain('Kino');
    expect(texts).not.toContain('Movie');
  });
  it('das Original bleibt unverändert (Kopie)', () => {
    const t = BUILTIN_WIDGET_TEMPLATES[0];
    const before = JSON.stringify(t.node);
    localizeTemplate(t.node, 'de');
    applyTemplateTheme(t.node, themeById('nord'));
    expect(JSON.stringify(t.node)).toBe(before);
  });
});

describe('Themes', () => {
  it('Standard ist Nord und existiert', () => {
    expect(DEFAULT_TEMPLATE_THEME).toBe('nord');
    expect(themeById(DEFAULT_TEMPLATE_THEME)).toBeTruthy();
  });
  it('Rollen der Quell-Palette', () => {
    expect(colorRole('#0b1220')).toBe('surface');
    expect(colorRole('#e5e7eb')).toBe('text');
    expect(colorRole('#10b981')).toBe('accent');
    expect(colorRole('#3a1518')).toBe('tint');
  });
  it('Akzentfamilie bleibt erhalten, Ergebnis ist gültiges Hex', () => {
    for (const th of TEMPLATE_THEMES) {
      expect(mapColor('#10b981', th)).toMatch(/^#[0-9a-f]{6}$/);
      expect(mapColor('#0b1220', th)).toBe(th.surfaces[0]);
    }
  });
  it('alle Vorlagen: nur gültige Farben, Kreise bleiben Kreise', () => {
    for (const th of TEMPLATE_THEMES) {
      for (const t of BUILTIN_WIDGET_TEMPLATES) {
        const themed = applyTemplateTheme(t.node, th);
        const orig: WidgetNode[] = [];
        walk(t.node, (n) => orig.push(n));
        let i = 0;
        walk(themed, (n) => {
          const o = orig[i++];
          for (const [k, v] of Object.entries(n.props)) {
            if (/(^|_)color$/.test(k) && typeof v === 'string') expect(v, `${t.id}.${k}`).toMatch(/^#[0-9a-f]{6}$/i);
          }
          const r = o.props.radius as number | undefined;
          const half = Math.min(o.geometry.width, o.geometry.height) / 2;
          if (typeof r === 'number' && r >= half - 1) expect(n.props.radius).toBe(r);
        });
      }
    }
  });
});
