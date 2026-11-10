export interface Polyline3 {
  /** three.js coordinates, flattened [x, y, z, ...]. */
  points: Float32Array;
  cumulative: Float32Array;
  length: number;
}

export function createPolyline(planar: number[], elevation?: number[], yOffset = 0): Polyline3 {
  const count = planar.length / 2;
  const points = new Float32Array(count * 3);
  const cumulative = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    points[i * 3] = planar[i * 2];
    points[i * 3 + 1] = (elevation?.[i] ?? 0) + yOffset;
    points[i * 3 + 2] = -planar[i * 2 + 1];
    if (i > 0) {
      cumulative[i] =
        cumulative[i - 1] + Math.hypot(points[i * 3] - points[i * 3 - 3], points[i * 3 + 2] - points[i * 3 - 1]);
    }
  }
  return { points, cumulative, length: cumulative[count - 1] ?? 0 };
}

export interface Sample {
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
}

export function samplePolyline(line: Polyline3, s: number, out: Sample): Sample {
  const { points, cumulative } = line;
  const count = cumulative.length;
  const clamped = Math.min(Math.max(s, 0), line.length);
  let lo = 0;
  let hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid] <= clamped) lo = mid;
    else hi = mid;
  }
  const span = cumulative[hi] - cumulative[lo] || 1;
  const t = (clamped - cumulative[lo]) / span;
  const a = lo * 3;
  const b = hi * 3;
  out.x = points[a] + (points[b] - points[a]) * t;
  out.y = points[a + 1] + (points[b + 1] - points[a + 1]) * t;
  out.z = points[a + 2] + (points[b + 2] - points[a + 2]) * t;
  const dx = points[b] - points[a];
  const dz = points[b + 2] - points[a + 2];
  const length = Math.hypot(dx, dz) || 1;
  out.dx = dx / length;
  out.dz = dz / length;
  return out;
}
