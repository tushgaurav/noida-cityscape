import type { CityData } from '@noida/city-schema';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  MeshBasicMaterial,
} from 'three';
import { useAppStore } from '../state/store';
import { registry } from './registry';

const ACCENT = '#f0a43a';

export function Selection({ city }: { city: CityData }) {
  const selected = useAppStore((state) => state.selected);
  const fillMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: ACCENT,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        blending: AdditiveBlending,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -8,
      }),
    [],
  );
  const lineMaterial = useMemo(() => new LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.9, depthTest: false }), []);

  const geometries = useMemo(() => {
    if (selected == null) return null;
    const building = city.buildings[selected];
    let fill: BufferGeometry | null = null;
    for (const { mesh, chunk } of registry.buildingMeshes) {
      const k = chunk.buildingIndex.indexOf(selected);
      if (k < 0) continue;
      const position = mesh.geometry.getAttribute('position') as BufferAttribute;
      const start = chunk.vertexStart[k];
      const end = k + 1 < chunk.vertexStart.length ? chunk.vertexStart[k + 1] : position.count;
      fill = new BufferGeometry();
      fill.setAttribute('position', new BufferAttribute((position.array as Float32Array).slice(start * 3, end * 3), 3));
      break;
    }
    const lines: number[] = [];
    const top = building.height + 0.15;
    const bottom = Math.max(building.minHeight, 0.25);
    for (const ring of building.polygon) {
      for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        lines.push(ring[j], top, -ring[j + 1], ring[i], top, -ring[i + 1]);
        lines.push(ring[j], bottom, -ring[j + 1], ring[i], bottom, -ring[i + 1]);
        lines.push(ring[i], bottom, -ring[i + 1], ring[i], top, -ring[i + 1]);
      }
    }
    const outline = new BufferGeometry();
    outline.setAttribute('position', new Float32BufferAttribute(lines, 3));
    return { fill, outline };
  }, [selected, city]);

  useEffect(
    () => () => {
      geometries?.fill?.dispose();
      geometries?.outline.dispose();
    },
    [geometries],
  );

  useFrame(({ clock }) => {
    fillMaterial.opacity = 0.18 + Math.sin(clock.elapsedTime * 3) * 0.08;
  });

  if (!geometries) return null;
  return (
    <group>
      {geometries.fill && <mesh geometry={geometries.fill} material={fillMaterial} renderOrder={5} />}
      <lineSegments geometry={geometries.outline} material={lineMaterial} renderOrder={6} />
    </group>
  );
}
