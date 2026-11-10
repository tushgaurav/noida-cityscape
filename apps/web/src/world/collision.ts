import type { Building, CityData } from '@noida/city-schema';
import { Grid, distanceToRing, pointInPolygon, ringBounds } from '../lib/geo2d';

interface Entry {
  building: Building;
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

interface StreetSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  verge: number;
}

const WALKABLE_STREETS = new Set(['primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street']);

export class CollisionWorld {
  private readonly grid = new Grid<Entry>(40);
  private readonly streets = new Grid<StreetSegment>(60);
  readonly bounds: CityData['meta']['bounds'];

  constructor(city: CityData) {
    this.bounds = city.meta.bounds;
    for (const building of city.buildings) {
      const b = ringBounds(building.polygon[0]);
      this.grid.insert({ building, ...b }, b);
    }
    for (const road of city.roads) {
      if (!WALKABLE_STREETS.has(road.kind) || road.bridge || road.tunnel) continue;
      for (let i = 2; i < road.points.length; i += 2) {
        const segment = { ax: road.points[i - 2], ay: road.points[i - 1], bx: road.points[i], by: road.points[i + 1], verge: road.width / 2 + 1.3 };
        this.streets.insert(segment, {
          minE: Math.min(segment.ax, segment.bx),
          minN: Math.min(segment.ay, segment.by),
          maxE: Math.max(segment.ax, segment.bx),
          maxN: Math.max(segment.ay, segment.by),
        });
      }
    }
  }

  /** Nearest footpath beside a street, with the bearing (radians, three.js yaw) that faces along it. */
  nearestStreetSpot(e: number, n: number, searchRadius = 300): { e: number; n: number; yaw: number } | null {
    let best: { e: number; n: number; yaw: number; distance: number } | null = null;
    const seen = new Set<StreetSegment>();
    for (let dx = -searchRadius; dx <= searchRadius; dx += 60) {
      for (let dy = -searchRadius; dy <= searchRadius; dy += 60) {
        for (const s of this.streets.query(e + dx, n + dy)) {
          if (seen.has(s)) continue;
          seen.add(s);
          const vx = s.bx - s.ax;
          const vy = s.by - s.ay;
          const length = Math.hypot(vx, vy);
          if (length < 4) continue;
          const t = Math.max(0, Math.min(1, ((e - s.ax) * vx + (n - s.ay) * vy) / (length * length)));
          const side = (e - s.ax) * -vy + (n - s.ay) * vx >= 0 ? 1 : -1;
          const pe = s.ax + vx * t + (-vy / length) * s.verge * side;
          const pn = s.ay + vy * t + (vx / length) * s.verge * side;
          const distance = Math.hypot(pe - e, pn - n);
          if (best && distance >= best.distance) continue;
          if (this.blocked(pe, pn, 0.5)) continue;
          best = { e: pe, n: pn, yaw: Math.atan2(-vx, vy), distance };
        }
      }
    }
    return best;
  }

  /** True when a body of `radius` at planar (e, n) and height y intersects a building. */
  blocked(e: number, n: number, radius: number, y = 1): boolean {
    for (const entry of this.grid.query(e, n)) {
      const { building } = entry;
      if (e < entry.minE - radius || e > entry.maxE + radius || n < entry.minN - radius || n > entry.maxN + radius) continue;
      if (y > building.height + 0.4 || y < building.minHeight - 2.2) continue;
      if (pointInPolygon(e, n, building.polygon) || distanceToRing(e, n, building.polygon[0]) < radius) return true;
    }
    return false;
  }

  roofHeightAt(e: number, n: number): number {
    let height = 0;
    for (const entry of this.grid.query(e, n)) {
      if (pointInPolygon(e, n, entry.building.polygon)) height = Math.max(height, entry.building.height);
    }
    return height;
  }

  /** Spirals outwards from (e, n) to the nearest point a pedestrian can stand on. */
  nearestFree(e: number, n: number, radius = 0.5): [number, number] {
    if (!this.blocked(e, n, radius)) return [e, n];
    for (let ring = 1; ring < 60; ring++) {
      const r = ring * 2.5;
      const steps = Math.max(8, ring * 6);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const pe = e + Math.cos(a) * r;
        const pn = n + Math.sin(a) * r;
        if (!this.blocked(pe, pn, radius)) return [pe, pn];
      }
    }
    return [e, n];
  }

  clampToBounds(e: number, n: number, margin = 0): [number, number] {
    return [
      Math.min(Math.max(e, this.bounds.minE - margin), this.bounds.maxE + margin),
      Math.min(Math.max(n, this.bounds.minN - margin), this.bounds.maxN + margin),
    ];
  }
}
