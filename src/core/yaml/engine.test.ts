import { describe, it, expect } from 'vitest';
import { yamlToScreen, screenToYaml, yamlToScreens, screensToYaml } from './engine';
import { CATALOG, createWidget } from '../lvgl/catalog';
import type { WidgetNode } from '../lvgl/types';

/** Findet ein Widget im Modell per id (Tiefensuche). */
function find(nodes: WidgetNode[], id: string): WidgetNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const f = find(n.children, id);
    if (f) return f;
  }
  return undefined;
}

const CONFIG_WITH_AUTOMATION = `# Mein Schlafzimmer-Panel
esphome:
  name: bedroom-panel

lvgl:
  pages:
    - id: main_page
      widgets:
        - button:
            id: light_btn
            x: 20
            y: 20
            width: 120
            height: 44
            bg_color: 0x2563EB
            widgets:
              - label:
                  id: light_btn__lbl
                  text: "Licht"
            on_press:
              - homeassistant.service:
                  service: light.toggle
                  data:
                    entity_id: light.schlafzimmer
        - slider:
            id: dim_slider
            x: 20
            y: 100
            width: 200
            height: 18
            min_value: 0
            max_value: 100
            value: 50
            on_value:
              - lambda: |-
                  ESP_LOGD("lvgl", "value: %d", (int) x);
`;

describe('YAML round-trip (strukturerhaltend)', () => {
  it('importiert Buttons inkl. verschachteltem Label-Text', () => {
    const { screen } = yamlToScreen(CONFIG_WITH_AUTOMATION);
    const btn = find(screen.children, 'light_btn')!;
    expect(btn).toBeDefined();
    expect(btn.type).toBe('button');
    expect(btn.props.text).toBe('Licht');
    expect(btn.props.bg_color).toBe('#2563EB');
    // Das Label darf NICHT als eigenes Kind auftauchen (Text ist ins Button-Prop gehoben).
    expect(btn.children.length).toBe(0);
  });

  it('erhält on_press-Automation & entity_id, wenn nur die Farbe geändert wird', () => {
    const { screen, yaml } = yamlToScreen(CONFIG_WITH_AUTOMATION);
    const btn = find(screen.children, 'light_btn')!;
    btn.props.bg_color = '#FF0000'; // Editor ändert nur das Aussehen

    const out = screenToYaml(screen, yaml);

    expect(out).toContain('light.toggle');
    expect(out).toContain('entity_id: light.schlafzimmer');
    expect(out).toContain('on_press:');
    // Neue Farbe ist drin …
    expect(out.toLowerCase()).toContain('0xff0000');
    // … die alte weg.
    expect(out).not.toContain('0x2563EB');
  });

  it('erhält on_value-Lambda beim Verschieben eines Sliders', () => {
    const { screen, yaml } = yamlToScreen(CONFIG_WITH_AUTOMATION);
    const sld = find(screen.children, 'dim_slider')!;
    sld.geometry.x = 40;
    sld.props.value = 75;

    const out = screenToYaml(screen, yaml);
    expect(out).toContain('on_value:');
    expect(out).toContain('ESP_LOGD');
    expect(out).toContain('value: 75');
    expect(out).toContain('x: 40');
  });

  it('erhält den einleitenden Kommentar und fremde Komponenten', () => {
    const { screen, yaml } = yamlToScreen(CONFIG_WITH_AUTOMATION);
    const out = screenToYaml(screen, yaml);
    expect(out).toContain('# Mein Schlafzimmer-Panel');
    expect(out).toContain('esphome:');
    expect(out).toContain('name: bedroom-panel');
  });

  it('entfernt ein im Editor gelöschtes Widget, lässt den Rest unberührt', () => {
    const { screen, yaml } = yamlToScreen(CONFIG_WITH_AUTOMATION);
    screen.children = screen.children.filter((n) => n.id !== 'dim_slider');
    const out = screenToYaml(screen, yaml);
    expect(out).not.toContain('dim_slider');
    expect(out).toContain('light_btn'); // Button bleibt
    expect(out).toContain('light.schlafzimmer');
  });

  it('übernimmt die Bildschirmgröße aus der display-Dimensions', () => {
    const yaml = `
display:
  - platform: ili9xxx
    model: ili9341
    dimensions: 320x240
lvgl:
  pages:
    - id: main
      widgets: []
`;
    const { screen } = yamlToScreen(yaml);
    expect(screen.width).toBe(320);
    expect(screen.height).toBe(240);
  });

  it('berücksichtigt rotation mit Grad-Symbol (90° → Breite/Höhe getauscht)', () => {
    const yaml = `
display:
  - platform: ili9xxx
    dimensions: 320x480
    rotation: 90°
lvgl:
  pages:
    - id: main
      widgets: []
`;
    const { screen } = yamlToScreen(yaml);
    expect(screen.width).toBe(480);
    expect(screen.height).toBe(320);
  });

  it('akzeptiert rotation auch als reine Zahl', () => {
    const { screen } = yamlToScreen(`
display:
  - platform: ili9xxx
    dimensions: 320x240
    rotation: 270
lvgl:
  pages:
    - id: main
      widgets: []
`);
    expect(screen.width).toBe(240);
    expect(screen.height).toBe(320);
  });

  it('berücksichtigt rotation auf der lvgl-Komponente (nicht nur display)', () => {
    const { screen } = yamlToScreen(`
display:
  - platform: ili9xxx
    dimensions: 320x480
lvgl:
  rotation: 90
  pages:
    - id: main
      widgets: []
`);
    expect(screen.width).toBe(480);
    expect(screen.height).toBe(320);
  });

  it('liest die Auflösung aus dem model-Namen (TTGO TDisplay 135x240)', () => {
    const { screen } = yamlToScreen(`
display:
  - platform: st7789v
    model: TTGO TDisplay 135x240
    rotation: 0
lvgl:
  pages:
    - id: main
      widgets: []
`);
    expect(screen.width).toBe(135);
    expect(screen.height).toBe(240);
  });

  it('kennt Displaymodelle ohne Auflösung im Namen (Guition JC1060P470 → 1024×600)', () => {
    const { screen } = yamlToScreen(`
display:
  - platform: mipi_dsi
    model: JC1060P470
lvgl:
  pages:
    - id: main
      widgets:
        - obj:
            width: 100%
            height: 40
`);
    expect(screen.width).toBe(1024);
    expect(screen.height).toBe(600);
  });

  it('Modelltabelle respektiert rotation (ili9341, 90° → 320×240)', () => {
    const { screen } = yamlToScreen(`
display:
  - platform: ili9xxx
    model: ILI9341
    rotation: 90
lvgl:
  pages:
    - id: main
      widgets: []
`);
    expect(screen.width).toBe(320);
    expect(screen.height).toBe(240);
  });

  it('leitet die Größe aus der Widget-Ausdehnung ab, wenn kein display definiert ist', () => {
    const yaml = `
lvgl:
  pages:
    - id: main
      widgets:
        - button:
            id: b1
            x: 20
            y: 20
            width: 380
            height: 260
`;
    const { screen } = yamlToScreen(yaml);
    expect(screen.width).toBe(400); // 20+380, auf 10 gerundet
    expect(screen.height).toBe(280); // 20+260
  });

  it('wandelt bg_opa COVER in eine Zahl um und exportiert kein NaN%', () => {
    const { screen, yaml } = yamlToScreen(`
lvgl:
  pages:
    - id: main
      widgets:
        - obj:
            id: o1
            x: 0
            y: 0
            width: 100
            height: 100
            bg_opa: COVER
`);
    expect(screen.children[0].props.bg_opa).toBe(100);
    const out = screenToYaml(screen, yaml);
    expect(out).not.toContain('NaN');
    expect(out).toContain('bg_opa: 100%');
  });

  it('liest align ins Modell (fürs Rendering) und erhält es im YAML', () => {
    const { screen, yaml } = yamlToScreen(`
lvgl:
  pages:
    - id: main
      widgets:
        - button:
            id: b1
            align: top_mid
            y: 20
            width: 120
            height: 44
`);
    expect(screen.children[0].props.align).toBe('top_mid');
    const out = screenToYaml(screen, yaml);
    expect(out).toContain('align: top_mid');
  });

  it('löst styles-Referenzen auf (Farbe/Radius aus style_definitions)', () => {
    const { screen } = yamlToScreen(`
lvgl:
  style_definitions:
    - id: style_btn
      bg_color: 0xFF1493
      radius: 12
  pages:
    - id: main
      widgets:
        - button:
            id: b1
            styles: style_btn
            width: 120
            height: 44
`);
    expect(screen.children[0].props.bg_color).toBe('#FF1493');
    expect(screen.children[0].props.radius).toBe(12);
  });

  it('inline-Wert überschreibt den Style-Wert', () => {
    const { screen } = yamlToScreen(`
lvgl:
  style_definitions:
    - id: s
      bg_color: 0x000000
  pages:
    - id: main
      widgets:
        - button:
            id: b1
            styles: s
            bg_color: 0xFF0000
            width: 100
            height: 40
`);
    expect(screen.children[0].props.bg_color).toBe('#FF0000');
  });

  it('parst layout (flex) eines Containers ins Modell', () => {
    const { screen } = yamlToScreen(`
lvgl:
  pages:
    - id: main
      widgets:
        - obj:
            id: nav
            width: 135
            height: 40
            layout:
              type: flex
              flex_flow: row
              flex_align_main: space_evenly
            widgets:
              - button: { id: b1, width: 34, height: 34 }
              - button: { id: b2, width: 34, height: 34 }
`);
    const nav = screen.children[0];
    expect((nav.props.layout as Record<string, unknown>).type).toBe('flex');
    expect((nav.props.layout as Record<string, unknown>).flex_align_main).toBe('space_evenly');
    expect(nav.children).toHaveLength(2);
  });

  it('Button: on_press-Toggle ohne Status-Sensor; Entity per Roundtrip aus on_press', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'btn_1', type: 'button', geometry: { x: 10, y: 10, width: 120, height: 44 },
      props: { text: 'Licht' }, entity: 'light.schreibtisch', children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('action: homeassistant.toggle');
    expect(out).toContain('entity_id: light.schreibtisch');
    expect(out).not.toContain('binary_sensor'); // Buttons spiegeln keinen Status
    // Roundtrip: Entity aus dem on_press zurücklesen
    expect(find(yamlToScreen(out).screen.children, 'btn_1')?.entity).toBe('light.schreibtisch');
  });

  it('Toggle-Button: checkable + eigenes checked-Aussehen + Status-Spiegelung', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'btn_1', type: 'button', geometry: { x: 0, y: 0, width: 100, height: 40 },
      props: { text: 'Licht', bg_color: '#2563eb', checkable: true, checked_bg_color: '#6b7280', checked_bg_opa: 60 },
      entity: 'light.a', children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('checkable: true');
    expect(out).toMatch(/checked:[\s\S]*bg_color: 0x6b7280[\s\S]*bg_opa: 60%/);
    expect(out).toContain('binary_sensor'); // im Toggle-Modus spiegelt der Button den Status
    const back = find(yamlToScreen(out).screen.children, 'btn_1')!;
    expect(back.props.checkable).toBe(true);
    expect(back.props.checked_bg_opa).toBe(60);
  });

  it('Button ohne Toggle-Modus spiegelt keinen Status (nur on_press)', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'btn_2', type: 'button', geometry: { x: 0, y: 0, width: 100, height: 40 },
      props: { text: 'X' }, entity: 'light.a', children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('homeassistant.toggle');
    expect(out).not.toContain('binary_sensor');
  });

  it('LED schaltet schlicht an/aus (lv_led_on/off), nicht über Helligkeit', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'led_1', type: 'led', geometry: { x: 0, y: 0, width: 28, height: 28 },
      props: { color: '#fbbf24' }, entity: 'light.decke', children: [],
    });
    const out = screenToYaml(screen, '');
    // Schlicht an/aus über die eindeutigen LVGL-Aufrufe – `lvgl.led.update: brightness`
    // hat sich am Gerät als unzuverlässig erwiesen (Prozent-/Rohwert-Semantik).
    expect(out).toContain('id: led_1__state');
    expect(out).toContain('entity_id: light.decke');
    expect(out).toContain('lv_led_on(id(led_1))');
    expect(out).toContain('lv_led_off(id(led_1))');
    expect(out).not.toContain('lvgl.led.update');
    expect(out).not.toContain('brightness:');
  });

  it('schreibt eine veraltete Bindung neu, behält aber fremde Schlüssel', () => {
    // Bestehende `__state`-Sensoren wurden früher nur in der entity_id aktualisiert –
    // die erzeugte Aktion blieb für immer stehen, Korrekturen erreichten nur neue Widgets.
    const base = [
      'binary_sensor:',
      '  - platform: homeassistant',
      '    id: led_1__state',
      '    entity_id: light.schreibtischlampe',
      '    name: Nicht anfassen',
      '    on_state:',
      '      - lvgl.led.update:',
      '          id: led_1',
      "          brightness: !lambda 'return x ? 100 : 0;'",
      '',
    ].join('\n');
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'led_1', type: 'led', geometry: { x: 0, y: 0, width: 28, height: 28 },
      props: { color: '#fbbf24' }, entity: 'light.schreibtischlampe', children: [],
    });
    const out = screenToYaml(screen, base);
    expect(out).not.toContain('lvgl.led.update'); // alte Aktion ersetzt
    expect(out).toContain('lv_led_on(id(led_1))');
    expect(out).toContain('name: Nicht anfassen'); // fremder Schlüssel bleibt
  });

  it('Switch-Status ist idempotent und räumt beim Entkoppeln auf', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'sw_1', type: 'switch', geometry: { x: 0, y: 0, width: 52, height: 28 },
      props: {}, entity: 'light.a', children: [],
    });
    const y1 = screenToYaml(screen, '');
    const r1 = yamlToScreen(y1);
    const y2 = screenToYaml(r1.screen, r1.yaml);
    expect((y2.match(/id: sw_1__state/g) ?? []).length).toBe(1); // kein Duplikat

    const r2 = yamlToScreen(y2);
    find(r2.screen.children, 'sw_1')!.entity = undefined;
    const y3 = screenToYaml(r2.screen, y2);
    expect(y3).not.toContain('binary_sensor');
  });

  it('numerisches Widget (arc) bindet an einen sensor mit value (nicht checked)', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'arc_1', type: 'arc', geometry: { x: 0, y: 0, width: 120, height: 120 },
      props: { value: 0, min_value: 0, max_value: 100 }, entity: 'sensor.fan_speed', children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('sensor:');
    expect(out).toContain('id: arc_1__state');
    expect(out).toContain('on_value:');
    expect(out).toContain("value: !lambda 'return (int) x;'");
    expect(out).not.toContain('binary_sensor'); // arc ist numerisch, nicht schaltbar
    // Roundtrip erhält die Entity aus dem sensor.
    expect(find(yamlToScreen(out).screen.children, 'arc_1')?.entity).toBe('sensor.fan_speed');
  });

  it('ergänzt attribute für numerische Bindung an Fan/Cover/Light', () => {
    const mk = (entity: string) => {
      const { screen } = yamlToScreen('');
      screen.children.push({
        id: 'arc_1', type: 'arc', geometry: { x: 0, y: 0, width: 100, height: 100 },
        props: { value: 0, min_value: 0, max_value: 100 }, entity, children: [],
      });
      return screenToYaml(screen, '');
    };
    expect(mk('fan.umwaelzluefter')).toContain('attribute: percentage');
    expect(mk('cover.rollo')).toContain('attribute: current_position');
    expect(mk('light.decke')).toContain('attribute: brightness');
    expect(mk('sensor.temperatur')).not.toContain('attribute:'); // State ist schon numerisch
  });

  it('setzt text_font auf ein Button-Label mit MDI-Icon (sonst □ am Gerät)', () => {
    const cloud = String.fromCodePoint(0xf0590);
    const base = `
font:
  - file: "materialdesignicons-webfont.ttf"
    id: mdi_icons
lvgl:
  pages:
    - id: main_page
      widgets:
        - button:
            id: btn_1
            widgets:
              - label:
                  id: btn_1__lbl
                  text: "${cloud}"
`;
    const { screen } = yamlToScreen(base);
    const out = screenToYaml(screen, base);
    // Es MUSS eine MDI-Font gesetzt sein (sonst □) – in der Größe, die der Editor zeigt.
    expect(out).toMatch(/text_font: (mdi_icons|studio_mdi_\d+)/);
    expect(out).toContain('glyphs:');
    expect(out).toContain(cloud); // Glyph ist registriert
  });

  it('Verlauf: ohne Richtung wird die Verlaufsfarbe entfernt (sonst bleibt sie ewig hängen)', () => {
    const base = `
lvgl:
  pages:
    - id: main_page
      widgets:
        - obj:
            id: obj_1
            x: 0
            y: 0
            width: 135
            height: 240
            bg_color: 0x0b1220
            bg_grad_color: 0x13ec1e
            bg_grad_dir: VER
`;
    const { screen } = yamlToScreen(base);
    expect(screen.children[0].props.bg_grad_color).toBe('#13EC1E');
    // Nutzer wählt „Kein Verlauf" → beide Keys müssen verschwinden.
    screen.children[0].props.bg_grad_dir = '';
    const out = screenToYaml(screen, base);
    expect(out).not.toContain('bg_grad_color');
    expect(out).not.toContain('bg_grad_dir');
    expect(out).toContain('bg_color: 0xb1220'); // Grundfarbe bleibt
  });

  it('Verlauf: eine Verlaufsfarbe ohne Richtung landet nicht im YAML', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'obj_1', type: 'obj', geometry: { x: 0, y: 0, width: 100, height: 50 },
      props: { bg_color: '#0b1220', bg_grad_color: '#13ec1e' }, children: [],
    });
    const out = screenToYaml(screen, base);
    expect(out).not.toContain('bg_grad_color');
  });

  it('Scrollbalken: Container mit Kindern scrollen nicht (Gerät zeigte sonst Balken)', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'card', type: 'obj', geometry: { x: 0, y: 0, width: 135, height: 240 },
      props: { bg_color: '#0b1220' },
      children: [
        { id: 'lbl_1', type: 'label', geometry: { x: 5, y: 5, width: 50, height: 12 }, props: { text: 'Hi' }, children: [] },
      ],
    });
    const out = screenToYaml(screen, base);
    // In Anführungszeichen: YAML 1.1 (ESPHome) läse blankes OFF als Boolean False.
    expect(out).toContain('scrollbar_mode: "OFF"');
    expect(out).toContain('scrollable: false');
    // Das Kind selbst hat keine Kinder → keine Scroll-Keys. Die Seite auch nicht:
    // dort sind nur Style-Properties erlaubt, scrollbar_mode ist eine Widget-Option.
    expect(out.match(/scrollbar_mode/g)).toHaveLength(1);

    // Round-Trip: die Keys bleiben stabil und verdoppeln sich nicht.
    const again = screenToYaml(yamlToScreen(out).screen, out);
    expect(again.match(/scrollbar_mode/g)).toHaveLength(1);
    expect(again.match(/scrollable: false/g)).toHaveLength(1);
  });

  it('Padding: Seite und Container werden auf pad_all 0 genagelt (LVGL misst ab Content-Area)', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'card', type: 'obj', geometry: { x: 0, y: 0, width: 135, height: 240 },
      props: { bg_color: '#0b1220' },
      children: [
        { id: 'lbl_1', type: 'label', geometry: { x: 7, y: 7, width: 50, height: 12 }, props: { text: 'Hi' }, children: [] },
      ],
    });
    const out = screenToYaml(screen, base);
    // Seite + Container, aber nicht das Label ohne Kinder.
    expect(out.match(/pad_all: 0/g)).toHaveLength(2);

    // Ausdrücklicher Innenabstand bleibt erhalten.
    screen.children[0].props.pad_all = 6;
    const padded = screenToYaml(screen, base);
    expect(padded).toContain('pad_all: 6');
    expect(padded.match(/pad_all: 0/g)).toHaveLength(1); // nur noch die Seite
  });

  it('quotiert Text-Props, die YAML 1.1 als Boolean lesen würde', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'card', type: 'obj', geometry: { x: 0, y: 0, width: 100, height: 50 },
      props: { scrollbar_mode: 'ON' },
      children: [
        { id: 'l', type: 'label', geometry: { x: 0, y: 0, width: 20, height: 10 }, props: { text: 'x' }, children: [] },
      ],
    });
    const out = screenToYaml(screen, base);
    expect(out).toContain('scrollbar_mode: "ON"');
    expect(yamlToScreen(out).screen.children[0].props.scrollbar_mode).toBe('ON');
  });

  it('Scrollbalken: eine ausdrückliche Vorgabe wird respektiert', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'card', type: 'obj', geometry: { x: 0, y: 0, width: 135, height: 240 },
      props: { bg_color: '#0b1220', scrollbar_mode: 'AUTO', scrollable: true },
      children: [
        { id: 'lbl_1', type: 'label', geometry: { x: 5, y: 5, width: 50, height: 12 }, props: { text: 'Hi' }, children: [] },
      ],
    });
    const out = screenToYaml(screen, base);
    expect(out).toContain('scrollbar_mode: AUTO');
    expect(out).not.toContain('scrollable:'); // true = LVGL-Default → Key weglassen
  });

  it('studio_font wird NICHT gelöscht, solange ein Widget es referenziert', () => {
    // Reproduziert den Compile-Fehler „Couldn't find ID 'studio_font_18'":
    // Label hat bereits text_font gesetzt → wurde beim Aufräumen fälschlich entfernt.
    const base = `
font:
  - file: "gfonts://Roboto"
    id: studio_font_18
    size: 18
lvgl:
  pages:
    - id: main_page
      widgets:
        - label:
            id: lbl_6
            x: 0
            y: 0
            width: 40
            height: 20
            text: Label
            text_font: studio_font_18
`;
    const { pages } = yamlToScreens(base);
    const out = screensToYaml(pages, base);
    expect(out).toContain('text_font: studio_font_18');
    expect(out).toContain('id: studio_font_18'); // Definition muss erhalten bleiben

    // Auch über mehrere Runden stabil.
    const again = screensToYaml(yamlToScreens(out).pages, out);
    expect(again).toContain('id: studio_font_18');
  });

  it('fehlende studio_font-Definition wird wieder angelegt (selbstheilend)', () => {
    const base = `
lvgl:
  pages:
    - id: main_page
      widgets:
        - label:
            id: lbl_6
            x: 0
            y: 0
            width: 40
            height: 20
            text: Label
            text_font: studio_font_18
`;
    const { pages } = yamlToScreens(base);
    const out = screensToYaml(pages, base);
    expect(out).toContain('id: studio_font_18');
    expect(out).toContain('size: 18');
  });

  it('Meter erzeugt scales+indicators (sonst zeichnet LVGL nur einen leeren Kreis)', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { pages } = yamlToScreens(base);
    pages[0].children.push({
      id: 'meter_1', type: 'meter', geometry: { x: 8, y: 48, width: 120, height: 120 },
      props: { value: 45, min_value: 0, max_value: 100, color: '#f59e0b' }, children: [],
    });
    const out = screensToYaml(pages, base);
    expect(out).toContain('scales:');
    expect(out).toContain('range_from: 0');
    expect(out).toContain('range_to: 100');
    // indicators MUSS in der Skala liegen (nicht auf Meter-Ebene).
    expect(out).toMatch(/scales:[\s\S]*indicators:[\s\S]*arc:/);
    // Bahn + Wert, beide mit runden Enden wie in der Vorschau.
    expect(out).toContain('id: meter_1__track');
    expect(out).toContain('id: meter_1__value');
    expect(out.match(/rounded: true/g)).toHaveLength(2);
    expect(out).toContain('end_value: 45');
    // Kein gefüllter Hintergrundkreis („weiße Scheibe" auf dem Gerät).
    expect(out).toContain('bg_opa: 0%');

    const back = yamlToScreens(out).pages[0].children[0];
    expect(back.props.min_value).toBe(0);
    expect(back.props.max_value).toBe(100);
    expect(back.props.value).toBe(45);
    expect(back.props.color).toBe('#F59E0B'); // Wert-Bogen
    expect(back.props.bg_color).toBe('#374151'); // Bahn
  });

  it('Mehrere Seiten: importiert alle pages und schreibt sie erhaltend zurück', () => {
    const base = `
lvgl:
  pages:
    - id: main_page
      bg_color: 0x111827
      widgets:
        - label:
            id: lbl_a
            x: 5
            y: 5
            width: 60
            height: 12
            text: Start
    - id: page_2
      bg_color: 0x222222
      widgets:
        - label:
            id: lbl_b
            x: 5
            y: 5
            width: 60
            height: 12
            text: Zweite
`;
    const { pages } = yamlToScreens(base);
    expect(pages).toHaveLength(2);
    expect(pages[0].id).toBe('main_page');
    expect(pages[1].id).toBe('page_2');
    expect(pages[1].children[0].props.text).toBe('Zweite');
    expect(pages[1].bg_color).toBe('#222222');

    // Änderung auf Seite 2 landet auch auf Seite 2.
    pages[1].children[0].props.text = 'Geändert';
    const out = screensToYaml(pages, base);
    expect(out).toContain('id: main_page');
    expect(out).toContain('id: page_2');
    expect(out).toContain('Geändert');
    expect(out).toContain('Start'); // Seite 1 unangetastet

    const again = yamlToScreens(out).pages;
    expect(again).toHaveLength(2);
    expect(again[1].children[0].props.text).toBe('Geändert');
    expect(again[0].children[0].props.text).toBe('Start');
  });

  it('einseitige lvgl.widgets-Form wird bei einer zweiten Seite migriert (nicht dupliziert)', () => {
    // ESPHome erlaubt NICHT `lvgl.widgets` und `lvgl.pages` gleichzeitig – und ohne
    // Migration wären die vorhandenen Widgets aus der Seitenstruktur verschwunden.
    const base = `
lvgl:
  widgets:
    - label:
        id: lbl_1
        x: 0
        y: 0
        width: 40
        height: 12
        text: A
`;
    const { pages } = yamlToScreens(base);
    expect(pages[0].children).toHaveLength(1);
    pages.push({ id: 'page_2', name: 'S2', width: pages[0].width, height: pages[0].height, bg_color: '#000000', children: [] });
    const out = screensToYaml(pages, base);
    expect(out).toMatch(/^ {2}pages:/m);
    expect(out).not.toMatch(/^ {2}widgets:/m); // keine parallele Alt-Form mehr
    expect(out).toContain('text: A'); // ursprüngliches Widget erhalten
    const back = yamlToScreens(out).pages;
    expect(back).toHaveLength(2);
    expect(back[0].children[0].props.text).toBe('A');
  });

  it('Arc: adjustable + Knob-Radius landen im YAML und kommen zurück', () => {
    // Ohne `adjustable` zeichnet LVGL gar keinen Griff – dann wären knob_*-Styles tot.
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { pages } = yamlToScreens(base);
    pages[0].children.push({
      id: 'arc_1', type: 'arc', geometry: { x: 0, y: 0, width: 120, height: 120 },
      props: { value: 50, min_value: 0, max_value: 100, adjustable: true, knob_radius: 0, knob_bg_color: '#ffffff' },
      children: [],
    });
    const out = screensToYaml(pages, base);
    expect(out).toContain('adjustable: true');
    expect(out).toMatch(/knob:[\s\S]*radius: 0/);

    const back = yamlToScreens(out).pages[0].children[0];
    expect(back.props.adjustable).toBe(true);
    expect(back.props.knob_radius).toBe(0);
    expect(back.props.knob_bg_color).toBe('#FFFFFF');
  });

  it('Label mit HA-Entity wird exportiert und überlebt den Round-Trip', () => {
    // Vorher: Für Labels wurde KEIN Sensor erzeugt – die Bindung war beim nächsten
    // Import spurlos verschwunden (obwohl die Vorschau Live-Werte zeigte).
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { pages } = yamlToScreens(base);
    pages[0].children.push({
      id: 'lbl_fan', type: 'label', geometry: { x: 0, y: 0, width: 60, height: 12 },
      props: { text: '0', decimals: 0 }, entity: 'fan.umwaelzluefter', children: [],
    });
    const out = screensToYaml(pages, base);
    expect(out).toContain('id: lbl_fan__state');
    expect(out).toContain('entity_id: fan.umwaelzluefter');
    expect(out).toContain('attribute: percentage'); // fan → percentage
    expect(out).toContain('lvgl.label.update');
    expect(out).toContain('%.0f'); // decimals: 0

    const back = yamlToScreens(out).pages[0].children[0];
    expect(back.entity).toBe('fan.umwaelzluefter');

    // Erneuter Export darf den Sensor nicht verdoppeln.
    const out2 = screensToYaml(yamlToScreens(out).pages, out);
    expect((out2.match(/lbl_fan__state/g) ?? []).length).toBe((out.match(/lbl_fan__state/g) ?? []).length);
  });

  it('relative Größen (100%, SIZE_CONTENT) überleben den Round-Trip', () => {
    // Die KI schreibt gern `width: 100%`. Früher wurde daraus die Katalog-Default-Breite
    // (180) – die responsive Angabe war dauerhaft zerstört.
    const base = `
display:
  - platform: st7789v
    id: d
lvgl:
  pages:
    - id: main_page
      widgets:
        - obj:
            id: navbar
            x: 0
            y: 0
            width: 100%
            height: SIZE_CONTENT
`;
    const { pages } = yamlToScreens(base);
    const nav = pages[0].children[0];
    // Im Editor als echte Pixel sichtbar (nicht der 180er-Default).
    expect(nav.geometry.width).toBe(pages[0].width);
    const out = screensToYaml(pages, base);
    expect(out).toContain('width: 100%');
    expect(out).toContain('height: SIZE_CONTENT');

    // Nach echtem Ändern im Editor wird eine feste Zahl geschrieben.
    const p2 = yamlToScreens(out).pages;
    p2[0].children[0].geometry.width = 200;
    const out2 = screensToYaml(p2, out);
    expect(out2).toContain('width: 200');
    expect(out2).toContain('height: SIZE_CONTENT'); // unangetastet
  });

  it('Export ist idempotent (Export→Import→Export ändert nichts mehr)', () => {
    const base = `
lvgl:
  pages:
    - id: main_page
      widgets:
        - obj:
            id: o1
            x: 0
            y: 0
            width: 100
            height: 100
            widgets:
              - label:
                  id: l1
                  x: 2
                  y: 2
                  width: 40
                  height: 12
                  text: Hi
        - meter:
            id: m1
            x: 0
            y: 0
            width: 80
            height: 80
`;
    const o1 = screensToYaml(yamlToScreens(base).pages, base);
    const o2 = screensToYaml(yamlToScreens(o1).pages, o1);
    const o3 = screensToYaml(yamlToScreens(o2).pages, o2);
    expect(o3).toBe(o2); // stabil, kein „Wachsen" bei jedem Speichern
  });

  it('Neue Seite im Modell wird als weitere page angelegt', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { pages } = yamlToScreens(base);
    pages.push({
      id: 'page_2', name: 'Seite 2', width: pages[0].width, height: pages[0].height, bg_color: '#000000',
      children: [{ id: 'lbl_x', type: 'label', geometry: { x: 0, y: 0, width: 40, height: 12 }, props: { text: 'Neu' }, children: [] }],
    });
    const out = screensToYaml(pages, base);
    expect(out).toContain('id: page_2');
    expect(out).toContain('Neu');
    expect(yamlToScreens(out).pages).toHaveLength(2);
  });

  it('Seiten-Aktion: page_action erzeugt on_press lvgl.page.* und liest es zurück', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n    - id: page_2\n      widgets: []\n';
    const { pages } = yamlToScreens(base);
    pages[0].children.push({
      id: 'btn_next', type: 'button', geometry: { x: 0, y: 0, width: 60, height: 24 },
      props: { text: 'Weiter', page_action: 'next' }, children: [],
    });
    pages[1].children.push({
      id: 'btn_home', type: 'button', geometry: { x: 0, y: 0, width: 60, height: 24 },
      props: { text: 'Start', page_action: 'show:main_page' }, children: [],
    });
    const out = screensToYaml(pages, base);
    expect(out).toContain('lvgl.page.next');
    expect(out).toContain('lvgl.page.show: main_page');

    const back = yamlToScreens(out).pages;
    expect(back[0].children[0].props.page_action).toBe('next');
    expect(back[1].children[0].props.page_action).toBe('show:main_page');

    // Aktion entfernen → unser on_press verschwindet wieder.
    back[0].children[0].props.page_action = '';
    const cleared = screensToYaml(back, out);
    expect(cleared).not.toContain('lvgl.page.next');
    expect(cleared).toContain('lvgl.page.show: main_page'); // die andere bleibt
  });

  it('Widget-IDs bleiben über Seiten hinweg eindeutig', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets:\n        - label: { x: 0, y: 0, width: 10, height: 10, text: A }\n    - id: page_2\n      widgets:\n        - label: { x: 0, y: 0, width: 10, height: 10, text: B }\n';
    const { pages } = yamlToScreens(base);
    const ids = [...pages[0].children, ...pages[1].children].map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length); // keine Doppelung
  });

  it('Bildquelle online_image: erzeugt Top-Level-Komponente + src und liest sie zurück', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'img_1', type: 'image', geometry: { x: 0, y: 0, width: 100, height: 80 },
      props: { img_source: 'online', img_url: 'http://cam/frame.jpeg', img_format: 'JPEG', img_type: 'RGB565', img_update_interval: '4s' },
      children: [],
    });
    const out = screenToYaml(screen, base);
    expect(out).toContain('online_image:');
    expect(out).toContain('url: "http://cam/frame.jpeg"');
    expect(out).toContain('id: img_1__img');
    expect(out).toContain('format: JPEG');
    expect(out).toContain('update_interval: 4s');
    expect(out).toContain('src: img_1__img');

    const back = yamlToScreen(out).screen.children[0];
    expect(back.props.img_source).toBe('online');
    expect(back.props.img_url).toBe('http://cam/frame.jpeg');
    expect(back.props.img_update_interval).toBe('4s');

    // Quelle entfernen → online_image + src verschwinden wieder.
    const s2 = yamlToScreen(out).screen;
    s2.children[0].props.img_source = '';
    const cleared = screenToYaml(s2, out);
    expect(cleared).not.toContain('online_image:');
    expect(cleared).not.toContain('src: img_1__img');
  });

  it('online_image ergänzt http_request und normalisiert das Intervall (4 → 4s)', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'cam', type: 'image', geometry: { x: 0, y: 0, width: 110, height: 64 },
      props: { img_source: 'online', img_url: 'http://cam/frame.jpeg', img_format: 'JPEG', img_type: 'RGB565', img_update_interval: '4' },
      children: [],
    });
    const out = screenToYaml(screen, base);
    expect(out).toContain('http_request:'); // sonst „requires component http_request"
    expect(out).toContain('update_interval: 4s'); // Einheit ergänzt
  });

  it('online_image: buffer_size wird nur geschrieben, wenn explizit gesetzt', () => {
    // Der Download-Puffer wird als C++-Member VOR setup() angelegt (siehe
    // docs/ADDONS.md) – auf PSRAM-losen Boards kann ESPHomes Default (64 KB) je Bild den
    // Speicher für den Display-Puffer knapp machen. Ohne Angabe darf sich am YAML nichts
    // ändern (ESPHomes eigener Default gilt), explizit gesetzt muss der Wert ankommen.
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'cam', type: 'image', geometry: { x: 0, y: 0, width: 100, height: 80 },
      props: { img_source: 'online', img_url: 'http://x/a.png', img_format: 'PNG', img_type: 'RGB565' },
      children: [],
    });
    const withoutIt = screenToYaml(screen, base);
    expect(withoutIt).not.toContain('buffer_size');

    const s2 = yamlToScreen(withoutIt).screen;
    s2.children[0].props.img_buffer_size = 16384;
    const withIt = screenToYaml(s2, withoutIt);
    expect(withIt).toContain('buffer_size: 16384');
    expect(yamlToScreen(withIt).screen.children[0].props.img_buffer_size).toBe(16384);

    // Wieder entfernen (leer/0/negativ) → verschwindet komplett aus dem YAML.
    const s3 = yamlToScreen(withIt).screen;
    s3.children[0].props.img_buffer_size = 0;
    expect(screenToYaml(s3, withIt)).not.toContain('buffer_size');
  });

  it('online_image: format ist nie AUTO, sondern wird aus der URL abgeleitet', () => {
    // ESPHome kennt bei online_image nur BMP/JPEG/JPG/PNG; ein früher erzeugtes
    // `format: AUTO` ließ die Kompilierung mit „Unknown value 'AUTO'" scheitern.
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const img = (id: string, url: string, format?: string) => ({
      id, type: 'image' as const, geometry: { x: 0, y: 0, width: 100, height: 80 },
      props: { img_source: 'online', img_url: url, img_format: format, img_type: 'RGB565' },
      children: [],
    });
    const { screen } = yamlToScreen(base);
    screen.children.push(img('a', 'http://frigate/api/hof/latest.jpg?h=180', 'AUTO'));
    screen.children.push(img('b', 'https://maps.geoapify.com/v1/staticmap?format=png&width=1', 'AUTO'));
    screen.children.push(img('c', 'https://x/radar?format=image/png', undefined));
    const out = screenToYaml(screen, base);
    expect(out).not.toContain('AUTO');
    expect(out).toContain('format: JPEG'); // .jpg im Pfad
    expect(out.match(/format: PNG/g)).toHaveLength(2);
  });

  it('online_image: RGBA wird zu RGB565 + transparency (ESPHome kennt RGBA nicht mehr)', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'radar', type: 'image', geometry: { x: 0, y: 0, width: 100, height: 80 },
      props: { img_source: 'online', img_url: 'https://x/radar.png', img_format: 'PNG', img_type: 'RGBA' },
      children: [],
    });
    const out = screenToYaml(screen, base);
    expect(out).not.toContain('RGBA');
    expect(out).toContain('type: RGB565');
    expect(out).toContain('transparency: alpha_channel');
    // und der Wert überlebt den Reimport
    expect(yamlToScreen(out).screen.children[0].props.img_transparency).toBe('alpha_channel');
  });

  it('online_image: transparency wird gesetzt und wieder entfernt', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'ov', type: 'image', geometry: { x: 0, y: 0, width: 100, height: 80 },
      props: { img_source: 'online', img_url: 'https://x/o.png', img_format: 'PNG', img_type: 'RGB565', img_transparency: 'alpha_channel' },
      children: [],
    });
    const out = screenToYaml(screen, base);
    expect(out).toContain('transparency: alpha_channel');
    const s2 = yamlToScreen(out).screen;
    s2.children[0].props.img_transparency = '';
    expect(screenToYaml(s2, out)).not.toContain('transparency:');
  });

  it('Bildquelle file: erzeugt image-Komponente mit file + transparency', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push({
      id: 'img_2', type: 'image', geometry: { x: 0, y: 0, width: 64, height: 64 },
      props: { img_source: 'file', img_file: 'mdi:weather-night', img_type: 'RGB565', img_transparency: 'alpha_channel' },
      children: [],
    });
    const out = screenToYaml(screen, base);
    expect(out).toMatch(/image:[\s\S]*file: "mdi:weather-night"/);
    expect(out).toContain('transparency: alpha_channel');
    expect(out).toContain('src: img_2__img');
    const back = yamlToScreen(out).screen.children[0];
    expect(back.props.img_source).toBe('file');
    expect(back.props.img_file).toBe('mdi:weather-night');
  });

  it('Bildquelle ref: verweist auf ein fremdes Bild, ohne etwas zu generieren', () => {
    const base = `
image:
  - file: "logo.png"
    id: my_logo
    type: RGB565
lvgl:
  pages:
    - id: main_page
      widgets:
        - image:
            id: img_3
            x: 0
            y: 0
            width: 50
            height: 50
            src: my_logo
`;
    const { screen } = yamlToScreen(base);
    const node = screen.children[0];
    expect(node.props.img_source).toBe('ref');
    expect(node.props.img_ref).toBe('my_logo');
    const out = screenToYaml(screen, base);
    expect(out).toContain('src: my_logo');
    expect(out).toContain('id: my_logo'); // fremdes Bild bleibt erhalten
    expect(out).not.toContain('__img');
  });

  it('Icon-Größe: Icons behalten ihre MDI-Font-Größe über den Round-Trip', () => {
    const bulb = String.fromCodePoint(0xf0335);
    const base = `
font:
  - file: "gfonts://Roboto"
    id: font_title
    size: 9
  - file: "https://github.com/Templarian/MaterialDesign-Webfont/raw/master/fonts/materialdesignicons-webfont.ttf"
    id: mdi_icons
    size: 22
    bpp: 4
    glyphs: ["${bulb}"]
lvgl:
  pages:
    - id: main_page
      widgets:
        - label:
            id: ico_1
            text: "${bulb}"
            text_font: mdi_icons
`;
    const { screen } = yamlToScreen(base);
    // Import übernimmt die Icon-Größe aus der Font-Ressource.
    expect(screen.children[0].props.font_size).toBe(22);
    const out = screenToYaml(screen, base);
    expect(out).toContain('text_font: mdi_icons'); // unverändert – keine neue Font nötig
    expect(out).not.toContain('studio_mdi_');
  });

  it('Icon-Größe: eine Textfont an einem Icon-Label wird auf eine MDI-Font korrigiert', () => {
    const bulb = String.fromCodePoint(0xf0335);
    const lamp = String.fromCodePoint(0xf06b5);
    // So sah es nach dem KI-Umbau aus: das neue Icon zeigt auf die 9px-Textfont.
    const base = `
font:
  - file: "gfonts://Roboto"
    id: font_title
    size: 9
  - file: "https://github.com/Templarian/MaterialDesign-Webfont/raw/master/fonts/materialdesignicons-webfont.ttf"
    id: mdi_icons
    size: 22
    bpp: 4
    glyphs: ["${bulb}"]
lvgl:
  pages:
    - id: main_page
      widgets:
        - label:
            id: ico_1
            text: "${bulb}"
            text_font: mdi_icons
        - label:
            id: ico_2
            text: "${lamp}"
            text_font: font_title
`;
    const { screen } = yamlToScreen(base);
    const out = screenToYaml(screen, base);
    // Das falsch verfonte Icon bekommt eine MDI-Font in SEINER Größe (9px) – NICHT
    // irgendeine vorhandene. Sonst stünde auf dem Gerät 22px statt der gezeigten 9px.
    expect(out).toMatch(/id: ico_2[\s\S]*text_font: studio_mdi_9/);
    expect(out).toMatch(/id: studio_mdi_9[\s\S]*glyphs:/);
    expect(out).toContain(lamp); // neuer Glyph ist registriert
    // Das unveränderte Icon (bereits MDI, passende Größe) bleibt unberührt.
    expect(out).toMatch(/id: ico_1[\s\S]*text_font: mdi_icons/);
  });

  it('Icon-Größe: geänderte font_size erzeugt eine passende MDI-Font', () => {
    const bulb = String.fromCodePoint(0xf0335);
    const base = `
font:
  - file: "https://github.com/Templarian/MaterialDesign-Webfont/raw/master/fonts/materialdesignicons-webfont.ttf"
    id: mdi_icons
    size: 22
    bpp: 4
    glyphs: ["${bulb}"]
lvgl:
  pages:
    - id: main_page
      widgets:
        - label:
            id: ico_1
            text: "${bulb}"
            text_font: mdi_icons
`;
    const { screen } = yamlToScreen(base);
    screen.children[0].props.font_size = 32;
    const out = screenToYaml(screen, base);
    expect(out).toContain('id: studio_mdi_32');
    expect(out).toContain('text_font: studio_mdi_32');
    expect(out).toContain('bpp: 4');
    // Zurück auf 22 → die erzeugte Font verschwindet wieder.
    const back = yamlToScreen(out).screen;
    expect(back.children[0].props.font_size).toBe(32);
    back.children[0].props.font_size = 22;
    expect(screenToYaml(back, out)).not.toContain('studio_mdi_32');
  });

  it('lokale Entity: Klick schaltet die Komponente, deren Trigger spiegeln zurück', () => {
    const base = 'switch:\n  - platform: gpio\n    id: relay1\n    pin: GPIO12\n'
      + 'sensor:\n  - platform: dht\n    id: temp1\n    pin: GPIO4\n'
      + 'lvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push(
      { id: 'btn_1', type: 'button', geometry: { x: 0, y: 0, width: 100, height: 40 }, props: { text: 'R' }, entity: 'relay1', children: [] },
      { id: 'led_1', type: 'led', geometry: { x: 0, y: 50, width: 28, height: 28 }, props: { color: '#fbbf24' }, entity: 'relay1', children: [] },
      { id: 'arc_1', type: 'arc', geometry: { x: 0, y: 90, width: 100, height: 100 }, props: { value: 0, min_value: 0, max_value: 100 }, entity: 'temp1', children: [] },
    );
    const out = screenToYaml(screen, base);
    expect(out).toContain('switch.toggle: relay1'); // Klick schaltet lokal
    expect(out).toMatch(/on_turn_on:[\s\S]*lvgl\.led\.update[\s\S]*brightness: 100/);
    expect(out).toMatch(/on_value:[\s\S]*lvgl\.arc\.update/);
    expect(out).not.toContain('homeassistant'); // rein lokal, keine HA-Bindung
    // Button ohne Toggle-Modus spiegelt keinen checked-Zustand
    expect(out).not.toContain('id: btn_1\n          state');
    const back = yamlToScreen(out).screen;
    expect(find(back.children, 'btn_1')?.entity).toBe('relay1');
    expect(find(back.children, 'arc_1')?.entity).toBe('temp1');
  });

  it('lokale Entity (ohne Punkt) erzeugt keine HA-Bindung', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'btn_1', type: 'button', geometry: { x: 0, y: 0, width: 120, height: 44 },
      props: { text: 'X' }, entity: 'relay1', children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).not.toContain('binary_sensor');
    expect(out).not.toContain('homeassistant');
  });

  it('mappt Arc-Farben auf arc_color / indicator.arc_color und liest sie zurück', () => {
    const base = `
lvgl:
  pages:
    - id: main_page
      widgets:
        - arc:
            id: arc_1
            min_value: 0
            max_value: 50
            value: 25
            bg_color: 0x1c1c24
            indicator:
              bg_color: 0xf5a623
`;
    // Import: Track aus bg_color, Wert aus indicator.bg_color (Fallback auf Alt-Keys).
    const { screen } = yamlToScreen(base);
    const arc = find(screen.children, 'arc_1')!;
    expect(arc.props.bg_color).toBe('#1C1C24');
    expect(arc.props.color).toBe('#F5A623');
    // Export: schreibt die RICHTIGEN LVGL-Keys, damit das Gerät die Farben zeigt.
    const out = screenToYaml(screen, base);
    expect(out).toContain('arc_color: 0x1c1c24');
    expect(out).toContain('arc_color: 0xf5a623');
  });

  it('ergänzt benutzte MDI-Icon-Glyphen automatisch in die Font-glyphs', () => {
    const thermo = String.fromCodePoint(0xf050f);
    const cloud = String.fromCodePoint(0xf0590);
    const base = `
font:
  - file: "fonts/materialdesignicons-webfont.ttf"
    id: mdi_icons
    glyphs: [ "${thermo}" ]
lvgl:
  pages:
    - id: main_page
      widgets:
        - label:
            id: lbl_1
            text: "${cloud}"
            text_font: mdi_icons
`;
    const { screen } = yamlToScreen(base);
    const out = screenToYaml(screen, base);
    expect(out).toContain(cloud); // Wolke landet in glyphs
    expect(out).toContain(thermo); // Thermometer bleibt erhalten
  });

  it('exportiert & liest universelle Style-Props (opacity, shadow, outline, hidden, padding)', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'obj_1', type: 'obj', geometry: { x: 0, y: 0, width: 100, height: 100 },
      props: {
        opa: 80, hidden: true, pad_all: 6,
        shadow_color: '#000000', shadow_width: 12, shadow_opa: 50, shadow_offset_x: 2, shadow_offset_y: 3,
        outline_color: '#ff0000', outline_width: 2, outline_opa: 100, outline_pad: 4,
      },
      children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('opa: 80%');
    expect(out).toContain('hidden: true');
    expect(out).toContain('shadow_width: 12');
    expect(out).toContain('shadow_opa: 50%');
    expect(out).toContain('outline_width: 2');
    expect(out).toContain('pad_all: 6');

    const back = find(yamlToScreen(out).screen.children, 'obj_1')!;
    expect(back.props.opa).toBe(80);
    expect(back.props.hidden).toBe(true);
    expect(back.props.shadow_width).toBe(12);
    expect(back.props.outline_color).toBe('#FF0000');
    expect(back.props.pad_all).toBe(6);
  });

  it('mappt Slider-Parts (indicator/knob) + Füllfarbe und liest sie zurück', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'sld_1', type: 'slider', geometry: { x: 0, y: 0, width: 200, height: 20 },
      props: { value: 50, min_value: 0, max_value: 100, bg_color: '#374151', color: '#f59e0b', knob_bg_color: '#ffffff', knob_radius: 8 },
      children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('indicator:');
    expect(out).toContain('bg_color: 0xf59e0b'); // Füllfarbe im indicator
    expect(out).toContain('knob:');
    const back = find(yamlToScreen(out).screen.children, 'sld_1')!;
    expect(back.props.color).toBe('#F59E0B');
    expect(back.props.knob_bg_color).toBe('#FFFFFF');
    expect(back.props.knob_radius).toBe(8);
  });

  it('überträgt ALLE unterstützten Style-Props ins YAML', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'o', type: 'obj', geometry: { x: 0, y: 0, width: 200, height: 100 },
      props: {
        bg_opa: 90, border_width: 2, border_color: '#334155', border_opa: 80, radius: 12,
        opa: 95, hidden: true, pad_all: 6, bg_grad_color: '#0b1220', bg_grad_dir: 'VER',
        shadow_color: '#000000', shadow_width: 9, shadow_opa: 100, shadow_spread: 7, shadow_offset_x: 1, shadow_offset_y: 2,
        outline_color: '#ff0000', outline_width: 2, outline_opa: 70, outline_pad: 4,
      }, children: [],
    });
    const out = screenToYaml(screen, '');
    for (const k of ['bg_opa: 90%', 'border_opa: 80%', 'opa: 95%', 'hidden: true', 'pad_all: 6',
      'bg_grad_color', 'bg_grad_dir: VER', 'shadow_width: 9', 'shadow_spread: 7', 'shadow_offset_x: 1',
      'outline_width: 2', 'outline_pad: 4']) {
      expect(out).toContain(k);
    }
  });

  it('Grid-Layout: Templates am Container + Zellen am Kind (roundtrip)', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'grid_1', type: 'obj', geometry: { x: 0, y: 0, width: 200, height: 120 },
      props: { layout: { type: 'grid', grid_columns: 'FR(1), FR(1)', grid_rows: 'FR(1), 40px', pad_row: 8, pad_column: 8 } },
      children: [{
        id: 'c1', type: 'label', geometry: { x: 0, y: 0, width: 60, height: 20 },
        props: { text: 'A', grid_cell_column_pos: 0, grid_cell_row_pos: 0, grid_cell_column_span: 2 }, children: [],
      }],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('type: grid');
    expect(out).toMatch(/grid_columns:[\s\S]*- FR\(1\)/);
    expect(out).toContain('grid_cell_column_span: 2');
    const back = yamlToScreen(out).screen;
    const g = find(back.children, 'grid_1')!;
    expect((g.props.layout as Record<string, unknown>).grid_columns).toBe('FR(1), FR(1)');
    expect(g.children[0].props.grid_cell_column_span).toBe(2);
  });

  it('Knob stylebar; die Füllung kommt schlicht aus `color`', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'sld', type: 'slider', geometry: { x: 0, y: 0, width: 150, height: 18 },
      props: { value: 50, min_value: 0, max_value: 100, color: '#f59e0b', knob_radius: 6, knob_pad_all: 2 },
      children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toMatch(/knob:[\s\S]*radius: 6/);
    // Die Füllung ist die normale Farbe – kein zweiter Regler dafür.
    expect(out).toMatch(/indicator:[\s\S]*bg_color: 0xf59e0b/);
    const back = find(yamlToScreen(out).screen.children, 'sld')!;
    expect(back.props.knob_radius).toBe(6);
    expect(back.props.color).toBe('#F59E0B');
    expect(back.props.indicator_bg_color).toBeUndefined(); // kein Duplikat
  });

  it('Switch/Checkbox: Anfangszustand über `state: { checked: … }` (nicht checked: true)', () => {
    // `checked:` ist auf Widget-Ebene ein STYLE-Block → `checked: true` bricht den Build
    // mit „expected a dictionary".
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'sw', type: 'switch', geometry: { x: 0, y: 0, width: 52, height: 28 },
      props: { checked: true, color: '#22c55e' }, children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toMatch(/state:\s*\n\s+checked: true/);
    // Genau einmal – nämlich im state-Block, nie direkt am Widget.
    expect((out.match(/checked: true/g) ?? []).length).toBe(1);
    expect(find(yamlToScreen(out).screen.children, 'sw')!.props.checked).toBe(true);

    // Zurückschalten entfernt den Zustand wieder.
    const s2 = yamlToScreen(out).screen;
    find(s2.children, 'sw')!.props.checked = false;
    expect(screenToYaml(s2, out)).not.toContain('checked: true');
  });

  it('AUDIT: jedes Widget überträgt seine Einstellungen ins YAML und zurück', () => {
    const children = CATALOG.map((e, i) => createWidget(e.type, 0, i * 30, `${e.prefix}_a`));
    const out = screenToYaml(
      { id: 's', name: 'S', width: 480, height: 320, bg_color: '#111827', children },
      '',
    );
    const back = yamlToScreen(out).screen;
    const lost: string[] = [];
    for (const n of children) {
      const b = find(back.children, n.id);
      if (!b) { lost.push(`${n.type}: komplett`); continue; }
      for (const [k, v] of Object.entries(n.props)) {
        if (v == null || v === '') continue;
        if (b.props[k] === undefined) lost.push(`${n.type}.${k}`);
      }
    }
    expect(lost).toEqual([]); // keine Einstellung darf verloren gehen
    // Stichproben auf die korrekten LVGL-Keys:
    expect(out).toContain('line_color:'); // Line-Farbe (nicht "color")
    expect(out).toContain('brightness: 100'); // LED (ESPHome-Bereich ist 0..100)
    expect(out).toMatch(/spinner:[\s\S]*indicator:[\s\S]*arc_color/); // Spinner-Farbe via indicator
    expect(out).toContain('light_color:'); // QR
  });

  it('bildet font_size auf text_font ab (Wiederverwendung + Auto-Generierung) und zurück', () => {
    const base = 'font:\n  - file: "gfonts://Roboto"\n    id: font_value\n    size: 24\nlvgl:\n  pages:\n    - id: main_page\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    screen.children.push(
      { id: 'l24', type: 'label', geometry: { x: 0, y: 0, width: 80, height: 20 }, props: { text: 'A', font_size: 24 }, children: [] },
      { id: 'l18', type: 'label', geometry: { x: 0, y: 30, width: 80, height: 20 }, props: { text: 'B', font_size: 18 }, children: [] },
    );
    const out = screenToYaml(screen, base);
    expect(out).toContain('text_font: font_value'); // 24 → vorhandener Font
    expect(out).toContain('id: studio_font_18'); // 18 → auto-generiert
    expect(out).toContain('text_font: studio_font_18');
    const back = yamlToScreen(out).screen;
    expect(find(back.children, 'l18')?.props.font_size).toBe(18);
  });

  it('legt den Verlauf auf den Indicator (grad_part) und liest ihn zurück', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'sld', type: 'slider', geometry: { x: 0, y: 0, width: 100, height: 18 },
      props: { value: 50, min_value: 0, max_value: 100, bg_color: '#374151', color: '#f59e0b', bg_grad_color: '#23f01e', bg_grad_dir: 'VER', grad_part: 'indicator' },
      children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toMatch(/indicator:[\s\S]*bg_grad_color/); // Verlauf im Indicator
    expect(find(yamlToScreen(out).screen.children, 'sld')?.props.grad_part).toBe('indicator');
  });

  it('defaultet Schatten-/Kontur-Farbe bei gesetzter Breite, aber nie die Verlaufsrichtung', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'o', type: 'obj', geometry: { x: 0, y: 0, width: 100, height: 50 },
      props: { bg_grad_color: '#00ff00', shadow_width: 8, outline_width: 2 }, children: [],
    });
    const out = screenToYaml(screen, '');
    // Richtung ist der Schalter – ohne sie darf kein Verlauf entstehen.
    expect(out).not.toContain('bg_grad_dir');
    expect(out).not.toContain('bg_grad_color');
    expect(out).toContain('shadow_color: 0x0'); // Default schwarz
    expect(out).toContain('outline_color: 0x0');
  });

  it('überträgt Button-Text-Style aufs verschachtelte Label (roundtrip)', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'b', type: 'button', geometry: { x: 0, y: 0, width: 120, height: 40 },
      props: { text: 'Hi', text_align: 'CENTER', text_decor: 'UNDERLINE' }, children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('text_align: CENTER');
    expect(out).toContain('text_decor: UNDERLINE');
    expect(find(yamlToScreen(out).screen.children, 'b')?.props.text_align).toBe('CENTER');
  });

  it('skaliert Licht-brightness (0..255) auf den Widget-Maximalwert', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'sld', type: 'slider', geometry: { x: 0, y: 0, width: 200, height: 20 },
      props: { value: 0, min_value: 0, max_value: 100 }, entity: 'light.decke', children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('attribute: brightness');
    expect(out).toContain('x * 100 / 255.0');
  });

  it('mappt Text-Style, Gradient, Ausrichtung und Layout (roundtrip)', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'lbl_1', type: 'label', geometry: { x: 0, y: 0, width: 200, height: 30 },
      props: { text: 'Hi', text_align: 'CENTER', text_decor: 'UNDERLINE', text_letter_spacing: 2 }, children: [],
    });
    screen.children.push({
      id: 'obj_1', type: 'obj', geometry: { x: 0, y: 40, width: 200, height: 100 },
      props: { bg_color: '#1f2937', bg_grad_color: '#0b1220', bg_grad_dir: 'VER', align: 'top_mid',
        layout: { type: 'flex', flex_flow: 'row', pad_column: 8, pad_row: 4 } },
      children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('text_align: CENTER');
    expect(out).toContain('text_decor: UNDERLINE');
    expect(out).toContain('bg_grad_dir: VER');
    expect(out).toContain('align: top_mid');
    expect(out).toContain('flex_flow: row');
    expect(out).toContain('pad_column: 8');
    const back = yamlToScreen(out).screen;
    expect(find(back.children, 'lbl_1')?.props.text_align).toBe('CENTER');
    const layout = find(back.children, 'obj_1')?.props.layout as Record<string, unknown>;
    expect(layout.type).toBe('flex');
    expect(Number(layout.pad_column)).toBe(8);
  });

  it('liest & schreibt die Seiten-Hintergrundfarbe (page bg_color)', () => {
    const base = 'lvgl:\n  pages:\n    - id: main_page\n      bg_color: 0xff0000\n      widgets: []\n';
    const { screen } = yamlToScreen(base);
    expect(screen.bg_color).toBe('#FF0000');
    screen.bg_color = '#00FF00';
    const back = yamlToScreen(screenToYaml(screen, base));
    expect(back.screen.bg_color).toBe('#00FF00');
  });

  it('generiert valides lvgl-YAML aus einem frischen Modell (ohne baseYaml)', () => {
    const { screen } = yamlToScreen('');
    screen.children.push({
      id: 'btn_1',
      type: 'button',
      geometry: { x: 10, y: 10, width: 100, height: 40 },
      props: { text: 'Hallo', bg_color: '#2563EB' },
      children: [],
    });
    const out = screenToYaml(screen, '');
    expect(out).toContain('lvgl:');
    expect(out).toContain('button:');
    expect(out).toContain('id: btn_1');
    expect(out).toContain('text: Hallo');
  });
});
