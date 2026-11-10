import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCity } from '../build';
import type { OverpassResponse } from '../osm';
import { cityDataPath, parseRegionArg, rawDataPath } from '../paths';
import { getRegion } from '../regions';

const region = getRegion(parseRegionArg(process.argv));
const input = rawDataPath(region.id);
const raw = JSON.parse(await readFile(input, 'utf8').catch(() => {
  throw new Error(`Missing ${input}. Run "pnpm data:fetch" first.`);
})) as OverpassResponse;

const started = performance.now();
const city = buildCity(raw, region);
const output = cityDataPath(region.id);
await mkdir(path.dirname(output), { recursive: true });
const json = JSON.stringify(city);
await writeFile(output, json);

const { stats } = city.meta;
console.log(`Built ${region.name} in ${Math.round(performance.now() - started)} ms → ${output}`);
console.log(
  [
    `${stats.buildings.toLocaleString()} buildings (${stats.taggedHeights} with tagged height/levels)`,
    `${stats.roadKm} km of road (${city.roads.length.toLocaleString()} segments, ${city.roadNodes.length.toLocaleString()} nodes)`,
    `${stats.railKm} km of rail`,
    `${stats.areas} areas, ${city.barriers.length} barriers`,
    `${stats.trees.toLocaleString()} trees`,
    `${stats.pois} named places`,
    `${(json.length / 1024 / 1024).toFixed(2)} MB`,
  ]
    .map((line) => `  · ${line}`)
    .join('\n'),
);
