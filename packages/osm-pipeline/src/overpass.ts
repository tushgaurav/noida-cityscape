import type { GeoBBox } from '@noida/city-schema';
import type { OverpassResponse } from './osm';

export const DEFAULT_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const USER_AGENT = 'noida-city/0.1 (3D city model pipeline; https://www.openstreetmap.org/copyright)';

export function buildCityQuery(bbox: GeoBBox, timeoutSeconds = 240): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:${timeoutSeconds}][maxsize:536870912];
(
  way["building"](${b});
  relation["building"](${b});
  way["building:part"](${b});
  relation["building:part"](${b});
  way["highway"](${b});
  way["railway"](${b});
  way["landuse"](${b});
  relation["landuse"](${b});
  way["leisure"](${b});
  relation["leisure"](${b});
  way["natural"](${b});
  relation["natural"](${b});
  way["amenity"](${b});
  relation["amenity"](${b});
  way["water"](${b});
  relation["water"](${b});
  way["place"~"square"](${b});
  way["barrier"~"^(wall|fence|retaining_wall|hedge|city_wall)$"](${b});
  node["natural"="tree"](${b});
  node["railway"="station"](${b});
  node["public_transport"="station"](${b});
  node["name"](${b});
);
out geom;`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FetchOptions {
  mirrors?: string[];
  rounds?: number;
  log?: (message: string) => void;
}

export async function fetchOverpass(query: string, options: FetchOptions = {}): Promise<OverpassResponse> {
  const mirrors = options.mirrors ?? DEFAULT_MIRRORS;
  const rounds = options.rounds ?? 4;
  const log = options.log ?? (() => {});
  let lastError: unknown;

  for (let round = 0; round < rounds; round++) {
    for (const url of mirrors) {
      try {
        log(`→ ${url} (attempt ${round + 1}/${rounds})`);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(300_000),
        });
        const text = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
        if (!text.trimStart().startsWith('{')) throw new Error(`Non-JSON response: ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
        const json = JSON.parse(text) as OverpassResponse;
        if (json.remark && /error|timed out|out of memory/i.test(json.remark)) throw new Error(`Overpass remark: ${json.remark}`);
        log(`✓ ${json.elements.length.toLocaleString()} elements from ${new URL(url).host}`);
        return json;
      } catch (error) {
        lastError = error;
        log(`✗ ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const wait = 5_000 * 2 ** round;
    if (round < rounds - 1) {
      log(`All mirrors failed, retrying in ${wait / 1000}s…`);
      await sleep(wait);
    }
  }
  throw new Error(`Overpass fetch failed after ${rounds} rounds: ${String(lastError)}`);
}
