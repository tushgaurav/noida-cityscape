import type { Area, AreaKind, Polygon } from '@noida/city-schema';
import { type PipelineContext, isAreaRelation, relationPolygons, wayPolygon } from '../context';
import { clipPolygonToBounds, coordsBounds, pointInPolygon, roundCoords, signedArea } from '../geometry';
import type { OsmIndex, OsmTags } from '../osm';
import { isClosedWay } from '../osm';
import { GridIndex } from '../spatial';

const LEISURE: Record<string, AreaKind> = {
  park: 'park',
  garden: 'garden',
  pitch: 'pitch',
  track: 'pitch',
  stadium: 'pitch',
  sports_centre: 'pitch',
  playground: 'playground',
  golf_course: 'grass',
  swimming_pool: 'pool',
  nature_reserve: 'forest',
  common: 'grass',
};

const LANDUSE: Record<string, AreaKind> = {
  grass: 'grass',
  meadow: 'grass',
  village_green: 'grass',
  recreation_ground: 'grass',
  flowerbed: 'garden',
  forest: 'forest',
  orchard: 'farmland',
  farmland: 'farmland',
  plant_nursery: 'farmland',
  greenhouse_horticulture: 'farmland',
  reservoir: 'water',
  basin: 'water',
  residential: 'residential',
  commercial: 'commercial',
  industrial: 'industrial',
  retail: 'retail',
  construction: 'construction',
  brownfield: 'brownfield',
  greenfield: 'brownfield',
  landfill: 'bare',
  quarry: 'bare',
  cemetery: 'cemetery',
  religious: 'religious',
  military: 'military',
  education: 'campus',
  institutional: 'campus',
};

const NATURAL: Record<string, AreaKind> = {
  wood: 'forest',
  scrub: 'scrub',
  heath: 'scrub',
  grassland: 'grass',
  water: 'water',
  wetland: 'wetland',
  sand: 'sand',
  beach: 'sand',
  bare_rock: 'bare',
};

const AMENITY: Record<string, AreaKind> = {
  parking: 'parking',
  university: 'campus',
  college: 'campus',
  school: 'campus',
  kindergarten: 'campus',
  hospital: 'hospital_grounds',
  clinic: 'hospital_grounds',
  grave_yard: 'cemetery',
  place_of_worship: 'religious',
  marketplace: 'plaza',
  fountain: 'pool',
};

export function classifyArea(tags: OsmTags): AreaKind | null {
  if (tags.building || tags['building:part']) return null;
  if (tags.highway) return tags.area === 'yes' && tags.highway === 'pedestrian' ? 'plaza' : null;
  if (tags.amenity === 'parking' && (tags.parking === 'underground' || tags.parking === 'multi-storey')) return null;
  return (
    (tags.leisure && LEISURE[tags.leisure]) ||
    (tags.natural && NATURAL[tags.natural]) ||
    (tags.water || tags.waterway === 'riverbank' ? 'water' : null) ||
    (tags.amenity && AMENITY[tags.amenity]) ||
    (tags.landuse && LANDUSE[tags.landuse]) ||
    (tags.place === 'square' ? 'plaza' : null)
  );
}

const LANDUSE_CONTEXT = new Set<AreaKind>([
  'residential',
  'commercial',
  'retail',
  'industrial',
  'campus',
  'hospital_grounds',
  'religious',
  'military',
]);

export function createLanduseLookup(areas: Area[]): (e: number, n: number) => AreaKind | undefined {
  const grid = new GridIndex<{ area: Area; size: number }>(100);
  for (const area of areas) {
    if (!LANDUSE_CONTEXT.has(area.kind)) continue;
    grid.insert({ area, size: Math.abs(signedArea(area.polygon[0])) }, coordsBounds(area.polygon[0]));
  }
  return (e, n) => {
    let best: { area: Area; size: number } | undefined;
    for (const entry of grid.query(e, n)) {
      if ((!best || entry.size < best.size) && pointInPolygon(e, n, entry.area.polygon)) best = entry;
    }
    return best?.area.kind;
  };
}

export function extractAreas(osm: OsmIndex, ctx: PipelineContext): Area[] {
  const areas: Area[] = [];
  const push = (id: string, kind: AreaKind, polygon: Polygon, tags: OsmTags) => {
    const clipped = clipPolygonToBounds(polygon, ctx.bounds);
    if (clipped) areas.push({ id, kind, polygon: clipped.map(roundCoords), name: tags.name });
  };
  for (const way of osm.ways) {
    if (!way.tags || !isClosedWay(way)) continue;
    const kind = classifyArea(way.tags);
    const polygon = kind && wayPolygon(way, ctx);
    if (kind && polygon) push(`w${way.id}`, kind, polygon, way.tags);
  }
  for (const relation of osm.relations) {
    if (!relation.tags || !isAreaRelation(relation)) continue;
    const kind = classifyArea(relation.tags);
    if (!kind) continue;
    relationPolygons(relation, ctx).forEach((polygon, index) =>
      push(index ? `r${relation.id}-${index}` : `r${relation.id}`, kind, polygon, relation.tags!),
    );
  }
  return areas;
}
