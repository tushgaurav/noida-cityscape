export const CITY_DATA_VERSION = 1 as const;

/** Planar coordinates in metres, flattened as [e0, n0, e1, n1, ...]. +e is east, +n is north. */
export type FlatCoords = number[];

/** First ring is the outer boundary (counter-clockwise), the rest are holes (clockwise). */
export type Polygon = FlatCoords[];

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface GeoBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface PlanarBounds {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

export type BuildingKind =
  | 'residential'
  | 'apartments'
  | 'house'
  | 'commercial'
  | 'office'
  | 'retail'
  | 'industrial'
  | 'warehouse'
  | 'education'
  | 'hospital'
  | 'religious'
  | 'civic'
  | 'transport'
  | 'hotel'
  | 'construction'
  | 'shelter'
  | 'roof'
  | 'utility'
  | 'generic';

export type FacadeStyle = 'glass' | 'office' | 'plaster' | 'brick' | 'industrial' | 'construction';

export type HeightSource = 'tagged' | 'levels' | 'estimated';

export interface Building {
  id: string;
  polygon: Polygon;
  height: number;
  minHeight: number;
  levels: number;
  floorHeight: number;
  heightSource: HeightSource;
  kind: BuildingKind;
  osmType: string;
  facade: FacadeStyle;
  wallColor?: string;
  roofColor?: string;
  roofShape?: string;
  name?: string;
  address?: string;
  isPart?: boolean;
}

export type RoadKind =
  | 'motorway'
  | 'trunk'
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'unclassified'
  | 'residential'
  | 'living_street'
  | 'service'
  | 'pedestrian'
  | 'track'
  | 'footway'
  | 'cycleway'
  | 'path'
  | 'steps';

export interface RoadSegment {
  id: string;
  wayId: number;
  kind: RoadKind;
  link: boolean;
  name?: string;
  ref?: string;
  width: number;
  lanes: number;
  oneway: boolean;
  layer: number;
  bridge: boolean;
  tunnel: boolean;
  surface?: string;
  points: FlatCoords;
  /** Height above ground per vertex, only present for elevated segments. */
  elevation?: number[];
  from: number;
  to: number;
}

export interface RoadNode {
  e: number;
  n: number;
  degree: number;
}

export type RailKind = 'subway' | 'light_rail' | 'rail' | 'monorail' | 'tram';

export interface RailLine {
  id: string;
  kind: RailKind;
  name?: string;
  points: FlatCoords;
  elevated: boolean;
  tunnel: boolean;
  layer: number;
}

export type AreaKind =
  | 'park'
  | 'garden'
  | 'grass'
  | 'forest'
  | 'scrub'
  | 'farmland'
  | 'water'
  | 'pool'
  | 'wetland'
  | 'sand'
  | 'bare'
  | 'parking'
  | 'pitch'
  | 'playground'
  | 'campus'
  | 'hospital_grounds'
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'retail'
  | 'construction'
  | 'brownfield'
  | 'cemetery'
  | 'religious'
  | 'military'
  | 'plaza';

export interface Area {
  id: string;
  kind: AreaKind;
  polygon: Polygon;
  name?: string;
}

export type BarrierKind = 'wall' | 'fence' | 'retaining_wall' | 'hedge';

export interface Barrier {
  id: string;
  kind: BarrierKind;
  points: FlatCoords;
  height: number;
}

export const TREE_STRIDE = 3;

export const TreeSource = {
  osm: 0,
  area: 1,
  street: 2,
} as const;

export type TreeSourceCode = (typeof TreeSource)[keyof typeof TreeSource];

export type PoiKind =
  | 'metro_station'
  | 'hospital'
  | 'university'
  | 'college'
  | 'school'
  | 'mall'
  | 'office'
  | 'hotel'
  | 'worship'
  | 'bank'
  | 'fuel'
  | 'food'
  | 'park'
  | 'government'
  | 'shop'
  | 'residential'
  | 'locality'
  | 'landmark';

export interface Poi {
  id: string;
  name: string;
  kind: PoiKind;
  e: number;
  n: number;
  importance: number;
  buildingId?: string;
}

export interface CityStats {
  buildings: number;
  taggedHeights: number;
  roadKm: number;
  railKm: number;
  trees: number;
  areas: number;
  pois: number;
}

export interface CityMeta {
  regionId: string;
  name: string;
  subtitle: string;
  origin: GeoPoint;
  bbox: GeoBBox;
  bounds: PlanarBounds;
  focus: { e: number; n: number };
  osmTimestamp: string;
  generatedAt: string;
  attribution: string;
  stats: CityStats;
}

export interface CityData {
  version: typeof CITY_DATA_VERSION;
  meta: CityMeta;
  buildings: Building[];
  roads: RoadSegment[];
  roadNodes: RoadNode[];
  rail: RailLine[];
  areas: Area[];
  barriers: Barrier[];
  /** Flattened [e, n, source] triples, see TREE_STRIDE / TreeSource. */
  trees: number[];
  pois: Poi[];
}
