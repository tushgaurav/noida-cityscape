import type { AttributeData, MeshData } from '../types';

export class GeometryBuilder<K extends string> {
  readonly data: Record<K, number[]>;
  readonly indices: number[] = [];
  private readonly first: K;

  constructor(
    private readonly sizes: Record<K, number>,
    private readonly indexed = true,
  ) {
    const keys = Object.keys(sizes) as K[];
    this.first = keys[0];
    this.data = Object.fromEntries(keys.map((key) => [key, [] as number[]])) as Record<K, number[]>;
  }

  get vertexCount(): number {
    return this.data[this.first].length / this.sizes[this.first];
  }

  build(): MeshData {
    const attributes: Record<string, AttributeData> = {};
    for (const key of Object.keys(this.sizes) as K[]) {
      attributes[key] = { array: new Float32Array(this.data[key]), itemSize: this.sizes[key] };
    }
    return { attributes, index: this.indexed ? new Uint32Array(this.indices) : undefined };
  }
}

export type ColoredBuilder = GeometryBuilder<'position' | 'normal' | 'color'>;

export const createColoredBuilder = (): ColoredBuilder => new GeometryBuilder({ position: 3, normal: 3, color: 3 });

export function pushQuad(
  b: ColoredBuilder,
  corners: [number, number, number][],
  normal: [number, number, number],
  color: [number, number, number],
) {
  const base = b.vertexCount;
  for (const corner of corners) {
    b.data.position.push(...corner);
    b.data.normal.push(...normal);
    b.data.color.push(...color);
  }
  b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Oriented box: (cx, cz) centre, y0..y1 vertical extent, sx along `angle` (radians, three.js XZ plane), sz across. */
export function pushBox(
  b: ColoredBuilder,
  cx: number,
  cz: number,
  y0: number,
  y1: number,
  sx: number,
  sz: number,
  angle: number,
  color: [number, number, number],
  bottom = false,
) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const hx = sx / 2;
  const hz = sz / 2;
  const corner = (lx: number, lz: number, y: number): [number, number, number] => [cx + lx * c - lz * s, y, cz + lx * s + lz * c];
  const axisX: [number, number, number] = [c, 0, s];
  const axisZ: [number, number, number] = [-s, 0, c];
  const neg = (v: [number, number, number]): [number, number, number] => [-v[0], -v[1], -v[2]];
  pushQuad(b, [corner(-hx, hz, y0), corner(hx, hz, y0), corner(hx, hz, y1), corner(-hx, hz, y1)], axisZ, color);
  pushQuad(b, [corner(hx, -hz, y0), corner(-hx, -hz, y0), corner(-hx, -hz, y1), corner(hx, -hz, y1)], neg(axisZ), color);
  pushQuad(b, [corner(hx, hz, y0), corner(hx, -hz, y0), corner(hx, -hz, y1), corner(hx, hz, y1)], axisX, color);
  pushQuad(b, [corner(-hx, -hz, y0), corner(-hx, hz, y0), corner(-hx, hz, y1), corner(-hx, -hz, y1)], neg(axisX), color);
  pushQuad(b, [corner(-hx, hz, y1), corner(hx, hz, y1), corner(hx, -hz, y1), corner(-hx, -hz, y1)], [0, 1, 0], color);
  if (bottom) pushQuad(b, [corner(-hx, -hz, y0), corner(hx, -hz, y0), corner(hx, hz, y0), corner(-hx, hz, y0)], [0, -1, 0], color);
}

export function pushCylinder(
  b: ColoredBuilder,
  cx: number,
  cz: number,
  y0: number,
  y1: number,
  radius: number,
  segments: number,
  color: [number, number, number],
) {
  const base = b.vertexCount;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const nx = Math.cos(a);
    const nz = Math.sin(a);
    b.data.position.push(cx + nx * radius, y0, cz + nz * radius, cx + nx * radius, y1, cz + nz * radius);
    b.data.normal.push(nx, 0, nz, nx, 0, nz);
    b.data.color.push(...color, ...color);
  }
  for (let i = 0; i < segments; i++) {
    const a = base + i * 2;
    b.indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
}

export interface PathFrame {
  x: number;
  z: number;
  y: number;
  /** Unit left normal in three.js XZ (already scaled by the miter factor). */
  lx: number;
  lz: number;
  s: number;
}

/** Converts planar (e, n) points to three.js frames with miter-scaled left normals. */
export function pathFrames(points: number[], elevation?: number[], maxMiter = 2.5): PathFrame[] {
  const count = points.length / 2;
  const frames: PathFrame[] = [];
  let s = 0;
  for (let i = 0; i < count; i++) {
    const x = points[i * 2];
    const z = -points[i * 2 + 1];
    if (i > 0) s += Math.hypot(x - frames[i - 1].x, z - frames[i - 1].z);
    const prev = i > 0 ? i - 1 : i;
    const next = i < count - 1 ? i + 1 : i;
    let dx0 = x - points[prev * 2];
    let dz0 = z + points[prev * 2 + 1];
    let dx1 = points[next * 2] - x;
    let dz1 = -points[next * 2 + 1] - z;
    const l0 = Math.hypot(dx0, dz0) || 1;
    const l1 = Math.hypot(dx1, dz1) || 1;
    dx0 /= l0;
    dz0 /= l0;
    dx1 /= l1;
    dz1 /= l1;
    if (i === 0) {
      dx0 = dx1;
      dz0 = dz1;
    }
    if (i === count - 1) {
      dx1 = dx0;
      dz1 = dz0;
    }
    let lx = dz0 + dz1;
    let lz = -(dx0 + dx1);
    const length = Math.hypot(lx, lz);
    if (length < 1e-6) {
      lx = dz1;
      lz = -dx1;
    } else {
      lx /= length;
      lz /= length;
    }
    const miter = Math.min(maxMiter, 1 / Math.max(0.2, lx * dz1 - lz * dx1));
    frames.push({ x, z, y: elevation?.[i] ?? 0, lx: lx * miter, lz: lz * miter, s });
  }
  return frames;
}
