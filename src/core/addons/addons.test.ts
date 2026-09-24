import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { isReactive, reactive } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { calc, getPath, render, renderNumber, renderValue } from './template';
import {
  buildContext,
  computeOutputs,
  defaultConfig,
  resolveWidgets,
  resolveYaml,
  testCondition,
  validateManifest,
  withDefaults,
} from './apply';
import { applyAddonYaml } from './yamlMerge';
import { readInstances, stripInstances, writeInstances } from './instances';
import { computeBBox, formatBBoxSWNE, formatBBoxWSEN } from './geo';
import { ADDON_ROOT_KEY } from './types';
import type { AddonInstance, AddonManifest } from './types';
import { useDocumentStore } from '../lvgl/document';
import { nextId } from '../lvgl/catalog';
import type { WidgetNode } from '../lvgl/types';
import { resolveWidgets as resolve } from './apply';

/** Sucht einen Knoten rekursiv über alle Seiten/Verschachtelungsebenen (nur für Tests). */
function findAny(doc: ReturnType<typeof useDocumentStore>, id: string): WidgetNode | undefined {
  const walk = (nodes: WidgetNode[]): WidgetNode | undefined => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = walk(n.children);
      if (found) return found;
    }
    return undefined;
  };
  for (const page of doc.pages) {
    const found = walk(page.children);
    if (found) return found;
  }
  return undefined;
}

/**
 * Die beiden echten Addons werden NICHT mit der Extension ausgeliefert – sie liegen als
 * eigenständige Manifeste neben dem Projekt (`../addonWeather`, `../addonFrigate`).
 * Sind sie vorhanden, werden sie hier mitgeprüft; sonst überspringen wir diese Tests,
 * damit ein Klon ohne die Ordner trotzdem grün ist.
 */
const NEIGHBOUR_DIR = fileURLToPath(new URL('../../../../', import.meta.url));

function loadNeighbourAddon(folder: string): AddonManifest | null {
  const p = join(NEIGHBOUR_DIR, folder, 'addon.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as AddonManifest;
}

const WEATHER = loadNeighbourAddon('addonWeather');
const FRIGATE = loadNeighbourAddon('addonFrigate');

/** Kleines Manifest für die Mechanik-Tests (unabhängig von den echten Addons). */
const DEMO: AddonManifest = {
  id: 'test.demo',
  name: 'Demo',
  version: '1.0.0',
  fields: [
    { key: 'url', kind: 'text', label: 'URL', default: 'http://cam/x.jpg' },
    { key: 'size', kind: 'size', label: 'Größe', default: { width: 200, height: 120 } },
    { key: 'interval', kind: 'number', label: 'Intervall', default: 5 },
    { key: 'caption', kind: 'checkbox', label: 'Beschriftung', default: false },
  ],
  outputs: [{ key: 'captionY', kind: 'calc', expr: '{{ config.size.height }} + 6' }],
  widgets: [
    {
      key: 'cam',
      type: 'image',
      name: 'Bild',
      width: '{{ config.size.width }}',
      height: '{{ config.size.height }}',
      props: {
        img_source: 'online',
        img_url: '{{ config.url }}',
        img_format: 'JPEG',
        img_update_interval: '{{ config.interval }}s',
      },
    },
    {
      key: 'caption',
      type: 'label',
      visibleIf: { key: 'caption', truthy: true },
      y: '{{ out.captionY }}',
      props: { text: 'Kamera' },
    },
  ],
  yaml: 'http_request:\n  timeout: 10s\n',
};

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

describe('template', () => {
  const ctx = { config: { a: 5, name: 'Hof', color: '#ff8800', size: { width: 320, height: 180 } } };

  it('ersetzt Pfade und lässt Unbekanntes leer', () => {
    expect(render('{{ config.name }}/{{ config.size.width }}', ctx)).toBe('Hof/320');
    expect(render('x{{ config.fehlt }}y', ctx)).toBe('xy');
  });

  it('unterstützt Filter', () => {
    expect(render('{{ config.a | fixed:2 }}', ctx)).toBe('5.00');
    expect(render('{{ config.color | nohash }}', ctx)).toBe('ff8800');
    expect(render('{{ config.name | lower | enc }}', ctx)).toBe('hof');
    expect(render('{{ config.fehlt | default:leer }}', ctx)).toBe('leer');
  });

  it('liest verschachtelte Pfade', () => {
    expect(getPath(ctx, 'config.size.height')).toBe(180);
    expect(getPath(ctx, 'config.size.tief.er')).toBeUndefined();
  });

  it('renderValue behält Typen', () => {
    expect(renderValue('{{ config.a }}', ctx)).toBe(5);
    expect(renderValue(7, ctx)).toBe(7);
    expect(renderValue('online', ctx)).toBe('online');
    expect(renderNumber('{{ config.size.width }}', ctx)).toBe(320);
    expect(renderNumber('{{ fehlt }}', ctx, 42)).toBe(42);
  });

  it('wertet bedingte Blöcke aus', () => {
    const c = { config: { an: true, aus: false, leer: '', text: 'x', null0: 0 } };
    expect(render('a{{#if an}}B{{/if}}c', c)).toBe('aBc');
    expect(render('a{{#if aus}}B{{/if}}c', c)).toBe('ac');
    expect(render('{{#if leer}}B{{else}}C{{/if}}', c)).toBe('C');
    expect(render('{{#if null0}}B{{else}}C{{/if}}', c)).toBe('C'); // 0 gilt als falsch
    expect(render('{{#if text}}{{ config.text }}{{/if}}', c)).toBe('x');
    // verschachtelt
    expect(render('{{#if an}}1{{#if aus}}2{{else}}3{{/if}}4{{/if}}', c)).toBe('134');
    // volle Pfade
    expect(render('{{#if settings.p}}J{{else}}N{{/if}}', { settings: { p: 'geo' } })).toBe('J');
    // mehrere Blöcke nacheinander
    expect(render('{{#if an}}A{{/if}}-{{#if aus}}B{{/if}}-{{#if an}}C{{/if}}', c)).toBe('A--C');
  });

  it('rechnet ohne eval', () => {
    expect(calc('{{ config.size.height }} + 6', ctx)).toBe(186);
    expect(calc('2 * (3 + 4)', {})).toBe(14);
    expect(calc('max(2, 9) - min(1, 5)', {})).toBe(8);
    expect(calc('round(10 / 3)', {})).toBe(3);
    // Division durch 0 und Unsinn dürfen nicht werfen/hängen.
    expect(calc('5 / 0', {})).toBe(0);
    expect(calc('§$%', {})).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Geo / bbox
// ---------------------------------------------------------------------------

describe('geo', () => {
  it('bbox folgt dem Seitenverhältnis', () => {
    const b = computeBBox(51, 10, 20, 320, 240);
    // Nord-Süd-Ausdehnung = Ost-West * 0.75 (in km)
    const lonKm = (b.east - b.west) * 111.32 * Math.cos((51 * Math.PI) / 180);
    const latKm = (b.north - b.south) * 111.32;
    expect(lonKm).toBeCloseTo(20, 3);
    expect(latKm).toBeCloseTo(15, 3);
  });

  it('Achsenreihenfolge unterscheidet sich für WMS', () => {
    const b = { west: 1, south: 2, east: 3, north: 4 };
    expect(formatBBoxWSEN(b, 1)).toBe('1.0,2.0,3.0,4.0');
    expect(formatBBoxSWNE(b, 1)).toBe('2.0,1.0,4.0,3.0');
  });
});

// ---------------------------------------------------------------------------
// Outputs / Sichtbarkeit / Widgets
// ---------------------------------------------------------------------------

describe('outputs', () => {
  it('kennt template, calc, switch und bbox – und sieht frühere Werte', () => {
    const out = computeOutputs(
      [
        { key: 'w', kind: 'calc', expr: '{{ config.size.width }} * 2' },
        { key: 'url', kind: 'template', value: 'http://x/{{ out.w }}' },
        { key: 'p', kind: 'switch', on: 'settings.provider', cases: { a: 'A-{{ out.w }}', b: 'B' }, fallback: 'F' },
      ],
      { config: { size: { width: 100 } }, settings: { provider: 'a' } },
    );
    expect(out.w).toBe(200);
    expect(out.url).toBe('http://x/200');
    expect(out.p).toBe('A-200');
  });

  it('switch nutzt fallback', () => {
    const out = computeOutputs(
      [{ key: 'p', kind: 'switch', on: 'settings.provider', cases: { a: 'A' }, fallback: 'F' }],
      { settings: { provider: 'zzz' } },
    );
    expect(out.p).toBe('F');
  });
});

describe('testCondition', () => {
  const ctx = { config: { radar: true, mode: 'x' }, settings: { provider: 'geoapify' } };
  it('ergänzt config. bei Kurzform', () => {
    expect(testCondition({ key: 'radar', truthy: true }, ctx)).toBe(true);
    expect(testCondition({ key: 'radar', truthy: false }, ctx)).toBe(false);
  });
  it('prüft equals/in/not auf vollen Pfaden', () => {
    expect(testCondition({ key: 'settings.provider', equals: 'geoapify' }, ctx)).toBe(true);
    expect(testCondition({ key: 'config.mode', in: ['x', 'y'] }, ctx)).toBe(true);
    expect(testCondition({ key: 'config.mode', not: 'x' }, ctx)).toBe(false);
    expect(testCondition(undefined, ctx)).toBe(true);
  });
});

describe('reaktive Manifeste (aus dem Pinia-Store)', () => {
  // Installierte Addons liegen im Store, ihre Werte sind also reaktive Proxies.
  // `structuredClone` wirft darauf DataCloneError – das ließ „Addon hinzufügen"
  // scheitern, ohne dass sich das Konfig-Popup öffnete.
  it('defaultConfig verkraftet Proxy-Werte', () => {
    const m = reactive(JSON.parse(JSON.stringify(DEMO))) as AddonManifest;
    const cfg = defaultConfig(m.fields);
    expect(cfg.size).toEqual({ width: 200, height: 120 });
    // Das Ergebnis muss ein einfaches Objekt sein (kein Proxy, sonst reicht es das
    // Problem an structuredClone-Aufrufer weiter).
    expect(isReactive(cfg.size)).toBe(false);
  });

  it('kompletter Ablauf „Addon hinzufügen" mit reaktivem Manifest', () => {
    setActivePinia(createPinia());
    const doc = useDocumentStore();
    const m = reactive(JSON.parse(JSON.stringify(WEATHER ?? DEMO))) as AddonManifest;
    // genau die Schritte aus useAddons.addInstance()
    const inst = doc.createAddonInstance(m.id, defaultConfig(m.fields), m.name);
    const ctx = buildContext(m, { iid: inst.iid, config: inst.config }, {});
    const ids = doc.applyAddonWidgets(inst.iid, resolveWidgets(m, ctx));
    doc.setAddonYaml(inst.iid, resolveYaml(m, buildContext(m, { iid: inst.iid, config: inst.config, widgetIds: ids }, {})));
    expect(Object.keys(ids).length).toBeGreaterThan(0);
    expect(doc.screen.children.length).toBeGreaterThan(0);
  });
});

describe('defaultConfig / withDefaults', () => {
  it('füllt Defaults und ergänzt neue Felder nachträglich', () => {
    const cfg = defaultConfig(DEMO.fields);
    expect(cfg.interval).toBe(5);
    expect(cfg.size).toEqual({ width: 200, height: 120 });
    // Gespeicherte (alte) Konfiguration ohne 'interval' bekommt den Default dazu.
    const merged = withDefaults(DEMO.fields, { url: 'http://x' });
    expect(merged.url).toBe('http://x');
    expect(merged.interval).toBe(5);
    // Teilweise gefüllte Objekt-Werte werden aufgefüllt, nicht ersetzt.
    const partial = withDefaults(DEMO.fields, { size: { width: 640 } });
    expect(partial.size).toEqual({ width: 640, height: 120 });
  });
});

describe('resolveWidgets', () => {
  it('setzt Templates in Props und Größe ein', () => {
    const ctx = buildContext(DEMO, { iid: 'a_1', config: { url: 'http://cam/hof.jpg' } }, {});
    // Auch ein einzelnes Widget wird in den Gruppen-Container gehüllt (siehe unten) –
    // resolveWidgets liefert also [root, cam].
    const [root, cam] = resolveWidgets(DEMO, ctx);
    expect(root.key).toBe(ADDON_ROOT_KEY);
    expect(cam.parentKey).toBe(ADDON_ROOT_KEY);
    expect(cam.type).toBe('image');
    expect(cam.width).toBe(200);
    expect(cam.props.img_url).toBe('http://cam/hof.jpg');
    expect(cam.props.img_update_interval).toBe('5s');
    expect(cam.sizeFromConfig).toBe(true);
  });

  it('schaltet Widgets über visibleIf zu', () => {
    const ctx = buildContext(DEMO, { iid: 'a_1', config: { caption: true } }, {});
    const widgets = resolveWidgets(DEMO, ctx);
    expect(widgets.map((w) => w.key)).toEqual([ADDON_ROOT_KEY, 'cam', 'caption']);
    const caption = widgets.find((w) => w.key === 'caption')!;
    expect(caption.parentKey).toBe(ADDON_ROOT_KEY);
    expect(caption.y).toBe(126); // Höhe + 6 aus dem calc-Output, minY der Gruppe ist 0
  });

  it('verschachtelte Widgets bekommen einen parentKey', () => {
    const m: AddonManifest = {
      id: 'test.nested',
      name: 'Nested',
      version: '1.0.0',
      fields: [],
      widgets: [
        { key: 'card', type: 'obj', width: 100, height: 60, children: [{ key: 'lbl', type: 'label', props: { text: 'hi' } }] },
      ],
    };
    const ctx = buildContext(m, { iid: 'a_1', config: {} }, {});
    const list = resolve(m, ctx);
    // 'card' ist das einzige Top-Level-Widget, wird also selbst zum Kind des
    // (unsichtbaren) Gruppen-Containers – 'lbl' bleibt unverändert unter 'card'.
    expect(list.map((w) => [w.key, w.parentKey])).toEqual([
      [ADDON_ROOT_KEY, undefined],
      ['card', ADDON_ROOT_KEY],
      ['lbl', 'card'],
    ]);
  });

  describe('wrapInRoot (Gruppen-Container)', () => {
    const m: AddonManifest = {
      id: 'test.group',
      name: 'Group',
      version: '1.0.0',
      fields: [],
      widgets: [
        { key: 'a', type: 'label', x: 10, y: 20, width: 50, height: 15, props: { text: 'A' } },
        { key: 'b', type: 'label', x: 40, y: 5, width: 30, height: 10, props: { text: 'B' } },
      ],
    };

    it('bbox + relative Positionen sind korrekt', () => {
      const list = resolve(m, buildContext(m, { iid: 'a_1', config: {} }, {}));
      const root = list.find((w) => w.key === ADDON_ROOT_KEY)!;
      const a = list.find((w) => w.key === 'a')!;
      const b = list.find((w) => w.key === 'b')!;
      // bbox: minX=10, minY=5, maxX=max(60,70)=70, maxY=max(35,15)=35
      expect(root.width).toBe(60);
      expect(root.height).toBe(30);
      expect(a.x).toBe(0);
      expect(a.y).toBe(15);
      expect(b.x).toBe(30);
      expect(b.y).toBe(0);
      expect(root.props.bg_opa).toBe(0);
      expect(root.props.scrollable).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Validierung
// ---------------------------------------------------------------------------

describe('validateManifest', () => {
  it('akzeptiert ein vollständiges Manifest', () => {
    expect(validateManifest(DEMO)).toEqual([]);
  });

  it('meldet fehlende Pflichtangaben verständlich', () => {
    const errs = validateManifest({ name: 'X' });
    expect(errs.some((e) => e.includes("'id' is missing"))).toBe(true);
    expect(errs.some((e) => e.includes("'version' is missing"))).toBe(true);
    expect(errs.some((e) => e.includes("'widgets'"))).toBe(true);
  });

  it('erkennt unbekannte Feldtypen, Widget-Typen und doppelte Keys', () => {
    const errs = validateManifest({
      id: 'x.y',
      name: 'X',
      version: '1',
      fields: [
        { key: 'a', kind: 'kaputt', label: 'A' },
        { key: 'a', kind: 'text', label: 'A2' },
      ],
      widgets: [{ key: 'w', type: 'gibtsnicht' }],
    });
    expect(errs.some((e) => e.includes('unknown'))).toBe(true);
    expect(errs.some((e) => e.includes('duplicated'))).toBe(true);
    expect(errs.some((e) => e.includes('unknown widget type'))).toBe(true);
  });

  it('warnt bei yaml-ids ohne addon_-Präfix', () => {
    const errs = validateManifest({
      id: 'x.y',
      name: 'X',
      version: '1',
      fields: [],
      widgets: [{ key: 'w', type: 'label' }],
      yaml: 'sensor:\n  - platform: template\n    id: meins\n',
    });
    expect(errs.every((e) => e.startsWith('ⓘ '))).toBe(true);
  });
});

describe('Beispiel-Manifeste aus docs/examples', () => {
  const dir = fileURLToPath(new URL('../../../docs/examples', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));

  it('es gibt Beispiele', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s ist gültig und lässt sich auflösen', (file) => {
    const manifest = JSON.parse(readFileSync(join(dir, file), 'utf8')) as AddonManifest;
    expect(validateManifest(manifest)).toEqual([]);
    const ctx = buildContext(manifest, { iid: 'a_1', config: {} }, {});
    const widgets = resolveWidgets(manifest, ctx);
    expect(widgets.length).toBeGreaterThan(0);
    // Kein Widget darf mit Größe 0 herauskommen (Tippfehler in Templates).
    for (const w of widgets) {
      expect(w.width ?? 1).toBeGreaterThan(0);
      expect(w.height ?? 1).toBeGreaterThan(0);
    }
  });

  it('die Sensorkarte bindet die Entity und erbt die Einheit aus den Einstellungen', () => {
    const manifest = JSON.parse(
      readFileSync(join(dir, 'ha-sensor-card.json'), 'utf8'),
    ) as AddonManifest;
    const ctx = buildContext(
      manifest,
      { iid: 'a_1', config: { entity: 'sensor.wohnzimmer', einheit: '' } },
      { einheit: '°C' },
    );
    const widgets = resolveWidgets(manifest, ctx);
    const wert = widgets.find((w) => w.key === 'wert')!;
    expect(wert.parentKey).toBe('karte');
    expect(wert.entity).toBe('sensor.wohnzimmer');
    expect(wert.props.text).toBe('-- °C');
  });
});

// ---------------------------------------------------------------------------
// YAML-Fragmente
// ---------------------------------------------------------------------------

describe('applyAddonYaml', () => {
  it('legt fehlende Top-Level-Schlüssel an', () => {
    const out = applyAddonYaml('esphome:\n  name: test\n', ['http_request:\n  timeout: 15s\n']);
    expect(out).toContain('http_request:');
    expect(out).toContain('timeout: 15s');
  });

  it('lässt bestehende Werte des Nutzers gewinnen', () => {
    const base = 'http_request:\n  timeout: 5s\n  useragent: esphome\n';
    const out = applyAddonYaml(base, ['http_request:\n  timeout: 15s\n  verify_ssl: false\n']);
    expect(out).toContain('timeout: 5s');
    expect(out).toContain('verify_ssl: false');
  });

  it('ersetzt eigene Listeneinträge und räumt verwaiste auf', () => {
    const frag = (v: string) =>
      `sensor:\n  - platform: template\n    id: addon_a_1_x\n    name: ${v}\n`;
    const base = 'sensor:\n  - platform: dht\n    id: eigener\n';
    const first = applyAddonYaml(base, [frag('Eins')]);
    expect(first).toContain('id: addon_a_1_x');
    expect(first).toContain('name: Eins');

    const second = applyAddonYaml(first, [frag('Zwei')]);
    expect(second).toContain('name: Zwei');
    expect(second.match(/addon_a_1_x/g)).toHaveLength(1);

    // Addon entfernt → Eintrag verschwindet, der eigene Sensor bleibt.
    const removed = applyAddonYaml(second, []);
    expect(removed).not.toContain('addon_a_1_x');
    expect(removed).toContain('id: eigener');
  });

  it('löscht eine Sektion, die dadurch leer wird', () => {
    const base = 'esphome:\n  name: t\nsensor:\n  - platform: template\n    id: addon_a_1_x\n';
    const out = applyAddonYaml(base, []);
    expect(out).not.toContain('sensor:');
    expect(out).toContain('name: t');
  });

  it('lässt YAML ohne Addons unverändert', () => {
    const base = '# Kommentar\nesphome:\n  name: t\n';
    expect(applyAddonYaml(base, [])).toBe(base);
  });

  it('erhält ESPHome-Tags wie !lambda und !secret', () => {
    // Über einfache JS-Objekte gemergt gingen diese Tags verloren – aus `!lambda` wurde
    // ein harmloser String und das Gerät bekam statt Code eine Zeichenkette.
    const frag =
      'interval:\n  - interval: 3s\n    id: addon_a_1_tick\n    then:\n      - online_image.set_url:\n' +
      '          id: img_2__img\n          url: !lambda |-\n            return std::string("http://x");\n';
    const out = applyAddonYaml('esphome:\n  name: t\n', [frag]);
    expect(out).toContain('url: !lambda');
    expect(out).toContain('return std::string("http://x");');

    const withSecret = applyAddonYaml('esphome:\n  name: t\n', ['wifi:\n  password: !secret wifi_pw\n']);
    expect(withSecret).toContain('!secret wifi_pw');
  });

  it('ignoriert ein syntaktisch kaputtes Fragment', () => {
    const base = 'esphome:\n  name: t\n';
    expect(applyAddonYaml(base, ['sensor:\n  - platform: x\n   bad_indent: 1\n'])).toContain('name: t');
  });

  it('rendert das Fragment eines Manifests', () => {
    const ctx = buildContext(DEMO, { iid: 'a_1', config: {} }, {});
    expect(resolveYaml(DEMO, ctx)).toContain('http_request:');
  });
});

// ---------------------------------------------------------------------------
// Instanz-Persistenz im YAML
// ---------------------------------------------------------------------------

describe('Instanzen im YAML', () => {
  const inst: AddonInstance = {
    iid: 'a_1',
    addon: 'studio.frigate-camera',
    name: 'Hof',
    page: 'main_page',
    config: { camera: 'hof', size: { width: 320, height: 180 } },
    widgetIds: { cam: 'img_1' },
    yaml: 'http_request:\n  timeout: 15s\n',
  };

  it('schreibt und liest verlustfrei', () => {
    const yaml = writeInstances('esphome:\n  name: t\n', [inst]);
    expect(yaml.startsWith('# lvgl-studio-addons')).toBe(true);
    const back = readInstances(yaml);
    expect(back).toHaveLength(1);
    expect(back[0]).toEqual(inst);
    expect(yaml).toContain('esphome:');
  });

  it('ersetzt alte Zeilen statt sie zu verdoppeln', () => {
    const once = writeInstances('esphome:\n  name: t\n', [inst]);
    const twice = writeInstances(once, [{ ...inst, name: 'Neu' }]);
    expect(twice.match(/lvgl-studio-addon:/g)).toHaveLength(1);
    expect(readInstances(twice)[0].name).toBe('Neu');
  });

  it('entfernt die Zeilen wieder, wenn keine Instanz mehr existiert', () => {
    const once = writeInstances('esphome:\n  name: t\n', [inst]);
    expect(writeInstances(once, [])).toBe('esphome:\n  name: t\n');
    expect(stripInstances(once)).toBe('esphome:\n  name: t\n');
  });

  it('überspringt kaputte Zeilen', () => {
    const yaml = '# lvgl-studio-addon: {kaputt\nesphome:\n  name: t\n';
    expect(readInstances(yaml)).toEqual([]);
  });

  it('ignoriert YAML ohne Marker', () => {
    expect(readInstances('esphome:\n  name: t\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Dokument-Anbindung
// ---------------------------------------------------------------------------

describe('document + addons', () => {
  beforeEach(() => setActivePinia(createPinia()));

  function demoWidgets(config: Record<string, unknown>, iid = 'a_1') {
    const ctx = buildContext(DEMO, { iid, config }, {});
    return { widgets: resolveWidgets(DEMO, ctx), yaml: resolveYaml(DEMO, ctx) };
  }

  /** Findet den Gruppen-Container einer Instanz (immer der einzige Top-Level-Knoten). */
  function containerOf(doc: ReturnType<typeof useDocumentStore>, iid: string) {
    const inst = doc.addonInstance(iid)!;
    const id = inst.widgetIds[ADDON_ROOT_KEY];
    return doc.screen.children.find((n) => n.id === id)!;
  }

  it('gruppiert alle Widgets einer Instanz in einem unsichtbaren Container', () => {
    const doc = useDocumentStore();
    const inst = doc.createAddonInstance(DEMO.id, {});
    const { widgets, yaml } = demoWidgets({ caption: true }, inst.iid);
    doc.applyAddonWidgets(inst.iid, widgets, yaml);

    // Genau EIN Top-Level-Knoten auf der Seite: der Container.
    expect(doc.screen.children).toHaveLength(1);
    const container = containerOf(doc, inst.iid);
    expect(container.type).toBe('obj');
    expect(container.props.bg_opa).toBe(0); // unsichtbar
    expect(container.children.map((c) => c.id)).toEqual([
      doc.addons[0].widgetIds.cam,
      doc.addons[0].widgetIds.caption,
    ]);
  });

  it('Container verschieben bewegt die Gruppe – Kinder bleiben relativ, Größe folgt der Konfiguration', () => {
    const doc = useDocumentStore();
    const inst = doc.createAddonInstance(DEMO.id, { url: 'http://cam/hof.jpg' });
    const first = demoWidgets({ url: 'http://cam/hof.jpg', size: { width: 320, height: 180 } });
    doc.applyAddonWidgets(inst.iid, first.widgets, first.yaml);

    const containerId = doc.addons[0].widgetIds[ADDON_ROOT_KEY];
    const camId = doc.addons[0].widgetIds.cam;
    const camBefore = { ...findAny(doc, camId)!.geometry };

    // Nutzer zieht NUR den Container – „alles auf einmal verschieben".
    doc.updateGeometry(containerId, { x: 120, y: 90 });
    // Das Kind selbst bleibt unangetastet (relativ zum Container) – es „bewegt sich" nur
    // visuell mit, weil LVGL-Kindkoordinaten relativ zum Elternteil sind.
    expect(findAny(doc, camId)!.geometry).toEqual(camBefore);

    // … und stellt danach eine andere Größe/Quelle ein.
    const second = demoWidgets({ url: 'http://cam/garten.jpg', size: { width: 240, height: 135 } });
    doc.applyAddonWidgets(inst.iid, second.widgets, second.yaml);

    const container = containerOf(doc, inst.iid);
    expect(container.geometry.x).toBe(120); // Container-Position bleibt beim Nutzer
    expect(container.geometry.width).toBe(240); // Container-Größe folgt der Konfiguration
    expect(findAny(doc, camId)!.props.img_url).toContain('garten');
  });

  it('fügt zugeschaltete Widgets hinzu und entfernt abgeschaltete – der Container bleibt bestehen', () => {
    const doc = useDocumentStore();
    const inst = doc.createAddonInstance(DEMO.id, {});
    const on = demoWidgets({ caption: true });
    doc.applyAddonWidgets(inst.iid, on.widgets, on.yaml);
    const containerId = doc.addons[0].widgetIds[ADDON_ROOT_KEY];
    expect(doc.screen.children).toHaveLength(1);
    expect(containerOf(doc, inst.iid).children).toHaveLength(2);

    const off = demoWidgets({ caption: false });
    doc.applyAddonWidgets(inst.iid, off.widgets, off.yaml);
    // Derselbe Container (nicht neu angelegt) – nur ein Kind entfernt.
    expect(doc.addons[0].widgetIds[ADDON_ROOT_KEY]).toBe(containerId);
    expect(doc.screen.children).toHaveLength(1);
    expect(containerOf(doc, inst.iid).children).toHaveLength(1);
    expect(doc.addons[0].widgetIds.caption).toBeUndefined();
  });

  it('Migration: lose Widgets einer älteren Instanz werden ohne Positionssprung adoptiert', () => {
    const doc = useDocumentStore();
    const inst = doc.createAddonInstance(DEMO.id, { caption: true });
    // Zustand VOR der Gruppierung nachstellen: Widgets liegen direkt auf der Seite,
    // der Nutzer hat 'cam' inzwischen manuell verschoben.
    const camId = nextId('image', doc.allIds);
    doc.screen.children.push({ id: camId, type: 'image', geometry: { x: 77, y: 33, width: 200, height: 120 }, props: {}, children: [] });
    const capId = nextId('label', doc.allIds);
    doc.screen.children.push({ id: capId, type: 'label', geometry: { x: 77, y: 159, width: 200, height: 20 }, props: {}, children: [] });
    inst.widgetIds = { cam: camId, caption: capId };

    const { widgets, yaml } = demoWidgets({ caption: true }, inst.iid);
    doc.applyAddonWidgets(inst.iid, widgets, yaml);

    // Genau ein Top-Level-Knoten übrig (der neue Container), nichts dupliziert.
    expect(doc.screen.children).toHaveLength(1);
    const container = containerOf(doc, inst.iid);
    expect(container.children.map((c) => c.id).sort()).toEqual([camId, capId].sort());
    // Absolute Position unverändert: Container-Position + relative Kindposition.
    const cam = container.children.find((c) => c.id === camId)!;
    expect(container.geometry.x + cam.geometry.x).toBe(77);
    expect(container.geometry.y + cam.geometry.y).toBe(33);
  });

  it('Export enthält online_image, Fragment und Instanz-Kommentar; Import bringt die Instanz zurück', () => {
    const doc = useDocumentStore();
    doc.importYaml('esphome:\n  name: test\n');
    const inst = doc.createAddonInstance(DEMO.id, {});
    const w = demoWidgets({}, inst.iid);
    doc.applyAddonWidgets(inst.iid, w.widgets, w.yaml);

    const yaml = doc.exportedYaml;
    expect(yaml).toContain('online_image:');
    expect(yaml).toContain('http_request:');
    expect(yaml).toContain('lvgl-studio-addon:');
    // Der Format-Fehler „Unknown value 'AUTO'" darf nicht zurückkommen.
    expect(yaml).toContain('format: JPEG');

    const doc2 = useDocumentStore();
    doc2.importYaml(yaml);
    expect(doc2.addons).toHaveLength(1);
    expect(doc2.addons[0].addon).toBe(DEMO.id);
    expect(doc2.addons[0].widgetIds.cam).toBeTruthy();
  });

  it('das YAML-Fragment kennt die erzeugten Widget-ids ({{ widgets.x }})', () => {
    const doc = useDocumentStore();
    const manifest: AddonManifest = {
      ...DEMO,
      id: 'test.widgetids',
      yaml: 'interval:\n  - interval: 5s\n    id: addon_{{ iid }}_tick\n    then:\n      - lvgl.label.update:\n          id: {{ widgets.cam }}\n          text: hi\n',
    };
    const inst = doc.createAddonInstance(manifest.id, {});
    const ctx1 = buildContext(manifest, { iid: inst.iid, config: {} }, {});
    // Stufe 1: Widgets anlegen …
    const ids = doc.applyAddonWidgets(inst.iid, resolveWidgets(manifest, ctx1));
    expect(ids.cam).toBeTruthy();
    // Stufe 2: Fragment mit den ids rendern.
    const ctx2 = buildContext(manifest, { iid: inst.iid, config: {}, widgetIds: ids }, {});
    doc.setAddonYaml(inst.iid, resolveYaml(manifest, ctx2));

    expect(doc.addons[0].yaml).toContain(`id: ${ids.cam}`);
    expect(doc.exportedYaml).toContain(`id: ${ids.cam}`);
  });

  it('entfernt beim Löschen der Instanz auch ihre Widgets und ihr YAML', () => {
    const doc = useDocumentStore();
    doc.importYaml('esphome:\n  name: test\n');
    const inst = doc.createAddonInstance(DEMO.id, {});
    const w = demoWidgets({ caption: true }, inst.iid);
    doc.applyAddonWidgets(inst.iid, w.widgets, w.yaml);
    expect(doc.screen.children).toHaveLength(1); // der Gruppen-Container
    expect(doc.screen.children[0].children).toHaveLength(2); // cam + caption darin

    doc.removeAddonInstance(inst.iid);
    expect(doc.screen.children).toHaveLength(0);
    expect(doc.addons).toHaveLength(0);
    expect(doc.exportedYaml).not.toContain('lvgl-studio-addon:');
  });

  it('Undo stellt Instanzen wieder her', () => {
    const doc = useDocumentStore();
    const inst = doc.createAddonInstance(DEMO.id, {});
    const w = demoWidgets({}, inst.iid);
    doc.applyAddonWidgets(inst.iid, w.widgets, w.yaml);
    doc.removeAddonInstance(inst.iid);
    expect(doc.addons).toHaveLength(0);
    doc.undo();
    expect(doc.addons).toHaveLength(1);
    expect(doc.screen.children).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Die ausgelieferten Addons (liegen neben dem Projekt, nicht in der Extension)
// ---------------------------------------------------------------------------

describe.skipIf(!WEATHER)('addonWeather', () => {
  const M = WEATHER as AddonManifest;
  const cfg = (extra: Record<string, unknown> = {}) => ({
    location: { lat: 48.0474, lon: 11.66, zoom: 10, spanKm: 30 },
    size: { width: 240, height: 240 },
    ...extra,
  });
  const ctxFor = (extra: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) =>
    buildContext(M, { iid: 'a_1', config: cfg(extra), widgetIds: { map: 'img_1', radar: 'img_2', bar: 'bar_1', clock: 'lbl_1' } },
      { provider: 'geoapify', geoapifyKey: 'KEY', ...settings });

  it('ist ein gültiges Manifest', () => {
    expect(validateManifest(M)).toEqual([]);
  });

  it('baut Karten- und Radar-URL passend zum Esp32Weather-Vorbild', () => {
    const widgets = resolveWidgets(M, ctxFor({ radar: true }));
    const map = widgets.find((w) => w.key === 'map')!;
    const radar = widgets.find((w) => w.key === 'radar')!;
    const url = String(map.props.img_url);
    expect(url).toContain('maps.geoapify.com');
    expect(url).toContain('format=png'); // sonst liefert Geoapify JPEG
    expect(url).toContain('area=rect:');
    expect(url).toContain('apiKey=KEY');
    // gültige ESPHome-Werte (kein AUTO, kein RGBA)
    expect(map.props.img_format).toBe('PNG');
    expect(radar.props.img_type).toBe('RGB565');
    expect(radar.props.img_transparency).toBe('alpha_channel');
    expect(String(radar.props.img_url)).toContain('layers=dwd:Niederschlagsradar');
    expect(String(radar.props.img_url)).toContain('crs=EPSG:4326');
  });

  it('Animation aus: Radar pollt selbst, kein Balken, kein interval-Block', () => {
    const ctx = ctxFor({ radar: true, frames: 1, clock: false });
    const widgets = resolveWidgets(M, ctx);
    // Top-Level-Widgets liegen im Gruppen-Container – map/radar liegen darin, in dieser Reihenfolge.
    expect(widgets.filter((w) => w.parentKey).map((w) => w.key)).toEqual(['map', 'radar']);
    expect(widgets.find((w) => w.key === 'radar')!.props.img_update_interval).toMatch(/^\d+s$/);
    const frag = parseYaml(resolveYaml(M, ctx)) as Record<string, unknown>;
    expect(frag.interval).toBeUndefined();
    expect(frag.globals).toBeUndefined();
    expect(frag.time).toBeUndefined();
  });

  it('Animation an: interval + globals, Radar pollt nicht mehr selbst, Balken erscheint', () => {
    const ctx = ctxFor({ radar: true, frames: 6, frameStep: 5, frameSeconds: 3, bar: true, clock: false });
    const widgets = resolveWidgets(M, ctx);
    expect(widgets.filter((w) => w.parentKey).map((w) => w.key)).toEqual(['map', 'radar', 'bar']);
    expect(widgets.find((w) => w.key === 'radar')!.props.img_update_interval).toBe('never');
    expect(widgets.find((w) => w.key === 'bar')!.props.max_value).toBe(5);

    const yaml = resolveYaml(M, ctx);
    const frag = parseYaml(yaml) as Record<string, any>;
    expect(frag.globals[0].id).toBe('addon_a_1_frame');
    expect(frag.time[0].id).toBe('addon_a_1_time'); // die Animation braucht die Uhrzeit
    expect(frag.interval[0].interval).toBe('3s');
    // Die Aktion muss auf die ERZEUGTE online_image-id zeigen (…__img).
    expect(yaml).toContain('id: img_2__img');
    expect(yaml).toContain('&time=');
    expect(yaml).toContain('lvgl.bar.update');
    expect(yaml).toContain('id: bar_1');
  });

  it('Uhr an: sntp mit on_time, das genau das Uhr-Label aktualisiert', () => {
    const ctx = ctxFor({ radar: false, clock: true, clockFormat: '%H:%M', clockPos: 'bottom-right' });
    const widgets = resolveWidgets(M, ctx);
    expect(widgets.filter((w) => w.parentKey).map((w) => w.key)).toEqual(['map', 'clock']);
    const clock = widgets.find((w) => w.key === 'clock')!;
    // unten rechts → x/y aus der Größe abgeleitet, nicht 4/4
    expect(clock.x).toBeGreaterThan(100);
    expect(clock.y).toBeGreaterThan(100);

    const yaml = resolveYaml(M, ctx);
    const frag = parseYaml(yaml) as Record<string, any>;
    expect(frag.time[0].platform).toBe('sntp');
    expect(frag.time[0].timezone).toBe('Europe/Berlin');
    expect(frag.interval).toBeUndefined();
    expect(yaml).toContain('id: lbl_1');
    expect(yaml).toContain('strftime("%H:%M")');
  });

  it('Uhr + Animation gemeinsam ergeben genau EINEN time-Eintrag', () => {
    const yaml = resolveYaml(M, ctxFor({ radar: true, frames: 4, clock: true, bar: true }));
    const frag = parseYaml(yaml) as Record<string, any>;
    expect(frag.time).toHaveLength(1);
    expect(frag.time[0].on_time).toBeTruthy();
    expect(frag.interval).toHaveLength(1);
  });

  it('alles aus: nur das Timeout bleibt übrig', () => {
    const frag = parseYaml(resolveYaml(M, ctxFor({ radar: false, clock: false }))) as Record<string, unknown>;
    expect(Object.keys(frag)).toEqual(['http_request']);
  });
});

describe.skipIf(!FRIGATE)('addonFrigate', () => {
  const M = FRIGATE as AddonManifest;

  it('ist ein gültiges Manifest', () => {
    expect(validateManifest(M)).toEqual([]);
  });

  it('baut die Snapshot-URL inklusive optionaler Overlays', () => {
    const plain = resolveWidgets(
      M,
      buildContext(M, { iid: 'a_1', config: { camera: 'hof', size: { width: 240, height: 135 }, quality: 70 } }, { url: 'http://frigate:5000' }),
    ).find((w) => w.key === 'cam')!;
    expect(plain.props.img_url).toBe('http://frigate:5000/api/hof/latest.jpg?h=135&quality=70');
    expect(plain.props.img_format).toBe('JPEG'); // latest.jpg ist JPEG, nicht AUTO

    const withOverlays = resolveWidgets(
      M,
      buildContext(
        M,
        { iid: 'a_1', config: { camera: 'hof', size: { width: 240, height: 135 }, quality: 50, timestamp: true, bbox: true, motion: false } },
        { url: 'http://frigate:5000' },
      ),
    ).find((w) => w.key === 'cam')!;
    expect(withOverlays.props.img_url).toBe(
      'http://frigate:5000/api/hof/latest.jpg?h=135&quality=50&timestamp=1&bbox=1',
    );
  });

  it('wird wie alle Addons in einen Gruppen-Container gehüllt', () => {
    const widgets = resolveWidgets(
      M,
      buildContext(M, { iid: 'a_1', config: { camera: 'hof', caption: true } }, { url: 'http://frigate:5000' }),
    );
    expect(widgets[0].key).toBe(ADDON_ROOT_KEY);
    expect(widgets.filter((w) => w.parentKey === ADDON_ROOT_KEY).map((w) => w.key)).toEqual(['cam', 'caption']);
  });
});
