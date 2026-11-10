import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  LatheGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hashString } from '../lib/random';

type RGB = [number, number, number];

function finalize(geometry: BufferGeometry, colour: RGB | ((p: Vector3) => RGB), extra: Record<string, number> = {}): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const count = g.attributes.position.count;
  const colours = new Float32Array(count * 3);
  const p = new Vector3();
  for (let i = 0; i < count; i++) {
    p.fromBufferAttribute(g.attributes.position, i);
    const c = typeof colour === 'function' ? colour(p) : colour;
    colours.set(c, i * 3);
  }
  g.setAttribute('color', new BufferAttribute(colours, 3));
  for (const [name, value] of Object.entries(extra)) g.setAttribute(name, new BufferAttribute(new Float32Array(count).fill(value), 1));
  return g;
}

function box(sx: number, sy: number, sz: number, x: number, y: number, z: number, colour: RGB, extra: Record<string, number> = {}) {
  return finalize(new BoxGeometry(sx, sy, sz).translate(x, y, z), colour, extra);
}

function canopy(radius: number, cx: number, cy: number, cz: number, squash: number, salt: number, detail = 1): BufferGeometry {
  const g = new IcosahedronGeometry(radius, detail);
  const pos = g.attributes.position;
  const normals = g.attributes.normal;
  const v = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${Math.round(v.x * 50)}:${Math.round(v.y * 50)}:${Math.round(v.z * 50)}:${salt}`;
    const jitter = 1 + ((hashString(key) % 1000) / 1000 - 0.5) * 0.34;
    v.multiplyScalar(jitter);
    v.y *= squash;
    n.set(v.x, v.y / squash, v.z).normalize().lerp(new Vector3(0, 1, 0), 0.25).normalize();
    pos.setXYZ(i, v.x + cx, v.y + cy, v.z + cz);
    normals.setXYZ(i, n.x, n.y, n.z);
  }
  const bottom = cy - radius * squash;
  const height = radius * squash * 2;
  return finalize(g, (p) => {
    const ao = 0.5 + 0.5 * Math.min(Math.max((p.y - bottom) / height, 0), 1);
    return [ao, ao, ao];
  }, { aPart: 1 });
}

const BARK: RGB = [0.11, 0.075, 0.05];

function trunk(r0: number, r1: number, height: number, sides = 6): BufferGeometry {
  const g = new CylinderGeometry(r0, r1, height, sides, 1, true).translate(0, height / 2, 0);
  return finalize(g, BARK, { aPart: 0 });
}

/** Low-detail stand-ins used for distant tree chunks. */
export function createTreeLodGeometries(): BufferGeometry[] {
  const broadleaf = mergeGeometries([trunk(0.15, 0.24, 3.4, 4), canopy(2.6, 0, 4.7, 0, 0.8, 1, 0), canopy(1.8, 1.2, 4.2, 0.5, 0.8, 2, 0)])!;
  const ashoka = mergeGeometries([
    trunk(0.1, 0.15, 1.6, 4),
    finalize(
      new CylinderGeometry(0.35, 1.1, 7, 6, 1).translate(0, 4.7, 0),
      (p) => {
        const ao = 0.42 + 0.4 * Math.min(Math.max((p.y - 1.2) / 8, 0), 1);
        return [ao, ao, ao];
      },
      { aPart: 1 },
    ),
  ])!;
  const small = mergeGeometries([trunk(0.09, 0.13, 1.6, 4), canopy(1.6, 0, 2.5, 0, 0.85, 4, 0)])!;
  return [broadleaf, ashoka, small];
}

export function createTreeGeometries(): BufferGeometry[] {
  const broadleaf = mergeGeometries([
    trunk(0.15, 0.24, 3.4),
    canopy(2.5, 0, 4.8, 0, 0.78, 1),
    canopy(1.7, 1.3, 4.1, 0.6, 0.8, 2, 0),
    canopy(1.6, -1.1, 4.4, -0.7, 0.8, 3, 0),
  ])!;

  const profile = [
    [0.05, 0],
    [0.8, 0.8],
    [1.15, 2.4],
    [1.05, 4.4],
    [0.75, 6.2],
    [0.3, 7.6],
    [0.02, 8.3],
  ].map(([x, y]) => new Vector2(x, y));
  const lathe = new LatheGeometry(profile, 9).translate(0, 1.2, 0).toNonIndexed();
  const pos = lathe.attributes.position;
  const normals = lathe.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const key = `${Math.round(x * 40)}:${Math.round(pos.getY(i) * 40)}:${Math.round(z * 40)}`;
    const jitter = 1 + ((hashString(key) % 1000) / 1000 - 0.5) * 0.3;
    pos.setX(i, x * jitter);
    pos.setZ(i, z * jitter);
    const n = new Vector3(x, 0.3, z).normalize();
    normals.setXYZ(i, n.x, n.y, n.z);
  }
  const ashoka = mergeGeometries([
    trunk(0.1, 0.15, 1.6),
    finalize(lathe, (p) => {
      const ao = 0.42 + 0.4 * Math.min(Math.max((p.y - 1.2) / 8, 0), 1);
      return [ao, ao, ao];
    }, { aPart: 1 }),
  ])!;

  const small = mergeGeometries([trunk(0.09, 0.13, 1.6), canopy(1.5, 0, 2.5, 0, 0.85, 4), canopy(1.0, 0.7, 2.1, 0.3, 0.9, 5, 0)])!;
  return [broadleaf, ashoka, small];
}

export function createTankGeometry(): BufferGeometry {
  return mergeGeometries([
    finalize(new CylinderGeometry(1, 1, 1, 14).translate(0, 0.5, 0), [0.018, 0.018, 0.02]),
    finalize(new CylinderGeometry(0.35, 0.35, 0.12, 10).translate(0, 1.06, 0), [0.03, 0.03, 0.03]),
  ])!;
}

const POLE: RGB = [0.22, 0.23, 0.24];
const HOUSING: RGB = [0.3, 0.3, 0.3];
const LENS: RGB = [0.9, 0.85, 0.7];

export function createLampGeometry(double: boolean): BufferGeometry {
  const parts = [finalize(new CylinderGeometry(0.08, 0.12, 9, 6).translate(0, 4.5, 0), POLE, { aLight: 0 })];
  for (const side of double ? [1, -1] : [1]) {
    parts.push(box(1.9, 0.08, 0.08, side * 0.95, 8.9, 0, POLE, { aLight: 0 }));
    parts.push(box(0.75, 0.14, 0.34, side * 1.9, 8.86, 0, HOUSING, { aLight: 0 }));
    parts.push(box(0.6, 0.03, 0.26, side * 1.9, 8.78, 0, LENS, { aLight: 4 }));
  }
  return mergeGeometries(parts)!;
}

const WHITE: RGB = [1, 1, 1];
const GLASS: RGB = [0.03, 0.035, 0.04];
const TYRE: RGB = [0.015, 0.015, 0.015];
const HEAD: RGB = [0.9, 0.9, 0.85];
const TAIL: RGB = [0.5, 0.02, 0.02];

function wheels(xs: number[], halfTrack: number, radius: number, width: number) {
  return xs.flatMap((x) =>
    [-1, 1].map((side) => box(radius * 2, radius * 2, width, x, radius, side * halfTrack, TYRE, { aLight: 0 })),
  );
}

export type VehicleKind = 'car' | 'auto' | 'bus' | 'bike';

export const VEHICLE_LENGTH: Record<VehicleKind, number> = { car: 4.3, auto: 2.7, bus: 11.5, bike: 1.8 };

export function createVehicleGeometry(kind: VehicleKind): BufferGeometry {
  const L = (extra = 0) => ({ aLight: extra });
  switch (kind) {
    case 'car':
      return mergeGeometries([
        box(4.3, 0.78, 1.78, 0, 0.74, 0, WHITE, L()),
        box(2.3, 0.6, 1.6, -0.25, 1.43, 0, GLASS, L()),
        ...wheels([1.35, -1.35], 0.8, 0.32, 0.24),
        box(0.06, 0.16, 0.34, 2.16, 0.86, 0.58, HEAD, L(1)),
        box(0.06, 0.16, 0.34, 2.16, 0.86, -0.58, HEAD, L(1)),
        box(0.06, 0.14, 0.3, -2.16, 0.92, 0.62, TAIL, L(2)),
        box(0.06, 0.14, 0.3, -2.16, 0.92, -0.62, TAIL, L(2)),
      ])!;
    case 'auto':
      return mergeGeometries([
        box(2.6, 0.9, 1.3, 0, 0.75, 0, [0.05, 0.28, 0.07], L()),
        box(2.2, 0.85, 1.32, -0.15, 1.65, 0, [0.85, 0.62, 0.04], L()),
        box(0.5, 0.6, 1.1, 1.1, 1.5, 0, GLASS, L()),
        box(0.56, 0.56, 0.18, 1.0, 0.28, 0, TYRE, L()),
        ...wheels([-0.8], 0.6, 0.28, 0.18),
        box(0.06, 0.18, 0.18, 1.32, 1.0, 0, HEAD, L(1)),
        box(0.06, 0.12, 0.2, -1.32, 0.95, 0.5, TAIL, L(2)),
        box(0.06, 0.12, 0.2, -1.32, 0.95, -0.5, TAIL, L(2)),
      ])!;
    case 'bus':
      return mergeGeometries([
        box(11.5, 2.5, 2.55, 0, 1.75, 0, WHITE, L()),
        box(11.54, 0.95, 2.58, 0, 2.3, 0, GLASS, L(3)),
        box(0.1, 1.3, 2.3, 5.76, 2.0, 0, GLASS, L()),
        ...wheels([3.6, -3.4], 1.12, 0.5, 0.32),
        box(0.06, 0.2, 0.4, 5.78, 0.9, 0.85, HEAD, L(1)),
        box(0.06, 0.2, 0.4, 5.78, 0.9, -0.85, HEAD, L(1)),
        box(0.06, 0.25, 0.3, -5.78, 1.0, 0.95, TAIL, L(2)),
        box(0.06, 0.25, 0.3, -5.78, 1.0, -0.95, TAIL, L(2)),
      ])!;
    case 'bike':
      return mergeGeometries([
        box(1.7, 0.55, 0.36, 0, 0.6, 0, [0.03, 0.03, 0.035], L()),
        ...[0.62, -0.62].map((x) => box(0.56, 0.56, 0.1, x, 0.28, 0, TYRE, L())),
        box(0.42, 0.75, 0.46, -0.15, 1.3, 0, WHITE, L()),
        box(0.26, 0.28, 0.26, -0.1, 1.85, 0, [0.04, 0.04, 0.05], L()),
        box(0.06, 0.12, 0.12, 0.86, 0.95, 0, HEAD, L(1)),
        box(0.06, 0.08, 0.14, -0.86, 0.8, 0, TAIL, L(2)),
      ])!;
  }
}

export const TRAIN_CAR_LENGTH = 21.3;

export function createTrainCarGeometry(): BufferGeometry {
  const steel: RGB = [0.6, 0.62, 0.64];
  return mergeGeometries([
    box(20.8, 3.2, 3.2, 0, 2.05, 0, steel, { aLight: 0 }),
    box(20.84, 0.3, 3.22, 0, 1.4, 0, [0.02, 0.09, 0.42], { aLight: 0 }),
    box(20.2, 0.95, 3.23, 0, 2.6, 0, GLASS, { aLight: 3 }),
    box(18, 0.35, 2.3, 0, 3.8, 0, [0.42, 0.43, 0.44], { aLight: 0 }),
    box(20.2, 0.5, 2.8, 0, 0.3, 0, [0.06, 0.06, 0.06], { aLight: 0 }),
  ])!;
}
