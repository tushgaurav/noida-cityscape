import type { CityData, RoadKind, RoadSegment } from '@noida/city-schema';
import { seeded } from '../../lib/random';
import type { MeshData } from '../types';
import { GeometryBuilder, type PathFrame, createColoredBuilder, pathFrames, pushBox, pushQuad } from './GeometryBuilder';
import { ROAD_KIND_CODE, ROAD_TIER, linearRgb } from './palette';

const SIDEWALK: Partial<Record<RoadKind, number>> = {
  trunk: 3,
  primary: 3,
  secondary: 3,
  tertiary: 2.6,
  unclassified: 1.8,
  residential: 1.6,
  living_street: 1.2,
};

const LAMPS: Partial<Record<RoadKind, { spacing: number; probability: number }>> = {
  trunk: { spacing: 36, probability: 1 },
  primary: { spacing: 34, probability: 1 },
  secondary: { spacing: 34, probability: 1 },
  tertiary: { spacing: 36, probability: 0.95 },
  unclassified: { spacing: 44, probability: 0.6 },
  residential: { spacing: 46, probability: 0.5 },
};

const TIER_Y = [0.09, 0.08, 0.07, 0.06];
const SIDEWALK_Y = 0.045;
const DECK_DEPTH = 1.5;
const CONCRETE = linearRgb('#bdb7ac');
const CONCRETE_DARK = linearRgb('#8f8a80');
const BARRIER = linearRgb('#d5d0c6');

type RoadBuilder = GeometryBuilder<'position' | 'normal' | 'uv' | 'aRoad' | 'aSpan'>;
type WalkBuilder = GeometryBuilder<'position' | 'normal' | 'uv' | 'aWalk'>;

export interface RoadNodeInfo {
  maxWidth: number;
  tier: number;
  kindCode: number;
  elevation: number;
  degree: number;
  sidewalk: number;
}

export function analyseNodes(city: CityData): RoadNodeInfo[] {
  const info: RoadNodeInfo[] = city.roadNodes.map(() => ({ maxWidth: 0, tier: 3, kindCode: 14, elevation: 0, degree: 0, sidewalk: 0 }));
  for (const road of city.roads) {
    if (road.tunnel) continue;
    const ends: [number, number][] = [
      [road.from, road.elevation?.[0] ?? 0],
      [road.to, road.elevation?.[road.elevation.length - 1] ?? 0],
    ];
    for (const [node, elevation] of ends) {
      const n = info[node];
      n.degree++;
      n.maxWidth = Math.max(n.maxWidth, road.width);
      n.tier = Math.min(n.tier, ROAD_TIER[road.kind]);
      n.kindCode = Math.min(n.kindCode, ROAD_KIND_CODE[road.kind]);
      n.elevation = Math.max(n.elevation, elevation);
      if (!road.bridge && !road.link) n.sidewalk = Math.max(n.sidewalk, SIDEWALK[road.kind] ?? 0);
    }
  }
  return info;
}

function ribbonIndices(indices: number[], base: number, count: number) {
  for (let i = 0; i < count - 1; i++) {
    const l0 = base + i * 2;
    const r0 = l0 + 1;
    const l1 = l0 + 2;
    const r1 = l0 + 3;
    indices.push(r0, r1, l1, r0, l1, l0);
  }
}

function emitRoad(b: RoadBuilder, road: RoadSegment, frames: PathFrame[], clearStart: number, clearEnd: number) {
  const hw = road.width / 2;
  const y = TIER_Y[ROAD_TIER[road.kind]];
  const length = frames[frames.length - 1].s;
  const base = b.vertexCount;
  const attrs = [ROAD_KIND_CODE[road.kind], road.lanes, road.oneway ? 1 : 0, road.width];
  for (const f of frames) {
    for (const side of [1, -1]) {
      b.data.position.push(f.x + f.lx * hw * side, f.y + y, f.z + f.lz * hw * side);
      b.data.normal.push(0, 1, 0);
      b.data.uv.push(f.s, side);
      b.data.aRoad.push(...attrs);
      b.data.aSpan.push(length, clearStart, clearEnd, 0);
    }
  }
  ribbonIndices(b.indices, base, frames.length);
}

function emitSidewalk(b: WalkBuilder, road: RoadSegment, frames: PathFrame[], width: number) {
  const hw = road.width / 2;
  const outer = hw + width;
  const base = b.vertexCount;
  for (const f of frames) {
    for (const side of [1, -1]) {
      b.data.position.push(f.x + f.lx * outer * side, SIDEWALK_Y, f.z + f.lz * outer * side);
      b.data.normal.push(0, 1, 0);
      b.data.uv.push(f.s, outer * side);
      b.data.aWalk.push(hw, outer);
    }
  }
  ribbonIndices(b.indices, base, frames.length);
}

function emitDisc(
  b: GeometryBuilder<string>,
  x: number,
  y: number,
  z: number,
  radius: number,
  center: Record<string, number[]>,
  rim: Record<string, number[]>,
) {
  const segments = 18;
  const base = b.vertexCount;
  const push = (px: number, pz: number, extra: Record<string, number[]>) => {
    b.data.position.push(px, y, pz);
    b.data.normal.push(0, 1, 0);
    for (const [key, values] of Object.entries(extra)) b.data[key].push(...values);
  };
  push(x, z, center);
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    push(x + Math.cos(a) * radius, z + Math.sin(a) * radius, rim);
  }
  for (let i = 0; i < segments; i++) b.indices.push(base, base + 2 + i, base + 1 + i);
}

function emitBridge(b: ReturnType<typeof createColoredBuilder>, road: RoadSegment, frames: PathFrame[], rand: () => number) {
  const hw = road.width / 2;
  const y = TIER_Y[ROAD_TIER[road.kind]];
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const c = frames[i + 1];
    if (a.y < 0.4 && c.y < 0.4) continue;
    const edge = (f: PathFrame, side: number, dy: number): [number, number, number] => [
      f.x + f.lx * hw * side,
      Math.max(0, f.y + dy),
      f.z + f.lz * hw * side,
    ];
    const ln = Math.hypot(a.lx, a.lz) || 1;
    const left: [number, number, number] = [a.lx / ln, 0, a.lz / ln];
    const right: [number, number, number] = [-left[0], 0, -left[2]];
    pushQuad(b, [edge(c, 1, -DECK_DEPTH), edge(a, 1, -DECK_DEPTH), edge(a, 1, y + 0.95), edge(c, 1, y + 0.95)], left, CONCRETE);
    pushQuad(b, [edge(a, -1, -DECK_DEPTH), edge(c, -1, -DECK_DEPTH), edge(c, -1, y + 0.95), edge(a, -1, y + 0.95)], right, CONCRETE);
    pushQuad(b, [edge(a, -1, -DECK_DEPTH), edge(a, 1, -DECK_DEPTH), edge(c, 1, -DECK_DEPTH), edge(c, -1, -DECK_DEPTH)], [0, -1, 0], CONCRETE_DARK);
    const inner = (f: PathFrame, side: number, dy: number): [number, number, number] => [
      f.x + f.lx * (hw - 0.25) * side,
      f.y + dy,
      f.z + f.lz * (hw - 0.25) * side,
    ];
    pushQuad(b, [inner(a, 1, y), inner(c, 1, y), inner(c, 1, y + 0.95), inner(a, 1, y + 0.95)], right, BARRIER);
    pushQuad(b, [inner(c, -1, y), inner(a, -1, y), inner(a, -1, y + 0.95), inner(c, -1, y + 0.95)], left, BARRIER);
    pushQuad(b, [inner(a, 1, y + 0.95), inner(c, 1, y + 0.95), edge(c, 1, y + 0.95), edge(a, 1, y + 0.95)], [0, 1, 0], BARRIER);
    pushQuad(b, [edge(a, -1, y + 0.95), edge(c, -1, y + 0.95), inner(c, -1, y + 0.95), inner(a, -1, y + 0.95)], [0, 1, 0], BARRIER);
  }

  const spacing = 26 + rand() * 6;
  const total = frames[frames.length - 1].s;
  for (let s = spacing / 2; s < total; s += spacing) {
    let i = 0;
    while (i < frames.length - 2 && frames[i + 1].s < s) i++;
    const a = frames[i];
    const c = frames[i + 1];
    const t = (s - a.s) / Math.max(1e-6, c.s - a.s);
    const height = a.y + (c.y - a.y) * t;
    if (height < 4.2) continue;
    const x = a.x + (c.x - a.x) * t;
    const z = a.z + (c.z - a.z) * t;
    const angle = Math.atan2(c.z - a.z, c.x - a.x);
    const capTop = height - DECK_DEPTH;
    pushBox(b, x, z, 0, capTop - 1.1, 1.8, Math.min(road.width * 0.35, 2.6), angle, CONCRETE);
    pushBox(b, x, z, capTop - 1.1, capTop, 2.2, road.width * 0.92, angle, CONCRETE_DARK);
  }
}

export interface RoadBuffers {
  roadTiers: MeshData[];
  sidewalks: MeshData;
  bridgeStructure: MeshData;
  lamps: Float32Array;
}

export function buildRoads(city: CityData): RoadBuffers {
  const nodes = analyseNodes(city);
  const tiers: RoadBuilder[] = [0, 1, 2, 3].map(
    () => new GeometryBuilder({ position: 3, normal: 3, uv: 2, aRoad: 4, aSpan: 4 }),
  );
  const walks: WalkBuilder = new GeometryBuilder({ position: 3, normal: 3, uv: 2, aWalk: 2 });
  const bridges = createColoredBuilder();
  const lamps: number[] = [];

  for (const road of city.roads) {
    if (road.tunnel || road.points.length < 4) continue;
    const frames = pathFrames(road.points, road.elevation);
    const from = nodes[road.from];
    const to = nodes[road.to];
    const clear = (node: RoadNodeInfo) => (node.degree >= 3 ? node.maxWidth / 2 + 1.2 : 0);
    emitRoad(tiers[ROAD_TIER[road.kind]], road, frames, clear(from), clear(to));

    const sidewalk = SIDEWALK[road.kind];
    if (sidewalk && !road.bridge && !road.link) emitSidewalk(walks, road, frames, sidewalk);

    const rand = seeded(road.id);
    if (road.elevation && road.elevation.some((h) => h > 0.4)) emitBridge(bridges, road, frames, rand);

    const lamp = LAMPS[road.kind];
    if (lamp && !road.bridge && !road.link) {
      const total = frames[frames.length - 1].s;
      const median = !road.oneway && road.lanes >= 4;
      for (let s = lamp.spacing * (0.3 + rand() * 0.4); s < total - 5; s += lamp.spacing) {
        if (rand() > lamp.probability) continue;
        let i = 0;
        while (i < frames.length - 2 && frames[i + 1].s < s) i++;
        const a = frames[i];
        const c = frames[i + 1];
        const t = (s - a.s) / Math.max(1e-6, c.s - a.s);
        const x = a.x + (c.x - a.x) * t;
        const z = a.z + (c.z - a.z) * t;
        const ln = Math.hypot(a.lx, a.lz) || 1;
        const lx = a.lx / ln;
        const lz = a.lz / ln;
        if (median) lamps.push(x, 0, z, Math.atan2(lz, lx), 1);
        else {
          const offset = road.width / 2 + 0.7;
          lamps.push(x + lx * offset, 0, z + lz * offset, Math.atan2(-lz, -lx), 0);
        }
      }
    }
  }

  city.roadNodes.forEach((node, index) => {
    const info = nodes[index];
    if (info.degree < 2 || info.maxWidth < 2.5) return;
    const x = node.e;
    const z = -node.n;
    const radius = info.maxWidth / 2;
    const attrs = [info.kindCode, 1, 0, info.maxWidth];
    const span = [0, 1e4, 1e4, 0];
    emitDisc(tiers[info.tier] as unknown as GeometryBuilder<string>, x, info.elevation + TIER_Y[info.tier], z, radius,
      { uv: [0, 0], aRoad: attrs, aSpan: span },
      { uv: [0, 1], aRoad: attrs, aSpan: span },
    );
    if (info.sidewalk > 0 && info.elevation < 0.2 && info.degree >= 3) {
      const outer = radius + info.sidewalk;
      emitDisc(walks as unknown as GeometryBuilder<string>, x, SIDEWALK_Y, z, outer,
        { uv: [0, 0], aWalk: [-1, outer] },
        { uv: [0, outer], aWalk: [-1, outer] },
      );
    }
  });

  return {
    roadTiers: tiers.map((tier) => tier.build()),
    sidewalks: walks.build(),
    bridgeStructure: bridges.build(),
    lamps: new Float32Array(lamps),
  };
}
