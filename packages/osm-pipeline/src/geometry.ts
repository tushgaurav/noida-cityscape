import type { FlatCoords, PlanarBounds, Polygon } from '@noida/city-schema';

export function signedArea(ring: FlatCoords): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    sum += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  }
  return sum / 2;
}

export function reverseCoords(coords: FlatCoords): FlatCoords {
  const out = new Array<number>(coords.length);
  for (let i = 0, j = coords.length - 2; j >= 0; i += 2, j -= 2) {
    out[i] = coords[j];
    out[i + 1] = coords[j + 1];
  }
  return out;
}

export function orientRing(ring: FlatCoords, counterClockwise: boolean): FlatCoords {
  return signedArea(ring) > 0 === counterClockwise ? ring : reverseCoords(ring);
}

function segmentDistanceSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lengthSq : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = ax + t * dx - px;
  const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

export const distanceToSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number) =>
  Math.sqrt(segmentDistanceSq(px, py, ax, ay, bx, by));

export function simplifyLine(coords: FlatCoords, tolerance: number): FlatCoords {
  const count = coords.length / 2;
  if (count <= 2 || tolerance <= 0) return coords.slice();
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const toleranceSq = tolerance * tolerance;
  const stack = [0, count - 1];
  while (stack.length) {
    const last = stack.pop()!;
    const first = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = segmentDistanceSq(
        coords[i * 2],
        coords[i * 2 + 1],
        coords[first * 2],
        coords[first * 2 + 1],
        coords[last * 2],
        coords[last * 2 + 1],
      );
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index >= 0 && maxDistance > toleranceSq) {
      keep[index] = 1;
      stack.push(first, index, index, last);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) if (keep[i]) out.push(coords[i * 2], coords[i * 2 + 1]);
  return out;
}

const samePoint = (ax: number, ay: number, bx: number, by: number, epsilon = 0.01) =>
  Math.abs(ax - bx) < epsilon && Math.abs(ay - by) < epsilon;

export function dedupeCoords(coords: FlatCoords): FlatCoords {
  const out: number[] = [];
  for (let i = 0; i < coords.length; i += 2) {
    const len = out.length;
    if (len >= 2 && samePoint(out[len - 2], out[len - 1], coords[i], coords[i + 1])) continue;
    out.push(coords[i], coords[i + 1]);
  }
  return out;
}

/** Removes the closing vertex, duplicates and near-collinear points. Returns null for degenerate rings. */
export function normaliseRing(coords: FlatCoords, tolerance = 0.15, minArea = 1): FlatCoords | null {
  const points = dedupeCoords(coords);
  while (points.length >= 4 && samePoint(points[0], points[1], points[points.length - 2], points[points.length - 1])) {
    points.length -= 2;
  }
  if (points.length < 6) return null;
  const closed = simplifyLine([...points, points[0], points[1]], tolerance);
  closed.length -= 2;
  if (closed.length < 6 || Math.abs(signedArea(closed)) < minArea) return null;
  return closed;
}

export function pointInRing(e: number, n: number, ring: FlatCoords): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i];
    const yi = ring[i + 1];
    const xj = ring[j];
    const yj = ring[j + 1];
    if (yi > n !== yj > n && e < ((xj - xi) * (n - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(e: number, n: number, polygon: Polygon): boolean {
  if (!pointInRing(e, n, polygon[0])) return false;
  for (let k = 1; k < polygon.length; k++) if (pointInRing(e, n, polygon[k])) return false;
  return true;
}

export function ringCentroid(ring: FlatCoords): [number, number] {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const f = ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
    area += f;
    cx += (ring[j] + ring[i]) * f;
    cy += (ring[j + 1] + ring[i + 1]) * f;
  }
  if (Math.abs(area) < 1e-9) {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < ring.length; i += 2) {
      sx += ring[i];
      sy += ring[i + 1];
    }
    return [sx / (ring.length / 2), sy / (ring.length / 2)];
  }
  return [cx / (3 * area), cy / (3 * area)];
}

export function coordsBounds(coords: FlatCoords): PlanarBounds {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  for (let i = 0; i < coords.length; i += 2) {
    if (coords[i] < minE) minE = coords[i];
    if (coords[i] > maxE) maxE = coords[i];
    if (coords[i + 1] < minN) minN = coords[i + 1];
    if (coords[i + 1] > maxN) maxN = coords[i + 1];
  }
  return { minE, minN, maxE, maxN };
}

export const expandBounds = (b: PlanarBounds, margin: number): PlanarBounds => ({
  minE: b.minE - margin,
  minN: b.minN - margin,
  maxE: b.maxE + margin,
  maxN: b.maxN + margin,
});

export const boundsContain = (b: PlanarBounds, e: number, n: number) =>
  e >= b.minE && e <= b.maxE && n >= b.minN && n <= b.maxN;

const boundsOverlap = (a: PlanarBounds, b: PlanarBounds) =>
  a.minE <= b.maxE && a.maxE >= b.minE && a.minN <= b.maxN && a.maxN >= b.minN;

function clipAgainst(
  points: FlatCoords,
  inside: (e: number, n: number) => boolean,
  intersect: (ae: number, an: number, be: number, bn: number) => [number, number],
): FlatCoords {
  const out: number[] = [];
  const len = points.length;
  if (!len) return out;
  let pe = points[len - 2];
  let pn = points[len - 1];
  let pIn = inside(pe, pn);
  for (let i = 0; i < len; i += 2) {
    const ce = points[i];
    const cn = points[i + 1];
    const cIn = inside(ce, cn);
    if (cIn !== pIn) out.push(...intersect(pe, pn, ce, cn));
    if (cIn) out.push(ce, cn);
    pe = ce;
    pn = cn;
    pIn = cIn;
  }
  return out;
}

const atE = (e: number) => (ae: number, an: number, be: number, bn: number): [number, number] => [
  e,
  an + ((bn - an) * (e - ae)) / (be - ae),
];
const atN = (n: number) => (ae: number, an: number, be: number, bn: number): [number, number] => [
  ae + ((be - ae) * (n - an)) / (bn - an),
  n,
];

/** Sutherland–Hodgman clip of a ring against an axis-aligned rectangle. */
export function clipRingToBounds(ring: FlatCoords, b: PlanarBounds): FlatCoords | null {
  const rb = coordsBounds(ring);
  if (!boundsOverlap(rb, b)) return null;
  if (rb.minE >= b.minE && rb.maxE <= b.maxE && rb.minN >= b.minN && rb.maxN <= b.maxN) return ring;
  let points = clipAgainst(ring, (e) => e >= b.minE, atE(b.minE));
  points = clipAgainst(points, (e) => e <= b.maxE, atE(b.maxE));
  points = clipAgainst(points, (_, n) => n >= b.minN, atN(b.minN));
  points = clipAgainst(points, (_, n) => n <= b.maxN, atN(b.maxN));
  return normaliseRing(points, 0.05);
}

export function clipPolygonToBounds(polygon: Polygon, b: PlanarBounds): Polygon | null {
  const outer = clipRingToBounds(polygon[0], b);
  if (!outer) return null;
  const holes: FlatCoords[] = [];
  for (let k = 1; k < polygon.length; k++) {
    const hole = clipRingToBounds(polygon[k], b);
    if (hole) holes.push(orientRing(hole, false));
  }
  return [orientRing(outer, true), ...holes];
}

function clipSegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  b: PlanarBounds,
): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const checks: [number, number][] = [
    [-dx, x0 - b.minE],
    [dx, b.maxE - x0],
    [-dy, y0 - b.minN],
    [dy, b.maxN - y0],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [t0, t1];
}

export interface PathVertex {
  e: number;
  n: number;
  id: number;
}

/** Liang–Barsky clip of a polyline; boundary crossings get ids from `nextId`. */
export function clipPath(path: PathVertex[], b: PlanarBounds, nextId: () => number): PathVertex[][] {
  const pieces: PathVertex[][] = [];
  let current: PathVertex[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const c = path[i + 1];
    const clipped = clipSegment(a.e, a.n, c.e, c.n, b);
    if (!clipped) {
      if (current.length >= 2) pieces.push(current);
      current = [];
      continue;
    }
    const [t0, t1] = clipped;
    const lerp = (t: number): PathVertex => ({ e: a.e + (c.e - a.e) * t, n: a.n + (c.n - a.n) * t, id: nextId() });
    if (current.length === 0) current.push(t0 <= 0 ? a : lerp(t0));
    current.push(t1 >= 1 ? c : lerp(t1));
    if (t1 < 1) {
      if (current.length >= 2) pieces.push(current);
      current = [];
    }
  }
  if (current.length >= 2) pieces.push(current);
  return pieces;
}

export function clipLine(coords: FlatCoords, b: PlanarBounds): FlatCoords[] {
  const path: PathVertex[] = [];
  for (let i = 0; i < coords.length; i += 2) path.push({ e: coords[i], n: coords[i + 1], id: -1 });
  return clipPath(path, b, () => -1).map((piece) => piece.flatMap((v) => [v.e, v.n]));
}

export function lineLength(coords: FlatCoords): number {
  let length = 0;
  for (let i = 2; i < coords.length; i += 2) length += Math.hypot(coords[i] - coords[i - 2], coords[i + 1] - coords[i - 1]);
  return length;
}

/** Joins open way fragments that share endpoints into closed rings. */
export function assembleRings(lines: FlatCoords[]): FlatCoords[] {
  const pending = lines.filter((line) => line.length >= 4).map((line) => line.slice());
  const rings: FlatCoords[] = [];
  const isClosed = (c: FlatCoords) => c.length >= 8 && samePoint(c[0], c[1], c[c.length - 2], c[c.length - 1]);
  while (pending.length) {
    let current = pending.pop()!;
    while (!isClosed(current)) {
      const endE = current[current.length - 2];
      const endN = current[current.length - 1];
      let found = -1;
      let reversed = false;
      for (let k = 0; k < pending.length; k++) {
        const candidate = pending[k];
        if (samePoint(candidate[0], candidate[1], endE, endN)) {
          found = k;
          break;
        }
        if (samePoint(candidate[candidate.length - 2], candidate[candidate.length - 1], endE, endN)) {
          found = k;
          reversed = true;
          break;
        }
      }
      if (found < 0) break;
      const next = pending.splice(found, 1)[0];
      current = current.concat((reversed ? reverseCoords(next) : next).slice(2));
    }
    if (isClosed(current)) rings.push(current);
  }
  return rings;
}

export function buildPolygons(outers: FlatCoords[], inners: FlatCoords[]): Polygon[] {
  const polygons: Polygon[] = [];
  for (const raw of outers) {
    const ring = normaliseRing(raw);
    if (ring) polygons.push([orientRing(ring, true)]);
  }
  for (const raw of inners) {
    const ring = normaliseRing(raw);
    if (!ring) continue;
    const owner = polygons.find((polygon) => pointInRing(ring[0], ring[1], polygon[0]));
    owner?.push(orientRing(ring, false));
  }
  return polygons;
}

export const round1 = (value: number) => Math.round(value * 10) / 10;

export const roundCoords = (coords: FlatCoords) => coords.map(round1);
