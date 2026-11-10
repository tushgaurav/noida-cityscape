import type { FlatCoords, Polygon } from '@noida/city-schema';

export function signedArea(ring: FlatCoords): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) sum += ring[j] * ring[i + 1] - ring[i] * ring[j + 1];
  return sum / 2;
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

export function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq)) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}

export function distanceToRing(e: number, n: number, ring: FlatCoords): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    best = Math.min(best, distanceToSegment(e, n, ring[j], ring[j + 1], ring[i], ring[i + 1]));
  }
  return best;
}

export interface Bounds2 {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

export function ringBounds(ring: FlatCoords): Bounds2 {
  const b = { minE: Infinity, minN: Infinity, maxE: -Infinity, maxN: -Infinity };
  for (let i = 0; i < ring.length; i += 2) {
    b.minE = Math.min(b.minE, ring[i]);
    b.maxE = Math.max(b.maxE, ring[i]);
    b.minN = Math.min(b.minN, ring[i + 1]);
    b.maxN = Math.max(b.maxN, ring[i + 1]);
  }
  return b;
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
  if (Math.abs(area) < 1e-9) return [ring[0], ring[1]];
  return [cx / (3 * area), cy / (3 * area)];
}

export function cumulativeLengths(points: FlatCoords): number[] {
  const out = [0];
  for (let i = 2; i < points.length; i += 2) out.push(out[out.length - 1] + Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]));
  return out;
}

export function longestEdgeAngle(ring: FlatCoords): number {
  let best = 0;
  let angle = 0;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const de = ring[i] - ring[j];
    const dn = ring[i + 1] - ring[j + 1];
    const length = de * de + dn * dn;
    if (length > best) {
      best = length;
      angle = Math.atan2(dn, de);
    }
  }
  return angle;
}

export class Grid<T> {
  private readonly cells = new Map<number, T[]>();
  constructor(private readonly size: number) {}

  private key(x: number, y: number) {
    return (x + 32768) * 65536 + (y + 32768);
  }

  insert(item: T, b: Bounds2) {
    for (let x = Math.floor(b.minE / this.size); x <= Math.floor(b.maxE / this.size); x++) {
      for (let y = Math.floor(b.minN / this.size); y <= Math.floor(b.maxN / this.size); y++) {
        const key = this.key(x, y);
        const cell = this.cells.get(key);
        if (cell) cell.push(item);
        else this.cells.set(key, [item]);
      }
    }
  }

  query(e: number, n: number): readonly T[] {
    return this.cells.get(this.key(Math.floor(e / this.size), Math.floor(n / this.size))) ?? [];
  }
}
