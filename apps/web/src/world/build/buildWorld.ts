import type { CityData } from '@noida/city-schema';
import type { WorldBuffers } from '../types';
import { buildAreas, buildBarriers } from './areas';
import { buildBuildingChunks } from './buildings';
import { buildRail } from './rail';
import { buildRoads } from './roads';
import { buildRooftops } from './rooftops';
import { buildTrees } from './trees';

export function buildWorld(city: CityData, report: (label: string, progress: number) => void): WorldBuffers {
  const { stats } = city.meta;
  report(`Extruding ${stats.buildings.toLocaleString()} building footprints`, 0.05);
  const buildingChunks = buildBuildingChunks(city, (fraction) =>
    report(`Extruding ${stats.buildings.toLocaleString()} building footprints`, 0.05 + fraction * 0.35),
  );
  report('Placing water tanks, stair rooms and rooftop plant', 0.42);
  const { rooftops, waterTanks } = buildRooftops(city);
  report(`Laying ${stats.roadKm.toLocaleString()} km of road, footpaths and flyovers`, 0.55);
  const { roadTiers, sidewalks, bridgeStructure, lamps } = buildRoads(city);
  report('Painting parks, campuses and parking lots', 0.75);
  const areaLayers = buildAreas(city);
  const barriers = buildBarriers(city);
  report('Raising the Blue Line viaduct', 0.83);
  const { railStructure, railTrackBed } = buildRail(city);
  report(`Planting ${stats.trees.toLocaleString()} neem and ashoka trees`, 0.92);
  const treeChunks = buildTrees(city);
  report('Handing over to the GPU', 0.98);
  return {
    buildingChunks,
    rooftops,
    waterTanks,
    areaLayers,
    roadTiers,
    sidewalks,
    bridgeStructure,
    barriers,
    railStructure,
    railTrackBed,
    treeChunks,
    lamps,
  };
}
