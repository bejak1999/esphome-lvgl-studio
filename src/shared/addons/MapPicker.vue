<script setup lang="ts">
/**
 * Karten-Auswahl (Feldtyp `map`) – ohne externe Bibliothek: die OSM-Kacheln werden
 * direkt als `<img>` positioniert. Klick setzt den Punkt, Ziehen verschiebt die Ansicht,
 * Mausrad zoomt. Der Rahmen zeigt den Ausschnitt, den das Gerät später holt (Breite in km
 * + Seitenverhältnis des Bildes) – dieselbe Rechnung wie im `bbox`-Output.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  clampLat,
  kmPerPixel,
  latToTileY,
  lonToTileX,
  tileXToLon,
  tileYToLat,
  wrapLon,
} from '@/core/addons/geo';
import { useI18n } from '@/shared/i18n';
const { t } = useI18n();

export interface MapValue {
  lat: number;
  lon: number;
  zoom: number;
  spanKm: number;
}

const props = defineProps<{
  modelValue: MapValue;
  spanKm?: { min: number; max: number; default: number };
  /** Seitenverhältnis (Höhe/Breite) des Zielbildes für den Ausschnitt-Rahmen. */
  aspect?: number;
  /** Kachel-URL mit {z}/{x}/{y} (bereits gerendert). Leer = Standardquelle. */
  tileUrl?: string;
  tileAttribution?: string;
}>();
const emit = defineEmits<{ (e: 'update:modelValue', v: MapValue): void }>();

const TILE = 256;
const HEIGHT = 260;

/**
 * Standard-Kachelquelle. **Nicht** tile.openstreetmap.org: dessen Nutzungsregeln
 * verlangen einen Referer bzw. eine identifizierende Anwendung und blocken Anfragen aus
 * einer Extension-Seite mit einer „Access blocked"-Kachel. CARTOs Basemaps (auf
 * OSM-Daten) liefern ohne Schlüssel aus, ein Addon kann per `tileUrl` eine eigene Quelle
 * (z. B. Geoapify mit eigenem Key) vorgeben.
 */
const FALLBACK_TILE_URL = 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
const FALLBACK_ATTRIBUTION = '© OpenStreetMap · © CARTO';

const box = ref<HTMLElement | null>(null);
const width = ref(420);
const view = ref({ lat: props.modelValue.lat, lon: props.modelValue.lon });
const zoom = ref(Math.round(props.modelValue.zoom || 6));
const search = ref('');
const searching = ref(false);
const searchError = ref('');
const tilesBlocked = ref(false);

let ro: ResizeObserver | undefined;
onMounted(() => {
  if (!box.value) return;
  width.value = box.value.clientWidth || 420;
  ro = new ResizeObserver(() => {
    if (box.value) width.value = box.value.clientWidth || width.value;
  });
  ro.observe(box.value);
});
onBeforeUnmount(() => ro?.disconnect());

// Punkt von außen geändert (z. B. Instanz gewechselt) → Ansicht nachziehen.
watch(
  () => [props.modelValue.lat, props.modelValue.lon, props.modelValue.zoom] as const,
  ([lat, lon, z]) => {
    if (dragging) return;
    view.value = { lat, lon };
    zoom.value = Math.round(z || zoom.value);
  },
);

function patch(v: Partial<MapValue>) {
  emit('update:modelValue', { ...props.modelValue, ...v });
}

// ---- Kachel-Raster --------------------------------------------------------

const centerTile = computed(() => ({
  x: lonToTileX(view.value.lon, zoom.value),
  y: latToTileY(clampLat(view.value.lat), zoom.value),
}));

interface Tile {
  key: string;
  url: string;
  left: number;
  top: number;
}

/** Aktive Kachelquelle – fällt nach einem Ladefehler auf die Standardquelle zurück. */
const useFallback = ref(false);
const tileTemplate = computed(() => {
  const t = (props.tileUrl ?? '').trim();
  const usable = t.includes('{z}') && t.includes('{x}') && t.includes('{y}');
  return !usable || useFallback.value ? FALLBACK_TILE_URL : t;
});
const attribution = computed(() =>
  tileTemplate.value === FALLBACK_TILE_URL
    ? FALLBACK_ATTRIBUTION
    : props.tileAttribution || '© OpenStreetMap',
);

function tileUrlFor(z: number, x: number, y: number): string {
  return tileTemplate.value
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/** Erste fehlgeschlagene Kachel schaltet auf die Standardquelle um (Key falsch/blockiert). */
function onTileError() {
  if (useFallback.value || tileTemplate.value === FALLBACK_TILE_URL) {
    tilesBlocked.value = true;
    return;
  }
  useFallback.value = true;
}

// Andere Kachelquelle konfiguriert (z. B. Key nachgetragen) → erneut versuchen.
watch(
  () => props.tileUrl,
  () => {
    useFallback.value = false;
    tilesBlocked.value = false;
  },
);

const tiles = computed<Tile[]>(() => {
  const out: Tile[] = [];
  const n = Math.pow(2, zoom.value);
  const halfW = width.value / 2;
  const halfH = HEIGHT / 2;
  const x0 = Math.floor(centerTile.value.x - halfW / TILE);
  const x1 = Math.ceil(centerTile.value.x + halfW / TILE);
  const y0 = Math.floor(centerTile.value.y - halfH / TILE);
  const y1 = Math.ceil(centerTile.value.y + halfH / TILE);
  for (let ty = y0; ty <= y1; ty += 1) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = x0; tx <= x1; tx += 1) {
      const wx = ((tx % n) + n) % n;
      out.push({
        key: `${tileTemplate.value}|${zoom.value}/${tx}/${ty}`,
        url: tileUrlFor(zoom.value, wx, ty),
        left: Math.round(halfW + (tx - centerTile.value.x) * TILE),
        top: Math.round(halfH + (ty - centerTile.value.y) * TILE),
      });
    }
  }
  return out;
});

/** Pixelposition des gewählten Punktes in der Ansicht. */
const markerPos = computed(() => ({
  left: width.value / 2 + (lonToTileX(props.modelValue.lon, zoom.value) - centerTile.value.x) * TILE,
  top: HEIGHT / 2 + (latToTileY(clampLat(props.modelValue.lat), zoom.value) - centerTile.value.y) * TILE,
}));

/** Ausschnitt-Rahmen: Breite aus km/Pixel, Höhe über das Seitenverhältnis des Bildes. */
const frame = computed(() => {
  const span = props.modelValue.spanKm || props.spanKm?.default || 30;
  const kmPx = kmPerPixel(props.modelValue.lat, zoom.value);
  const w = kmPx > 0 ? span / kmPx : 0;
  const h = w * (props.aspect && props.aspect > 0 ? props.aspect : 0.75);
  return { w, h, visible: w > 4 && w < width.value * 6 };
});

// ---- Interaktion ----------------------------------------------------------

let dragging = false;
let moved = 0;
let last = { x: 0, y: 0 };

function onDown(ev: MouseEvent) {
  dragging = true;
  moved = 0;
  last = { x: ev.clientX, y: ev.clientY };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onMove(ev: MouseEvent) {
  if (!dragging) return;
  const dx = ev.clientX - last.x;
  const dy = ev.clientY - last.y;
  moved += Math.abs(dx) + Math.abs(dy);
  last = { x: ev.clientX, y: ev.clientY };
  const cx = centerTile.value.x - dx / TILE;
  const cy = centerTile.value.y - dy / TILE;
  view.value = { lat: tileYToLat(cy, zoom.value), lon: wrapLon(tileXToLon(cx, zoom.value)) };
}

function onUp(ev: MouseEvent) {
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', onUp);
  dragging = false;
  if (moved < 4) setPointFromEvent(ev);
}

function setPointFromEvent(ev: MouseEvent) {
  const el = box.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const px = ev.clientX - r.left;
  const py = ev.clientY - r.top;
  if (px < 0 || py < 0 || px > r.width || py > r.height) return;
  const tx = centerTile.value.x + (px - width.value / 2) / TILE;
  const ty = centerTile.value.y + (py - HEIGHT / 2) / TILE;
  patch({
    lat: Number(tileYToLat(ty, zoom.value).toFixed(6)),
    lon: Number(wrapLon(tileXToLon(tx, zoom.value)).toFixed(6)),
    zoom: zoom.value,
  });
}

function setZoom(z: number) {
  zoom.value = Math.max(2, Math.min(18, z));
  patch({ zoom: zoom.value });
}

function onWheel(ev: WheelEvent) {
  ev.preventDefault();
  setZoom(zoom.value + (ev.deltaY < 0 ? 1 : -1));
}

function centerOnPoint() {
  view.value = { lat: props.modelValue.lat, lon: props.modelValue.lon };
}

/** Ortssuche über Nominatim (nur auf Enter – die Nutzungsregeln erlauben keine Tipp-Suche). */
async function doSearch() {
  const q = search.value.trim();
  if (!q) return;
  searching.value = true;
  searchError.value = '';
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const list = (await res.json()) as { lat: string; lon: string }[];
    if (!list.length) {
      searchError.value = t('map_no_hit');
      return;
    }
    const lat = Number(list[0].lat);
    const lon = Number(list[0].lon);
    view.value = { lat, lon };
    zoom.value = Math.max(zoom.value, 11);
    patch({ lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)), zoom: zoom.value });
  } catch (e) {
    searchError.value = (e as Error).message;
  } finally {
    searching.value = false;
  }
}
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex gap-1.5">
      <input
        v-model="search"
        :placeholder="t('map_search')"
        class="min-w-0 flex-1 rounded-lg border border-white/10 bg-field px-2 py-1 text-[11px] text-gray-100 placeholder-gray-500 focus:border-blue-500/60 focus:outline-none"
        @keydown.enter.prevent="doSearch"
      />
      <button
        class="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5"
        :title="t('map_center')" :aria-label="t('map_center')"
        @click="centerOnPoint"
      >
        ⌖
      </button>
      <button class="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5" @click="setZoom(zoom - 1)">−</button>
      <span class="w-6 self-center text-center text-[10px] text-gray-500">{{ zoom }}</span>
      <button class="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5" @click="setZoom(zoom + 1)">+</button>
    </div>
    <p v-if="searchError" class="text-[10px] text-amber-400">{{ searchError }}</p>
    <p v-else-if="searching" class="text-[10px] text-gray-500">{{ t('map_searching') }}</p>

    <div
      ref="box"
      class="relative select-none overflow-hidden rounded-lg border border-white/10 bg-field"
      :style="{ height: HEIGHT + 'px', cursor: 'crosshair' }"
      @mousedown.prevent="onDown"
      @wheel="onWheel"
    >
      <img
        v-for="t in tiles"
        :key="t.key"
        :src="t.url"
        alt=""
        draggable="false"
        class="pointer-events-none absolute"
        :style="{ left: t.left + 'px', top: t.top + 'px', width: '256px', height: '256px' }"
        @error="onTileError"
      />

      <!-- Ausschnitt, den das Gerät später lädt -->
      <div
        v-if="frame.visible"
        class="pointer-events-none absolute border-2 border-blue-400/80 bg-blue-400/10"
        :style="{
          left: markerPos.left - frame.w / 2 + 'px',
          top: markerPos.top - frame.h / 2 + 'px',
          width: frame.w + 'px',
          height: frame.h + 'px',
        }"
      />
      <!-- gewählter Punkt -->
      <div
        class="pointer-events-none absolute h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500"
        :style="{ left: markerPos.left - 5 + 'px', top: markerPos.top - 5 + 'px' }"
      />

      <div class="pointer-events-none absolute bottom-0 right-0 bg-black/50 px-1 text-[9px] text-gray-300">
        {{ attribution }}
      </div>
      <div
        v-if="tilesBlocked"
        class="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-amber-300"
      >
        {{ t('map_tiles_failed') }}
      </div>
    </div>

    <div class="flex items-center gap-2">
      <label class="text-[10px] text-gray-500">{{ t('map_span') }}</label>
      <input
        type="range"
        :min="spanKm?.min ?? 2"
        :max="spanKm?.max ?? 200"
        step="1"
        :value="modelValue.spanKm"
        class="min-w-0 flex-1"
        @input="patch({ spanKm: Number(($event.target as HTMLInputElement).value) })"
      />
      <span class="w-14 text-right text-[10px] text-gray-400">{{ modelValue.spanKm }} km</span>
    </div>

    <div class="flex gap-1.5">
      <label class="flex flex-1 items-center gap-1 text-[10px] text-gray-500">
        Lat
        <input
          type="number"
          step="0.000001"
          :value="modelValue.lat"
          class="min-w-0 flex-1 rounded border border-white/10 bg-field px-1.5 py-0.5 text-[11px] text-gray-100"
          @change="patch({ lat: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
      <label class="flex flex-1 items-center gap-1 text-[10px] text-gray-500">
        Lon
        <input
          type="number"
          step="0.000001"
          :value="modelValue.lon"
          class="min-w-0 flex-1 rounded border border-white/10 bg-field px-1.5 py-0.5 text-[11px] text-gray-100"
          @change="patch({ lon: Number(($event.target as HTMLInputElement).value) })"
        />
      </label>
    </div>
  </div>
</template>
