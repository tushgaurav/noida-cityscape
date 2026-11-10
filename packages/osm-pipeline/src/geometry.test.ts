import { describe, expect, it } from 'vitest';
import {
  assembleRings,
  buildPolygons,
  clipLine,
  clipRingToBounds,
  normaliseRing,
  orientRing,
  pointInPolygon,
  ringCentroid,
  signedArea,
  simplifyLine,
} from './geometry';

const square = [0, 0, 10, 0, 10, 10, 0, 10];

describe('ring utilities', () => {
  it('computes signed area with counter-clockwise positive', () => {
    expect(signedArea(square)).toBe(100);
    expect(signedArea(orientRing(square, false))).toBe(-100);
  });

  it('normalises closed OSM rings and drops collinear points', () => {
    const ring = normaliseRing([0, 0, 5, 0, 10, 0, 10, 10, 0, 10, 0, 0]);
    expect(ring).toEqual(square);
  });

  it('rejects degenerate rings', () => {
    expect(normaliseRing([0, 0, 1, 0, 0, 0])).toBeNull();
    expect(normaliseRing([0, 0, 0.5, 0, 0.5, 0.5, 0, 0])).toBeNull();
  });

  it('finds the area centroid', () => {
    expect(ringCentroid(square)).toEqual([5, 5]);
  });

  it('respects holes in point-in-polygon tests', () => {
    const polygon = [square, orientRing([3, 3, 7, 3, 7, 7, 3, 7], false)];
    expect(pointInPolygon(1, 1, polygon)).toBe(true);
    expect(pointInPolygon(5, 5, polygon)).toBe(false);
    expect(pointInPolygon(11, 5, polygon)).toBe(false);
  });
});

describe('simplifyLine', () => {
  it('keeps corners and removes jitter below tolerance', () => {
    expect(simplifyLine([0, 0, 5, 0.05, 10, 0, 10, 10], 0.1)).toEqual([0, 0, 10, 0, 10, 10]);
  });
});

describe('clipping', () => {
  const bounds = { minE: 0, minN: 0, maxE: 10, maxN: 10 };

  it('clips rings to a rectangle', () => {
    const clipped = clipRingToBounds([-5, -5, 5, -5, 5, 5, -5, 5], bounds);
    expect(clipped).not.toBeNull();
    expect(Math.abs(signedArea(clipped!))).toBeCloseTo(25, 6);
  });

  it('splits polylines that leave and re-enter the rectangle', () => {
    const pieces = clipLine([-5, 2, 5, 2, 5, 15, 8, 15, 8, 5], bounds);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toEqual([0, 2, 5, 2, 5, 10]);
    expect(pieces[1]).toEqual([8, 10, 8, 5]);
  });
});

describe('multipolygon assembly', () => {
  it('stitches open fragments into rings and assigns holes', () => {
    const outers = assembleRings([
      [0, 0, 10, 0, 10, 10],
      [0, 0, 0, 10, 10, 10],
    ]);
    expect(outers).toHaveLength(1);
    const polygons = buildPolygons(outers, [[3, 3, 7, 3, 7, 7, 3, 7, 3, 3]]);
    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toHaveLength(2);
    expect(signedArea(polygons[0][0])).toBeGreaterThan(0);
    expect(signedArea(polygons[0][1])).toBeLessThan(0);
  });
});
