import { type Area, type AreaKind, type Building, type RailLine, type RoadSegment, TreeSource } from '@noida/city-schema';
import { type PipelineContext, projectGeometry } from '../context';
import {
  boundsContain,
  coordsBounds,
  distanceToSegment,
  lineLength,
  pointInPolygon,
  pointInRing,
  round1,
} from '../geometry';
import type { OsmIndex } from '../osm';
import { mulberry32 } from '../random';
import { GridIndex } from '../spatial';

const AREA_TREES: Partial<Record<AreaKind, { spacing?: number; edge?: number }>> = {
  forest: { spacing: 7 },
  park: { spacing: 17, edge: 9 },
  garden: { spacing: 12, edge: 8 },
  grass: { spacing: 26 },
  scrub: { spacing: 13 },
  cemetery: { spacing: 14 },
  campus: { spacing: 32, edge: 12 },
  hospital_grounds: { spacing: 28, edge: 12 },
  residential: { spacing: 36 },
  religious: { spacing: 22 },
  parking: { spacing: 24 },
  military: { spacing: 16 },
  brownfield: { spacing: 40 },
  farmland: { edge: 14 },
  commercial: { spacing: 60 },
  industrial: { spacing: 70 },
};

const EXCLUDED_AREAS = new Set<AreaKind>(['water', 'pool', 'pitch', 'wetland', 'construction']);

const STREET_TREES: Partial<Record<RoadSegment['kind'], { spacing: number; probability: number; verge: number }>> = {
  trunk: { spacing: 12, probability: 0.75, verge: 4 },
  primary: { spacing: 11, probability: 0.8, verge: 3.5 },
  secondary: { spacing: 11, probability: 0.8, verge: 3.5 },
  tertiary: { spacing: 12, probability: 0.75, verge: 3 },
  unclassified: { spacing: 14, probability: 0.5, verge: 2.4 },
  residential: { spacing: 13, probability: 0.55, verge: 2.2 },
};

const MAX_TREES = 32000;

interface SegmentEntry {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  clearance: number;
}

export function generateTrees(
  osm: OsmIndex,
  ctx: PipelineContext,
  buildings: Building[],
  roads: RoadSegment[],
  rail: RailLine[],
  areas: Area[],
): number[] {
  const rand = mulberry32(ctx.seed * 7919 + 17);
  const buildingGrid = new GridIndex<Building>(50);
  for (const building of buildings) buildingGrid.insert(building, coordsBounds(building.polygon[0]));

  const segmentGrid = new GridIndex<SegmentEntry>(40);
  const addSegments = (points: number[], clearance: number) => {
    for (let i = 2; i < points.length; i += 2) {
      const entry = { ax: points[i - 2], ay: points[i - 1], bx: points[i], by: points[i + 1], clearance };
      segmentGrid.insert(entry, {
        minE: Math.min(entry.ax, entry.bx) - clearance,
        minN: Math.min(entry.ay, entry.by) - clearance,
        maxE: Math.max(entry.ax, entry.bx) + clearance,
        maxN: Math.max(entry.ay, entry.by) + clearance,
      });
    }
  };
  for (const road of roads) {
    if (road.tunnel) continue;
    addSegments(road.points, road.width / 2 + (road.kind === 'footway' || road.kind === 'path' ? 0.6 : 1.6));
  }
  for (const line of rail) addSegments(line.points, line.elevated ? 4.5 : 3.5);

  const exclusionGrid = new GridIndex<Area>(80);
  for (const area of areas) if (EXCLUDED_AREAS.has(area.kind)) exclusionGrid.insert(area, coordsBounds(area.polygon[0]));

  const blocked = (e: number, n: number) => {
    if (!boundsContain(ctx.bounds, e, n)) return true;
    for (const segment of segmentGrid.query(e, n)) {
      if (distanceToSegment(e, n, segment.ax, segment.ay, segment.bx, segment.by) < segment.clearance) return true;
    }
    for (const building of buildingGrid.query(e, n)) {
      const ring = building.polygon[0];
      if (pointInRing(e, n, ring)) return true;
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        if (distanceToSegment(e, n, ring[j], ring[j + 1], ring[i], ring[i + 1]) < 1.8) return true;
      }
    }
    for (const area of exclusionGrid.query(e, n)) if (pointInPolygon(e, n, area.polygon)) return true;
    return false;
  };

  const trees: number[] = [];
  const plant = (e: number, n: number, source: number) => trees.push(round1(e), round1(n), source);

  for (const node of osm.nodes) {
    if (node.tags?.natural !== 'tree') continue;
    const [e, n] = ctx.projection.toPlanar(node.lat, node.lon);
    if (boundsContain(ctx.bounds, e, n)) plant(e, n, TreeSource.osm);
  }
  for (const way of osm.ways) {
    if (way.tags?.natural !== 'tree_row') continue;
    const points = projectGeometry(way.geometry, ctx);
    walkLine(points, 8, 0, (e, n) => boundsContain(ctx.bounds, e, n) && plant(e, n, TreeSource.osm), 1, rand);
  }

  for (const area of areas) {
    const config = AREA_TREES[area.kind];
    if (!config) continue;
    const outer = area.polygon[0];
    if (config.spacing) {
      const b = coordsBounds(outer);
      const s = config.spacing;
      for (let e = b.minE + s / 2; e < b.maxE; e += s) {
        for (let n = b.minN + s / 2; n < b.maxN; n += s) {
          const te = e + (rand() - 0.5) * s * 0.8;
          const tn = n + (rand() - 0.5) * s * 0.8;
          if (pointInPolygon(te, tn, area.polygon) && !blocked(te, tn)) plant(te, tn, TreeSource.area);
        }
      }
    }
    if (config.edge) {
      for (let i = 0, j = outer.length - 2; i < outer.length; j = i, i += 2) {
        const ax = outer[j];
        const ay = outer[j + 1];
        const length = Math.hypot(outer[i] - ax, outer[i + 1] - ay);
        if (length < 4) continue;
        const nx = -(outer[i + 1] - ay) / length;
        const ny = (outer[i] - ax) / length;
        for (let d = rand() * config.edge; d < length; d += config.edge * (0.8 + rand() * 0.4)) {
          const t = d / length;
          const te = ax + (outer[i] - ax) * t + nx * 3.5;
          const tn = ay + (outer[i + 1] - ay) * t + ny * 3.5;
          if (pointInPolygon(te, tn, area.polygon) && !blocked(te, tn)) plant(te, tn, TreeSource.area);
        }
      }
    }
  }

  for (const road of roads) {
    const config = STREET_TREES[road.kind];
    if (!config || road.bridge || road.tunnel || road.link || lineLength(road.points) < 20) continue;
    for (const side of [1, -1]) {
      walkLine(road.points, config.spacing, road.width / 2 + config.verge, (e, n) => {
        if (rand() < config.probability && !blocked(e, n)) plant(e, n, TreeSource.street);
      }, side, rand);
    }
  }

  if (trees.length / 3 > MAX_TREES) {
    const keepRatio = MAX_TREES / (trees.length / 3);
    const thinned: number[] = [];
    for (let i = 0; i < trees.length; i += 3) {
      if (trees[i + 2] === TreeSource.osm || rand() < keepRatio) thinned.push(trees[i], trees[i + 1], trees[i + 2]);
    }
    return thinned;
  }
  return trees;
}

function walkLine(
  points: number[],
  spacing: number,
  offset: number,
  visit: (e: number, n: number) => void,
  side: number,
  rand: () => number,
) {
  let carry = spacing * 0.5;
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2];
    const ay = points[i - 1];
    const dx = points[i] - ax;
    const dy = points[i + 1] - ay;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) continue;
    const nx = (-dy / length) * side;
    const ny = (dx / length) * side;
    let d = carry;
    while (d < length) {
      visit(ax + (dx * d) / length + nx * offset, ay + (dy * d) / length + ny * offset);
      d += spacing * (0.85 + rand() * 0.3);
    }
    carry = d - length;
  }
}
