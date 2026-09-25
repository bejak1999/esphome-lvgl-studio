// Host-Berechtigungen im PRODUKTIONS-Build (ohne E2E_HOSTS): nach der Installation hat die
// Extension keinen Zugriff aufs Heimnetz. Geprüft wird:
//   - saubere Anzeige „Zugriff nicht erlaubt" statt Fehler/Hänger (Editor, Sidebar, Bild-URL)
//   - keine Console-Fehler, kein Verbindungsversuch ohne Berechtigung
//   - wo der Browser echte Klicks erlaubt (Firefox ≤ 155 lokal): voller Ablauf Klick →
//     Berechtigung (per Test-Pref ohne Dialog) → Verbindung steht
//
//   npm run build && npm run build:chrome && node tests/e2e/permissions.mjs [chrome|firefox|all]
import fs from 'node:fs';
import { startFakeEsphome } from './fake-esphome.mjs';
import { launch, openPage, clickText, setSettings, sleep, reporter, keyboardFor, viewport } from './lib.mjs';

const which = process.argv[2] ?? 'all';
const browsers = which === 'all' ? ['chrome', 'firefox'] : [which];
const m = JSON.parse(fs.readFileSync('.output/chrome-mv3/manifest.json', 'utf8'));
if (m.host_permissions?.includes('http://127.0.0.1/*')) {
  console.error('Bitte mit Produktions-Build ausführen (ohne E2E_HOSTS).');
  process.exit(2);
}
const fake = await startFakeEsphome(36990);
const all = [];

for (const b of browsers) {
  const { browser, base } = await launch(b);
  const { results, ok } = reporter(b);
  const errors = [];
  try {
    const opt = await openPage(browser, base, 'options.html', errors);
    await setSettings(opt, { esphome: { url: fake.url, token: '' }, language: 'en' });

    const ed = await openPage(browser, base, 'editor.html', errors);
    await viewport(ed, 1440, 900);
    await sleep(2500);
    const text = () => ed.evaluate(() => document.body.innerText);
    ok('ohne Berechtigung: Hinweis statt Verbindung', /Access to 127\.0\.0\.1:\d+ not allowed yet/.test(await text()) && !/disconnect/.test(await text()));
    ok('ohne Berechtigung: kein Verbindungsversuch beim Server', !fake.log.length, fake.log.join(','));

    const sp = await openPage(browser, base, 'sidepanel.html', errors);
    await sleep(2500);
    ok('Sidebar: gleicher Hinweis', /not allowed yet/.test(await sp.evaluate(() => document.body.innerText)));
    await sp.close();

    // Bild-URL eines Geräts im Heimnetz → Hinweis mit „Allow" im Eigenschaften-Panel
    await clickText(ed, 'button', /^Image$/);
    await sleep(300);
    await ed.evaluate(() => {
      const l = [...document.querySelectorAll('aside label')].find((x) => x.textContent.trim() === 'Image source');
      const sel = document.getElementById(l.htmlFor);
      sel.value = 'online';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(300);
    await ed.evaluate(() => {
      const l = [...document.querySelectorAll('aside label')].find((x) => x.textContent.trim().startsWith('Image URL'));
      const i = document.getElementById(l.htmlFor);
      i.value = 'http://10.1.2.3:1984/api/frame.jpeg';
      i.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(600);
    ok('Bild-URL: Hinweis „Zugriff erlauben“', /Access to 10\.1\.2\.3:1984 not allowed yet/.test(await text()));

    // Voller Ablauf nur, wo echte Klicks möglich sind UND der Browser ohne Dialog erteilen kann.
    const kb = await keyboardFor(ed);
    if (b === 'firefox' && kb.native) {
      const btn = await ed.$('xpath/.//button[normalize-space()="connect"]');
      await btn.click();
      const t0 = Date.now();
      while (Date.now() - t0 < 10000 && !/disconnect/.test(await text())) await sleep(300);
      ok('Klick auf „connect“ → Berechtigung erteilt → verbunden', /disconnect/.test(await text()));
      ok('Berechtigung gilt nur für diesen Host', await ed.evaluate(async () => {
        const has = (o) => browser.permissions.contains({ origins: [o] });
        return (await has('http://127.0.0.1/*')) && !(await has('http://10.1.2.3/*'));
      }));
      // Weg 2: Einstellungen speichern erteilt den Zugriff für alle eingetragenen Geräte
      await setSettings(opt, { esphome: { url: fake.url.replace('127.0.0.1', 'localhost'), token: '' } });
      await opt.reload().catch(() => {});
      await sleep(1200);
      const save = await opt.$('xpath/.//button[normalize-space()="Save"]');
      await save.click();
      await sleep(1500);
      ok('Einstellungen speichern → Zugriff für den neuen Host erteilt', await opt.evaluate(() => browser.permissions.contains({ origins: ['http://localhost/*', 'ws://localhost/*'] })));
      const ed2 = await openPage(browser, base, 'editor.html', errors);
      await sleep(3000);
      ok('danach verbindet ein neu geöffneter Editor ohne weitere Nachfrage', /disconnect/.test(await ed2.evaluate(() => document.body.innerText)));
    } else {
      console.log(`SKIP  ${b}: Berechtigungsdialog nicht automatisierbar – bitte einmal manuell prüfen`);
    }
    const unexpected = [...new Set(errors)].filter((e) => !/Failed to load resource/i.test(e));
    ok('keine Console-Fehler', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  } catch (e) {
    console.error(e.stack);
    ok('Testlauf ohne Absturz', false, e.message);
  } finally {
    await browser.close();
  }
  all.push(...results);
}
await fake.close();
const failed = all.filter((r) => !r.pass);
console.log(`\n${all.length - failed.length}/${all.length} bestanden`);
process.exit(failed.length ? 1 : 0);
