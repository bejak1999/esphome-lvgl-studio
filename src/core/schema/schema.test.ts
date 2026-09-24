import { describe, it, expect } from 'vitest';
import { getWidgetFields, getKnownWidgetKeys, getWidgetTypes } from './lvgl';
import { validateYaml, validateWidgetKeys } from './validate';
import { stripMdx } from '../docs/client';

// Synthetisches Schema im Format von schema.esphome.io/<v>/lvgl.json (gekürzt).
const SCHEMA = {
  lvgl: {
    schemas: {
      WIDGET_TYPES: {
        schema: {
          config_vars: {
            button: {
              key: 'Optional',
              type: 'schema',
              schema: {
                config_vars: {
                  id: { key: 'Optional' },
                  x: { key: 'Optional' },
                  y: { key: 'Optional' },
                  width: { key: 'Optional' },
                  height: { key: 'Optional' },
                  checkable: { key: 'Optional' },
                  widgets: { key: 'Optional' },
                },
              },
            },
            slider: {
              key: 'Optional',
              type: 'schema',
              schema: {
                config_vars: {
                  id: { key: 'Optional' },
                  min_value: { key: 'Optional' },
                  max_value: { key: 'Optional' },
                  value: { key: 'Required' },
                },
              },
            },
            label: {
              schema: { config_vars: { id: { key: 'Optional' }, text: { key: 'Optional' } } },
            },
          },
        },
      },
      STYLE_SCHEMA: {
        schema: {
          config_vars: {
            bg_color: { key: 'Optional' },
            radius: { key: 'Optional' },
            border_width: { key: 'Optional' },
            align: { key: 'Optional' },
          },
        },
      },
    },
  },
};

describe('LVGL-Schema-Extraktion', () => {
  it('listet Widget-Typen', () => {
    expect(getWidgetTypes(SCHEMA)).toEqual(expect.arrayContaining(['button', 'slider', 'label']));
  });

  it('merged widget-spezifische + Style-Felder', () => {
    const keys = getKnownWidgetKeys(SCHEMA, 'button')!;
    expect(keys.has('checkable')).toBe(true); // widget-spezifisch
    expect(keys.has('bg_color')).toBe(true); // Style
    expect(keys.has('radius')).toBe(true);
  });

  it('gibt null für unbekannte Widget-Typen', () => {
    expect(getWidgetFields(SCHEMA, 'gibtsnicht')).toBeNull();
  });
});

describe('Schema-Validierung', () => {
  it('meldet unbekannte Keys, erlaubt on_* und universelle Keys', () => {
    const fields = getWidgetFields(SCHEMA, 'button')!;
    const issues = validateWidgetKeys('button', ['bg_color', 'on_press', 'id', 'bg_colr'], fields, 'btn_1');
    expect(issues).toHaveLength(1);
    expect(issues[0].key).toBe('bg_colr');
    expect(issues[0].level).toBe('warning');
  });

  it('meldet fehlende Pflichtfelder', () => {
    const fields = getWidgetFields(SCHEMA, 'slider')!;
    const issues = validateWidgetKeys('slider', ['id', 'min_value'], fields, 'sld_1');
    expect(issues.some((i) => i.key === 'value' && i.level === 'info')).toBe(true);
  });

  it('validiert ganzes YAML und findet den Tippfehler', () => {
    const yaml = `
lvgl:
  pages:
    - id: main
      widgets:
        - button:
            id: btn_1
            bg_colr: 0xFF0000
            on_press:
              - logger.log: hi
        - slider:
            id: sld_1
            min_value: 0
`;
    const issues = validateYaml(yaml, SCHEMA);
    expect(issues.some((i) => i.widgetId === 'btn_1' && i.key === 'bg_colr')).toBe(true);
    expect(issues.some((i) => i.widgetId === 'sld_1' && i.key === 'value')).toBe(true);
  });
});

describe('Docs-Aufbereitung', () => {
  it('entfernt Frontmatter und import-Zeilen', () => {
    const src = `---\ntitle: LVGL\n---\nimport Foo from '../x';\n\n# LVGL\nText hier.`;
    const out = stripMdx(src);
    expect(out.startsWith('# LVGL')).toBe(true);
    expect(out).not.toContain('import Foo');
    expect(out).not.toContain('title: LVGL');
  });
});
