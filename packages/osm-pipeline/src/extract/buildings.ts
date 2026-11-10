import type { AreaKind, Building, BuildingKind, FacadeStyle, HeightSource, Polygon } from '@noida/city-schema';
import { type PipelineContext, isAreaRelation, relationPolygons, wayPolygon } from '../context';
import { boundsContain, coordsBounds, pointInPolygon, round1, roundCoords, ringCentroid, signedArea } from '../geometry';
import type { OsmIndex, OsmNode, OsmTags } from '../osm';
import { isClosedWay } from '../osm';
import { seededRandom } from '../random';
import { GridIndex } from '../spatial';
import { normaliseColour, parseLength, parseNumber } from '../tags';

const BUILDING_KINDS: Record<string, BuildingKind> = {
  apartments: 'apartments',
  dormitory: 'apartments',
  residential: 'residential',
  house: 'house',
  detached: 'house',
  semidetached_house: 'house',
  terrace: 'house',
  bungalow: 'house',
  commercial: 'commercial',
  office: 'office',
  retail: 'retail',
  supermarket: 'retail',
  mall: 'retail',
  industrial: 'industrial',
  factory: 'industrial',
  manufacture: 'industrial',
  warehouse: 'warehouse',
  school: 'education',
  university: 'education',
  college: 'education',
  kindergarten: 'education',
  hospital: 'hospital',
  temple: 'religious',
  mosque: 'religious',
  church: 'religious',
  gurudwara: 'religious',
  religious: 'religious',
  shrine: 'religious',
  chapel: 'religious',
  civic: 'civic',
  government: 'civic',
  public: 'civic',
  fire_station: 'civic',
  train_station: 'transport',
  transportation: 'transport',
  hotel: 'hotel',
  construction: 'construction',
  roof: 'roof',
  carport: 'roof',
  canopy: 'roof',
  shed: 'shelter',
  garage: 'shelter',
  garages: 'shelter',
  hut: 'shelter',
  cabin: 'shelter',
  kiosk: 'shelter',
  toilets: 'shelter',
  guardhouse: 'shelter',
  container: 'shelter',
  service: 'utility',
  transformer_tower: 'utility',
  water_tower: 'utility',
};

const FLOOR_HEIGHT: Record<BuildingKind, number> = {
  residential: 3.1,
  apartments: 3.1,
  house: 3.1,
  commercial: 3.8,
  office: 3.8,
  retail: 4.2,
  industrial: 5.5,
  warehouse: 8,
  education: 3.8,
  hospital: 3.9,
  religious: 5,
  civic: 3.8,
  transport: 6,
  hotel: 3.4,
  construction: 3.4,
  shelter: 3.2,
  roof: 4.5,
  utility: 3.5,
  generic: 3.4,
};

function inferKind(tags: OsmTags): BuildingKind {
  const value = tags.building ?? tags['building:part'] ?? 'yes';
  const direct = BUILDING_KINDS[value];
  if (direct) return direct;
  const amenity = tags.amenity;
  if (amenity === 'hospital' || amenity === 'clinic') return 'hospital';
  if (amenity === 'school' || amenity === 'college' || amenity === 'university') return 'education';
  if (amenity === 'place_of_worship') return 'religious';
  if (amenity === 'fuel') return 'roof';
  if (tags.tourism === 'hotel') return 'hotel';
  if (tags.shop === 'mall' || tags.shop === 'supermarket' || tags.shop === 'department_store') return 'retail';
  if (tags.office) return 'office';
  if (tags.railway === 'station' || tags.public_transport === 'station') return 'transport';
  if (tags.industrial || tags.man_made === 'works') return 'industrial';
  return 'generic';
}

function estimateLevels(kind: BuildingKind, area: number, rand: () => number): number {
  const between = (min: number, max: number) => Math.round(min + rand() * (max - min));
  switch (kind) {
    case 'house':
      return between(2, 3);
    case 'residential':
    case 'apartments':
      if (area > 700) return between(10, 20);
      if (area > 250) return between(4, 6);
      return between(2, 4);
    case 'office':
    case 'commercial':
      if (area > 3000) return between(6, 12);
      if (area > 1200) return between(5, 9);
      if (area > 400) return between(3, 6);
      return between(2, 4);
    case 'retail':
      return area > 2000 ? between(3, 5) : between(1, 3);
    case 'industrial':
      return area > 2000 ? between(1, 3) : between(1, 2);
    case 'warehouse':
    case 'roof':
    case 'shelter':
    case 'utility':
      return 1;
    case 'education':
      return area > 1500 ? between(4, 7) : between(3, 5);
    case 'hospital':
      return area > 2000 ? between(6, 10) : between(3, 6);
    case 'religious':
      return between(1, 2);
    case 'civic':
      return between(3, 5);
    case 'transport':
      return 3;
    case 'hotel':
      return between(5, 10);
    case 'construction':
      return between(2, 8);
    case 'generic':
      if (area < 60) return between(1, 2);
      if (area < 150) return between(2, 3);
      if (area < 400) return between(3, 4);
      if (area < 1200) return between(3, 6);
      if (area < 3000) return between(4, 8);
      return between(5, 10);
  }
}

const LANDUSE_KIND: Partial<Record<AreaKind, BuildingKind>> = {
  residential: 'residential',
  commercial: 'commercial',
  retail: 'retail',
  industrial: 'industrial',
  campus: 'education',
  hospital_grounds: 'hospital',
  religious: 'religious',
  military: 'civic',
};

function refineByLanduse(kind: BuildingKind, landuse: AreaKind | undefined, area: number): BuildingKind {
  if (kind !== 'generic' || !landuse) return kind;
  const mapped = LANDUSE_KIND[landuse];
  if (mapped === 'industrial') return area > 2500 ? 'industrial' : 'commercial';
  if (mapped === 'education' || mapped === 'hospital') return area > 150 ? mapped : 'shelter';
  return mapped ?? kind;
}

function pickFacade(kind: BuildingKind, tags: OsmTags, levels: number, area: number, rand: () => number): FacadeStyle {
  const material = `${tags['building:material'] ?? ''} ${tags['building:facade:material'] ?? ''}`;
  if (/glass/.test(material)) return 'glass';
  if (/brick/.test(material)) return 'brick';
  if (/metal|steel/.test(material)) return 'industrial';
  const roll = rand();
  switch (kind) {
    case 'construction':
      return 'construction';
    case 'industrial':
    case 'warehouse':
    case 'utility':
    case 'shelter':
    case 'roof':
      return 'industrial';
    case 'office':
    case 'commercial':
    case 'hotel':
      return levels >= 4 && roll < 0.6 ? 'glass' : 'office';
    case 'retail':
      return roll < 0.4 ? 'glass' : 'office';
    case 'education':
    case 'hospital':
    case 'civic':
    case 'transport':
      return roll < 0.15 ? 'glass' : 'office';
    case 'residential':
    case 'apartments':
    case 'house':
    case 'religious':
      return roll < 0.15 ? 'brick' : 'plaster';
    case 'generic':
      if (area > 1200) return roll < 0.45 ? 'glass' : 'office';
      if (area > 350) return levels >= 5 && roll < 0.25 ? 'glass' : roll < 0.6 ? 'office' : 'plaster';
      return roll < 0.1 ? 'brick' : 'plaster';
  }
}

function formatAddress(tags: OsmTags): string | undefined {
  const parts = [tags['addr:housename'], tags['addr:housenumber'], tags['addr:street'], tags['addr:place']].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

interface Candidate {
  id: string;
  osmId: number;
  tags: OsmTags;
  polygon: Polygon;
  isPart: boolean;
}

const MERGEABLE_POINT_TAGS = ['name', 'amenity', 'office', 'shop', 'tourism', 'healthcare', 'addr:housenumber', 'addr:street'];

export function extractBuildings(
  osm: OsmIndex,
  ctx: PipelineContext,
  landuseAt: (e: number, n: number) => AreaKind | undefined = () => undefined,
): Building[] {
  const candidates: Candidate[] = [];
  const isBuilding = (tags: OsmTags | undefined) =>
    !!tags &&
    ((tags.building && tags.building !== 'no') || (tags['building:part'] && tags['building:part'] !== 'no')) &&
    tags.location !== 'underground' &&
    tags.parking !== 'underground';

  for (const way of osm.ways) {
    if (!isBuilding(way.tags) || !isClosedWay(way)) continue;
    const polygon = wayPolygon(way, ctx);
    if (polygon) candidates.push({ id: `w${way.id}`, osmId: way.id, tags: way.tags!, polygon, isPart: !way.tags!.building });
  }
  for (const relation of osm.relations) {
    if (!isBuilding(relation.tags) || !isAreaRelation(relation)) continue;
    relationPolygons(relation, ctx).forEach((polygon, index) =>
      candidates.push({
        id: index === 0 ? `r${relation.id}` : `r${relation.id}-${index}`,
        osmId: relation.id,
        tags: relation.tags!,
        polygon,
        isPart: !relation.tags!.building,
      }),
    );
  }

  const parts = candidates.filter((c) => c.isPart);
  const partGrid = new GridIndex<[number, number]>(60);
  for (const part of parts) {
    const [e, n] = ringCentroid(part.polygon[0]);
    partGrid.insert([e, n], { minE: e, minN: n, maxE: e, maxN: n });
  }

  const pointGrid = new GridIndex<{ e: number; n: number; node: OsmNode }>(60);
  for (const node of osm.nodes) {
    if (!node.tags || !MERGEABLE_POINT_TAGS.some((key) => node.tags![key])) continue;
    const [e, n] = ctx.projection.toPlanar(node.lat, node.lon);
    pointGrid.insert({ e, n, node }, { minE: e, minN: n, maxE: e, maxN: n });
  }

  const buildings: Building[] = [];
  for (const candidate of candidates) {
    const outer = candidate.polygon[0];
    const [ce, cn] = ringCentroid(outer);
    if (!boundsContain(ctx.bounds, ce, cn)) continue;
    const bounds = coordsBounds(outer);

    if (!candidate.isPart && partGrid.queryBounds(bounds).some(([pe, pn]) => pointInPolygon(pe, pn, candidate.polygon))) {
      continue;
    }

    const tags: OsmTags = { ...candidate.tags };
    for (const point of pointGrid.queryBounds(bounds)) {
      if (!pointInPolygon(point.e, point.n, candidate.polygon)) continue;
      for (const key of MERGEABLE_POINT_TAGS) if (!tags[key] && point.node.tags![key]) tags[key] = point.node.tags![key];
    }

    const area = Math.abs(signedArea(outer));
    const rand = seededRandom(`${ctx.seed}:${candidate.id}`);
    const kind = refineByLanduse(inferKind(tags), landuseAt(ce, cn), area);
    const floorHeight = FLOOR_HEIGHT[kind];
    const taggedHeight = parseLength(tags.height ?? tags['building:height']);
    const taggedLevels = parseNumber(tags['building:levels']);
    const roofLevels = parseNumber(tags['roof:levels']) ?? 0;
    const minLevel = parseNumber(tags['building:min_level']);

    let height: number;
    let heightSource: HeightSource;
    if (taggedHeight !== undefined && taggedHeight > 0) {
      height = taggedHeight;
      heightSource = 'tagged';
    } else if (taggedLevels !== undefined && taggedLevels > 0) {
      height = (taggedLevels + roofLevels) * floorHeight + (kind === 'roof' ? 0 : 0.9);
      heightSource = 'levels';
    } else {
      const levels = estimateLevels(kind, area, rand);
      height = levels * floorHeight + (kind === 'roof' || kind === 'shelter' ? 0 : 0.9);
      heightSource = 'estimated';
    }

    let minHeight = parseLength(tags.min_height) ?? (minLevel !== undefined ? minLevel * floorHeight : 0);
    if (kind === 'roof' && tags.min_height === undefined && minLevel === undefined) minHeight = Math.max(height - 0.7, 2.6);
    if (kind === 'transport' && heightSource === 'estimated') height = 18;
    height = Math.min(Math.max(height, minHeight + 0.6), 420);
    const levels = Math.max(1, Math.round((height - minHeight) / floorHeight));

    buildings.push({
      id: candidate.id,
      polygon: candidate.polygon.map(roundCoords),
      height: round1(height),
      minHeight: round1(minHeight),
      levels: taggedLevels ?? levels,
      floorHeight,
      heightSource,
      kind,
      osmType: tags.building ?? tags['building:part'] ?? 'yes',
      facade: pickFacade(kind, tags, levels, area, rand),
      wallColor: normaliseColour(tags['building:colour'] ?? tags['building:color']),
      roofColor: normaliseColour(tags['roof:colour'] ?? tags['roof:color']),
      roofShape: tags['roof:shape'],
      name: tags.name ?? tags['name:en'],
      address: formatAddress(tags),
      isPart: candidate.isPart || undefined,
    });
  }
  return buildings;
}
