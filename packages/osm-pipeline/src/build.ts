import {
  CITY_DATA_VERSION,
  type CityData,
  type GeoBBox,
  TREE_STRIDE,
  bboxAround,
  bboxToPlanar,
  createProjection,
} from '@noida/city-schema';
import type { PipelineContext } from './context';
import { createLanduseLookup, extractAreas } from './extract/areas';
import { extractBuildings } from './extract/buildings';
import { extractBarriers, extractRail } from './extract/lines';
import { extractPois } from './extract/pois';
import { MOTOR_KINDS, extractRoads } from './extract/roads';
import { generateTrees } from './extract/trees';
import { lineLength, round1 } from './geometry';
import { type OverpassResponse, indexElements } from './osm';
import type { RegionConfig } from './regions';

export function buildCity(raw: OverpassResponse & { bbox?: GeoBBox }, region: RegionConfig): CityData {
  const projection = createProjection(region.center);
  const bbox = bboxAround(region.center, region.halfWidth, region.halfHeight);
  const ctx: PipelineContext = { projection, bounds: bboxToPlanar(bbox, projection), seed: region.seed };
  const osm = indexElements(raw.elements);

  const areas = extractAreas(osm, ctx);
  const buildings = extractBuildings(osm, ctx, createLanduseLookup(areas));
  const { roads, nodes } = extractRoads(osm, ctx);
  const rail = extractRail(osm, ctx);
  const barriers = extractBarriers(osm, ctx);
  const pois = extractPois(osm, ctx, buildings, region.name);
  const trees = generateTrees(osm, ctx, buildings, roads, rail, areas);
  const [focusE, focusN] = projection.toPlanar(region.focus.lat, region.focus.lon);

  const km = (lines: { points: number[] }[]) => round1(lines.reduce((sum, line) => sum + lineLength(line.points), 0) / 1000);

  return {
    version: CITY_DATA_VERSION,
    meta: {
      regionId: region.id,
      name: region.name,
      subtitle: region.subtitle,
      origin: region.center,
      bbox,
      bounds: {
        minE: round1(ctx.bounds.minE),
        minN: round1(ctx.bounds.minN),
        maxE: round1(ctx.bounds.maxE),
        maxN: round1(ctx.bounds.maxN),
      },
      focus: { e: round1(focusE), n: round1(focusN) },
      osmTimestamp: raw.osm3s.timestamp_osm_base,
      generatedAt: new Date().toISOString(),
      attribution: '© OpenStreetMap contributors (ODbL)',
      stats: {
        buildings: buildings.length,
        taggedHeights: buildings.filter((b) => b.heightSource !== 'estimated').length,
        roadKm: km(roads.filter((road) => MOTOR_KINDS.has(road.kind))),
        railKm: km(rail),
        trees: trees.length / TREE_STRIDE,
        areas: areas.length,
        pois: pois.length,
      },
    },
    buildings,
    roads,
    roadNodes: nodes,
    rail,
    areas,
    barriers,
    trees,
    pois,
  };
}
