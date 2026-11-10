import type { CityData } from '@noida/city-schema';
import earcut from 'earcut';
import type { MeshData } from '../types';
import { GeometryBuilder, createColoredBuilder, pushQuad } from './GeometryBuilder';
import { AREA_KIND_CODE, areaLayer, linearRgb } from './palette';

const LAYER_Y = [0.012, 0.02, 0.028, 0.034];

export function buildAreas(city: CityData): MeshData[] {
  const layers = [0, 1, 2, 3].map(() => new GeometryBuilder({ position: 3, normal: 3, aKind: 1 }));
  for (const area of city.areas) {
    const layer = areaLayer(area.kind);
    const b = layers[layer];
    const flat: number[] = [];
    const holes: number[] = [];
    area.polygon.forEach((ring, index) => {
      if (index > 0) holes.push(flat.length / 2);
      flat.push(...ring);
    });
    const triangles = earcut(flat, holes.length ? holes : null);
    const base = b.vertexCount;
    const code = AREA_KIND_CODE[area.kind];
    for (let i = 0; i < flat.length; i += 2) {
      b.data.position.push(flat[i], LAYER_Y[layer], -flat[i + 1]);
      b.data.normal.push(0, 1, 0);
      b.data.aKind.push(code);
    }
    for (let t = 0; t < triangles.length; t += 3) {
      const a = triangles[t];
      const c = triangles[t + 1];
      const d = triangles[t + 2];
      const cross = (flat[c * 2] - flat[a * 2]) * (flat[d * 2 + 1] - flat[a * 2 + 1]) - (flat[c * 2 + 1] - flat[a * 2 + 1]) * (flat[d * 2] - flat[a * 2]);
      if (cross >= 0) b.indices.push(base + a, base + c, base + d);
      else b.indices.push(base + c, base + a, base + d);
    }
  }
  return layers.map((layer) => layer.build());
}

const BARRIER_COLOUR = {
  wall: linearRgb('#cbbfa8'),
  retaining_wall: linearRgb('#a59e90'),
  fence: linearRgb('#5f6566'),
  hedge: linearRgb('#4b6a34'),
};

export function buildBarriers(city: CityData): MeshData {
  const b = createColoredBuilder();
  for (const barrier of city.barriers) {
    const colour = BARRIER_COLOUR[barrier.kind];
    const half = barrier.kind === 'hedge' ? 0.5 : barrier.kind === 'fence' ? 0.05 : 0.12;
    const h = barrier.height;
    const p = barrier.points;
    for (let i = 2; i < p.length; i += 2) {
      const ax = p[i - 2];
      const az = -p[i - 1];
      const cx = p[i];
      const cz = -p[i + 1];
      const length = Math.hypot(cx - ax, cz - az);
      if (length < 0.05) continue;
      const lx = (cz - az) / length;
      const lz = -(cx - ax) / length;
      const L = (x: number, z: number, y: number): [number, number, number] => [x + lx * half, y, z + lz * half];
      const R = (x: number, z: number, y: number): [number, number, number] => [x - lx * half, y, z - lz * half];
      pushQuad(b, [L(cx, cz, 0), L(ax, az, 0), L(ax, az, h), L(cx, cz, h)], [lx, 0, lz], colour);
      pushQuad(b, [R(ax, az, 0), R(cx, cz, 0), R(cx, cz, h), R(ax, az, h)], [-lx, 0, -lz], colour);
      pushQuad(b, [R(ax, az, h), R(cx, cz, h), L(cx, cz, h), L(ax, az, h)], [0, 1, 0], colour);
    }
  }
  return b.build();
}
