import type { Screen, WidgetNode } from '../lvgl/types';

/** Komplettes Dashboard als wiederverwendbare Vorlage. */
export interface DashboardTemplate {
  id: string;
  name: string;
  kind: 'dashboard';
  screen: Screen;
  /** Gruppierung im Vorlagen-Modal (z. B. "Klima", "Beleuchtung"). */
  category?: string;
  builtin?: boolean;
  createdAt: number;
}

/** Einzelnes Widget (ggf. mit Kindern) als Vorlage. */
export interface WidgetTemplate {
  id: string;
  name: string;
  kind: 'widget';
  node: WidgetNode;
  /** Gruppierung im Vorlagen-Modal (z. B. "Klima", "Beleuchtung"). */
  category?: string;
  builtin?: boolean;
  createdAt: number;
}

export type Template = DashboardTemplate | WidgetTemplate;

export function isDashboard(t: Template): t is DashboardTemplate {
  return t.kind === 'dashboard';
}
export function isWidget(t: Template): t is WidgetTemplate {
  return t.kind === 'widget';
}
