import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { bboxAround } from '@noida/city-schema';
import { DEFAULT_MIRRORS, buildCityQuery, fetchOverpass } from '../overpass';
import { parseRegionArg, rawDataPath } from '../paths';
import { getRegion } from '../regions';

const region = getRegion(parseRegionArg(process.argv));
const bbox = bboxAround(region.center, region.halfWidth, region.halfHeight);
const mirrors = process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : DEFAULT_MIRRORS;

console.log(`Fetching OpenStreetMap data for ${region.name} (${region.id})`);
console.log(`bbox S${bbox.south.toFixed(5)} W${bbox.west.toFixed(5)} N${bbox.north.toFixed(5)} E${bbox.east.toFixed(5)}`);

const data = await fetchOverpass(buildCityQuery(bbox), { mirrors, log: (message) => console.log(`  ${message}`) });
const output = rawDataPath(region.id);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify({ ...data, bbox }));
console.log(`Saved ${output} (OSM base ${data.osm3s.timestamp_osm_base})`);
