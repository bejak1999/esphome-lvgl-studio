/**
 * Line-Punkte ↔ Widget-Box.
 *
 * LVGL zeichnet die Punkte einer `line` relativ zum Widget-Ursprung; die Widget-Größe
 * beeinflusst die Zeichnung nicht. Im Editor führte das dazu, dass der Auswahlrahmen und
 * die tatsächliche Linie nichts miteinander zu tun hatten – Ziehen am Griff änderte die
 * Länge nicht. Deshalb halten wir beide Seiten synchron: die Box ist immer die Hüllbox
 * der Punkte, und ein Resize skaliert die Punkte mit.
 */

export type Point = [number, number];

/** „0,0 160,0" → [[0,0],[160,0]]. Toleriert Klammern, Semikolons und Zeilenumbrüche. */
export function parseLinePoints(value: unknown): Point[] {
  const nums = (String(value ?? '').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

export function formatLinePoints(pts: Point[]): string {
  return pts.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ');
}

/** Hüllbox der Punkte. Bei weniger als zwei Punkten `null`. */
export function linePointsBBox(pts: Point[]): { x: number; y: number; width: number; height: number } | null {
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Bildet die Punkte auf eine neue Box ab. Achsen ohne Ausdehnung (waagerechte bzw.
 * senkrechte Linie) werden mittig gesetzt – so bleibt die Linie beim Ziehen im Rahmen,
 * statt an der Oberkante zu kleben.
 */
export function fitLinePointsToBox(value: unknown, width: number, height: number): string | null {
  const pts = parseLinePoints(value);
  const bb = linePointsBBox(pts);
  if (!bb) return null;
  const map = (v: number, min: number, span: number, size: number) =>
    span > 0 ? ((v - min) / span) * size : size / 2;
  return formatLinePoints(
    pts.map(([x, y]) => [map(x, bb.x, bb.width, width), map(y, bb.y, bb.height, height)] as Point),
  );
}

/**
 * Normalisiert die Punkte auf den Ursprung (0,0) und liefert die passende Box-Größe.
 * Wird benutzt, wenn der Nutzer die Punkte direkt eintippt – dann folgt der Rahmen.
 */
export function boxForLinePoints(value: unknown): { points: string; width: number; height: number } | null {
  const pts = parseLinePoints(value);
  const bb = linePointsBBox(pts);
  if (!bb) return null;
  return {
    points: formatLinePoints(pts.map(([x, y]) => [x - bb.x, y - bb.y] as Point)),
    width: Math.max(1, Math.round(bb.width)),
    height: Math.max(1, Math.round(bb.height)),
  };
}
