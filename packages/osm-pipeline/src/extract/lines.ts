import type { Barrier, BarrierKind, RailKind, RailLine } from '@noida/city-schema';
import { type PipelineContext, projectGeometry } from '../context';
import { clipLine, expandBounds, roundCoords, simplifyLine } from '../geometry';
import type { OsmIndex, OsmTags } from '../osm';
import { parseLayer, parseLength } from '../tags';

const BARRIER_HEIGHT: Record<BarrierKind, number> = {
  wall: 2.2,
  fence: 1.8,
  retaining_wall: 1.2,
  hedge: 1.4,
};

export function extractBarriers(osm: OsmIndex, ctx: PipelineContext): Barrier[] {
  const barriers: Barrier[] = [];
  for (const way of osm.ways) {
    const value = way.tags?.barrier;
    const kind: BarrierKind | undefined =
      value === 'city_wall' ? 'wall' : value && value in BARRIER_HEIGHT ? (value as BarrierKind) : undefined;
    if (!kind) continue;
    const height = parseLength(way.tags!.height) ?? BARRIER_HEIGHT[kind];
    clipLine(projectGeometry(way.geometry, ctx), ctx.bounds).forEach((points, index) =>
      barriers.push({ id: `w${way.id}:${index}`, kind, points: roundCoords(simplifyLine(points, 0.1)), height }),
    );
  }
  return barriers;
}

const RAIL_KINDS = new Set<RailKind>(['subway', 'light_rail', 'rail', 'monorail', 'tram']);

const isPlanned = (tags: OsmTags) =>
  Object.entries(tags).some(([key, value]) => value === 'proposed' || value === 'construction' || key === 'proposed');

export function extractRail(osm: OsmIndex, ctx: PipelineContext): RailLine[] {
  const lines: RailLine[] = [];
  const bounds = expandBounds(ctx.bounds, 250);
  for (const way of osm.ways) {
    const tags = way.tags;
    const kind = tags?.railway as RailKind | undefined;
    if (!tags || !kind || !RAIL_KINDS.has(kind) || isPlanned(tags) || tags.service === 'yard') continue;
    const layer = parseLayer(tags.layer);
    const tunnel = !!tags.tunnel && tags.tunnel !== 'no';
    const elevated = !tunnel && ((!!tags.bridge && tags.bridge !== 'no') || layer > 0);
    clipLine(projectGeometry(way.geometry, ctx), bounds).forEach((points, index) =>
      lines.push({
        id: `w${way.id}:${index}`,
        kind,
        name: tags.name,
        points: roundCoords(simplifyLine(points, 0.2)),
        elevated,
        tunnel,
        layer,
      }),
    );
  }
  return lines;
}
