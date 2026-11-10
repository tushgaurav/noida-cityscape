import type { Building, CityData } from '@noida/city-schema';
import earcut from 'earcut';
import { pick, seeded } from '../../lib/random';
import type { BuildingChunk, TypedArray } from '../types';
import { GeometryBuilder } from './GeometryBuilder';
import { FACADE_CODE, ROOF_PALETTE, type RGB, WALL_PALETTE, linearRgb } from './palette';

export const CHUNK_SIZE = 700;

export function chunkKey(e: number, n: number): string {
  return `${Math.floor(e / CHUNK_SIZE)}:${Math.floor(n / CHUNK_SIZE)}`;
}

export interface BuildingStyle {
  wall: RGB;
  roof: RGB;
  seed: number;
}

export function buildingStyle(building: Building): BuildingStyle {
  const rand = seeded(building.id);
  const wall = building.wallColor ? linearRgb(building.wallColor) : linearRgb(pick(WALL_PALETTE[building.facade], rand));
  const roof = building.roofColor ? linearRgb(building.roofColor) : linearRgb(pick(ROOF_PALETTE[building.facade], rand));
  return { wall, roof, seed: rand() };
}

type BuildingBuilder = GeometryBuilder<'position' | 'normal' | 'uv' | 'color' | 'facade'>;

function emitBuilding(b: BuildingBuilder, building: Building, style: BuildingStyle) {
  const top = building.height;
  const bottom = building.minHeight > 0.3 ? building.minHeight : -0.6;
  const facade = [FACADE_CODE[building.facade], style.seed, building.floorHeight, top];
  const { position, normal, uv, color, facade: facadeAttr } = b.data;

  const vertex = (x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: RGB) => {
    position.push(x, y, z);
    normal.push(nx, ny, nz);
    uv.push(u, v);
    color.push(c[0], c[1], c[2]);
    facadeAttr.push(facade[0], facade[1], facade[2], facade[3]);
  };

  for (const ring of building.polygon) {
    let u = 0;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
      const ae = ring[j];
      const an = ring[j + 1];
      const be = ring[i];
      const bn = ring[i + 1];
      const de = be - ae;
      const dn = bn - an;
      const length = Math.hypot(de, dn);
      if (length < 0.05) continue;
      const nx = dn / length;
      const nz = de / length;
      const u0 = u;
      const u1 = u + length;
      u = u1;
      vertex(ae, bottom, -an, nx, 0, nz, u0, bottom, style.wall);
      vertex(be, bottom, -bn, nx, 0, nz, u1, bottom, style.wall);
      vertex(be, top, -bn, nx, 0, nz, u1, top, style.wall);
      vertex(ae, bottom, -an, nx, 0, nz, u0, bottom, style.wall);
      vertex(be, top, -bn, nx, 0, nz, u1, top, style.wall);
      vertex(ae, top, -an, nx, 0, nz, u0, top, style.wall);
    }
  }

  const flat: number[] = [];
  const holes: number[] = [];
  building.polygon.forEach((ring, index) => {
    if (index > 0) holes.push(flat.length / 2);
    flat.push(...ring);
  });
  const triangles = earcut(flat, holes.length ? holes : null);
  for (let t = 0; t < triangles.length; t += 3) {
    let a = triangles[t];
    let c = triangles[t + 1];
    const d = triangles[t + 2];
    const cross = (flat[c * 2] - flat[a * 2]) * (flat[d * 2 + 1] - flat[a * 2 + 1]) - (flat[c * 2 + 1] - flat[a * 2 + 1]) * (flat[d * 2] - flat[a * 2]);
    if (cross < 0) [a, c] = [c, a];
    for (const k of [a, c, d]) vertex(flat[k * 2], top, -flat[k * 2 + 1], 0, 1, 0, flat[k * 2], -flat[k * 2 + 1], style.roof);
    if (building.minHeight > 0.3) {
      for (const k of [c, a, d]) vertex(flat[k * 2], bottom, -flat[k * 2 + 1], 0, -1, 0, flat[k * 2], -flat[k * 2 + 1], style.roof);
    }
  }
}

export function buildBuildingChunks(city: CityData, onProgress: (fraction: number) => void): BuildingChunk[] {
  const groups = new Map<string, number[]>();
  city.buildings.forEach((building, index) => {
    const ring = building.polygon[0];
    const key = chunkKey(ring[0], ring[1]);
    const group = groups.get(key);
    if (group) group.push(index);
    else groups.set(key, [index]);
  });

  const chunks: BuildingChunk[] = [];
  let processed = 0;
  for (const indices of groups.values()) {
    const builder: BuildingBuilder = new GeometryBuilder({ position: 3, normal: 3, uv: 2, color: 3, facade: 4 }, false);
    const starts: number[] = [];
    for (const index of indices) {
      starts.push(builder.vertexCount);
      const building = city.buildings[index];
      emitBuilding(builder, building, buildingStyle(building));
      if (++processed % 400 === 0) onProgress(processed / city.buildings.length);
    }
    chunks.push({
      mesh: builder.build(),
      vertexStart: new Uint32Array(starts),
      buildingIndex: new Uint32Array(indices),
    });
  }
  return chunks;
}

export function findBuildingAtVertex(chunk: { vertexStart: TypedArray; buildingIndex: TypedArray }, vertex: number): number {
  let lo = 0;
  let hi = chunk.vertexStart.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (chunk.vertexStart[mid] <= vertex) lo = mid;
    else hi = mid - 1;
  }
  return chunk.buildingIndex[lo];
}
