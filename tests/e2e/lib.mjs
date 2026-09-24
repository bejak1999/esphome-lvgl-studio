// Gemeinsame Helfer der E2E-Tests: Extension in Chrome/Firefox laden, Seiten öffnen, Audits.
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const ROOT = path.resolve('.output');
export const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
export const HEADLESS = process.env.HEADLESS === '1';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FF_ID = 'esphome-lvgl-studio@benni.local';
const FF_UUID = '6b1f1d2e-1111-4c4c-9a9a-0123456789ab'; // feste moz-extension-UUID für die Tests

/** Firefox: Env > lokale Installation (Windows) > von Puppeteer installierte Version. */
function firefoxPath() {
  if (process.env.FIREFOX_PATH) return process.env.FIREFOX_PATH;
  const win = 'C:/Program Files/Mozilla Firefox/firefox.exe';
  return fs.existsSync(win) ? win : undefined;
}

export async function launch(which) {
  if (which === 'chrome') {
    const browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || undefined, // Standard: Chrome for Testing von Puppeteer
      headless: HEADLESS,
      pipe: true,
      enableExtensions: [path.join(ROOT, 'chrome-mv3')],
      // GitHub-Linux-Runner erlauben die Chrome-Sandbox nicht (AppArmor) → dort abschalten.
      args: ['--window-size=1500,950', '--no-first-run', ...(process.env.CI ? ['--no-sandbox'] : [])],
      defaultViewport: null,
    });
    const sw = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://'),
      { timeout: 20000 },
    );
    return { browser, base: sw.url().match(/^chrome-extension:\/\/[^/]+/)[0] };
  }
  const browser = await puppeteer.launch({
    browser: 'firefox',
    executablePath: firefoxPath(),
    headless: HEADLESS,
    // Nötig, damit WebDriver-BiDi moz-extension://-Seiten öffnen darf.
    args: ['--remote-allow-system-access', '--width=1500', '--height=950'],
    defaultViewport: null,
    extraPrefsFirefox: {
      'extensions.webextensions.uuids': JSON.stringify({ [FF_ID]: FF_UUID }),
      'xpinstall.signatures.required': false,
    },
  });
  await browser.installExtension(path.join(ROOT, 'firefox-mv2'));
  return { browser, base: `moz-extension://${FF_UUID}` };
}

export async function openPage(browser, base, file, errors = []) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`[${file}] pageerror: ${e?.message ?? e}`));
  page.on('console', (m) => {
    if (['error', 'warn', 'warning'].includes(m.type())) errors.push(`[${file}] ${m.type()}: ${m.text()}`);
  });
  // Firefox/BiDi meldet bei moz-extension-Seiten kein zuverlässiges load-Event.
  await page.goto(`${base}/${file}`, { waitUntil: 'load', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => document.body?.innerText?.length > 20, { timeout: 15000 });
  return page;
}

export const clickText = (page, sel, re) =>
  page.evaluate(
    (sel, src, flags) => {
      const rx = new RegExp(src, flags);
      const el = [...document.querySelectorAll(sel)].find(
        (e) => e.offsetParent !== null && (rx.test(e.textContent.trim()) || rx.test(e.title || '') || rx.test(e.getAttribute('aria-label') || '')),
      );
      el?.click();
      return !!el;
    },
    sel,
    re.source,
    re.flags,
  );

export async function setSettings(page, patch) {
  await page.evaluate(async (patch) => {
    const api = globalThis.browser ?? globalThis.chrome;
    const cur = (await api.storage.local.get('settings')).settings ?? {};
    await api.storage.local.set({ settings: { ...cur, ...patch } });
  }, patch);
}

/** Einfaches Ergebnis-Protokoll mit PASS/FAIL-Ausgabe. */
export function reporter(prefix) {
  const results = [];
  const ok = (name, pass, info = '') => {
    results.push({ name: `${prefix} ${name}`, pass, info });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${prefix} ${name}${info && !pass ? '  — ' + String(info).slice(0, 200) : ''}`);
  };
  return { results, ok };
}

/** axe (ohne Nutzer-Designs auf dem Canvas) + Layout-Überlauf + Sprachreste. */
export async function audit(page, lang) {
  if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(AXE);
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run({ exclude: [['[data-lvgl-canvas]']] }, { resultTypes: ['violations'] });
    return r.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`);
  });
  const layout = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    if (document.scrollingElement.scrollWidth > vw + 1) out.push(`page scrollWidth ${document.scrollingElement.scrollWidth} > ${vw}`);
    for (const el of document.querySelectorAll('button, span, label, h1, h2, p, input, select')) {
      if (!el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.width && r.right > vw + 2) {
        let p = el.parentElement;
        let scroller = false;
        while (p) {
          if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) { scroller = true; break; }
          p = p.parentElement;
        }
        if (!scroller) out.push(`beyond viewport: "${(el.textContent || '').trim().slice(0, 30)}"`);
      }
    }
    return out;
  });
  const leftovers = await page.evaluate((lang) => {
    const de = /[äöüßÄÖÜ]|\b(und|oder|nicht|Gerät|Seite|Einstellungen|Löschen|Speichern|wählen|Vorlage|Hintergrund|Breite|Höhe|Farbe|Keine|Verbinden|Größe)\b/;
    const en = /\b(the|Settings|Delete|Save|Loading|Connect|Disconnect|Select|Choose|Width|Height|Color|Background|Template|Templates|Cancel|Close|Apply|Error|Device|Search)\b/;
    const rx = lang === 'en' ? de : en;
    const out = new Set();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const n = walk.currentNode;
      const t = n.textContent.trim();
      const el = n.parentElement;
      if (!t || !el || el.closest('textarea, script, style, [data-lvgl-canvas]') || el.offsetParent === null) continue;
      if (rx.test(t)) out.add(t.slice(0, 60));
    }
    for (const el of document.querySelectorAll('[title],[placeholder],[aria-label]')) {
      if (el.closest('[data-lvgl-canvas]')) continue;
      for (const a of ['title', 'placeholder', 'aria-label']) {
        const v = el.getAttribute(a);
        if (v && rx.test(v)) out.add(`@${a}: ${v.slice(0, 60)}`);
      }
    }
    return [...out];
  }, lang);
  return { axe, layout, leftovers };
}
