import { defineStore } from 'pinia';
import type { Geometry, Screen, WidgetNode, WidgetProps, WidgetType } from './types';
import { isContainer } from './types';
import { createWidget, nextId } from './catalog';
import { boxForLinePoints, fitLinePointsToBox } from './line';
import { screensToYaml, yamlToScreens } from '../yaml/engine';
import type { AddonInstance, ResolvedWidget } from '../addons/types';
import { applyAddonYaml } from '../addons/yamlMerge';
import { readInstances, writeInstances } from '../addons/instances';
import { tr } from '@/shared/i18n';

/** Sammelt alle IDs im Baum (für Kollisionsfreiheit neuer IDs). */
function collectIds(nodes: WidgetNode[], acc: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    acc.add(n.id);
    collectIds(n.children, acc);
  }
  return acc;
}

/** Nächste freie Instanz-id für ein Addon (`a_1`, `a_2`, …). */
function nextInstanceId(existing: AddonInstance[]): string {
  const used = new Set(existing.map((i) => i.iid));
  let n = 1;
  while (used.has(`a_${n}`)) n += 1;
  return `a_${n}`;
}

/** Findet einen Knoten samt Elternliste per ID (Tiefensuche). */
function findNode(
  nodes: WidgetNode[],
  id: string,
): { node: WidgetNode; siblings: WidgetNode[] } | null {
  for (const n of nodes) {
    if (n.id === id) return { node: n, siblings: nodes };
    const found = findNode(n.children, id);
    if (found) return found;
  }
  return null;
}

/**
 * Klont einen Widget-Teilbaum mit frischen, kollisionsfreien IDs.
 *
 * JSON-Roundtrip statt `structuredClone`: Vorlagen können aus einem Store kommen und sind
 * dann reaktive Proxies – darauf wirft `structuredClone` `DataCloneError`.
 */
/** Vergleichswert für „Modell seit dem Import unverändert?" (Seiten + Addon-Instanzen). */
function modelFingerprint(s: { pages: unknown; addons: unknown }): string {
  return JSON.stringify([s.pages, s.addons]);
}

/** Anzeigename einer Seite: eigener Name oder „Page n“/„Seite n“. */
export function pageLabel(page: { name?: string }, index: number): string {
  return page.name || tr('page_default', { n: index + 1 });
}

export function cloneWithNewIds(node: WidgetNode, used: Set<string>): WidgetNode {
  const id = nextId(node.type, used);
  used.add(id);
  return {
    ...(JSON.parse(JSON.stringify(node)) as WidgetNode),
    id,
    children: node.children.map((c) => cloneWithNewIds(c, used)),
  };
}

// Größenbezogene Props, die beim Skalieren einer Vorlage mitwachsen/-schrumpfen müssen.
const SCALABLE_PROPS = ['font_size', 'radius', 'border_width', 'arc_width'] as const;

/**
 * Skaliert einen Widget-Teilbaum uniform (in-place): Geometrie UND größenbezogene
 * Style-Props (Schriftgröße, Radius, Rahmen, Arc-Breite), damit eine Vorlage bei
 * anderer Displaygröße proportional und ohne Überlappungen bleibt.
 */
export function scaleWidgetTree(node: WidgetNode, f: number): WidgetNode {
  const r = (v: number) => Math.round(v * f);
  node.geometry = {
    x: r(node.geometry.x),
    y: r(node.geometry.y),
    width: Math.max(1, r(node.geometry.width)),
    height: Math.max(1, r(node.geometry.height)),
  };
  const props = node.props as Record<string, unknown>;
  for (const k of SCALABLE_PROPS) {
    if (typeof props[k] === 'number') {
      props[k] = Math.max(k === 'font_size' ? 6 : 0, Math.round((props[k] as number) * f));
    }
  }
  node.children.forEach((c) => scaleWidgetTree(c, f));
  return node;
}

function defaultScreen(): Screen {
  return {
    id: 'main_page',
    // Leer = Standardname in der aktuellen UI-Sprache (siehe pageLabel) – beim Anlegen des
    // Stores sind die Einstellungen (Sprache) evtl. noch nicht geladen.
    name: '',
    width: 480,
    height: 320,
    bg_color: '#111827',
    children: [],
  };
}

/** Erzeugt eine eindeutige Seiten-id (LVGL-`pages[].id`, Ziel von Navigations-Aktionen). */
function nextPageId(existing: Screen[]): string {
  const used = new Set(existing.map((p) => p.id));
  let n = existing.length + 1;
  while (used.has(`page_${n}`)) n += 1;
  return `page_${n}`;
}

export const useDocumentStore = defineStore('document', {
  state: () => ({
    /** Alle LVGL-Seiten (`lvgl.pages`). Die aktive Seite ist das, was der Editor zeigt. */
    pages: [defaultScreen()] as Screen[],
    activePage: 0,
    selectedId: null as string | null,
    // Mehrfachauswahl (Strg-Klick): alle markierten IDs; `selectedId` ist die „primäre".
    selectedIds: [] as string[],
    // Zuletzt importiertes/normalisiertes YAML als Basis für den erhaltenden Export.
    // Leer = frisches Projekt (YAML wird aus dem Modell generiert).
    baseYaml: '',
    // Originaltext des letzten Imports + Modell-Fingerabdruck direkt danach. Solange das Modell
    // unverändert ist, wird exakt dieser Text exportiert – „Öffnen & Speichern" verändert eine
    // Config damit garantiert nicht (keine Umformatierung, kein ungefragtes lvgl:/scrollable).
    sourceYaml: '',
    sourceModel: '',
    // Ungespeicherte Änderungen seit dem letzten Speichern/Laden (für die Warn-Anzeige).
    dirty: false,
    // Im Dokument platzierte Addon-Instanzen (siehe core/addons/). Sie werden als
    // Kommentarzeilen im YAML mitgespeichert und beim Import wieder gelesen.
    addons: [] as AddonInstance[],
    // einfache History (Snapshots) für Undo/Redo
    _past: [] as string[],
    _future: [] as string[],
  }),

  getters: {
    /** Die aktuell bearbeitete Seite (Editor/Canvas arbeiten immer hierauf). */
    screen(state): Screen {
      return state.pages[state.activePage] ?? state.pages[0];
    },
    /** IDs ALLER Seiten – Widget-IDs müssen dokumentweit eindeutig sein. */
    allIds(state): Set<string> {
      const acc = new Set<string>();
      for (const p of state.pages) collectIds(p.children, acc);
      return acc;
    },
    selected(state): WidgetNode | null {
      if (!state.selectedId) return null;
      return findNode(state.pages[state.activePage]?.children ?? [], state.selectedId)?.node ?? null;
    },
    /** Alle aktuell markierten Knoten (Mehrfachauswahl). */
    selectedNodes(state): WidgetNode[] {
      return state.selectedIds
        .map((id) => findNode(state.pages[state.activePage]?.children ?? [], id)?.node)
        .filter((n): n is WidgetNode => !!n);
    },
    canUndo(state): boolean {
      return state._past.length > 0;
    },
    canRedo(state): boolean {
      return state._future.length > 0;
    },
    /**
     * Aktuelles YAML (Modell auf `baseYaml` angewandt, erhaltend) inklusive der
     * YAML-Fragmente der Addons und der Instanz-Kommentare.
     */
    exportedYaml(state): string {
      if (state.sourceYaml && modelFingerprint(state) === state.sourceModel) return state.sourceYaml;
      const yaml = screensToYaml(state.pages, state.baseYaml);
      const merged = applyAddonYaml(
        yaml,
        state.addons.map((a) => a.yaml ?? '').filter(Boolean),
      );
      return writeInstances(merged, state.addons);
    },
  },

  actions: {
    _snapshot(): string {
      return JSON.stringify({ pages: this.pages, activePage: this.activePage, addons: this.addons });
    },
    _restore(snap: string) {
      const v = JSON.parse(snap) as { pages: Screen[]; activePage: number; addons?: AddonInstance[] };
      this.pages = v.pages;
      this.activePage = Math.min(v.activePage ?? 0, Math.max(0, v.pages.length - 1));
      this.addons = v.addons ?? [];
    },
    _commit() {
      // aktuellen Zustand auf den Undo-Stack legen (vor der nächsten Mutation aufrufen)
      this._past.push(this._snapshot());
      if (this._past.length > 100) this._past.shift();
      this._future = [];
      this.dirty = true;
    },

    /** Markiert das Dokument als gespeichert (nach „Gerät speichern"/Import). */
    markSaved() {
      this.dirty = false;
    },

    /**
     * Auswahl setzen. `additive` (Strg) schaltet die ID in der Mehrfachauswahl um,
     * ohne sie zu leeren; sonst wird nur diese eine ID ausgewählt.
     */
    select(id: string | null, additive = false) {
      if (!id) {
        this.selectedId = null;
        this.selectedIds = [];
        return;
      }
      if (additive) {
        const i = this.selectedIds.indexOf(id);
        if (i >= 0) {
          this.selectedIds.splice(i, 1);
          this.selectedId = this.selectedIds[this.selectedIds.length - 1] ?? null;
        } else {
          this.selectedIds.push(id);
          this.selectedId = id;
        }
        return;
      }
      this.selectedId = id;
      this.selectedIds = [id];
    },

    /** Verschiebt alle markierten Widgets um dasselbe Delta (Gruppen-Drag). */
    moveSelectionBy(dx: number, dy: number, record = true) {
      if (record) this._commit();
      for (const id of this.selectedIds) {
        const node = findNode(this.screen.children, id)?.node;
        if (node) node.geometry = { ...node.geometry, x: Math.round(node.geometry.x + dx), y: Math.round(node.geometry.y + dy) };
      }
    },

    /**
     * Setzt die Positionen mehrerer Widgets aus ihren Ursprungspositionen + Delta
     * (für flüssiges Gruppen-Draggen ohne akkumulierende Rundungsfehler).
     */
    setGroupPositions(origins: Record<string, { x: number; y: number }>, dx: number, dy: number, record = false) {
      if (record) this._commit();
      for (const [id, o] of Object.entries(origins)) {
        const node = findNode(this.screen.children, id)?.node;
        if (node) node.geometry = { ...node.geometry, x: Math.round(o.x + dx), y: Math.round(o.y + dy) };
      }
    },

    /** Vor einer zusammenhängenden Interaktion (z. B. Drag) aufrufen: ein Undo-Schritt. */
    beginInteraction() {
      this._commit();
    },

    /** Fügt ein neues Widget hinzu (optional in einen Container). Gibt die neue ID zurück. */
    addWidget(type: WidgetType, x = 20, y = 20, parentId?: string): string {
      this._commit();
      const id = nextId(type, this.allIds);
      const node = createWidget(type, x, y, id);

      if (parentId) {
        const target = findNode(this.screen.children, parentId)?.node;
        if (target && isContainer(target.type)) {
          target.children.push(node);
        } else {
          this.screen.children.push(node);
        }
      } else {
        this.screen.children.push(node);
      }
      this.selectedId = id;
      return id;
    },

    updateProps(id: string, patch: Partial<WidgetProps>) {
      const node = findNode(this.screen.children, id)?.node;
      if (!node) return;
      this._commit();
      node.props = { ...node.props, ...patch };
      // Punkte direkt eingetippt → Rahmen an die neue Hüllbox anpassen.
      if (node.type === 'line' && 'points' in patch) {
        const fit = boxForLinePoints(node.props.points);
        if (fit) {
          node.props = { ...node.props, points: fit.points };
          node.geometry = { ...node.geometry, width: fit.width, height: fit.height };
        }
      }
    },

    updateGeometry(id: string, patch: Partial<Geometry>, record = true) {
      const node = findNode(this.screen.children, id)?.node;
      if (!node) return;
      if (record) this._commit();
      const prev = node.geometry;
      node.geometry = { ...prev, ...patch };
      // Eine Line hat keine eigene Zeichenfläche – ihre Punkte müssen mitskalieren,
      // sonst bleibt sie beim Ziehen am Griff unverändert lang.
      if (node.type === 'line' && (node.geometry.width !== prev.width || node.geometry.height !== prev.height)) {
        const pts = fitLinePointsToBox(node.props.points, node.geometry.width, node.geometry.height);
        if (pts) node.props = { ...node.props, points: pts };
      }
    },

    /**
     * Skaliert einen Knoten samt Teilbaum: setzt die neue Geometrie und skaliert die
     * (ursprünglichen) Kinder proportional mit `factor` (Geometrie + Schriftgrößen).
     * Für „ganze Vorlage per Eck-Griff größer/kleiner ziehen". `record=false` beim Draggen.
     */
    resizeScale(
      id: string,
      geom: Geometry,
      factor: number,
      origChildren: WidgetNode[],
      record = false,
    ) {
      const node = findNode(this.screen.children, id)?.node;
      if (!node) return;
      if (record) this._commit();
      node.geometry = geom;
      node.children = origChildren.map((c) => scaleWidgetTree(JSON.parse(JSON.stringify(c)) as WidgetNode, factor));
    },

    setEntity(id: string, entity: string) {
      const node = findNode(this.screen.children, id)?.node;
      if (!node) return;
      this._commit();
      node.entity = entity || undefined;
    },

    rename(id: string, name: string) {
      const node = findNode(this.screen.children, id)?.node;
      if (!node) return;
      this._commit();
      node.name = name;
    },

    /**
     * Verschiebt ein Widget in einen anderen Container (oder auf den Screen, parentId=null).
     * `x`/`y` sind die neue Position relativ zum neuen Elternelement.
     */
    reparent(id: string, parentId: string | null, x: number, y: number) {
      const found = findNode(this.screen.children, id);
      if (!found) return;
      const target = parentId ? findNode(this.screen.children, parentId)?.node : null;
      if (parentId && (!target || !isContainer(target.type))) return;
      // Nicht in sich selbst / einen eigenen Nachfahren verschieben.
      if (target) {
        const desc = new Set<string>();
        const collect = (n: WidgetNode) => { desc.add(n.id); n.children.forEach(collect); };
        collect(found.node);
        if (desc.has(target.id)) return;
      }
      this._commit();
      const idx = found.siblings.indexOf(found.node);
      found.siblings.splice(idx, 1);
      found.node.geometry.x = Math.round(x);
      found.node.geometry.y = Math.round(y);
      (target ? target.children : this.screen.children).push(found.node);
      this.selectedId = id;
    },

    /** Verschiebt ein Widget in der Zeichenreihenfolge (spätere = weiter vorne). */
    reorder(id: string, where: 'front' | 'back' | 'forward' | 'backward') {
      const found = findNode(this.screen.children, id);
      if (!found) return;
      const sibs = found.siblings;
      const i = sibs.indexOf(found.node);
      if (i < 0) return;
      this._commit();
      sibs.splice(i, 1);
      if (where === 'front') sibs.push(found.node);
      else if (where === 'back') sibs.unshift(found.node);
      else if (where === 'forward') sibs.splice(Math.min(i + 1, sibs.length), 0, found.node);
      else sibs.splice(Math.max(i - 1, 0), 0, found.node);
    },

    remove(id: string) {
      const found = findNode(this.screen.children, id);
      if (!found) return;
      this._commit();
      const idx = found.siblings.indexOf(found.node);
      if (idx >= 0) found.siblings.splice(idx, 1);
      if (this.selectedId === id) this.selectedId = null;
      const si = this.selectedIds.indexOf(id);
      if (si >= 0) this.selectedIds.splice(si, 1);
    },

    /** Entfernt alle aktuell markierten Widgets auf einmal. */
    removeSelection() {
      const ids = [...this.selectedIds];
      if (!ids.length) return;
      this._commit();
      for (const id of ids) {
        const found = findNode(this.screen.children, id);
        if (!found) continue;
        const idx = found.siblings.indexOf(found.node);
        if (idx >= 0) found.siblings.splice(idx, 1);
      }
      this.selectedId = null;
      this.selectedIds = [];
    },

    setScreenProp(patch: Partial<Pick<Screen, 'width' | 'height' | 'bg_color' | 'name'>>) {
      this._commit();
      Object.assign(this.screen, patch);
      // Die Displaygröße gilt für ALLE Seiten – sonst laufen sie auseinander.
      if (patch.width != null || patch.height != null) {
        for (const p of this.pages) {
          if (patch.width != null) p.width = patch.width;
          if (patch.height != null) p.height = patch.height;
        }
      }
    },

    undo() {
      if (!this._past.length) return;
      this._future.push(this._snapshot());
      const prev = this._past.pop()!;
      this._restore(prev);
      this.selectedId = null;
      this.selectedIds = [];
    },
    redo() {
      if (!this._future.length) return;
      this._past.push(this._snapshot());
      const next = this._future.pop()!;
      this._restore(next);
      this.selectedId = null;
      this.selectedIds = [];
    },

    /** Ersetzt die aktive Seite (Screen-Modell direkt). */
    loadScreen(screen: Screen) {
      this._commit();
      this.pages[this.activePage] = screen;
      this.selectedId = null;
      this.selectedIds = [];
    },

    // ---- Seiten (LVGL pages) --------------------------------------------

    /** Wechselt die angezeigte/bearbeitete Seite. */
    setActivePage(i: number) {
      if (i < 0 || i >= this.pages.length || i === this.activePage) return;
      this.activePage = i;
      this.selectedId = null;
      this.selectedIds = [];
    },

    /** Legt eine neue, leere Seite an und wechselt zu ihr. Gibt deren id zurück. */
    addPage(name?: string): string {
      this._commit();
      const base = this.pages[0] ?? defaultScreen();
      const id = nextPageId(this.pages);
      this.pages.push({
        id,
        name: name || tr('page_default', { n: this.pages.length + 1 }),
        width: base.width,
        height: base.height,
        bg_color: base.bg_color,
        children: [],
      });
      this.activePage = this.pages.length - 1;
      this.selectedId = null;
      this.selectedIds = [];
      return id;
    },

    /** Entfernt eine Seite (die letzte verbleibende bleibt bestehen). */
    removePage(i: number) {
      if (this.pages.length <= 1 || i < 0 || i >= this.pages.length) return;
      this._commit();
      this.pages.splice(i, 1);
      this.activePage = Math.min(this.activePage, this.pages.length - 1);
      this.selectedId = null;
      this.selectedIds = [];
    },

    /** Benennt eine Seite um (`name` = Anzeige, `id` = LVGL-Ziel für Navigation). */
    renamePage(i: number, name: string, id?: string) {
      const p = this.pages[i];
      if (!p) return;
      this._commit();
      p.name = name;
      if (id && id !== p.id) {
        // Navigations-Aktionen, die auf die alte id zeigen, mitziehen.
        const old = p.id;
        p.id = id;
        const fix = (nodes: WidgetNode[]) => {
          for (const n of nodes) {
            if (n.props.page_action === `show:${old}`) n.props = { ...n.props, page_action: `show:${id}` };
            fix(n.children);
          }
        };
        for (const pg of this.pages) fix(pg.children);
      }
    },

    /** Fügt einen Widget-Teilbaum (Vorlage) mit frischen IDs ein. Gibt die neue ID zurück. */
    insertNode(node: WidgetNode): string {
      this._commit();
      const clone = cloneWithNewIds(node, this.allIds);
      this.screen.children.push(clone);
      this.selectedId = clone.id;
      return clone.id;
    },

    /**
     * Fügt eine Vorlage ein und skaliert sie deterministisch auf die Displaygröße:
     * Ist die Vorlage größer als der Screen, wird sie uniform herunterskaliert (Seiten-
     * verhältnis bleibt erhalten) und zentriert. Passt sie ohnehin, bleibt sie unverändert.
     * Gibt die neue ID zurück.
     */
    insertTemplate(node: WidgetNode): string {
      this._commit();
      const clone = cloneWithNewIds(node, this.allIds);
      const { width: w, height: h } = clone.geometry;
      const sw = this.screen.width;
      const sh = this.screen.height;
      const factor = Math.min(1, sw / w, sh / h);
      if (factor < 1) {
        scaleWidgetTree(clone, factor);
        clone.geometry.x = Math.max(0, Math.round((sw - clone.geometry.width) / 2));
        clone.geometry.y = Math.max(0, Math.round((sh - clone.geometry.height) / 2));
      }
      this.screen.children.push(clone);
      this.selectedId = clone.id;
      return clone.id;
    },

    /**
     * Importiert vollständiges ESPHome-YAML: baut das Editor-Modell und merkt sich das
     * (normalisierte) YAML als Basis, sodass beim Export alle nicht verwalteten Inhalte
     * (Lambdas, Automationen, Kommentare, andere Komponenten) erhalten bleiben.
     */
    importYaml(text: string) {
      const { pages, yaml } = yamlToScreens(text);
      this._commit();
      this.pages = pages.length ? pages : [defaultScreen()];
      this.activePage = Math.min(this.activePage, this.pages.length - 1);
      this.baseYaml = yaml;
      this.sourceYaml = text;
      // Addon-Instanzen stehen als Kommentar im YAML – von dort kommen sie zurück, auch
      // auf einem Rechner, auf dem das Addon selbst (noch) nicht installiert ist.
      this.addons = readInstances(text);
      this.selectedId = null;
      this.selectedIds = [];
      this.sourceModel = modelFingerprint(this);
      // Frisch geladen = deckungsgleich mit dem Gerät → nicht „ungespeichert".
      this.dirty = false;
    },

    /** Aktuelles YAML (erhaltend, inkl. Addons) als String. */
    exportYaml(): string {
      return this.exportedYaml;
    },

    // ---- Addons ----------------------------------------------------------

    /** Instanz per id. */
    addonInstance(iid: string): AddonInstance | null {
      return this.addons.find((a) => a.iid === iid) ?? null;
    },

    /** Legt eine neue, noch leere Instanz auf der aktiven Seite an. */
    createAddonInstance(addonId: string, config: Record<string, unknown>, name?: string): AddonInstance {
      this._commit();
      const inst: AddonInstance = {
        iid: nextInstanceId(this.addons),
        addon: addonId,
        name,
        page: this.screen.id,
        config: JSON.parse(JSON.stringify(config)),
        widgetIds: {},
      };
      this.addons.push(inst);
      return inst;
    },

    /**
     * Migriert eine Instanz von vor der Gruppierung (Widgets lagen lose/direkt auf der
     * Seite) in den neu eingeführten Gruppen-Container: die schon vorhandenen Kinder
     * werden – an ihrer AKTUELLEN Bildschirmposition – unter den frisch angelegten
     * Container gehängt, statt sie zu duplizieren oder stehen zu lassen. Ein no-op, wenn
     * der Container schon existiert oder es noch nichts zu adoptieren gibt (frische
     * Instanz – dann legt die normale Schleife unten alles inklusive Container neu an).
     */
    _migrateAddonGroup(inst: AddonInstance, page: Screen, widgets: ResolvedWidget[]) {
      const root = widgets.find((w) => !w.parentKey);
      if (!root || inst.widgetIds[root.key]) return;

      const childKeys = widgets.filter((w) => w.parentKey === root.key).map((w) => w.key);
      const loose: WidgetNode[] = [];
      for (const key of childKeys) {
        const id = inst.widgetIds[key];
        const node = id ? page.children.find((n) => n.id === id) : undefined;
        if (node) loose.push(node);
      }
      if (!loose.length) return;

      const minX = Math.min(...loose.map((n) => n.geometry.x));
      const minY = Math.min(...loose.map((n) => n.geometry.y));
      const id = nextId(root.type, this.allIds);
      const container = createWidget(root.type, minX, minY, id);
      for (const n of loose) {
        const at = page.children.indexOf(n);
        if (at >= 0) page.children.splice(at, 1);
        n.geometry = { ...n.geometry, x: n.geometry.x - minX, y: n.geometry.y - minY };
        container.children.push(n);
      }
      page.children.push(container);
      inst.widgetIds[root.key] = id;
    },

    /**
     * Überträgt die aufgelösten Widgets einer Instanz ins Dokument: fehlende werden
     * angelegt, vorhandene aktualisiert (Position bleibt beim Nutzer), entfallene gelöscht.
     * `yaml` ist das gerenderte Top-Level-Fragment des Addons.
     */
    applyAddonWidgets(iid: string, widgets: ResolvedWidget[], yaml = ''): Record<string, string> {
      const inst = this.addons.find((a) => a.iid === iid);
      if (!inst) return {};
      this._commit();

      const pageIdx = Math.max(0, this.pages.findIndex((p) => p.id === inst.page));
      const page = this.pages[pageIdx] ?? this.screen;
      inst.page = page.id;
      inst.yaml = yaml || undefined;

      const wanted = new Set(widgets.map((w) => w.key));

      // Entfallene Widgets (z. B. abgeschalteter Schalter) entfernen. findNode ist
      // rekursiv – funktioniert unabhängig davon, ob das Widget lose oder im
      // Gruppen-Container liegt.
      for (const [key, id] of Object.entries(inst.widgetIds)) {
        if (wanted.has(key)) continue;
        const found = findNode(page.children, id);
        if (found) {
          const at = found.siblings.indexOf(found.node);
          if (at >= 0) found.siblings.splice(at, 1);
        }
        delete inst.widgetIds[key];
      }

      // Ältere Instanzen (vor der Gruppierung) hatten ihre Widgets lose auf der Seite –
      // beim ersten Anwenden nach diesem Update in den neuen Container übernehmen, ohne
      // die Position zu verschieben.
      this._migrateAddonGroup(inst, page, widgets);

      // Ursprung der Gruppe: Position des ersten (Anker-)Widgets – seit der Gruppierung
      // praktisch immer der Container selbst – sonst frei gestaffelt.
      const anchorKey = widgets[0]?.key;
      const anchorId = anchorKey ? inst.widgetIds[anchorKey] : undefined;
      const anchorNode = anchorId ? findNode(page.children, anchorId)?.node : null;
      const others = this.addons.filter((a) => a.iid !== iid && a.page === page.id).length;
      const origin = anchorNode
        ? { x: anchorNode.geometry.x, y: anchorNode.geometry.y }
        : { x: 20 + (others % 6) * 14, y: 20 + (others % 6) * 14 };

      for (const w of widgets) {
        const existingId = inst.widgetIds[w.key];
        let node = existingId ? findNode(page.children, existingId)?.node ?? null : null;
        // Hat das Addon den Typ geändert, wird das Widget neu angelegt.
        if (node && node.type !== w.type) {
          const found = findNode(page.children, node.id)!;
          const at = found.siblings.indexOf(found.node);
          if (at >= 0) found.siblings.splice(at, 1);
          node = null;
        }

        if (!node) {
          const id = nextId(w.type, this.allIds);
          // Nur die oberste Ebene (seit der Gruppierung praktisch immer der Container)
          // bekommt den Ursprung der Gruppe – verschachtelte Widgets sind schon relativ
          // zu ihrem Elternteil (sonst würde der Ursprung doppelt gezählt).
          const isTop = !w.parentKey;
          const x = isTop ? origin.x + (w.x ?? 0) : (w.x ?? 0);
          const y = isTop ? origin.y + (w.y ?? 0) : (w.y ?? 0);
          node = createWidget(w.type, x, y, id);
          if (w.width != null) node.geometry.width = w.width;
          if (w.height != null) node.geometry.height = w.height;
          // Kind eines anderen Addon-Widgets? Sonst direkt auf die Seite.
          const parentId = w.parentKey ? inst.widgetIds[w.parentKey] : undefined;
          const parent = parentId ? findNode(page.children, parentId)?.node : null;
          if (parent && isContainer(parent.type)) parent.children.push(node);
          else page.children.push(node);
          inst.widgetIds[w.key] = id;
        } else if (w.sizeFromConfig) {
          // Größe kommt aus der Konfiguration → beim Übernehmen mitziehen.
          if (w.width != null) node.geometry.width = w.width;
          if (w.height != null) node.geometry.height = w.height;
        }

        node.props = { ...node.props, ...w.props };
        if (w.name) node.name = w.name;
        if (w.entity !== undefined) node.entity = w.entity || undefined;
      }

      this.selectedId = anchorKey ? inst.widgetIds[anchorKey] ?? null : null;
      this.selectedIds = this.selectedId ? [this.selectedId] : [];
      return { ...inst.widgetIds };
    },

    /**
     * Setzt das gerenderte YAML-Fragment einer Instanz. Getrennt vom Anlegen der Widgets,
     * weil das Fragment deren ids kennen darf (`{{ widgets.<key> }}`) – die gibt es erst
     * danach. Erzeugt bewusst KEINEN eigenen Undo-Schritt.
     */
    setAddonYaml(iid: string, yaml: string) {
      const inst = this.addons.find((a) => a.iid === iid);
      if (!inst) return;
      inst.yaml = yaml || undefined;
      this.dirty = true;
    },

    /** Ändert Konfiguration/Name einer Instanz (ohne die Widgets anzufassen). */
    updateAddonInstance(iid: string, patch: Partial<Pick<AddonInstance, 'config' | 'name' | 'addonVersion'>>) {
      const inst = this.addons.find((a) => a.iid === iid);
      if (!inst) return;
      this._commit();
      if (patch.config) inst.config = JSON.parse(JSON.stringify(patch.config));
      if (patch.name !== undefined) inst.name = patch.name;
      if (patch.addonVersion !== undefined) inst.addonVersion = patch.addonVersion;
    },

    /** Entfernt eine Instanz. `keepWidgets` löst sie nur vom Addon, statt sie zu löschen. */
    removeAddonInstance(iid: string, keepWidgets = false) {
      const inst = this.addons.find((a) => a.iid === iid);
      if (!inst) return;
      this._commit();
      if (!keepWidgets) {
        const page = this.pages.find((p) => p.id === inst.page) ?? this.screen;
        for (const id of Object.values(inst.widgetIds)) {
          const found = findNode(page.children, id);
          if (!found) continue;
          const at = found.siblings.indexOf(found.node);
          if (at >= 0) found.siblings.splice(at, 1);
          if (this.selectedId === id) this.selectedId = null;
        }
      }
      this.addons = this.addons.filter((a) => a.iid !== iid);
      this.selectedIds = this.selectedIds.filter((id) => !!findNode(this.screen.children, id));
    },
  },
});
