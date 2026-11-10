import type { FlatCoords, PlanarBounds, Polygon, Projection } from '@noida/city-schema';
import { assembleRings, buildPolygons, normaliseRing, orientRing } from './geometry';
import type { OsmLatLon, OsmRelation, OsmWay } from './osm';

export interface PipelineContext {
  projection: Projection;
  bounds: PlanarBounds;
  seed: number;
}

export function projectGeometry(geometry: (OsmLatLon | null)[] | undefined, ctx: PipelineContext): FlatCoords {
  const coords: number[] = [];
  if (!geometry) return coords;
  for (const point of geometry) {
    if (!point) continue;
    const [e, n] = ctx.projection.toPlanar(point.lat, point.lon);
    coords.push(e, n);
  }
  return coords;
}

export function wayPolygon(way: OsmWay, ctx: PipelineContext): Polygon | null {
  const ring = normaliseRing(projectGeometry(way.geometry, ctx));
  return ring ? [orientRing(ring, true)] : null;
}

export function relationPolygons(relation: OsmRelation, ctx: PipelineContext): Polygon[] {
  const outers: FlatCoords[] = [];
  const inners: FlatCoords[] = [];
  for (const member of relation.members) {
    if (member.type !== 'way' || !member.geometry) continue;
    const coords = projectGeometry(member.geometry, ctx);
    if (member.role === 'inner') inners.push(coords);
    else outers.push(coords);
  }
  return buildPolygons(assembleRings(outers), assembleRings(inners));
}

export const isAreaRelation = (relation: OsmRelation) =>
  relation.tags?.type === 'multipolygon' || relation.tags?.type === 'boundary';
