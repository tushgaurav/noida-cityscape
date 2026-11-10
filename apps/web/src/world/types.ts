export type TypedArray = Float32Array | Uint8Array | Uint16Array | Uint32Array;

export interface AttributeData {
  array: TypedArray;
  itemSize: number;
  normalized?: boolean;
}

export interface MeshData {
  attributes: Record<string, AttributeData>;
  index?: Uint32Array;
}

export interface BuildingChunk {
  mesh: MeshData;
  /** Sorted first-vertex offsets of each building inside `mesh`. */
  vertexStart: Uint32Array;
  /** Index into CityData.buildings for each entry of `vertexStart`. */
  buildingIndex: Uint32Array;
}

export interface TreeChunk {
  variant: number;
  /** [x, z, scale, rotation, tint] per instance. */
  instances: Float32Array;
}

export const TREE_INSTANCE_STRIDE = 5;
export const TANK_INSTANCE_STRIDE = 5;
export const LAMP_INSTANCE_STRIDE = 5;

export interface WorldBuffers {
  buildingChunks: BuildingChunk[];
  rooftops: MeshData;
  /** [x, y, z, radius, height] per tank. */
  waterTanks: Float32Array;
  areaLayers: MeshData[];
  roadTiers: MeshData[];
  sidewalks: MeshData;
  bridgeStructure: MeshData;
  barriers: MeshData;
  railStructure: MeshData;
  railTrackBed: MeshData;
  treeChunks: TreeChunk[];
  /** [x, y, z, heading, double] per lamp post. */
  lamps: Float32Array;
}

export type WorkerProgress = { type: 'progress'; label: string; progress: number };
export type WorkerDone = { type: 'done'; world: WorldBuffers };
export type WorkerError = { type: 'error'; message: string };
export type WorkerMessage = WorkerProgress | WorkerDone | WorkerError;

export function collectTransferables(world: WorldBuffers): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const addMesh = (mesh: MeshData) => {
    for (const attribute of Object.values(mesh.attributes)) buffers.add(attribute.array.buffer as ArrayBuffer);
    if (mesh.index) buffers.add(mesh.index.buffer as ArrayBuffer);
  };
  for (const chunk of world.buildingChunks) {
    addMesh(chunk.mesh);
    buffers.add(chunk.vertexStart.buffer as ArrayBuffer);
    buffers.add(chunk.buildingIndex.buffer as ArrayBuffer);
  }
  [world.rooftops, world.sidewalks, world.bridgeStructure, world.barriers, world.railStructure, world.railTrackBed].forEach(addMesh);
  world.areaLayers.forEach(addMesh);
  world.roadTiers.forEach(addMesh);
  for (const chunk of world.treeChunks) buffers.add(chunk.instances.buffer as ArrayBuffer);
  buffers.add(world.waterTanks.buffer as ArrayBuffer);
  buffers.add(world.lamps.buffer as ArrayBuffer);
  return [...buffers];
}
