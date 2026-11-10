import type { Mesh } from 'three';
import type { CollisionWorld } from '../world/collision';
import type { BuildingChunk } from '../world/types';

export interface BuildingMeshEntry {
  mesh: Mesh;
  chunk: BuildingChunk;
}

export const registry = {
  buildingMeshes: [] as BuildingMeshEntry[],
  collision: null as CollisionWorld | null,
};
