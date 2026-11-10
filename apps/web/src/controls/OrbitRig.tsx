import { MapControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { type ComponentRef, useRef } from 'react';
import { Vector3 } from 'three';
import { registry } from '../scene/registry';
import { useAppStore } from '../state/store';
import { telemetry } from '../state/telemetry';
import { axis, cameraState, isDown } from './input';

const forward = new Vector3();
const right = new Vector3();
const move = new Vector3();

export function OrbitRig() {
  const mode = useAppStore((state) => state.mode);
  return mode === 'orbit' ? <OrbitControlsRig /> : null;
}

function OrbitControlsRig() {
  const controls = useRef<ComponentRef<typeof MapControls>>(null);
  const camera = useThree((state) => state.camera);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    const active = useAppStore.getState().mode === 'orbit' && !cameraState.transitioning;
    if (active && !c.enabled) {
      c.target.copy(cameraState.orbitTarget);
      c.enabled = true;
      c.update();
    } else if (!active && c.enabled) {
      c.enabled = false;
    }
    if (!active) return;

    const distance = camera.position.distanceTo(c.target);
    const x = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    const z = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    if (x || z) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
      const speed = Math.max(distance, 60) * 0.9 * (isDown('ShiftLeft', 'ShiftRight') ? 2.5 : 1);
      move.copy(forward).multiplyScalar(z).addScaledVector(right, x).normalize().multiplyScalar(speed * Math.min(delta, 0.05));
      camera.position.add(move);
      c.target.add(move);
    }

    const collision = registry.collision;
    if (collision) {
      const [e, n] = collision.clampToBounds(c.target.x, -c.target.z, 200);
      if (e !== c.target.x || -n !== c.target.z) {
        camera.position.x += e - c.target.x;
        camera.position.z += -n - c.target.z;
        c.target.set(e, 0, -n);
      }
    }
    c.target.y = 0;
    cameraState.orbitTarget.copy(c.target);
    telemetry.focusX = c.target.x;
    telemetry.focusZ = c.target.z;
  });

  return (
    <MapControls
      ref={controls}
      target={cameraState.orbitTarget.toArray()}
      enabled={false}
      enableDamping
      dampingFactor={0.08}
      screenSpacePanning={false}
      maxPolarAngle={Math.PI * 0.47}
      minDistance={25}
      maxDistance={5200}
      zoomSpeed={1.1}
      rotateSpeed={0.6}
    />
  );
}
