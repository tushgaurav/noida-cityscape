import type { CityData, RailLine } from '@noida/city-schema';
import type { MeshData } from '../types';
import { type ColoredBuilder, type PathFrame, createColoredBuilder, pathFrames, pushBox, pushCylinder, pushQuad } from './GeometryBuilder';
import { linearRgb } from './palette';

const DECK_HALF = 2.7;
const CONCRETE = linearRgb('#c9c4b9');
const CONCRETE_SHADE = linearRgb('#a39e94');
const DECK_TOP = linearRgb('#8e8b85');
const RAIL = linearRgb('#55524e');
const ROOF = linearRgb('#e8e6e1');
const GLASS = linearRgb('#3c4f5a');
const STEEL = linearRgb('#9aa0a3');

export const railDeckHeight = (line: RailLine) => (line.layer >= 2 ? 6.5 * line.layer : 12.5);

export function nearestOnLine(points: number[], e: number, n: number): { distance: number; e: number; n: number; angle: number } {
  let best = { distance: Infinity, e: 0, n: 0, angle: 0 };
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2];
    const ay = points[i - 1];
    const dx = points[i] - ax;
    const dy = points[i + 1] - ay;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((e - ax) * dx + (n - ay) * dy) / lengthSq));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const distance = Math.hypot(px - e, py - n);
    if (distance < best.distance) best = { distance, e: px, n: py, angle: Math.atan2(-dy, dx) };
  }
  return best;
}

function extrudeProfile(
  b: ColoredBuilder,
  frames: PathFrame[],
  height: number,
  profile: [lateral: number, dy: number][],
  colour: [number, number, number],
) {
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const c = frames[i + 1];
    for (let k = 0; k < profile.length - 1; k++) {
      const [l0, y0] = profile[k];
      const [l1, y1] = profile[k + 1];
      const p = (f: PathFrame, l: number, y: number): [number, number, number] => [f.x + f.lx * l, height + y, f.z + f.lz * l];
      const ln = Math.hypot(a.lx, a.lz) || 1;
      const tx = -a.lz / ln;
      const tz = a.lx / ln;
      const ex = (a.lx / ln) * (l1 - l0);
      const ey = y1 - y0;
      const ez = (a.lz / ln) * (l1 - l0);
      let nx = -tz * ey;
      let ny = tz * ex - tx * ez;
      let nz = tx * ey;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      pushQuad(b, [p(a, l0, y0), p(c, l0, y0), p(c, l1, y1), p(a, l1, y1)], [nx, ny, nz], colour);
    }
  }
}

export function buildRail(city: CityData): { railStructure: MeshData; railTrackBed: MeshData } {
  const structure = createColoredBuilder();
  const rails = createColoredBuilder();
  const elevated = city.rail.filter((line) => line.elevated && line.points.length >= 4);

  for (const line of elevated) {
    const frames = pathFrames(line.points, undefined, 1.6);
    const H = railDeckHeight(line);
    const W = DECK_HALF;
    extrudeProfile(structure, frames, H, [[-W, 0.05], [W, 0.05]], DECK_TOP);
    extrudeProfile(structure, frames, H, [[W, 1.1], [W, -0.35], [1.6, -2.2], [-1.6, -2.2], [-W, -0.35], [-W, 1.1]], CONCRETE);
    extrudeProfile(structure, frames, H, [[-W, 1.1], [-W + 0.22, 1.1], [-W + 0.22, 0.05]], CONCRETE_SHADE);
    extrudeProfile(structure, frames, H, [[W - 0.22, 0.05], [W - 0.22, 1.1], [W, 1.1]], CONCRETE_SHADE);
    for (const offset of [-0.76, 0.76]) {
      extrudeProfile(rails, frames, H, [[offset - 0.05, 0.05], [offset - 0.05, 0.24], [offset + 0.05, 0.24], [offset + 0.05, 0.05]], RAIL);
    }
  }

  elevated.forEach((line, index) => {
    const H = railDeckHeight(line);
    const frames = pathFrames(line.points);
    const total = frames[frames.length - 1].s;
    for (let s = 15; s < total; s += 30) {
      let i = 0;
      while (i < frames.length - 2 && frames[i + 1].s < s) i++;
      const a = frames[i];
      const c = frames[i + 1];
      const t = (s - a.s) / Math.max(1e-6, c.s - a.s);
      let x = a.x + (c.x - a.x) * t;
      let z = a.z + (c.z - a.z) * t;
      if (elevated.slice(0, index).some((other) => nearestOnLine(other.points, x, -z).distance < 7.5)) continue;
      let capWidth = DECK_HALF * 2 + 1;
      const partner = elevated
        .slice(index + 1)
        .map((other) => nearestOnLine(other.points, x, -z))
        .find((hit) => hit.distance < 7.5);
      if (partner) {
        x = (x + partner.e) / 2;
        z = (z - partner.n) / 2;
        capWidth += partner.distance;
      }
      const angle = Math.atan2(c.z - a.z, c.x - a.x);
      const capTop = H - 2.2;
      pushCylinder(structure, x, z, 0, capTop - 1.6, 1.05, 14, CONCRETE);
      pushBox(structure, x, z, capTop - 1.6, capTop, 2.4, capWidth, angle, CONCRETE_SHADE);
    }
  });

  for (const poi of city.pois) {
    if (poi.kind !== 'metro_station') continue;
    const hits = elevated
      .map((line) => ({ line, hit: nearestOnLine(line.points, poi.e, poi.n) }))
      .filter(({ hit }) => hit.distance < 140)
      .sort((p, q) => p.hit.distance - q.hit.distance);
    if (!hits.length) continue;
    const { line, hit } = hits[0];
    const partner = hits.find(({ line: other, hit: h }) => other !== line && Math.hypot(h.e - hit.e, h.n - hit.n) < 9);
    const centerE = partner ? (hit.e + partner.hit.e) / 2 : hit.e;
    const centerN = partner ? (hit.n + partner.hit.n) / 2 : hit.n;
    const gap = partner ? Math.hypot(partner.hit.e - hit.e, partner.hit.n - hit.n) / 2 : 0;
    buildStation(structure, centerE, -centerN, hit.angle, railDeckHeight(line), gap);
  }

  return { railStructure: structure.build(), railTrackBed: rails.build() };
}

function buildStation(b: ColoredBuilder, x: number, z: number, angle: number, H: number, halfGap: number) {
  const along = (d: number, lateral: number): [number, number] => [
    x + Math.cos(angle) * d - Math.sin(angle) * lateral,
    z + Math.sin(angle) * d + Math.cos(angle) * lateral,
  ];
  const platformOffset = halfGap + DECK_HALF + 1.9;
  const roofHalf = platformOffset + 3.4;

  pushBox(b, x, z, 6.2, 7.3, 112, 22, angle, CONCRETE, true);
  pushBox(b, x, z, 7.3, 9.9, 111, 21.4, angle, GLASS);
  pushBox(b, x, z, 9.9, 10.6, 112, 22, angle, CONCRETE);

  for (const side of [-1, 1]) {
    const [px, pz] = along(0, side * platformOffset);
    pushBox(b, px, pz, H - 0.6, H + 0.15, 140, 3.6, angle, CONCRETE_SHADE, true);
    for (let d = -66; d <= 66; d += 16.5) {
      const [cx, cz] = along(d, side * (roofHalf - 0.6));
      pushBox(b, cx, cz, H + 0.15, H + 6.6, 0.55, 0.55, angle, STEEL);
    }
    for (const d of [-42, 0, 42]) {
      const [cx, cz] = along(d, side * 8.5);
      pushBox(b, cx, cz, 0, 6.2, 1.7, 1.7, angle, CONCRETE);
    }
    const [sx, sz] = along(side * 48, side * 14.5);
    pushBox(b, sx, sz, 0, 10.6, 9, 6, angle, CONCRETE_SHADE, true);
  }

  pushBox(b, x, z, H + 6.6, H + 7.3, 150, roofHalf * 2 + 1.5, angle, ROOF, true);
  pushBox(b, x, z, H + 7.3, H + 8.1, 148, roofHalf * 1.1, angle, ROOF);
}
