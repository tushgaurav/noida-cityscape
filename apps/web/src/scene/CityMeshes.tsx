import type { CityData } from '@noida/city-schema';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  type BufferGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { useAppStore } from '../state/store';
import { CollisionWorld } from '../world/collision';
import { isEmptyMesh, toBufferGeometry } from '../world/geometry';
import {
  createAreaMaterial,
  createFacadeMaterial,
  createFoliageMaterial,
  createGlowAwareMaterial,
  createGroundMaterial,
  createLightPoolMaterial,
  createRoadMaterial,
  createSidewalkMaterial,
} from '../world/materials/materials';
import { createLampGeometry, createTankGeometry, createTreeGeometries, createTreeLodGeometries } from '../world/models';
import {
  LAMP_INSTANCE_STRIDE,
  type MeshData,
  TANK_INSTANCE_STRIDE,
  TREE_INSTANCE_STRIDE,
  type WorldBuffers,
} from '../world/types';
import { registry } from './registry';

function useGeometry(mesh: MeshData): BufferGeometry | null {
  const geometry = useMemo(() => (isEmptyMesh(mesh) ? null : toBufferGeometry(mesh)), [mesh]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry;
}

function StaticMesh({
  mesh,
  material,
  castShadow = false,
  receiveShadow = true,
  renderOrder,
}: {
  mesh: MeshData;
  material: MeshStandardMaterial;
  castShadow?: boolean;
  receiveShadow?: boolean;
  renderOrder?: number;
}) {
  const geometry = useGeometry(mesh);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} material={material} castShadow={castShadow} receiveShadow={receiveShadow} renderOrder={renderOrder} />
  );
}

function Ground({ city }: { city: CityData }) {
  const geometry = useMemo(() => new PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2), []);
  const material = useMemo(() => createGroundMaterial(city.meta.bounds), [city]);
  return <mesh geometry={geometry} material={material} receiveShadow position={[0, -0.02, 0]} />;
}

function Buildings({ world }: { world: WorldBuffers }) {
  const material = useMemo(createFacadeMaterial, []);
  const meshes = useMemo(
    () =>
      world.buildingChunks.map((chunk) => {
        const mesh = new Mesh(toBufferGeometry(chunk.mesh), material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return { mesh, chunk };
      }),
    [world, material],
  );
  useLayoutEffect(() => {
    registry.buildingMeshes = meshes;
    return () => {
      registry.buildingMeshes = [];
      meshes.forEach(({ mesh }) => mesh.geometry.dispose());
    };
  }, [meshes]);
  return (
    <group>
      {meshes.map(({ mesh }) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </group>
  );
}

function WaterTanks({ data }: { data: Float32Array }) {
  const geometry = useMemo(createTankGeometry, []);
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 }), []);
  const count = data.length / TANK_INSTANCE_STRIDE;
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    for (let i = 0; i < count; i++) {
      const o = i * TANK_INSTANCE_STRIDE;
      m.makeScale(data[o + 3], data[o + 4], data[o + 3]).setPosition(data[o], data[o + 1], data[o + 2]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [data, count]);
  if (!count) return null;
  return <instancedMesh ref={ref} args={[geometry, material, count]} castShadow receiveShadow />;
}

const TREE_VISIBLE_DISTANCE = 3400;
const TREE_DETAIL_DISTANCE = 450;

function Trees({ world, shadows }: { world: WorldBuffers; shadows: boolean }) {
  const geometries = useMemo(createTreeGeometries, []);
  const lodGeometries = useMemo(createTreeLodGeometries, []);
  const material = useMemo(createFoliageMaterial, []);
  const chunks = useMemo(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const position = new Vector3();
    const scale = new Vector3();
    return world.treeChunks.map((chunk) => {
      const count = chunk.instances.length / TREE_INSTANCE_STRIDE;
      const detail = new InstancedMesh(geometries[chunk.variant].clone(), material, count);
      const tints = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const o = i * TREE_INSTANCE_STRIDE;
        const s = chunk.instances[o + 2];
        q.setFromAxisAngle(up, chunk.instances[o + 3]);
        position.set(chunk.instances[o], 0, chunk.instances[o + 1]);
        scale.set(s, s * (0.9 + chunk.instances[o + 4] * 0.25), s);
        detail.setMatrixAt(i, m.compose(position, q, scale));
        tints[i] = chunk.instances[o + 4];
      }
      const tint = new InstancedBufferAttribute(tints, 1);
      detail.geometry.setAttribute('aTint', tint);
      detail.computeBoundingSphere();
      const lod = new InstancedMesh(lodGeometries[chunk.variant].clone(), material, count);
      lod.instanceMatrix = detail.instanceMatrix;
      lod.geometry.setAttribute('aTint', tint);
      lod.boundingSphere = detail.boundingSphere;
      for (const mesh of [detail, lod]) mesh.receiveShadow = true;
      return { detail, lod };
    });
  }, [world, geometries, lodGeometries, material]);

  useEffect(() => {
    chunks.forEach(({ detail, lod }) => {
      detail.castShadow = shadows;
      lod.castShadow = shadows;
    });
  }, [chunks, shadows]);

  useEffect(
    () => () => {
      chunks.forEach(({ detail, lod }) => {
        detail.geometry.dispose();
        lod.geometry.dispose();
        detail.dispose();
      });
    },
    [chunks],
  );

  useFrame(({ camera }) => {
    for (const { detail, lod } of chunks) {
      const sphere = detail.boundingSphere;
      if (!sphere) continue;
      const distance = camera.position.distanceTo(sphere.center) - sphere.radius;
      detail.visible = distance < TREE_DETAIL_DISTANCE;
      lod.visible = !detail.visible && distance < TREE_VISIBLE_DISTANCE;
    }
  });

  return (
    <group>
      {chunks.map(({ detail, lod }) => (
        <group key={detail.uuid}>
          <primitive object={detail} />
          <primitive object={lod} />
        </group>
      ))}
    </group>
  );
}

function buildLampMesh(geometry: BufferGeometry, material: MeshStandardMaterial, list: number[]): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, list.length / 3);
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const one = new Vector3(1, 1, 1);
  const position = new Vector3();
  for (let i = 0; i < list.length / 3; i++) {
    q.setFromAxisAngle(up, -list[i * 3 + 2]);
    mesh.setMatrixAt(i, m.compose(position.set(list[i * 3], 0, list[i * 3 + 1]), q, one));
  }
  mesh.computeBoundingSphere();
  mesh.castShadow = false;
  return mesh;
}

function StreetLights({ data }: { data: Float32Array }) {
  const singleGeometry = useMemo(() => createLampGeometry(false), []);
  const doubleGeometry = useMemo(() => createLampGeometry(true), []);
  const poolGeometry = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  const material = useMemo(() => createGlowAwareMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5 }), []);
  const poolMaterial = useMemo(createLightPoolMaterial, []);
  const poolsRef = useRef<InstancedMesh>(null);

  const { single, double, pools } = useMemo(() => {
    const singles: number[] = [];
    const doubles: number[] = [];
    const poolList: number[] = [];
    for (let i = 0; i < data.length; i += LAMP_INSTANCE_STRIDE) {
      const [x, , z, heading, isDouble] = data.subarray(i, i + LAMP_INSTANCE_STRIDE);
      (isDouble ? doubles : singles).push(x, z, heading);
      for (const side of isDouble ? [1, -1] : [1]) {
        poolList.push(x + Math.cos(heading) * 2.4 * side, z + Math.sin(heading) * 2.4 * side);
      }
    }
    return { single: singles, double: doubles, pools: poolList };
  }, [data]);

  const singleMesh = useMemo(() => buildLampMesh(singleGeometry, material, single), [singleGeometry, material, single]);
  const doubleMesh = useMemo(() => buildLampMesh(doubleGeometry, material, double), [doubleGeometry, material, double]);

  useLayoutEffect(() => {
    const mesh = poolsRef.current;
    if (!mesh) return;
    const m = new Matrix4();
    for (let i = 0; i < pools.length / 2; i++) {
      m.makeScale(26, 1, 26).setPosition(pools[i * 2], 0.14, pools[i * 2 + 1]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [pools]);

  useFrame(() => {
    if (poolsRef.current) poolsRef.current.visible = poolMaterial.uniforms.uNight.value > 0.02;
  });

  return (
    <group>
      <primitive object={singleMesh} />
      <primitive object={doubleMesh} />
      <instancedMesh ref={poolsRef} args={[poolGeometry, poolMaterial, pools.length / 2]} renderOrder={2} frustumCulled={false} />
    </group>
  );
}

export function CityMeshes({ city, world }: { city: CityData; world: WorldBuffers }) {
  const quality = useAppStore((state) => state.quality);
  const layers = useAppStore((state) => state.layers);
  const shadows = quality !== 'low';
  const roadMaterials = useMemo(() => [-9, -8, -7, -6].map(createRoadMaterial), []);
  const areaMaterials = useMemo(() => [0, 1, 2, 3].map(createAreaMaterial), []);
  const sidewalkMaterial = useMemo(createSidewalkMaterial, []);
  const coloredMaterial = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }), []);
  const concreteMaterial = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }), []);
  const railMaterial = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.8 }), []);

  useEffect(() => {
    registry.collision = new CollisionWorld(city);
    return () => {
      registry.collision = null;
    };
  }, [city]);

  return (
    <group>
      <Ground city={city} />
      {world.areaLayers.map((mesh, index) => (
        <StaticMesh key={`area-${index}`} mesh={mesh} material={areaMaterials[index]} />
      ))}
      <StaticMesh mesh={world.sidewalks} material={sidewalkMaterial} />
      {world.roadTiers.map((mesh, index) => (
        <StaticMesh key={`road-${index}`} mesh={mesh} material={roadMaterials[index]} castShadow={false} />
      ))}
      <StaticMesh mesh={world.bridgeStructure} material={concreteMaterial} castShadow={shadows} />
      <StaticMesh mesh={world.barriers} material={coloredMaterial} castShadow={shadows} />
      <Buildings world={world} />
      <StaticMesh mesh={world.rooftops} material={coloredMaterial} castShadow={shadows} />
      <WaterTanks data={world.waterTanks} />
      {layers.metro && (
        <>
          <StaticMesh mesh={world.railStructure} material={concreteMaterial} castShadow={shadows} />
          <StaticMesh mesh={world.railTrackBed} material={railMaterial} />
        </>
      )}
      {layers.trees && <Trees world={world} shadows={shadows && quality === 'high'} />}
      {layers.lights && <StreetLights data={world.lamps} />}
    </group>
  );
}
