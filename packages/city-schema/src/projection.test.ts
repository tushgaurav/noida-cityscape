import { describe, expect, it } from 'vitest';
import { bboxAround, bboxToPlanar, createProjection } from './projection';

describe('createProjection', () => {
  const origin = { lat: 28.6225, lon: 77.3655 };
  const projection = createProjection(origin);

  it('maps the origin to zero', () => {
    expect(projection.toPlanar(origin.lat, origin.lon)).toEqual([0, 0]);
  });

  it('round-trips planar and geographic coordinates', () => {
    const [e, n] = projection.toPlanar(28.6311, 77.3712);
    const [lat, lon] = projection.toGeo(e, n);
    expect(lat).toBeCloseTo(28.6311, 9);
    expect(lon).toBeCloseTo(77.3712, 9);
  });

  it('uses realistic metre scales at Noida latitude', () => {
    const [, north] = projection.toPlanar(origin.lat + 0.01, origin.lon);
    const [east] = projection.toPlanar(origin.lat, origin.lon + 0.01);
    expect(north).toBeGreaterThan(1106);
    expect(north).toBeLessThan(1110);
    expect(east).toBeGreaterThan(975);
    expect(east).toBeLessThan(981);
  });

  it('builds a symmetric bbox around a point', () => {
    const bounds = bboxToPlanar(bboxAround(origin, 1000, 500), projection);
    expect(bounds.minE).toBeCloseTo(-1000, 6);
    expect(bounds.maxE).toBeCloseTo(1000, 6);
    expect(bounds.minN).toBeCloseTo(-500, 6);
    expect(bounds.maxN).toBeCloseTo(500, 6);
  });
});
