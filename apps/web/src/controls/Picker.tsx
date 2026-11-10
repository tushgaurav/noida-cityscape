import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Raycaster, Vector2, Vector3 } from 'three';
import { registry } from '../scene/registry';
import { useAppStore } from '../state/store';
import { telemetry } from '../state/telemetry';
import { findBuildingAtVertex } from '../world/build/buildings';
import { cameraState } from './input';

export function Picker() {
  const { gl, camera } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);

  useEffect(() => {
    const canvas = gl.domElement;
    let down: { x: number; y: number; time: number } | null = null;

    const pick = (ndc: Vector2) => {
      raycaster.setFromCamera(ndc, camera);
      raycaster.far = 6000;
      const hits = raycaster.intersectObjects(
        registry.buildingMeshes.map((entry) => entry.mesh),
        false,
      );
      const hit = hits[0];
      if (!hit || hit.faceIndex == null) return null;
      const entry = registry.buildingMeshes.find((candidate) => candidate.mesh === hit.object);
      return entry ? findBuildingAtVertex(entry.chunk, hit.faceIndex * 3) : null;
    };

    const onPointerDown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY, time: performance.now() };
    };
    const onPointerUp = (event: PointerEvent) => {
      const state = useAppStore.getState();
      if (!down || event.button !== 0 || cameraState.transitioning) return;
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      const quick = performance.now() - down.time < 450;
      down = null;
      if (state.mode !== 'orbit') {
        if (!state.pointerLocked) {
          void canvas.requestPointerLock();
          return;
        }
        state.select(pick(new Vector2(0, 0)));
        return;
      }
      if (moved > 6 || !quick) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      state.select(pick(ndc));
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, [gl, camera, raycaster]);

  const forward = useMemo(() => new Vector3(), []);
  useFrame((_, delta) => {
    camera.getWorldDirection(forward);
    telemetry.x = camera.position.x;
    telemetry.y = camera.position.y;
    telemetry.z = camera.position.z;
    telemetry.heading = (Math.atan2(forward.x, -forward.z) + Math.PI * 2) % (Math.PI * 2);
    telemetry.pitch = Math.asin(Math.min(Math.max(forward.y, -1), 1));
    telemetry.fov = (camera as { fov?: number }).fov ?? 50;
    if (delta > 0) telemetry.fps = telemetry.fps * 0.95 + (1 / delta) * 0.05;
  });

  return null;
}
