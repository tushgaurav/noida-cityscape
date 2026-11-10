import type { Building, CityData } from '@noida/city-schema';
import { distanceToRing, longestEdgeAngle, pointInPolygon, ringBounds, signedArea } from '../../lib/geo2d';
import { seeded } from '../../lib/random';
import type { MeshData } from '../types';
import { buildingStyle } from './buildings';
import { createColoredBuilder, pushBox } from './GeometryBuilder';
import { type RGB, linearRgb, shade } from './palette';

const HVAC_GREY = linearRgb('#a7aaa8');
const HVAC_DARK = linearRgb('#7d8283');
const SOLAR_BLUE = linearRgb('#1f2a3a');

function randomInteriorPoint(building: Building, inset: number, rand: () => number): [number, number] | null {
  const ring = building.polygon[0];
  const b = ringBounds(ring);
  for (let attempt = 0; attempt < 24; attempt++) {
    const e = b.minE + rand() * (b.maxE - b.minE);
    const n = b.minN + rand() * (b.maxN - b.minN);
    if (pointInPolygon(e, n, building.polygon) && distanceToRing(e, n, ring) > inset) return [e, n];
  }
  return null;
}

const FLAT_KINDS = new Set(['shelter', 'roof', 'utility', 'construction', 'transport']);

export function buildRooftops(city: CityData): { rooftops: MeshData; waterTanks: Float32Array } {
  const builder = createColoredBuilder();
  const tanks: number[] = [];

  for (const building of city.buildings) {
    if (FLAT_KINDS.has(building.kind) || building.height < 5 || (building.roofShape && building.roofShape !== 'flat')) continue;
    const area = Math.abs(signedArea(building.polygon[0]));
    if (area < 40) continue;
    const rand = seeded(`roof:${building.id}`);
    const style = buildingStyle(building);
    const angle = -longestEdgeAngle(building.polygon[0]);
    const top = building.height;
    const residential = building.facade === 'plaster' || building.facade === 'brick';
    let mumtyTop = 0;
    let mumtyPoint: [number, number] | null = null;

    if (area > 70 && building.levels >= 2 && rand() < 0.8) {
      const point = randomInteriorPoint(building, 2.6, rand);
      if (point) {
        const sx = 2.8 + rand() * 1.4;
        const sz = 3 + rand() * 1.8;
        mumtyTop = top + 2.7;
        mumtyPoint = point;
        pushBox(builder, point[0], -point[1], top - 0.1, mumtyTop, sx, sz, angle, shade(style.wall, 0.93));
        pushBox(builder, point[0], -point[1], mumtyTop, mumtyTop + 0.15, sx + 0.5, sz + 0.5, angle, shade(style.roof, 0.9));
      }
    }

    if (residential && building.levels <= 7) {
      const count = Math.min(4, Math.max(1, Math.round(area / 140)));
      for (let k = 0; k < count; k++) {
        if (rand() > 0.85) continue;
        const onMumty = k === 0 && mumtyPoint && rand() < 0.65;
        const point = onMumty ? mumtyPoint : randomInteriorPoint(building, 1.4, rand);
        if (!point) continue;
        const radius = 0.55 + rand() * 0.3;
        tanks.push(point[0] + (onMumty ? (rand() - 0.5) * 0.8 : 0), onMumty ? mumtyTop + 0.15 : top, -point[1], radius, 1.1 + rand() * 0.5);
      }
      if (area > 90 && rand() < 0.14) addSolarArray(builder, building, top, angle, rand);
    } else if (area > 500) {
      const units = 2 + Math.floor(rand() * Math.min(6, area / 500));
      const anchor = randomInteriorPoint(building, 4, rand);
      if (anchor) {
        for (let k = 0; k < units; k++) {
          const offset = (k - units / 2) * 2.8;
          const cx = anchor[0] + Math.cos(angle) * offset;
          const cz = -anchor[1] + Math.sin(angle) * offset;
          const colour: RGB = k % 3 === 0 ? HVAC_DARK : HVAC_GREY;
          pushBox(builder, cx, cz, top - 0.05, top + 1.3 + rand() * 0.6, 2.2, 1.5, angle, colour);
        }
      }
      if (rand() < 0.25) addSolarArray(builder, building, top, angle, rand);
    }
  }

  return { rooftops: builder.build(), waterTanks: new Float32Array(tanks) };
}

function addSolarArray(
  builder: ReturnType<typeof createColoredBuilder>,
  building: Building,
  top: number,
  angle: number,
  rand: () => number,
) {
  const anchor = randomInteriorPoint(building, 3.5, rand);
  if (!anchor) return;
  const rows = 2 + Math.floor(rand() * 3);
  const columns = 2 + Math.floor(rand() * 4);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < columns; k++) {
      const lx = (k - columns / 2) * 1.1;
      const lz = (r - rows / 2) * 2.2;
      const e = anchor[0] + lx * c - lz * s;
      const nz = -anchor[1] + lx * s + lz * c;
      if (!pointInPolygon(e, -nz, building.polygon)) continue;
      pushBox(builder, e, nz, top + 0.4, top + 0.55, 1.0, 1.9, angle, SOLAR_BLUE);
    }
  }
}
