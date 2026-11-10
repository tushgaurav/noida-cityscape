import type { Building, Poi, PoiKind, Polygon } from '@noida/city-schema';
import { type PipelineContext, isAreaRelation, relationPolygons, wayPolygon } from '../context';
import { boundsContain, coordsBounds, pointInPolygon, ringCentroid, round1, signedArea } from '../geometry';
import type { OsmIndex, OsmTags } from '../osm';
import { isClosedWay } from '../osm';
import { GridIndex } from '../spatial';

const BASE_IMPORTANCE: Record<PoiKind, number> = {
  locality: 95,
  metro_station: 100,
  hospital: 82,
  university: 80,
  college: 74,
  mall: 70,
  government: 52,
  school: 46,
  hotel: 44,
  office: 38,
  residential: 34,
  park: 30,
  landmark: 32,
  worship: 28,
  fuel: 16,
  bank: 14,
  food: 10,
  shop: 8,
};

export function classifyPoi(tags: OsmTags): { kind: PoiKind; penalty?: number } | null {
  const { amenity, shop, office, tourism, leisure, landuse, place, railway } = tags;
  if (railway === 'station' || (tags.public_transport === 'station' && tags.station)) return { kind: 'metro_station' };
  if (place === 'suburb' || place === 'neighbourhood' || place === 'quarter' || place === 'hamlet' || place === 'village') {
    return { kind: 'locality', penalty: place === 'suburb' ? 0 : 15 };
  }
  if (/^sector \d+/i.test(tags.name ?? '') && landuse) return { kind: 'locality', penalty: 5 };
  if (amenity === 'hospital') return { kind: 'hospital', penalty: /clinic|nursing|eye|dental/i.test(tags.name ?? '') ? 35 : 0 };
  if (amenity === 'clinic' || amenity === 'dentist') return { kind: 'hospital', penalty: 50 };
  if (amenity === 'university') return { kind: 'university' };
  if (amenity === 'college' || office === 'educational_institution' || landuse === 'education') return { kind: 'college' };
  if (amenity === 'school') return { kind: 'school' };
  if (shop === 'mall' || shop === 'department_store' || /\bmall\b/i.test(tags.name ?? '')) return { kind: 'mall' };
  if (office === 'government' || amenity === 'townhall' || amenity === 'police' || amenity === 'post_office') {
    return { kind: 'government' };
  }
  if (tourism === 'hotel' || tourism === 'guest_house') return { kind: 'hotel' };
  if (amenity === 'place_of_worship') return { kind: 'worship' };
  if (amenity === 'events_venue' || amenity === 'cinema' || amenity === 'theatre' || tourism === 'attraction') {
    return { kind: 'landmark' };
  }
  if (office || landuse === 'commercial' || tags.building === 'office' || tags.building === 'commercial') return { kind: 'office' };
  if (landuse === 'residential') return { kind: 'residential' };
  if (leisure === 'park' || leisure === 'garden') return { kind: 'park' };
  if (amenity === 'fuel') return { kind: 'fuel' };
  if (amenity === 'bank') return { kind: 'bank' };
  if (amenity === 'restaurant' || amenity === 'cafe' || amenity === 'fast_food' || amenity === 'food_court') return { kind: 'food' };
  if (shop === 'supermarket') return { kind: 'shop', penalty: -10 };
  if (shop) return { kind: 'shop' };
  return null;
}

const normaliseName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097f]+/g, ' ')
    .replace(/\b(noida|indirapuram|ghaziabad|gautam buddha nagar|campus|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function extractPois(osm: OsmIndex, ctx: PipelineContext, buildings: Building[], regionName: string): Poi[] {
  const buildingGrid = new GridIndex<Building>(80);
  for (const building of buildings) buildingGrid.insert(building, coordsBounds(building.polygon[0]));

  const candidates: Poi[] = [];
  const add = (id: string, tags: OsmTags, e: number, n: number, area = 0) => {
    const name = (tags['name:en'] ?? tags.name)?.split('\n')[0].trim();
    if (!name || !boundsContain(ctx.bounds, e, n)) return;
    const classified = classifyPoi(tags);
    if (!classified) return;
    const areaBonus = area > 400 && classified.kind !== 'locality' ? Math.min(22, Math.log2(area / 400) * 4) : 0;
    const regionBonus = normaliseName(name) === normaliseName(regionName) ? 30 : 0;
    const building = buildingGrid.query(e, n).find((b) => pointInPolygon(e, n, b.polygon));
    candidates.push({
      id,
      name,
      kind: classified.kind,
      e: round1(e),
      n: round1(n),
      importance: Math.round(BASE_IMPORTANCE[classified.kind] - (classified.penalty ?? 0) + areaBonus + regionBonus),
      buildingId: building?.id,
    });
  };

  for (const node of osm.nodes) {
    if (!node.tags?.name || node.tags.railway === 'stop' || node.tags.public_transport === 'stop_position') continue;
    const [e, n] = ctx.projection.toPlanar(node.lat, node.lon);
    add(`n${node.id}`, node.tags, e, n);
  }
  const addPolygon = (id: string, tags: OsmTags, polygon: Polygon | null) => {
    if (!polygon) return;
    const [e, n] = ringCentroid(polygon[0]);
    const inside = pointInPolygon(e, n, polygon) ? [e, n] : [polygon[0][0], polygon[0][1]];
    add(id, tags, inside[0], inside[1], Math.abs(signedArea(polygon[0])));
  };
  for (const way of osm.ways) {
    if (!way.tags?.name || way.tags.highway || way.tags.railway || !isClosedWay(way)) continue;
    addPolygon(`w${way.id}`, way.tags, wayPolygon(way, ctx));
  }
  for (const relation of osm.relations) {
    if (!relation.tags?.name || !isAreaRelation(relation)) continue;
    addPolygon(`r${relation.id}`, relation.tags, relationPolygons(relation, ctx)[0] ?? null);
  }

  candidates.sort((a, b) => b.importance - a.importance);
  const kept: Poi[] = [];
  for (const poi of candidates) {
    const key = normaliseName(poi.name);
    const duplicate = kept.some(
      (other) => normaliseName(other.name) === key && Math.hypot(other.e - poi.e, other.n - poi.n) < 300,
    );
    if (!duplicate) kept.push(poi);
  }
  return kept;
}
