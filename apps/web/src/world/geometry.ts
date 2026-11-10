import { BufferAttribute, BufferGeometry } from 'three';
import type { MeshData } from './types';

export function toBufferGeometry(mesh: MeshData): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const [name, attribute] of Object.entries(mesh.attributes)) {
    geometry.setAttribute(name, new BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized ?? false));
  }
  if (mesh.index) geometry.setIndex(new BufferAttribute(mesh.index, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

export const isEmptyMesh = (mesh: MeshData) => (mesh.attributes.position?.array.length ?? 0) === 0;
