import { type CityData, TREE_STRIDE, TreeSource } from '@noida/city-schema';
import { mulberry32 } from '../../lib/random';
import type { TreeChunk } from '../types';
import { chunkKey } from './buildings';

export const TREE_VARIANTS = 3;

function chooseVariant(source: number, roll: number): number {
  if (source === TreeSource.street) return roll < 0.58 ? 0 : roll < 0.94 ? 1 : 2;
  if (source === TreeSource.area) return roll < 0.72 ? 0 : roll < 0.84 ? 1 : 2;
  return roll < 0.85 ? 0 : 2;
}

export function buildTrees(city: CityData): TreeChunk[] {
  const rand = mulberry32(0x7ee5);
  const groups = new Map<string, number[][]>();
  for (let i = 0; i < city.trees.length; i += TREE_STRIDE) {
    const e = city.trees[i];
    const n = city.trees[i + 1];
    const variant = chooseVariant(city.trees[i + 2], rand());
    const key = chunkKey(e, n);
    let group = groups.get(key);
    if (!group) {
      group = Array.from({ length: TREE_VARIANTS }, () => []);
      groups.set(key, group);
    }
    const scale = variant === 2 ? 0.7 + rand() * 0.4 : variant === 1 ? 0.95 + rand() * 0.45 : 1.05 + rand() * 0.75;
    group[variant].push(e, -n, scale, rand() * Math.PI * 2, rand());
  }
  const chunks: TreeChunk[] = [];
  for (const group of groups.values()) {
    group.forEach((instances, variant) => {
      if (instances.length) chunks.push({ variant, instances: new Float32Array(instances) });
    });
  }
  return chunks;
}
