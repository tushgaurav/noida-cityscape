import type { RoadKind, RoadNode, RoadSegment } from '@noida/city-schema';
import type { PipelineContext } from '../context';
import { type PathVertex, clipPath, expandBounds, round1 } from '../geometry';
import type { OsmIndex, OsmTags, OsmWay } from '../osm';
import { isYes, parseLayer, parseLength, parseNumber } from '../tags';

const HIGHWAY_KINDS: Record<string, RoadKind> = {
  motorway: 'motorway',
  trunk: 'trunk',
  primary: 'primary',
  secondary: 'secondary',
  tertiary: 'tertiary',
  unclassified: 'unclassified',
  road: 'unclassified',
  residential: 'residential',
  living_street: 'living_street',
  service: 'service',
  busway: 'service',
  pedestrian: 'pedestrian',
  track: 'track',
  footway: 'footway',
  cycleway: 'cycleway',
  path: 'path',
  bridleway: 'path',
  steps: 'steps',
};

const DEFAULT_LANES: Partial<Record<RoadKind, [oneway: number, twoWay: number]>> = {
  motorway: [3, 6],
  trunk: [3, 4],
  primary: [2, 4],
  secondary: [2, 4],
  tertiary: [2, 2],
  unclassified: [1, 2],
  residential: [1, 2],
  living_street: [1, 1],
};

const FIXED_WIDTH: Partial<Record<RoadKind, number>> = {
  service: 4.5,
  pedestrian: 5,
  track: 3,
  footway: 2,
  cycleway: 2,
  path: 1.5,
  steps: 2.2,
};

export const MOTOR_KINDS = new Set<RoadKind>([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'living_street',
  'service',
]);

const ROAD_BRIDGE_HEIGHT = 6.5;

interface RoadProps {
  kind: RoadKind;
  link: boolean;
  width: number;
  lanes: number;
  oneway: boolean;
  reversed: boolean;
  layer: number;
  bridge: boolean;
  tunnel: boolean;
  tags: OsmTags;
}

function roadProps(way: OsmWay): RoadProps | null {
  const tags = way.tags;
  const value = tags?.highway;
  if (!tags || !value || tags.area === 'yes' || tags.indoor === 'yes') return null;
  const link = value.endsWith('_link');
  const kind = HIGHWAY_KINDS[link ? value.slice(0, -5) : value];
  if (!kind) return null;

  const onewayTag = tags.oneway;
  const reversed = onewayTag === '-1';
  const oneway =
    reversed ||
    isYes(onewayTag) ||
    (onewayTag !== 'no' && (kind === 'motorway' || tags.junction === 'roundabout' || tags.junction === 'circular'));

  const defaults = DEFAULT_LANES[kind];
  const taggedLanes = parseNumber(tags.lanes);
  const lanes = Math.max(1, Math.round(taggedLanes ?? (link ? 1 : defaults ? defaults[oneway ? 0 : 1] : 1)));
  const laneWidth = kind === 'motorway' || kind === 'trunk' ? 3.6 : kind === 'residential' ? 3.0 : 3.3;
  const shoulder = kind === 'motorway' || kind === 'trunk' ? 2 : kind === 'primary' || kind === 'secondary' ? 1 : 0.5;
  const serviceWidth = tags.service === 'parking_aisle' ? 5.5 : tags.service === 'driveway' ? 3.2 : FIXED_WIDTH[kind];
  const width = parseLength(tags.width) ?? (defaults || link ? lanes * laneWidth + shoulder : (serviceWidth ?? 3));

  return {
    kind,
    link,
    width: Math.min(Math.max(width, 1.2), 40),
    lanes,
    oneway,
    reversed,
    layer: parseLayer(tags.layer),
    bridge: !!tags.bridge && tags.bridge !== 'no' && tags.bridge !== 'proposed',
    tunnel: !!tags.tunnel && tags.tunnel !== 'no',
    tags,
  };
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

function resample(path: PathVertex[], maxStep: number): PathVertex[] {
  const out: PathVertex[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const steps = Math.ceil(Math.hypot(b.e - a.e, b.n - a.n) / maxStep);
    for (let s = 1; s < steps; s++) out.push({ e: a.e + ((b.e - a.e) * s) / steps, n: a.n + ((b.n - a.n) * s) / steps, id: -1 });
    out.push(b);
  }
  return out;
}

const pathLength = (path: PathVertex[]) => {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += Math.hypot(path[i].e - path[i - 1].e, path[i].n - path[i - 1].n);
  return length;
};

export interface RoadNetwork {
  roads: RoadSegment[];
  nodes: RoadNode[];
}

export function extractRoads(osm: OsmIndex, ctx: PipelineContext): RoadNetwork {
  const clipBounds = expandBounds(ctx.bounds, 250);
  let syntheticId = -1;
  const pieces: { path: PathVertex[]; props: RoadProps; wayId: number }[] = [];

  for (const way of osm.ways) {
    const props = roadProps(way);
    if (!props) continue;
    if (props.tunnel && props.tags.tunnel === 'building_passage') continue;
    const path: PathVertex[] = [];
    way.geometry.forEach((point, index) => {
      if (!point) return;
      const [e, n] = ctx.projection.toPlanar(point.lat, point.lon);
      path.push({ e, n, id: way.nodes[index] });
    });
    if (props.reversed) path.reverse();
    for (const piece of clipPath(path, clipBounds, () => syntheticId--)) pieces.push({ path: piece, props, wayId: way.id });
  }

  const usage = new Map<number, number>();
  for (const { path } of pieces) {
    path.forEach((vertex, index) => {
      const isEnd = index === 0 || index === path.length - 1;
      usage.set(vertex.id, (usage.get(vertex.id) ?? 0) + (isEnd ? 2 : 1));
    });
  }

  const nodeIndex = new Map<number, number>();
  const nodes: (RoadNode & { grounded: boolean })[] = [];
  const nodeFor = (vertex: PathVertex) => {
    let index = nodeIndex.get(vertex.id);
    if (index === undefined) {
      index = nodes.length;
      nodeIndex.set(vertex.id, index);
      nodes.push({ e: round1(vertex.e), n: round1(vertex.n), degree: 0, grounded: false });
    }
    return index;
  };

  interface RawSegment {
    path: PathVertex[];
    props: RoadProps;
    wayId: number;
    from: number;
    to: number;
    length: number;
  }
  const segments: RawSegment[] = [];
  for (const { path, props, wayId } of pieces) {
    let start = 0;
    for (let i = 1; i < path.length; i++) {
      const isSplit = i === path.length - 1 || (usage.get(path[i].id) ?? 0) >= 2;
      if (!isSplit) continue;
      const segmentPath = path.slice(start, i + 1);
      const from = nodeFor(segmentPath[0]);
      const to = nodeFor(segmentPath[segmentPath.length - 1]);
      nodes[from].degree++;
      nodes[to].degree++;
      if (!props.bridge && !props.tunnel) {
        nodes[from].grounded = true;
        nodes[to].grounded = true;
      }
      segments.push({ path: segmentPath, props, wayId, from, to, length: pathLength(segmentPath) });
      start = i;
    }
  }

  const groundDistance = new Float64Array(nodes.length).fill(Infinity);
  const adjacency: [neighbour: number, length: number][][] = nodes.map(() => []);
  for (const segment of segments) {
    if (!segment.props.bridge) continue;
    adjacency[segment.from].push([segment.to, segment.length]);
    adjacency[segment.to].push([segment.from, segment.length]);
  }
  const queue: number[] = [];
  nodes.forEach((node, index) => {
    if (node.grounded) groundDistance[index] = 0;
    if (node.grounded && adjacency[index].length) queue.push(index);
  });
  while (queue.length) {
    let best = 0;
    for (let k = 1; k < queue.length; k++) if (groundDistance[queue[k]] < groundDistance[queue[best]]) best = k;
    const current = queue.splice(best, 1)[0];
    for (const [neighbour, length] of adjacency[current]) {
      const distance = groundDistance[current] + length;
      if (distance < groundDistance[neighbour]) {
        if (groundDistance[neighbour] === Infinity) queue.push(neighbour);
        groundDistance[neighbour] = distance;
      }
    }
  }

  const roads: RoadSegment[] = segments.map((segment, index) => {
    const { props } = segment;
    let path = segment.path;
    let elevation: number[] | undefined;
    if (props.bridge) {
      const isFoot = !MOTOR_KINDS.has(props.kind);
      const height = (isFoot ? 6 : ROAD_BRIDGE_HEIGHT) * Math.max(1, props.layer);
      const rampLength = isFoot ? 14 : 160;
      path = resample(path, 8);
      const total = pathLength(path);
      const fromDistance = groundDistance[segment.from];
      const toDistance = groundDistance[segment.to];
      elevation = [];
      let travelled = 0;
      for (let i = 0; i < path.length; i++) {
        if (i > 0) travelled += Math.hypot(path[i].e - path[i - 1].e, path[i].n - path[i - 1].n);
        const d = Math.min(fromDistance + travelled, toDistance + (total - travelled));
        elevation.push(round1(height * (Number.isFinite(d) ? smoothstep(0, rampLength, d) : 1)));
      }
    }
    return {
      id: `${segment.wayId}:${index}`,
      wayId: segment.wayId,
      kind: props.kind,
      link: props.link,
      name: props.tags.name ?? props.tags['name:en'],
      ref: props.tags.ref,
      width: round1(props.width),
      lanes: props.lanes,
      oneway: props.oneway,
      layer: props.layer,
      bridge: props.bridge,
      tunnel: props.tunnel,
      surface: props.tags.surface,
      points: path.flatMap((vertex) => [round1(vertex.e), round1(vertex.n)]),
      elevation,
      from: segment.from,
      to: segment.to,
    };
  });

  return { roads, nodes: nodes.map(({ e, n, degree }) => ({ e, n, degree })) };
}
