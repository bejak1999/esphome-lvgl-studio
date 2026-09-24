// E2E-Suite: lädt die gebaute Extension in Chrome und/oder Firefox und prüft
//  (1) Audit je Ansicht & Sprache: axe-core, Layout-Überlauf, Sprachreste, Console-Fehler
//  (2) Funktionen aus Nutzersicht (Einstellungen, Verbinden, Bearbeiten, Seiten, Vorlagen, …)
//
//   npm run build && npm run build:chrome
//   node tests/e2e/run.mjs [chrome|firefox|all]      (HEADLESS=1 für CI)
//
// Standardmäßig gegen den nachgebauten device-builder (fake-esphome.mjs). Mit ESPHOME_URL
// gegen ein echtes Gerät – dann nur lesend: es wird nie gespeichert, kompiliert oder geflasht.
import { startFakeEsphome } from './fake-esphome.mjs';
import { launch, openPage, clickText, setSettings, sleep, audit, reporter } from './lib.mjs';

const which = process.argv[2] ?? 'all';
const browsers = which === 'all' ? ['chrome', 'firefox'] : [which];
const fake = process.env.ESPHOME_URL ? null : await startFakeEsphome();
const ESPHOME = process.env.ESPHOME_URL ?? fake.url;
const DEVICE = new RegExp(process.env.E2E_DEVICE ?? 'demo-display', 'i');
const UNREACHABLE = 'http://10.255.255.1:8123'; // nicht routbar → Timeout-Pfad

const all = [];
for (const b of browsers) {
  const { browser, base } = await launch(b);
  const { results, ok } = reporter(b);
  const errors = [];
  try {
    await auditViews(browser, base, ok, errors);
    await functional(browser, base, ok, errors);
    const unexpected = [...new Set(errors)].filter((e) => !/openrouter|401|10\.255\.255\.1|Failed to load resource/i.test(e));
    ok('keine unerwarteten Console-Fehler/-Warnungen', unexpected.length === 0, unexpected.slice(0, 4).join(' | '));
  } catch (e) {
    console.error(e.stack);
    ok('Testlauf ohne Absturz', false, e.message);
  } finally {
    await browser.close();
  }
  all.push(...results);
}
await fake?.close();

const failed = all.filter((r) => !r.pass);
console.log(`\n${all.length - failed.length}/${all.length} bestanden`);
process.exit(failed.length ? 1 : 0);

// ---------------------------------------------------------------------------

async function auditViews(browser, base, ok, errors) {
  for (const lang of ['en', 'de']) {
    const opt = await openPage(browser, base, 'options.html', errors);
    await setSettings(opt, { esphome: { url: ESPHOME, token: '' }, language: lang });
    await opt.reload().catch(() => {});
    await sleep(1200);
    const check = async (page, view) => {
      const r = await audit(page, lang);
      ok(`[${lang}] ${view}: axe ohne Verstöße`, r.axe.length === 0, r.axe.join(' | '));
      ok(`[${lang}] ${view}: kein Layout-Überlauf`, r.layout.length === 0, r.layout.join(' | '));
      ok(`[${lang}] ${view}: keine Sprachreste`, r.leftovers.length === 0, r.leftovers.join(' | '));
    };
    await opt.setViewport({ width: 1280, height: 900 });
    await check(opt, 'Optionen');

    for (const w of [320, 420]) {
      const sp = await openPage(browser, base, 'sidepanel.html', errors);
      await sp.setViewport({ width: w, height: 800 });
      await sleep(3000);
      await check(sp, `Sidepanel ${w}px`);
      if (w === 420) {
        await clickText(sp, 'button', /^⚙$/);
        await sleep(500);
        await check(sp, 'Sidepanel-Einstellungen');
      }
      await sp.close();
    }

    const ed = await openPage(browser, base, 'editor.html', errors);
    await ed.setViewport({ width: 1280, height: 720 });
    await sleep(3000);
    await check(ed, 'Editor leer');
    await ed.select('select[aria-label]', await deviceValue(ed));
    await sleep(2500);
    await check(ed, 'Editor mit Gerät');
    for (const m of [['mode_split', /^(Split|Geteilt)$/], ['mode_code', /^Code$/], ['mode_preview', /^(Preview|Vorschau)$/]]) {
      await clickText(ed, 'header button', m[1]);
      await sleep(500);
      await check(ed, `Editor ${m[0]}`);
    }
    await clickText(ed, 'header button', /^Design$/);
    await clickText(ed, 'header button', /^(Templates|Vorlagen)$/);
    await sleep(800);
    await check(ed, 'Vorlagen-Dialog');
    await ed.keyboard.press('Escape');
    await sleep(300);
    ok(`[${lang}] Escape schließt Dialog`, !(await ed.evaluate(() => !!document.querySelector('[role=dialog]'))));
    await ed.close();
    await opt.close();
  }
}

async function deviceValue(page) {
  return page.evaluate(
    (src) => [...document.querySelectorAll('select[aria-label] option')].map((o) => o.value).find((v) => new RegExp(src, 'i').test(v)),
    DEVICE.source,
  );
}

async function functional(browser, base, ok, errors) {
  const yamlOf = (p) => p.evaluate(() => document.querySelector('textarea[aria-label="ESPHome YAML"]')?.value ?? null);
  const text = (p) => p.evaluate(() => document.body.innerText);
  const canvasText = (p) => p.evaluate(() => document.querySelector('[data-lvgl-canvas]')?.innerText ?? '');
  const mode = async (p, re) => { await clickText(p, 'header button', re); await sleep(400); };
  const ctrl = async (p, key) => { await p.keyboard.down('Control'); await p.keyboard.press(key); await p.keyboard.up('Control'); await sleep(300); };
  const setCode = async (p, value) => {
    await p.evaluate((v) => {
      const ta = document.querySelector('textarea[aria-label="ESPHome YAML"]');
      ta.focus(); ta.value = v;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.blur();
    }, value);
    await sleep(600);
  };
  const saveBtn = /^(Save|Speichern)$/;

  // Einstellungen über die UI speichern und nach Reload wiederfinden
  const opt = await openPage(browser, base, 'options.html', errors);
  await setSettings(opt, { language: 'en' });
  await opt.reload().catch(() => {});
  await sleep(1000);
  const urlSel = 'input[placeholder*="6052"]';
  // Ohne Element-Handles: Firefox (BiDi) verwirft sie nach einem Reload.
  await opt.evaluate((s) => { const i = document.querySelector(s); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); }, urlSel);
  await opt.keyboard.type(ESPHOME);
  await clickText(opt, 'button', saveBtn);
  await sleep(500);
  await opt.reload().catch(() => {});
  await sleep(1200);
  ok('Einstellungen: URL speichern & nach Reload erhalten', (await opt.evaluate((s) => document.querySelector(s).value, urlSel)) === ESPHOME);

  const ed = await openPage(browser, base, 'editor.html', errors);
  await ed.setViewport({ width: 1440, height: 900 });
  await sleep(3500);
  ok('Editor: verbindet automatisch', /disconnect/i.test(await text(ed)));

  // Sprache live umschalten
  await opt.select('select', 'de');
  await clickText(opt, 'button', saveBtn);
  await sleep(700);
  ok('Sprache: Umschalten wirkt live im offenen Editor', /Vorlagen/.test(await ed.evaluate(() => document.querySelector('header').innerText)));
  ok('Sprache: <html lang> folgt', (await ed.evaluate(() => document.documentElement.lang)) === 'de');
  await opt.select('select', 'en');
  await clickText(opt, 'button', saveBtn);
  await sleep(700);

  // Gerät öffnen: unverändert = exakt der Originaltext; Displaygröße aus dem Modell
  const dev = await deviceValue(ed);
  await ed.select('select[aria-label]', dev);
  await sleep(2500);
  ok('Gerät: Displaygröße aus model (JC1060P470 → 1024×600)', /1024 × 600/.test(await text(ed)));
  await mode(ed, /^Split$/);
  const original = fake?.configs.get(dev);
  if (original) ok('Gerät: unverändert exportiert = Originaltext', (await yamlOf(ed)) === original);
  ok('Gerät: nicht als ungespeichert markiert', !/unsaved/i.test(await text(ed)));

  // Widget aus der Palette, Breite im Panel ändern → YAML
  await mode(ed, /^Design$/);
  await clickText(ed, 'button', /^Label$/);
  await sleep(300);
  await mode(ed, /^Split$/);
  const linked = await ed.evaluate(() => {
    const l = [...document.querySelectorAll('aside label')].find((x) => x.textContent.trim() === 'Width');
    const input = l && document.getElementById(l.htmlFor);
    input?.focus();
    return !!input;
  });
  ok('Eigenschaften: Label ↔ Eingabefeld verknüpft', linked);
  if (linked) {
    await ctrl(ed, 'a');
    await ed.keyboard.type('222');
    await ed.keyboard.press('Tab');
    await sleep(500);
  }
  ok('Eigenschaften: Breite ändern → YAML', /width: 222/.test(await yamlOf(ed)));
  ok('Ungespeichert-Hinweis erscheint', /unsaved/i.test(await text(ed)));
  if (original) {
    const out = await yamlOf(ed);
    ok('Bearbeiten erhält Lambdas, !secret & Sensoren', ['!secret wifi_password', "str_sprintf(\"%.1f°C\", x)", 'entity_id: sensor.living_room_temperature'].every((s) => out.includes(s)));
  }

  // Tastatur im Elementbaum
  const tree = (re) => ed.evaluate((src) => { const b = [...document.querySelectorAll('aside .group > button:first-child')].find((e) => new RegExp(src).test(e.textContent)); b?.focus(); return !!b; }, re);
  const y1 = await yamlOf(ed);
  await tree('Label\\s*·\\s*lbl_2\\b');
  await ed.keyboard.press('Enter');
  await sleep(200);
  ok('Tastatur: Baum-Element per Enter auswählen', /lbl_2/.test(await ed.evaluate(() => document.querySelector('aside [aria-current=true]')?.textContent ?? '')));
  await ed.evaluate(() => document.activeElement.blur());
  await ed.keyboard.press('Delete');
  await sleep(300);
  ok('Tastatur: Entf löscht Widget', /id: lbl_2\b/.test(y1) && !/id: lbl_2\b/.test(await yamlOf(ed)));
  await ctrl(ed, 'z');
  ok('Tastatur: Strg+Z stellt wieder her', /id: lbl_2\b/.test(await yamlOf(ed)));
  await ctrl(ed, 'y');
  ok('Tastatur: Strg+Y wiederholt', !/id: lbl_2\b/.test(await yamlOf(ed)));
  await ctrl(ed, 'z');

  // Code-Editor
  const code = await yamlOf(ed);
  await setCode(ed, code.replace('Smart Home', 'Smart Home QA'));
  ok('Code: Änderung erscheint im Canvas', /Smart Home QA/.test(await canvasText(ed)));
  await setCode(ed, 'lvgl:\n  pages:\n    - id: x\n      widgets: [\n');
  ok('Code: kaputtes YAML → Fehlermeldung', /YAML error/.test(await text(ed)));
  ok('Code: Dokument bleibt nach Fehler erhalten', /Smart Home QA/.test(await canvasText(ed)));
  await setCode(ed, code);

  // Seiten
  const pages = () => ed.evaluate(() => document.querySelectorAll('[title^="Page id"]').length);
  const p0 = await pages();
  await clickText(ed, 'button', /^\+ Page$/);
  await sleep(300);
  ok('Seiten: hinzufügen', (await pages()) === p0 + 1);
  await ed.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '✎').pop()?.click());
  await sleep(300);
  await ctrl(ed, 'a');
  await ed.keyboard.type('QA page');
  await ed.keyboard.press('Enter');
  await sleep(300);
  ok('Seiten: umbenennen per Enter', /QA page/.test(await text(ed)));
  await ed.evaluate(() => document.querySelector('[aria-label="Delete current page"]')?.click());
  await sleep(300);
  ok('Seiten: löschen', (await pages()) === p0);

  // Vorlagen, Export, Verlauf
  await mode(ed, /^Design$/);
  const count = () => ed.evaluate(() => document.querySelectorAll('aside .group > button:first-child').length);
  const c0 = await count();
  await clickText(ed, 'header button', /^Templates$/);
  await sleep(700);
  await ed.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((x) => /insert/i.test(x.textContent + x.title))?.click());
  await sleep(500);
  await ed.keyboard.press('Escape');
  ok('Vorlagen: Widget-Vorlage einfügen', (await count()) > c0);
  const exported = await ed.evaluate(() => new Promise((res) => {
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { res(this.download); HTMLAnchorElement.prototype.click = orig; };
    [...document.querySelectorAll('header button')].find((b) => b.textContent.trim() === 'Export').click();
    setTimeout(() => res(null), 1500);
  }));
  ok('Export: dashboard.yaml', exported === 'dashboard.yaml');
  await clickText(ed, 'button', /^History$/);
  await sleep(500);
  const v = () => ed.evaluate(() => document.querySelectorAll('[role=dialog] .w-64 > button').length);
  const v0 = await v();
  await clickText(ed, '[role=dialog] button', /Save state now|snapshot/i);
  await sleep(500);
  ok('Verlauf: Stand sichern', (await v()) === v0 + 1);
  await ed.keyboard.press('Escape');
  await sleep(300);

  // Sidepanel ↔ Editor
  const sp = await openPage(browser, base, 'sidepanel.html', errors);
  await sp.setViewport({ width: 400, height: 850 });
  await sleep(3500);
  await sp.select('select[aria-label]', dev);
  await sleep(2500);
  await ed.bringToFront();
  await clickText(ed, 'button', /^Button$/);
  await sleep(1200);
  await sp.bringToFront();
  ok('Sync: neues Widget erscheint in der Sidebar', (await sp.evaluate(() => document.body.innerText)).includes('Button'));

  // KI ohne / mit ungültigem Key
  ok('KI: Hinweis ohne Key', /No OpenRouter key/i.test(await text(sp)));
  await setSettings(sp, { ai: { apiKey: 'sk-or-invalid-e2e', model: 'google/gemini-2.0-flash-001', baseUrl: 'https://openrouter.ai/api/v1', contextLength: 0 } });
  await sleep(600);
  await sp.type('textarea', 'Make the background blue');
  await clickText(sp, 'button', /^Send$/);
  await sleep(8000);
  ok('KI: ungültiger Key → Fehlermeldung, UI wieder bedienbar',
    (await sp.evaluate(() => [...document.querySelectorAll('*')].some((e) => /error|401|failed|fetch/i.test(e.textContent) && e.children.length === 0 && e.closest('.justify-start')))) &&
    !(await sp.evaluate(() => /^Stop$/m.test(document.body.innerText))));
  await setSettings(sp, { ai: { apiKey: '', model: 'google/gemini-2.0-flash-001', baseUrl: 'https://openrouter.ai/api/v1', contextLength: 0 } });

  // Home Assistant nicht erreichbar → Timeout-Meldung
  await ed.bringToFront();
  await setSettings(ed, { ha: { url: UNREACHABLE, token: 'x' } });
  await clickText(ed, 'button', /^Load entities$/);
  await sleep(10000);
  ok('HA: nicht erreichbar → Fehlermeldung statt Hänger', /did not respond|timeout/i.test(await text(ed)));
  await setSettings(ed, { ha: { url: '', token: '' } });

  // Trennen / neu verbinden
  await clickText(ed, 'button', /^disconnect$/);
  await sleep(400);
  const disconnected = !/disconnect/.test(await text(ed));
  await clickText(ed, 'button', /^connect$/);
  await sleep(3000);
  ok('Verbindung: trennen & neu verbinden', disconnected && /disconnect/.test(await text(ed)));
}
