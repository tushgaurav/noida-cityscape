import type { AreaKind, FacadeStyle, RoadKind } from '@noida/city-schema';
import { Color } from 'three';

export type RGB = [number, number, number];

const scratch = new Color();

export function linearRgb(css: string, fallback = '#cccccc'): RGB {
  try {
    scratch.setStyle(css);
  } catch {
    scratch.setStyle(fallback);
  }
  return [scratch.r, scratch.g, scratch.b];
}

export const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export const FACADE_CODE: Record<FacadeStyle, number> = {
  glass: 0,
  office: 1,
  plaster: 2,
  brick: 3,
  industrial: 4,
  construction: 5,
};

export const WALL_PALETTE: Record<FacadeStyle, string[]> = {
  glass: ['#5d7d8d', '#46636f', '#6f8c95', '#3e5a66', '#7b9098', '#4f6d63', '#55707f', '#8a9ea4'],
  office: ['#d6d3cb', '#c3bdb1', '#e2ddd3', '#b2aea4', '#cfc6b5', '#bfb8ab', '#d8cfbf', '#a9a59b'],
  plaster: [
    '#e9dcc3',
    '#efe6d6',
    '#dcc6a6',
    '#e6cdb6',
    '#d4d4cc',
    '#e8d5a6',
    '#cfae8f',
    '#ebe0d0',
    '#dbb79b',
    '#c8bfae',
    '#e4d9bf',
    '#d9c9b0',
  ],
  brick: ['#8f5d48', '#9a6a55', '#86584a', '#a07560'],
  industrial: ['#bcb8b0', '#a9a59c', '#c6c2b7', '#909ca2', '#b5ada0'],
  construction: ['#9d968a', '#8f897e', '#a7a094'],
};

export const ROOF_PALETTE: Record<FacadeStyle, string[]> = {
  glass: ['#8f8c86', '#9b978f', '#7f7d79', '#a39f97'],
  office: ['#9d978c', '#a8a295', '#8f8a80', '#b1aa9c', '#cfcbc3'],
  plaster: ['#a19a8e', '#ada596', '#948d82', '#b8b09f', '#a3806a', '#c9c4ba', '#8e8679'],
  brick: ['#a3806a', '#9a8f80', '#ab9f8d'],
  industrial: ['#8d9499', '#6f7e88', '#a3a7a4', '#9b9a94'],
  construction: ['#8a857c', '#7d786f'],
};

export const ROAD_KIND_CODE: Record<RoadKind, number> = {
  motorway: 0,
  trunk: 1,
  primary: 2,
  secondary: 3,
  tertiary: 4,
  unclassified: 5,
  residential: 6,
  living_street: 7,
  service: 8,
  pedestrian: 9,
  track: 10,
  footway: 11,
  cycleway: 12,
  path: 13,
  steps: 14,
};

export const ROAD_TIER: Record<RoadKind, number> = {
  motorway: 0,
  trunk: 0,
  primary: 0,
  secondary: 1,
  tertiary: 1,
  unclassified: 2,
  residential: 2,
  living_street: 2,
  service: 2,
  pedestrian: 3,
  track: 3,
  footway: 3,
  cycleway: 3,
  path: 3,
  steps: 3,
};

export const AREA_KIND_CODE: Record<AreaKind, number> = {
  residential: 0,
  commercial: 1,
  industrial: 2,
  retail: 3,
  military: 4,
  campus: 5,
  hospital_grounds: 6,
  religious: 7,
  construction: 8,
  brownfield: 9,
  farmland: 10,
  cemetery: 11,
  park: 12,
  garden: 13,
  grass: 14,
  forest: 15,
  scrub: 16,
  sand: 17,
  bare: 18,
  wetland: 19,
  parking: 20,
  pitch: 21,
  playground: 22,
  plaza: 23,
  water: 24,
  pool: 25,
};

export function areaLayer(kind: AreaKind): number {
  const code = AREA_KIND_CODE[kind];
  if (code >= 24) return 3;
  if (code >= 20) return 2;
  if (code >= 12) return 1;
  return 0;
}
