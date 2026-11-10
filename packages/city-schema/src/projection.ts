import type { GeoBBox, GeoPoint, PlanarBounds } from './types';

const DEG = Math.PI / 180;

export function metresPerDegree(lat: number): { lat: number; lon: number } {
  const phi = lat * DEG;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi) - 0.0023 * Math.cos(6 * phi),
    lon: 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi) + 0.118 * Math.cos(5 * phi),
  };
}

export interface Projection {
  origin: GeoPoint;
  toPlanar(lat: number, lon: number): [e: number, n: number];
  toGeo(e: number, n: number): [lat: number, lon: number];
}

/** Local tangent-plane projection, accurate to centimetres over a few kilometres. */
export function createProjection(origin: GeoPoint): Projection {
  const scale = metresPerDegree(origin.lat);
  return {
    origin,
    toPlanar: (lat, lon) => [(lon - origin.lon) * scale.lon, (lat - origin.lat) * scale.lat],
    toGeo: (e, n) => [origin.lat + n / scale.lat, origin.lon + e / scale.lon],
  };
}

export function bboxAround(center: GeoPoint, halfWidth: number, halfHeight = halfWidth): GeoBBox {
  const scale = metresPerDegree(center.lat);
  return {
    south: center.lat - halfHeight / scale.lat,
    north: center.lat + halfHeight / scale.lat,
    west: center.lon - halfWidth / scale.lon,
    east: center.lon + halfWidth / scale.lon,
  };
}

export function bboxToPlanar(bbox: GeoBBox, projection: Projection): PlanarBounds {
  const [minE, minN] = projection.toPlanar(bbox.south, bbox.west);
  const [maxE, maxN] = projection.toPlanar(bbox.north, bbox.east);
  return { minE, minN, maxE, maxN };
}
