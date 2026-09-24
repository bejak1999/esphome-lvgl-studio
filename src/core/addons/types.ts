/**
 * Addon-System: Datenmodell.
 *
 * Ein Addon ist **rein deklarativ** (JSON) – es enthält keinen Code. Das ist Absicht:
 * Browser-Extensions dürfen unter MV3 keinen nachgeladenen Code ausführen (`unsafe-eval`
 * ist verboten), und ein JSON-Manifest bleibt prüfbar, teilbar und versionierbar.
 *
 * Ein Manifest beschreibt drei Dinge:
 *  1. `settings` – einmalige Angaben pro Installation (z. B. Frigate-URL, API-Key),
 *  2. `fields`   – die Konfiguration je Instanz (das Popup im Editor),
 *  3. `widgets` (+ optional `yaml`) – was daraus im ESPHome-Dokument entsteht.
 *
 * Autoren-Dokumentation: `docs/ADDONS.md`.
 */

import type { WidgetType } from '../lvgl/types';

/** Aktuelle Manifest-Version. Ältere/neuere werden beim Installieren abgelehnt. */
export const ADDON_API_VERSION = 1;

/** Präfix für YAML-Einträge, die einem Addon gehören (siehe `yamlMerge.ts`). */
export const ADDON_ID_PREFIX = 'addon_';

/**
 * Reservierter Widget-Schlüssel des automatisch erzeugten Gruppen-Containers (siehe
 * `apply.ts#wrapInRoot`). Manifeste dürfen ihn nicht selbst vergeben – `validateManifest`
 * lehnt das ab.
 */
export const ADDON_ROOT_KEY = '__root';

// ---------------------------------------------------------------------------
// Formularfelder
// ---------------------------------------------------------------------------

export type FieldKind =
  | 'text'
  | 'number'
  | 'slider'
  | 'select'
  | 'remote-select'
  | 'checkbox'
  | 'color'
  | 'size'
  | 'map'
  | 'ha-entity'
  | 'note';

export interface FieldOption {
  value: string;
  label?: string;
}

/**
 * Bedingte Anzeige. `key` ist ein Pfad im Kontext; ohne Punkt wird `config.` ergänzt
 * (`{ key: 'radar', truthy: true }` ⇒ `config.radar`).
 */
export interface Condition {
  key: string;
  equals?: unknown;
  not?: unknown;
  in?: unknown[];
  truthy?: boolean;
}

export interface FieldSpec {
  /** Schlüssel im Konfigurations-Objekt (`{{ config.<key> }}`). */
  key: string;
  kind: FieldKind;
  label: string;
  /** Erklärender Text unter dem Feld. */
  help?: string;
  default?: unknown;

  // text
  placeholder?: string;
  password?: boolean;

  // number / slider
  min?: number;
  max?: number;
  step?: number;
  unit?: string;

  // select
  options?: FieldOption[];

  // remote-select: Optionen werden zur Laufzeit von einer URL geladen
  /** URL-Template, z. B. `{{ settings.url }}/api/config`. */
  url?: string;
  /** Punkt-Pfad zur Liste/zum Objekt in der Antwort, z. B. `cameras`. */
  itemsPath?: string;
  /** Bei Listen: Feld für den Wert bzw. die Anzeige (Objekte nutzen die Schlüssel). */
  valueKey?: string;
  labelKey?: string;

  // size: Wert ist `{ width, height }`
  /** Auswahl-Vorschläge in der Form `"320x240"`. */
  presets?: string[];

  // map: Wert ist `{ lat, lon, zoom, spanKm }`
  spanKm?: { min: number; max: number; default: number };
  /** Seitenverhältnis des Ausschnitt-Rahmens auf der Karte (Pfad auf ein `size`-Feld). */
  aspectFrom?: string;
  /**
   * Kachel-URL der Vorschaukarte mit `{z}/{x}/{y}` (Templates erlaubt, z. B. mit eigenem
   * API-Key). Ohne Angabe wird die Standardquelle benutzt; schlägt das Laden fehl, fällt
   * die Karte automatisch darauf zurück.
   */
  tileUrl?: string;
  /** Pflicht-Quellenangabe zur Kachel-URL (wird über der Karte eingeblendet). */
  tileAttribution?: string;

  visibleIf?: Condition;
}

// ---------------------------------------------------------------------------
// Abgeleitete Werte (`{{ out.<key> }}`)
// ---------------------------------------------------------------------------

export type OutputSpec =
  /** Zeichenkette aus Platzhaltern zusammensetzen. */
  | { key: string; kind: 'template'; value: string }
  /** Rechnen (nur Zahlen/Operatoren/Funktionen – kein `eval`, siehe `template.ts`). */
  | { key: string; kind: 'calc'; expr: string; digits?: number }
  /** Fallunterscheidung anhand eines Wertes. */
  | { key: string; kind: 'switch'; on: string; cases: Record<string, string>; fallback?: string }
  /** WGS84-Bounding-Box aus Mittelpunkt + Breite in km, passend zum Seitenverhältnis. */
  | {
      key: string;
      kind: 'bbox';
      lat: string | number;
      lon: string | number;
      spanKm: string | number;
      width: string | number;
      height: string | number;
      /** Reihenfolge der vier Werte: `wsen` (Standard, lon/lat) oder `swne` (lat/lon, WMS 1.3). */
      order?: 'wsen' | 'swne';
      digits?: number;
    };

// ---------------------------------------------------------------------------
// Erzeugte LVGL-Widgets
// ---------------------------------------------------------------------------

/**
 * Ein Widget, das die Instanz im Dokument anlegt. Zahlenfelder dürfen Platzhalter-Strings
 * sein (`"{{ config.size.width }}"`). `x`/`y` gelten nur beim ersten Anlegen – danach
 * gehört die Position dem Nutzer (er darf sie im Canvas verschieben).
 */
export interface WidgetSpec {
  /** Stabiler Schlüssel innerhalb des Addons (Instanz merkt sich Schlüssel → Widget-id). */
  key: string;
  type: WidgetType;
  /** Anzeigename im Element-Baum (Template erlaubt). */
  name?: string;
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  /** LVGL-/Editor-Props (siehe `core/lvgl/types.ts`), Werte dürfen Templates sein. */
  props?: Record<string, unknown>;
  /**
   * Home-Assistant-Entity, an die das Widget gebunden wird (Template erlaubt). Die
   * YAML-Engine erzeugt daraus die passenden `sensor:`/`binary_sensor:`-Einträge.
   */
  entity?: string;
  children?: WidgetSpec[];
  visibleIf?: Condition;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export interface AddonManifest {
  /** Eindeutige id, Konvention `<herkunft>.<name>`, z. B. `studio.frigate-camera`. */
  id: string;
  name: string;
  version: string;
  /** Manifest-Format; aktuell 1. */
  api?: number;
  description?: string;
  author?: string;
  homepage?: string;
  /** Emoji für Liste/Panel. */
  icon?: string;
  /** Einmalige Angaben pro Installation (in den Einstellungen gepflegt). */
  settings?: FieldSpec[];
  /** Konfiguration je Instanz (Popup im Editor). */
  fields: FieldSpec[];
  outputs?: OutputSpec[];
  widgets: WidgetSpec[];
  /** Zusätzliches Top-Level-YAML als Template (siehe `yamlMerge.ts`). */
  yaml?: string;
  /** Live-Vorschau im Popup. */
  preview?: { kind: 'image'; url: string; interval?: number };
}

/** Eine im Dokument platzierte Addon-Instanz. */
export interface AddonInstance {
  /** Instanz-id (`a_…`), stabil über Speichern/Laden. */
  iid: string;
  /** `AddonManifest.id`. */
  addon: string;
  /** Version des Addons beim letzten Anwenden (nur informativ). */
  addonVersion?: string;
  /** Anzeigename im Panel (Standard: Addon-Name). */
  name?: string;
  /** `Screen.id` der Seite, auf der die Widgets liegen. */
  page: string;
  config: Record<string, unknown>;
  /** `WidgetSpec.key` → Widget-id im Dokument. */
  widgetIds: Record<string, string>;
  /**
   * Gerendertes Top-Level-YAML-Fragment. Wird mitgespeichert, damit ein Gerät auch dann
   * korrekt exportiert, wenn das Addon (noch) nicht installiert ist.
   */
  yaml?: string;
}

/** Eine installierte Addon-Quelle. */
export interface InstalledAddon {
  manifest: AddonManifest;
  /** Werte der `settings`-Felder. */
  settings: Record<string, unknown>;
  source: 'url' | 'file' | 'json';
  /** Bei `source: 'url'`: Ursprung für „Aktualisieren". */
  sourceUrl?: string;
  installedAt: number;
  enabled: boolean;
}

/** Fertig aufgelöstes Widget (alle Platzhalter ersetzt) – Eingabe für das Dokument. */
export interface ResolvedWidget {
  key: string;
  /** Schlüssel des Elternteils innerhalb derselben Instanz (für verschachtelte Specs). */
  parentKey?: string;
  type: WidgetType;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  props: Record<string, unknown>;
  /** Aufgelöste Home-Assistant-Entity (leer = keine Bindung). */
  entity?: string;
  /** True, wenn Breite/Höhe aus der Konfiguration kommen und beim Übernehmen neu gesetzt werden. */
  sizeFromConfig: boolean;
}
