export type OsmTags = Record<string, string>;

export interface OsmLatLon {
  lat: number;
  lon: number;
}

export interface OsmNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: OsmTags;
}

export interface OsmWay {
  type: 'way';
  id: number;
  nodes: number[];
  geometry: (OsmLatLon | null)[];
  tags?: OsmTags;
}

export interface OsmRelationMember {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role: string;
  geometry?: (OsmLatLon | null)[];
  lat?: number;
  lon?: number;
}

export interface OsmRelation {
  type: 'relation';
  id: number;
  members: OsmRelationMember[];
  tags?: OsmTags;
}

export type OsmElement = OsmNode | OsmWay | OsmRelation;

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: { timestamp_osm_base: string; copyright: string };
  elements: OsmElement[];
  remark?: string;
}

export interface OsmIndex {
  nodes: OsmNode[];
  ways: OsmWay[];
  relations: OsmRelation[];
}

export function indexElements(elements: OsmElement[]): OsmIndex {
  const seen = new Set<string>();
  const index: OsmIndex = { nodes: [], ways: [], relations: [] };
  for (const element of elements) {
    const key = `${element.type}${element.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (element.type === 'node') index.nodes.push(element);
    else if (element.type === 'way') index.ways.push(element);
    else index.relations.push(element);
  }
  return index;
}

export const isClosedWay = (way: OsmWay) => way.nodes.length >= 4 && way.nodes[0] === way.nodes[way.nodes.length - 1];

export const elementId = (element: OsmElement) => `${element.type[0]}${element.id}`;
