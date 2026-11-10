import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Euler, Vector3 } from 'three';
import { registry } from '../scene/registry';
import { useAppStore } from '../state/store';
import { telemetry } from '../state/telemetry';
import { EYE_HEIGHT } from './CameraDirector';
import { axis, cameraState, isDown } from './input';

const LOOK_SENSITIVITY = 0.0021;
const WALK_SPEED = 3.4;
const RUN_SPEED = 9;
const FLY_SPEED = 32;
const GRAVITY = 22;
const JUMP_VELOCITY = 6;

export function FirstPersonRig() {
  const { camera, gl } = useThree();
  const look = useRef({ yaw: 0, pitch: 0, synced: false });
  const motion = useRef({ velocity: new Vector3(), vy: 0, bob: 0, feet: 0, grounded: true });
  const scratch = useRef({ euler: new Euler(0, 0, 0, 'YXZ'), forward: new Vector3(), right: new Vector3(), wish: new Vector3() });

  useEffect(() => {
    const canvas = gl.domElement;
    const onLockChange = () => useAppStore.getState().setPointerLocked(document.pointerLockElement === canvas);
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      look.current.yaw -= event.movementX * LOOK_SENSITIVITY;
      look.current.pitch = Math.min(Math.max(look.current.pitch - event.movementY * LOOK_SENSITIVITY, -1.5), 1.5);
    };
    const onWheel = (event: WheelEvent) => {
      if (useAppStore.getState().mode !== 'fly') return;
      cameraState.flySpeedMultiplier = Math.min(Math.max(cameraState.flySpeedMultiplier * (event.deltaY > 0 ? 0.85 : 1.18), 0.15), 12);
    };
    document.addEventListener('pointerlockchange', onLockChange);
    document.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [gl]);

  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        if (state.mode === previous.mode) return;
        look.current.synced = false;
        if (state.mode === 'orbit' && document.pointerLockElement) document.exitPointerLock();
      }),
    [],
  );

  useFrame((_, rawDelta) => {
    const mode = useAppStore.getState().mode;
    if (mode === 'orbit') return;
    if (cameraState.transitioning) {
      look.current.synced = false;
      return;
    }
    const dt = Math.min(rawDelta, 0.05);
    const s = scratch.current;
    const m = motion.current;
    if (!look.current.synced) {
      s.euler.setFromQuaternion(camera.quaternion, 'YXZ');
      look.current.yaw = s.euler.y;
      look.current.pitch = s.euler.x;
      look.current.synced = true;
      m.velocity.set(0, 0, 0);
      m.vy = 0;
      m.feet = Math.max(0, camera.position.y - EYE_HEIGHT);
    }
    const { yaw, pitch } = look.current;
    const collision = registry.collision;
    const boost = isDown('ShiftLeft', 'ShiftRight');
    const strafe = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
    const advance = axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
    const position = camera.position;
    let speed = 0;

    if (mode === 'walk') {
      s.forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
      s.right.set(Math.cos(yaw), 0, -Math.sin(yaw));
      s.wish.copy(s.forward).multiplyScalar(advance).addScaledVector(s.right, strafe);
      if (s.wish.lengthSq() > 0) s.wish.normalize().multiplyScalar(boost ? RUN_SPEED : WALK_SPEED);
      m.velocity.lerp(s.wish, 1 - Math.exp(-10 * dt));
      const nextX = position.x + m.velocity.x * dt;
      const nextZ = position.z + m.velocity.z * dt;
      if (!collision?.blocked(nextX, -position.z, 0.35, m.feet + 0.5)) position.x = nextX;
      if (!collision?.blocked(position.x, -nextZ, 0.35, m.feet + 0.5)) position.z = nextZ;
      if (m.grounded && isDown('Space')) {
        m.vy = JUMP_VELOCITY;
        m.grounded = false;
      }
      m.vy -= GRAVITY * dt;
      m.feet += m.vy * dt;
      if (m.feet <= 0) {
        m.feet = 0;
        m.vy = 0;
        m.grounded = true;
      }
      speed = Math.hypot(m.velocity.x, m.velocity.z);
      m.bob += speed * dt * 1.7;
      position.y = m.feet + EYE_HEIGHT + (m.grounded ? Math.sin(m.bob * 2) * 0.035 * Math.min(speed / WALK_SPEED, 1) : 0);
    } else {
      s.euler.set(pitch, yaw, 0, 'YXZ');
      s.forward.set(0, 0, -1).applyEuler(s.euler);
      s.right.set(1, 0, 0).applyEuler(s.euler);
      const lift = axis(['Space', 'KeyE'], ['KeyQ', 'KeyC', 'ControlLeft']);
      s.wish.copy(s.forward).multiplyScalar(advance).addScaledVector(s.right, strafe).addScaledVector(camera.up, lift);
      if (s.wish.lengthSq() > 0) s.wish.normalize().multiplyScalar(FLY_SPEED * cameraState.flySpeedMultiplier * (boost ? 4 : 1));
      m.velocity.lerp(s.wish, 1 - Math.exp(-4 * dt));
      const next = position.clone().addScaledVector(m.velocity, dt);
      for (const key of ['x', 'z'] as const) {
        const candidate = position.clone();
        candidate[key] = next[key];
        if (!collision?.blocked(candidate.x, -candidate.z, 1.2, candidate.y)) position[key] = next[key];
      }
      const floor = Math.max(2, (collision?.roofHeightAt(position.x, -position.z) ?? 0) + 1.5);
      position.y = Math.min(Math.max(next.y, floor), 3500);
      speed = m.velocity.length();
    }

    if (collision) {
      const [e, n] = collision.clampToBounds(position.x, -position.z, 400);
      position.x = e;
      position.z = -n;
    }
    s.euler.set(pitch, yaw, 0, 'YXZ');
    camera.quaternion.setFromEuler(s.euler);
    telemetry.speed = speed;
    telemetry.focusX = position.x - Math.sin(yaw) * (mode === 'walk' ? 30 : Math.min(Math.max(position.y, 40), 400));
    telemetry.focusZ = position.z - Math.cos(yaw) * (mode === 'walk' ? 30 : Math.min(Math.max(position.y, 40), 400));
  });

  return null;
}
