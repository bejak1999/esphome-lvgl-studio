<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import WidgetView from '@/core/lvgl/WidgetView.vue';
import { useDocumentStore } from '@/core/lvgl/document';
import {
  ENTITY_STATES_KEY, ENTITY_VALUES_KEY, entityNumericValue, entityUnit, isEntityActive, useHaStore,
  type EntityValue,
} from '@/core/ha/store';
import { useSettingsStore } from '@/shared/settings';
import type { WidgetNode, WidgetType } from '@/core/lvgl/types';
import { useI18n } from '@/shared/i18n';
const { t } = useI18n();

const props = defineProps<{ preview?: boolean }>();
const doc = useDocumentStore();
const ha = useHaStore();
const settings = useSettingsStore();

// Entity-Reflexion: bindet Widget-Zustände/-Werte an (live) HA-States (Vorschau-Hilfe).
const reflect = ref(true);
const entityStates = computed<Record<string, boolean> | null>(() => {
  if (!reflect.value) return null;
  const map: Record<string, boolean> = {};
  for (const e of ha.entities) map[e.entity_id] = isEntityActive(e.state);
  return map;
});
const entityValues = computed<Record<string, EntityValue> | null>(() => {
  if (!reflect.value) return null;
  const map: Record<string, EntityValue> = {};
  for (const e of ha.entities) map[e.entity_id] = { state: e.state ?? '', num: entityNumericValue(e), unit: entityUnit(e) };
  return map;
});
provide(ENTITY_STATES_KEY, entityStates);
provide(ENTITY_VALUES_KEY, entityValues);

// Live-Aktualisierung: HA-States regelmäßig neu laden (nur wenn aktiviert + Zugangsdaten).
let pollTimer: ReturnType<typeof setInterval> | undefined;
function refreshHa() {
  const { url, token } = settings.settings.ha;
  if (reflect.value && url && token && !ha.loading) ha.load(url, token);
}
onMounted(() => {
  pollTimer = setInterval(refreshHa, 15000);
});
onBeforeUnmount(() => clearInterval(pollTimer));

const zoom = ref(1);
const stageRef = ref<HTMLElement | null>(null);
const viewportRef = ref<HTMLElement | null>(null);

/**
 * Zoom so wählen, dass das ganze Display sichtbar ist (max. 100 %). Automatisch beim Öffnen
 * und bei neuer Displaygröße – große Panels (z. B. 1024×600) passen sonst nicht auf den Schirm.
 */
/** true, solange der Nutzer nicht selbst zoomt – dann folgt der Zoom der Fenstergröße. */
const autoFit = ref(true);

async function fitZoom() {
  autoFit.value = true;
  await nextTick();
  const vp = viewportRef.value;
  if (!vp || !doc.screen.width || !doc.screen.height) return;
  const pad = 64; // p-8 links+rechts bzw. oben+unten
  const z = Math.min(1, (vp.clientWidth - pad) / doc.screen.width, (vp.clientHeight - pad) / doc.screen.height);
  zoom.value = Math.max(0.1, Math.floor(z * 20) / 20);
}
let resizeObs: ResizeObserver | null = null;
onMounted(() => {
  fitZoom();
  // Moduswechsel (Split/Code), Fenstergröße: neu einpassen, außer der Nutzer hat gezoomt.
  resizeObs = new ResizeObserver(() => {
    if (autoFit.value) fitZoom();
  });
  if (viewportRef.value) resizeObs.observe(viewportRef.value);
});
onBeforeUnmount(() => resizeObs?.disconnect());
watch(() => [doc.screen.width, doc.screen.height], fitZoom);

// Snap & Ausrichtungshilfen
const snap = ref(true);
const showGrid = ref(true);
const GRID = 8;
const SNAP_THRESHOLD = 6; // logische px
/** Hilfslinie in absoluten Bühnen-Koordinaten: `pos` = Achse, `start`/`len` = Ausdehnung. */
interface Guide { dir: 'v' | 'h'; pos: number; start: number; len: number }
const activeGuides = ref<Guide[]>([]);

// ---- Drag & Drop aus der Palette ---------------------------------------
function onDragOver(ev: DragEvent) {
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
}

function onDrop(ev: DragEvent) {
  ev.preventDefault();
  const type = ev.dataTransfer?.getData('application/x-lvgl-widget') as WidgetType | '';
  if (!type) return;
  const { x, y } = toScreenCoords(ev.clientX, ev.clientY);
  doc.addWidget(type, x, y);
}

function toScreenCoords(clientX: number, clientY: number) {
  const rect = stageRef.value!.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / zoom.value,
    y: (clientY - rect.top) / zoom.value,
  };
}

// ---- Verschieben eines Widgets -----------------------------------------
let dragState:
  | {
      id: string; startX: number; startY: number; origX: number; origY: number;
      w: number; h: number; ctx: SnapCtx;
      /** Widget hängt an einem align-Anker → beim ersten Move in feste Koordinaten lösen. */
      align: boolean;
      /** Gruppen-Drag: Ursprungspositionen aller markierten Widgets (sonst null). */
      group: Record<string, { x: number; y: number }> | null;
    }
  | null = null;

/**
 * Bezugsrahmen fürs Snappen: Widget-Koordinaten sind immer relativ zum Eltern-Container,
 * die Hilfslinien werden aber absolut auf der Bühne gezeichnet. Deshalb merken wir uns
 * Geschwister, Größe des Elternteils und dessen absoluten Ursprung.
 */
interface SnapCtx { siblings: WidgetNode[]; absX: number; absY: number; width: number; height: number }

function snapContext(id: string): SnapCtx {
  const all: AbsNode[] = [];
  collectAbs(doc.screen.children, 0, 0, null, all);
  const me = all.find((e) => e.node.id === id);
  const parent = me?.parentId ? all.find((e) => e.node.id === me.parentId) : null;
  if (!parent) {
    return {
      siblings: doc.screen.children.filter((n) => n.id !== id),
      absX: 0, absY: 0, width: doc.screen.width, height: doc.screen.height,
    };
  }
  return {
    siblings: parent.node.children.filter((n) => n.id !== id),
    absX: parent.absX, absY: parent.absY,
    width: parent.node.geometry.width, height: parent.node.geometry.height,
  };
}

// LVGL-align → [horizontal, vertikal] (wie in WidgetView) – für die Absolut-Umrechnung.
const ALIGN_MAP: Record<string, [string, string]> = {
  center: ['center', 'center'], top_mid: ['center', 'top'], top_left: ['left', 'top'],
  top_right: ['right', 'top'], bottom_mid: ['center', 'bottom'], bottom_left: ['left', 'bottom'],
  bottom_right: ['right', 'bottom'], left_mid: ['left', 'center'], right_mid: ['right', 'center'],
};

/** Position eines (ggf. ausgerichteten) Widgets im Koordinatensystem seines Elternteils. */
function renderedPos(node: WidgetNode, parentW: number, parentH: number): { x: number; y: number } {
  const { x, y, width, height } = node.geometry;
  const a = ALIGN_MAP[String(node.props.align ?? '').toLowerCase()];
  if (!a) return { x, y };
  const sw = parentW;
  const sh = parentH;
  const [h, v] = a;
  const rx = h === 'left' ? x : h === 'right' ? sw - width + x : sw / 2 - width / 2 + x;
  const ry = v === 'top' ? y : v === 'bottom' ? sh - height + y : sh / 2 - height / 2 + y;
  return { x: Math.round(rx), y: Math.round(ry) };
}

function onGrab(id: string, ev: PointerEvent) {
  if (props.preview) return;
  const ref = findNodeRef(id);
  if (!ref) return;

  // Strg/⌘-Klick: nur die Auswahl umschalten, keinen Drag starten.
  if (ev.ctrlKey || ev.metaKey) {
    doc.select(id, true);
    return;
  }

  // Teil einer bestehenden Mehrfachauswahl? Dann die ganze Gruppe ziehen und die Auswahl
  // erst mal behalten (ein reiner Klick ohne Bewegung reduziert sie später auf dieses Widget).
  const inGroup = doc.selectedIds.length > 1 && doc.selectedIds.includes(id);
  if (!inGroup) doc.select(id);

  const ctx = snapContext(id);
  const node = findFullGeom(id)!;
  // Für align-Widgets die gerenderte Position als Ausgangspunkt nehmen (erst beim ersten
  // Move wird der align-Anker gelöst – ein reiner Klick soll nichts verändern/„dirty" machen).
  let origX = node.x;
  let origY = node.y;
  if (ref.props.align) {
    const rp = renderedPos(ref, ctx.width, ctx.height);
    origX = rp.x;
    origY = rp.y;
  }
  dragState = {
    id, startX: ev.clientX, startY: ev.clientY, origX, origY, w: node.width, h: node.height, ctx,
    align: !!ref.props.align,
    group: inGroup ? captureGroupOrigins() : null,
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp, { once: true });
}

/** Ursprungspositionen aller markierten Widgets (für den Gruppen-Drag). */
function captureGroupOrigins(): Record<string, { x: number; y: number }> {
  const origins: Record<string, { x: number; y: number }> = {};
  for (const sid of doc.selectedIds) {
    const g = findFullGeom(sid);
    if (g) origins[sid] = { x: g.x, y: g.y };
  }
  return origins;
}

/** Beste Snap-Verschiebung: prüft die Kanten des gezogenen Objekts gegen Kandidaten. */
function bestSnap(edges: number[], candidates: number[]): { delta: number; guide: number } | null {
  let best: { delta: number; guide: number } | null = null;
  for (const e of edges) {
    for (const c of candidates) {
      const diff = c - e;
      if (Math.abs(diff) <= SNAP_THRESHOLD && (!best || Math.abs(diff) < Math.abs(best.delta))) {
        best = { delta: diff, guide: c };
      }
    }
  }
  return best;
}

/**
 * Snap auf Kanten/Mitten der Geschwister und des Eltern-Containers, sonst aufs Raster.
 * Gerechnet wird im Eltern-Koordinatensystem (`ctx`), die zurückgegebenen Hilfslinien
 * sind bereits in absolute Bühnen-Koordinaten umgerechnet und nur so lang wie der Eltern-Rahmen.
 */
function computeSnap(x: number, y: number, w: number, h: number, ctx: SnapCtx) {
  const guides: Guide[] = [];
  let nx = x;
  let ny = y;
  if (!snap.value) return { x: Math.round(x), y: Math.round(y), guides };

  const xCands = [0, ctx.width / 2, ctx.width];
  const yCands = [0, ctx.height / 2, ctx.height];
  for (const s of ctx.siblings) {
    const p = renderedPos(s, ctx.width, ctx.height);
    xCands.push(p.x, p.x + s.geometry.width / 2, p.x + s.geometry.width);
    yCands.push(p.y, p.y + s.geometry.height / 2, p.y + s.geometry.height);
  }

  const xs = bestSnap([x, x + w / 2, x + w], xCands);
  const ys = bestSnap([y, y + h / 2, y + h], yCands);
  if (xs) {
    nx = x + xs.delta;
    guides.push({ dir: 'v', pos: ctx.absX + xs.guide, start: ctx.absY, len: ctx.height });
  } else {
    nx = Math.round(x / GRID) * GRID;
  }
  if (ys) {
    ny = y + ys.delta;
    guides.push({ dir: 'h', pos: ctx.absY + ys.guide, start: ctx.absX, len: ctx.width });
  } else {
    ny = Math.round(y / GRID) * GRID;
  }
  return { x: Math.round(nx), y: Math.round(ny), guides };
}

let dragMoved = false;

function onPointerMove(ev: PointerEvent) {
  if (!dragState) return;
  const dx = (ev.clientX - dragState.startX) / zoom.value;
  const dy = (ev.clientY - dragState.startY) / zoom.value;

  // Erst wenn wirklich gezogen wird: einen Undo-Schritt festhalten (ein reiner Klick
  // soll nichts verändern) und ggf. den align-Anker lösen.
  if (!dragMoved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
    dragMoved = true;
    if (dragState.align) doc.updateProps(dragState.id, { align: '' }); // committet einmalig
    else doc.beginInteraction();
  }
  if (!dragMoved) return;

  const { x, y, guides } = computeSnap(dragState.origX + dx, dragState.origY + dy, dragState.w, dragState.h, dragState.ctx);
  activeGuides.value = guides;
  if (dragState.group) {
    // Ganze Gruppe um dasselbe (gesnappte) Delta verschieben.
    doc.setGroupPositions(dragState.group, x - dragState.origX, y - dragState.origY, false);
  } else {
    doc.updateGeometry(dragState.id, { x, y }, false);
  }
}

// Flache Liste aller Knoten mit absoluter Position + Eltern-id (für Verschachtelung).
interface AbsNode { node: WidgetNode; absX: number; absY: number; parentId: string | null }
function collectAbs(nodes: WidgetNode[], px: number, py: number, parentId: string | null, acc: AbsNode[]) {
  for (const n of nodes) {
    const absX = px + n.geometry.x;
    const absY = py + n.geometry.y;
    acc.push({ node: n, absX, absY, parentId });
    collectAbs(n.children, absX, absY, n.id, acc);
  }
}

/** Prüft beim Loslassen, ob das Widget über einem anderen Container liegt → verschachteln. */
function tryReparent(id: string) {
  const all: AbsNode[] = [];
  collectAbs(doc.screen.children, 0, 0, null, all);
  const dragged = all.find((e) => e.node.id === id);
  if (!dragged) return;
  const cx = dragged.absX + dragged.node.geometry.width / 2;
  const cy = dragged.absY + dragged.node.geometry.height / 2;
  // eigene Nachfahren ausschließen
  const desc = new Set<string>();
  const mark = (n: WidgetNode) => { desc.add(n.id); n.children.forEach(mark); };
  mark(dragged.node);
  // kleinsten enthaltenden Container finden (tiefste Verschachtelung)
  let best: AbsNode | null = null;
  for (const e of all) {
    if (e.node.type !== 'obj' || desc.has(e.node.id)) continue;
    const inside = cx >= e.absX && cx <= e.absX + e.node.geometry.width && cy >= e.absY && cy <= e.absY + e.node.geometry.height;
    if (!inside) continue;
    const area = e.node.geometry.width * e.node.geometry.height;
    if (!best || area < best.node.geometry.width * best.node.geometry.height) best = e;
  }
  const newParentId = best ? best.node.id : null;
  if (newParentId === dragged.parentId) return; // keine Änderung
  const px = best ? best.absX : 0;
  const py = best ? best.absY : 0;
  doc.reparent(id, newParentId, dragged.absX - px, dragged.absY - py);
}

function onPointerUp() {
  if (dragState) {
    if (!dragMoved && dragState.group) {
      // Klick (ohne Ziehen) auf ein Gruppen-Mitglied → Auswahl auf dieses eine reduzieren.
      doc.select(dragState.id);
    } else if (dragMoved && !dragState.group) {
      // Verschachteln nur beim Einzel-Drag (eine Gruppe umzuhängen wäre mehrdeutig).
      tryReparent(dragState.id);
    }
  }
  dragState = null;
  dragMoved = false;
  activeGuides.value = [];
  window.removeEventListener('pointermove', onPointerMove);
}

function findFullGeom(id: string): { x: number; y: number; width: number; height: number } | null {
  const g = findNodeRef(id);
  return g ? { ...g.geometry } : null;
}

/** Findet den echten Knoten (Referenz) per ID. */
function findNodeRef(id: string): WidgetNode | null {
  const stack = [...doc.screen.children];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.id === id) return n;
    stack.push(...n.children);
  }
  return null;
}

// ---- Größe ändern über die Griffe -------------------------------------
let resizeState:
  | {
      id: string;
      dir: string;
      startX: number;
      startY: number;
      g: { x: number; y: number; width: number; height: number };
      scale: boolean;
      origChildren: WidgetNode[] | null;
    }
  | null = null;

function onResize(id: string, dir: string, ev: PointerEvent) {
  if (props.preview) return;
  const node = findNodeRef(id);
  if (!node) return;
  doc.beginInteraction();
  // Eck-Griff an einem Container mit Kindern → ganze „Vorlage" proportional skalieren.
  const isCorner = dir.length === 2;
  const scale = isCorner && node.children.length > 0;
  resizeState = {
    id,
    dir,
    startX: ev.clientX,
    startY: ev.clientY,
    g: { ...node.geometry },
    scale,
    origChildren: scale ? (JSON.parse(JSON.stringify(node.children)) as WidgetNode[]) : null,
  };
  window.addEventListener('pointermove', onResizeMove);
  window.addEventListener('pointerup', onResizeUp, { once: true });
}

function onResizeMove(ev: PointerEvent) {
  if (!resizeState) return;
  const dx = (ev.clientX - resizeState.startX) / zoom.value;
  const dy = (ev.clientY - resizeState.startY) / zoom.value;
  const { dir, g } = resizeState;
  const MIN = 8;

  // Proportionales Skalieren des ganzen Teilbaums (Seitenverhältnis gesperrt).
  if (resizeState.scale && resizeState.origChildren) {
    const raw = dir.includes('e') ? (g.width + dx) / g.width : (g.width - dx) / g.width;
    const factor = Math.max(MIN / g.width, raw);
    const newW = Math.max(MIN, Math.round(g.width * factor));
    const newH = Math.max(MIN, Math.round(g.height * factor));
    const nx = dir.includes('w') ? g.x + g.width - newW : g.x;
    const ny = dir.includes('n') ? g.y + g.height - newH : g.y;
    doc.resizeScale(resizeState.id, { x: nx, y: ny, width: newW, height: newH }, factor, resizeState.origChildren);
    return;
  }
  const q = (v: number) => (snap.value ? Math.round(v / GRID) * GRID : Math.round(v));

  // Nur die gezogene Kante bewegen; die gegenüberliegende Kante bleibt fix.
  let left = g.x;
  let top = g.y;
  let right = g.x + g.width;
  let bottom = g.y + g.height;
  if (dir.includes('e')) right = q(right + dx);
  if (dir.includes('w')) left = q(left + dx);
  if (dir.includes('s')) bottom = q(bottom + dy);
  if (dir.includes('n')) top = q(top + dy);
  // Mindestgröße erzwingen (die feste Kante behalten).
  if (right - left < MIN) {
    if (dir.includes('w')) left = right - MIN;
    else right = left + MIN;
  }
  if (bottom - top < MIN) {
    if (dir.includes('n')) top = bottom - MIN;
    else bottom = top + MIN;
  }
  doc.updateGeometry(
    resizeState.id,
    { x: left, y: top, width: right - left, height: bottom - top },
    false,
  );
}

function onResizeUp() {
  resizeState = null;
  window.removeEventListener('pointermove', onResizeMove);
}

function onStageClick() {
  if (!props.preview) doc.select(null);
}

function setZoom(z: number) {
  autoFit.value = false;
  zoom.value = Math.max(0.25, Math.min(3, Math.round(z * 100) / 100));
}
</script>

<template>
  <div class="relative flex min-w-0 flex-1 flex-col bg-[#0b1220]">
    <!-- Werkzeugleiste: Snap / Raster -->
    <div
      v-if="!preview"
      class="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-lg border border-white/10 bg-[#0e1626]/90 p-0.5 text-[11px]"
    >
      <button class="rounded px-2 py-1" :class="snap ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'" :title="t('canvas_snap_title')" @click="snap = !snap">{{ t('canvas_snap') }}</button>
      <button class="rounded px-2 py-1" :class="showGrid ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'" :title="t('canvas_grid_title')" @click="showGrid = !showGrid">{{ t('canvas_grid') }}</button>
      <button
        v-if="ha.entities.length"
        class="rounded px-2 py-1"
        :class="reflect ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'"
        :title="t('canvas_live_title')"
        @click="reflect = !reflect"
      >
        {{ t('canvas_live') }}
      </button>
    </div>

    <!-- Canvas-Fläche -->
    <!-- m-auto statt justify/items-center: zentriert, bleibt aber scrollbar, wenn das Display
         größer als die Fläche ist (sonst wäre der linke/obere Rand unerreichbar). Der Sizer hat
         die gezoomte Größe, damit die Scrollbalken stimmen. -->
    <div ref="viewportRef" class="flex min-h-0 flex-1 overflow-auto p-8" tabindex="0" role="region" :aria-label="t('canvas_area_label')">
      <div
        class="m-auto shrink-0"
        :style="{ width: doc.screen.width * zoom + 'px', height: doc.screen.height * zoom + 'px' }"
      >
      <div
        ref="stageRef"
        data-lvgl-canvas
        class="relative shrink-0 overflow-hidden shadow-2xl"
        :class="preview ? '' : 'select-none ring-1 ring-white/10'"
        :style="{
          width: doc.screen.width + 'px',
          height: doc.screen.height + 'px',
          backgroundColor: doc.screen.bg_color,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
          borderRadius: '12px',
        }"
        @click.self="onStageClick"
        @dragover="onDragOver"
        @drop="onDrop"
        @dragstart.prevent
      >
        <!-- Raster-Punkte -->
        <div
          v-if="showGrid && !preview"
          class="pointer-events-none absolute inset-0"
          :style="{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.09) 1px, transparent 1px)',
            backgroundSize: GRID + 'px ' + GRID + 'px',
          }"
        />
        <!-- Ausrichtungshilfen -->
        <div
          v-for="(gd, i) in activeGuides"
          :key="'g' + i"
          class="pointer-events-none absolute z-[15] bg-pink-500/80"
          :style="
            gd.dir === 'v'
              ? { left: gd.pos + 'px', top: gd.start + 'px', width: '1px', height: gd.len + 'px' }
              : { top: gd.pos + 'px', left: gd.start + 'px', height: '1px', width: gd.len + 'px' }
          "
        />

        <WidgetView
          v-for="node in doc.screen.children"
          :key="node.id"
          :node="node"
          :selected-id="preview ? null : doc.selectedId"
          :selected-ids="preview ? [] : doc.selectedIds"
          @select="() => {}"
          @grab="onGrab"
          @resize="onResize"
        />

        <div
          v-if="!doc.screen.children.length"
          class="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-xs text-gray-600"
        >
          {{ t('canvas_empty') }}<br />{{ t('canvas_empty2') }}
        </div>
      </div>
      </div>
    </div>

    <!-- Zoom-Leiste -->
    <div
      v-if="!preview"
      class="flex items-center justify-end gap-2 border-t border-white/10 px-3 py-1.5 text-[11px] text-gray-400"
    >
      <span>{{ doc.screen.width }} × {{ doc.screen.height }}</span>
      <span class="mx-1 text-white/20">|</span>
      <button class="rounded px-1.5 hover:bg-white/10" :aria-label="t('canvas_zoom_out')" :title="t('canvas_zoom_out')" @click="setZoom(zoom - 0.25)">−</button>
      <span class="w-10 text-center">{{ Math.round(zoom * 100) }}%</span>
      <button class="rounded px-1.5 hover:bg-white/10" :aria-label="t('canvas_zoom_in')" :title="t('canvas_zoom_in')" @click="setZoom(zoom + 0.25)">＋</button>
      <button class="rounded px-1.5 hover:bg-white/10" :title="t('canvas_zoom_fit_title')" @click="fitZoom">{{ t('canvas_zoom_fit') }}</button>
      <button class="rounded px-1.5 hover:bg-white/10" :title="t('canvas_zoom_reset_title')" @click="setZoom(1)">{{ t('canvas_zoom_reset') }}</button>
    </div>
  </div>
</template>
