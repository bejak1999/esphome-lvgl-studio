/**
 * Geo-Mathematik für die Karten-Auswahl und den `bbox`-Output.
 *
 * Die Bounding-Box-Rechnung entspricht der des Esp32Weather-Webtools
 * (`webtool/js/bbox.js`), damit ein am Punkt gewählter Ausschnitt auf dem Gerät exakt
 * so ankommt wie in der Vorschau.
 */

export const KM_PER_DEG_LAT = 111.32;

export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Bounding-Box aus Mittelpunkt + Ost-West-Ausdehnung in km. Die Nord-Süd-Ausdehnung
 * folgt dem Seitenverhältnis der Zielfläche, damit das Bild nicht verzerrt wird.
 */
export function computeBBox(
  centerLat: number,
  centerLon: number,
  widthKm: number,
  widthPx: number,
  heightPx: number,
): BBox {
  const aspect = widthPx > 0 ? heightPx / widthPx : 1;
  const heightKm = widthKm * aspect;
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);
  const halfLon = kmPerDegLon > 0 ? widthKm / 2 / kmPerDegLon : 0;
  const halfLat = heightKm / 2 / KM_PER_DEG_LAT;
  return {
    west: centerLon - halfLon,
    south: centerLat - halfLat,
    east: centerLon + halfLon,
    north: centerLat + halfLat,
  };
}

/** `west,south,east,north` (lon/lat – die üblichen Static-Map-APIs). */
export function formatBBoxWSEN(b: BBox, digits = 6): string {
  const f = (n: number) => n.toFixed(digits);
  return `${f(b.west)},${f(b.south)},${f(b.east)},${f(b.north)}`;
}

/** `south,west,north,east` (lat/lon – WMS 1.3.0 mit EPSG:4326). */
export function formatBBoxSWNE(b: BBox, digits = 6): string {
  const f = (n: number) => n.toFixed(digits);
  return `${f(b.south)},${f(b.west)},${f(b.north)},${f(b.east)}`;
}

// ---------------------------------------------------------------------------
// Slippy-Map-Kachelmathematik (für den Karten-Picker im Editor)
// ---------------------------------------------------------------------------

export function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * Math.pow(2, zoom);
}

export function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

export function tileXToLon(x: number, zoom: number): number {
  return (x / Math.pow(2, zoom)) * 360 - 180;
}

export function tileYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, zoom);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/**
 * Kilometer pro Pixel bei gegebener Breite/Zoomstufe (für den Ausschnitt-Rahmen).
 * 156543.034 m/px ist die Web-Mercator-Auflösung bei Zoom 0 am Äquator.
 */
export function kmPerPixel(lat: number, zoom: number): number {
  return (156.543034 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

export function clampLat(lat: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, lat));
}

export function wrapLon(lon: number): number {
  let l = lon;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}
