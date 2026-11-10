import { createProjection } from '@noida/city-schema';
import { describe, expect, it } from 'vitest';
import type { PipelineContext } from '../context';
import { type OsmIndex, type OsmWay, indexElements } from '../osm';
import { parseLength } from '../tags';
import { extractBuildings } from './buildings';
import { extractRoads } from './roads';

const origin = { lat: 28.62, lon: 77.36 };
const projection = createProjection(origin);
const ctx: PipelineContext = { projection, bounds: { minE: -1000, minN: -1000, maxE: 1000, maxN: 1000 }, seed: 1 };

let nextNode = 1;
const nodeIds = new Map<string, number>();
function way(id: number, points: [number, number][], tags: Record<string, string>): OsmWay {
  const geometry = points.map(([e, n]) => {
    const [lat, lon] = projection.toGeo(e, n);
    return { lat, lon };
  });
  const nodes = points.map(([e, n]) => {
    const key = `${e},${n}`;
    if (!nodeIds.has(key)) nodeIds.set(key, nextNode++);
    return nodeIds.get(key)!;
  });
  return { type: 'way', id, nodes, geometry, tags };
}

const osm = (...ways: OsmWay[]): OsmIndex => indexElements(ways);

describe('parseLength', () => {
  it('understands metres and feet', () => {
    expect(parseLength('25')).toBe(25);
    expect(parseLength('12.5 m')).toBe(12.5);
    expect(parseLength("10'")).toBeCloseTo(3.048, 3);
    expect(parseLength('tall')).toBeUndefined();
  });
});

describe('extractBuildings', () => {
  const footprint: [number, number][] = [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
    [0, 0],
  ];

  it('prefers tagged height, then levels, then a deterministic estimate', () => {
    const shifted = footprint.map(([e, n]) => [e + 100, n] as [number, number]);
    const [tagged, levels, estimated] = extractBuildings(
      osm(
        way(1, footprint, { building: 'yes', height: '31' }),
        way(2, footprint.map(([e, n]) => [e + 50, n] as [number, number]), { building: 'office', 'building:levels': '5' }),
        way(3, shifted, { building: 'yes' }),
      ),
      ctx,
    );
    expect(tagged).toMatchObject({ height: 31, heightSource: 'tagged' });
    expect(levels).toMatchObject({ heightSource: 'levels', levels: 5, height: 19.9 });
    expect(estimated.heightSource).toBe('estimated');
    expect(extractBuildings(osm(way(3, shifted, { building: 'yes' })), ctx)[0].height).toBe(estimated.height);
  });

  it('drops buildings whose centroid is outside the region', () => {
    const far = footprint.map(([e, n]) => [e + 5000, n] as [number, number]);
    expect(extractBuildings(osm(way(4, far, { building: 'yes' })), ctx)).toHaveLength(0);
  });
});

describe('extractRoads', () => {
  it('splits ways at shared junction nodes and records degrees', () => {
    const { roads, nodes } = extractRoads(
      osm(
        way(10, [[-100, 0], [0, 0], [100, 0]], { highway: 'secondary' }),
        way(11, [[0, -100], [0, 0]], { highway: 'residential' }),
      ),
      ctx,
    );
    expect(roads).toHaveLength(3);
    const junction = nodes.find((node) => node.e === 0 && node.n === 0);
    expect(junction?.degree).toBe(3);
  });

  it('raises bridges with ramps from grounded ends', () => {
    const { roads } = extractRoads(
      osm(
        way(20, [[-300, 50], [-200, 50]], { highway: 'trunk', oneway: 'yes' }),
        way(21, [[-200, 50], [200, 50]], { highway: 'trunk', oneway: 'yes', bridge: 'yes', layer: '1' }),
        way(22, [[200, 50], [300, 50]], { highway: 'trunk', oneway: 'yes' }),
      ),
      ctx,
    );
    const bridge = roads.find((road) => road.bridge)!;
    expect(bridge.elevation![0]).toBe(0);
    expect(bridge.elevation![bridge.elevation!.length - 1]).toBe(0);
    expect(Math.max(...bridge.elevation!)).toBeCloseTo(6.5, 1);
  });

  it('reverses oneway=-1 roads', () => {
    const { roads } = extractRoads(osm(way(30, [[0, 300], [50, 300]], { highway: 'tertiary', oneway: '-1' })), ctx);
    expect(roads[0].oneway).toBe(true);
    expect(roads[0].points[0]).toBeGreaterThan(roads[0].points[2]);
  });
});
