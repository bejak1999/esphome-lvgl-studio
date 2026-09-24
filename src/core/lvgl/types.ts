/**
 * LVGL-Widget-Datenmodell (framework-neutral).
 *
 * Der Editor arbeitet auf diesem Baum; in M2 wird er verlustfrei auf ESPHome-`lvgl:`-YAML
 * abgebildet (jede `id` wird zum stabilen YAML-Anker, damit Bindings/Automationen überleben).
 */

export type WidgetType =
  | 'obj'
  | 'button'
  | 'label'
  | 'icon'
  | 'image'
  | 'slider'
  | 'arc'
  | 'bar'
  | 'switch'
  | 'checkbox'
  | 'led'
  | 'dropdown'
  | 'textarea'
  | 'spinner'
  | 'line'
  | 'meter'
  | 'qrcode';

export type WidgetCategory = 'Container' | 'Display' | 'Input';

/** Frei positionierbare Geometrie in Pixeln (relativ zum Elternelement bzw. Screen). */
export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Style-/Inhalts-Eigenschaften eines Widgets. Bewusst locker typisiert, weil je nach
 * Widget unterschiedliche Keys relevant sind. Farb-Strings sind Hex (`#RRGGBB`).
 */
export interface WidgetProps {
  // Gemeinsamer Style
  bg_color?: string;
  bg_opa?: number; // 0..100
  radius?: number;
  border_width?: number;
  border_color?: string;

  // Text (label/button/checkbox/icon)
  text?: string;
  text_color?: string;
  font_size?: number;

  // Werte (slider/bar/arc/meter)
  value?: number;
  min_value?: number;
  max_value?: number;

  // Zustände (switch/checkbox/led)
  checked?: boolean;
  color?: string;

  // dropdown
  options?: string[];

  // erlaubt zusätzliche Keys ohne Typfehler
  [key: string]: unknown;
}

export interface WidgetNode {
  /** Stabile, eindeutige ID (wird später zum LVGL-/YAML-`id`). */
  id: string;
  type: WidgetType;
  /** Anzeigename im Element-Baum (optional, sonst Typ + id). */
  name?: string;
  geometry: Geometry;
  props: WidgetProps;
  /** Home-Assistant-Entity-Bindung (M4). In M1/M2 nur mitgeführt, nie überschrieben. */
  entity?: string;
  children: WidgetNode[];
}

export interface Screen {
  id: string;
  name: string;
  width: number;
  height: number;
  bg_color: string;
  children: WidgetNode[];
}

/** Widget-Typen, die Kinder aufnehmen können (Container). */
export const CONTAINER_TYPES: WidgetType[] = ['obj'];

export function isContainer(type: WidgetType): boolean {
  return CONTAINER_TYPES.includes(type);
}
