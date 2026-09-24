/**
 * Platzhalter-Ersetzung und sicheres Rechnen für Addon-Manifeste.
 *
 * Syntax: `{{ pfad.zum.wert }}` mit optionalen Filtern `{{ config.lat | fixed:5 }}`.
 * Bewusst OHNE `eval`/`new Function`: unter MV3 ist das verboten, und ein Manifest aus
 * dem Netz darf ohnehin keinen Code ausführen. Rechnen geht über `calc()`, das nur
 * Zahlen, Operatoren und eine feste Liste von Funktionen kennt.
 */

export type TemplateContext = Record<string, unknown>;

/** Liest einen Punkt-Pfad (`config.size.width`) aus dem Kontext. */
export function getPath(ctx: TemplateContext, path: string): unknown {
  let cur: unknown = ctx;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Wandelt einen Wert in einen für YAML/URLs brauchbaren String. */
function stringify(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function applyFilter(value: unknown, name: string, arg?: string): unknown {
  switch (name) {
    case 'fixed': {
      const n = Number(value);
      return Number.isFinite(n) ? n.toFixed(Number(arg ?? 2)) : value;
    }
    case 'round': {
      const n = Number(value);
      return Number.isFinite(n) ? Math.round(n) : value;
    }
    case 'int': {
      const n = parseInt(String(value), 10);
      return Number.isFinite(n) ? n : value;
    }
    case 'abs': {
      const n = Number(value);
      return Number.isFinite(n) ? Math.abs(n) : value;
    }
    case 'upper':
      return stringify(value).toUpperCase();
    case 'lower':
      return stringify(value).toLowerCase();
    /** URL-Kodierung für Query-Parameter. */
    case 'enc':
      return encodeURIComponent(stringify(value));
    /** Ersatzwert, wenn leer/undefiniert. */
    case 'default':
      return value == null || value === '' ? (arg ?? '') : value;
    /** Hex-Farbe ohne `#` (viele Karten-APIs erwarten das so). */
    case 'nohash':
      return stringify(value).replace(/^#/, '');
    default:
      return value;
  }
}

/** Wahrheitswert eines Kontextwerts (für `{{#if}}`). `"false"`/`"0"` gelten als falsch. */
export function isTruthy(v: unknown): boolean {
  if (typeof v === 'string') return v !== '' && v !== 'false' && v !== '0';
  return !!v;
}

const IF_OPEN = /\{\{#if\s+([^}]+?)\s*\}\}/;

/**
 * Wertet `{{#if pfad}}…{{else}}…{{/if}}` aus (beliebig verschachtelt) und entfernt die
 * Blöcke. Damit können YAML-Fragmente und URLs Teile weglassen, ohne dass Addons Code
 * mitbringen müssen.
 */
function renderConditionals(tpl: string, ctx: TemplateContext): string {
  const m = IF_OPEN.exec(tpl);
  if (!m) return tpl;

  const bodyStart = m.index + m[0].length;
  // Passendes {{/if}} suchen und dabei verschachtelte Blöcke überspringen.
  let depth = 1;
  let i = bodyStart;
  let elseAt = -1;
  while (i < tpl.length && depth > 0) {
    const nextIf = tpl.indexOf('{{#if', i);
    const nextElse = tpl.indexOf('{{else}}', i);
    const nextEnd = tpl.indexOf('{{/if}}', i);
    if (nextEnd < 0) return tpl.slice(0, m.index) + renderConditionals(tpl.slice(bodyStart), ctx); // unbalanciert
    if (nextIf >= 0 && nextIf < nextEnd) {
      depth += 1;
      i = nextIf + 5;
      continue;
    }
    if (depth === 1 && nextElse >= 0 && nextElse < nextEnd && elseAt < 0) {
      elseAt = nextElse;
      i = nextElse + 8;
      continue;
    }
    depth -= 1;
    if (depth === 0) {
      const bodyEnd = nextEnd;
      const truthyPart = tpl.slice(bodyStart, elseAt >= 0 ? elseAt : bodyEnd);
      const falsyPart = elseAt >= 0 ? tpl.slice(elseAt + 8, bodyEnd) : '';
      const path = m[1].includes('.') ? m[1] : `config.${m[1]}`;
      const chosen = isTruthy(getPath(ctx, path)) ? truthyPart : falsyPart;
      const rest = tpl.slice(bodyEnd + 7);
      return tpl.slice(0, m.index) + renderConditionals(chosen, ctx) + renderConditionals(rest, ctx);
    }
    i = nextEnd + 7;
  }
  return tpl;
}

const PLACEHOLDER = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Wertet einen einzelnen Ausdruck (`pfad | filter:arg | …`) aus. */
function evalExpression(expr: string, ctx: TemplateContext): unknown {
  const parts = expr.split('|').map((p) => p.trim());
  const path = parts.shift() ?? '';
  // Zahlen-/String-Literale erlauben, damit `{{ 'x' | upper }}` und Vergleiche in
  // `calc` funktionieren.
  let value: unknown;
  const lit = path.match(/^'([^']*)'$/) ?? path.match(/^"([^"]*)"$/);
  if (lit) value = lit[1];
  else if (/^-?\d+(\.\d+)?$/.test(path)) value = Number(path);
  else value = getPath(ctx, path);

  for (const f of parts) {
    const [name, arg] = f.split(':');
    value = applyFilter(value, name.trim(), arg?.trim());
  }
  return value;
}

/**
 * Ersetzt bedingte Blöcke und alle Platzhalter in `tpl`.
 * Unbekannte Pfade werden zu einem leeren String.
 */
export function render(tpl: string, ctx: TemplateContext): string {
  const text = tpl.includes('{{#if') ? renderConditionals(tpl, ctx) : tpl;
  return text.replace(PLACEHOLDER, (_m, expr: string) => stringify(evalExpression(expr, ctx)));
}

/**
 * Rendert einen Wert, der im Manifest Zahl ODER Template sein darf.
 * Nicht-numerische Ergebnisse liefern `fallback`.
 */
export function renderNumber(
  value: string | number | undefined,
  ctx: TemplateContext,
  fallback = 0,
): number {
  if (typeof value === 'number') return value;
  if (value == null || value === '') return fallback;
  const text = render(String(value), ctx).trim();
  // Leeres Ergebnis (unbekannter Pfad) ist KEINE 0 – sonst würde ein Tippfehler im
  // Manifest ein Widget stillschweigend auf Größe 0 setzen.
  if (text === '') return fallback;
  const n = Number(text);
  return Number.isFinite(n) ? n : fallback;
}

/** Rendert einen Wert, der ein Template sein kann, und behält Nicht-Strings bei. */
export function renderValue(value: unknown, ctx: TemplateContext): unknown {
  if (typeof value !== 'string') return value;
  if (!value.includes('{{')) return value;
  const out = render(value, ctx);
  // Rein numerische Ergebnisse als Zahl zurückgeben (Props wie `radius` erwarten Zahlen).
  if (/^-?\d+(\.\d+)?$/.test(out.trim()) && out.trim() !== '') return Number(out.trim());
  if (out === 'true') return true;
  if (out === 'false') return false;
  return out;
}

// ---------------------------------------------------------------------------
// Sicherer Rechen-Ausdruck (Shunting-Yard-frei: rekursiver Abstieg)
// ---------------------------------------------------------------------------

const FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min,
  max: Math.max,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  sqrt: Math.sqrt,
  cos: Math.cos,
  sin: Math.sin,
  tan: Math.tan,
  /** Grad → Radiant (praktisch für Geo-Rechnungen). */
  rad: (d) => (d * Math.PI) / 180,
  deg: (r) => (r * 180) / Math.PI,
  pow: Math.pow,
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

interface Cursor {
  s: string;
  i: number;
}

function skip(c: Cursor) {
  while (c.i < c.s.length && /\s/.test(c.s[c.i])) c.i += 1;
}

function parseExpr(c: Cursor): number {
  let v = parseTerm(c);
  for (;;) {
    skip(c);
    const op = c.s[c.i];
    if (op !== '+' && op !== '-') return v;
    c.i += 1;
    const r = parseTerm(c);
    v = op === '+' ? v + r : v - r;
  }
}

function parseTerm(c: Cursor): number {
  let v = parseUnary(c);
  for (;;) {
    skip(c);
    const op = c.s[c.i];
    if (op !== '*' && op !== '/' && op !== '%') return v;
    c.i += 1;
    const r = parseUnary(c);
    if (op === '*') v *= r;
    else if (op === '/') v = r === 0 ? 0 : v / r;
    else v = r === 0 ? 0 : v % r;
  }
}

function parseUnary(c: Cursor): number {
  skip(c);
  if (c.s[c.i] === '-') {
    c.i += 1;
    return -parseUnary(c);
  }
  if (c.s[c.i] === '+') {
    c.i += 1;
    return parseUnary(c);
  }
  return parsePower(c);
}

function parsePower(c: Cursor): number {
  const base = parseAtom(c);
  skip(c);
  if (c.s[c.i] === '^') {
    c.i += 1;
    return Math.pow(base, parseUnary(c));
  }
  return base;
}

function parseAtom(c: Cursor): number {
  skip(c);
  const ch = c.s[c.i];
  if (ch === '(') {
    c.i += 1;
    const v = parseExpr(c);
    skip(c);
    if (c.s[c.i] === ')') c.i += 1;
    return v;
  }
  const num = /^\d+(\.\d+)?/.exec(c.s.slice(c.i));
  if (num) {
    c.i += num[0].length;
    return Number(num[0]);
  }
  const name = /^[a-zA-Z_][a-zA-Z0-9_]*/.exec(c.s.slice(c.i));
  if (name) {
    c.i += name[0].length;
    const key = name[0].toLowerCase();
    skip(c);
    if (c.s[c.i] === '(') {
      c.i += 1;
      const args: number[] = [];
      for (;;) {
        skip(c);
        if (c.s[c.i] === ')') {
          c.i += 1;
          break;
        }
        args.push(parseExpr(c));
        skip(c);
        if (c.s[c.i] === ',') c.i += 1;
        else if (c.s[c.i] === ')') {
          c.i += 1;
          break;
        } else break; // unerwartetes Zeichen → abbrechen statt endlos zu laufen
      }
      const fn = FUNCS[key];
      return fn ? fn(...args) : 0;
    }
    return CONSTS[key] ?? 0;
  }
  // Unbekanntes Zeichen: überspringen, damit ein Tippfehler nicht zur Endlosschleife wird.
  c.i += 1;
  return 0;
}

/**
 * Rechnet einen Ausdruck aus, in dem zuvor alle Platzhalter ersetzt werden.
 * Erlaubt sind Zahlen, `+ - * / % ^`, Klammern, die Konstanten `pi`/`e` und die
 * Funktionen min, max, round, floor, ceil, abs, sqrt, cos, sin, tan, rad, deg, pow.
 */
export function calc(expr: string, ctx: TemplateContext): number {
  const rendered = render(expr, ctx);
  const c: Cursor = { s: rendered, i: 0 };
  const v = parseExpr(c);
  return Number.isFinite(v) ? v : 0;
}
