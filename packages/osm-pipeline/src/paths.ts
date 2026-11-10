import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '..', '..');

export const rawDataPath = (regionId: string) => path.join(packageRoot, 'data', 'raw', `${regionId}.osm.json`);

export const cityDataPath = (regionId: string) =>
  path.join(repoRoot, 'apps', 'web', 'public', 'data', `${regionId}.city.json`);

export function parseRegionArg(argv: string[], fallback = 'sector-62'): string {
  const index = argv.indexOf('--region');
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}
