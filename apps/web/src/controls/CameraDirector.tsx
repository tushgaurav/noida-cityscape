import type { CityData } from '@noida/city-schema';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Euler, Matrix4, type PerspectiveCamera, Quaternion, Raycaster, Vector2, Vector3 } from 'three';
import { registry } from '../scene/registry';
import { type CameraMode, useAppStore } from '../state/store';
import { telemetry } from '../state/telemetry';
import { cameraState } from './input';

interface Pose {
  position: Vector3;
  quaternion: Quaternion;
  fov: number;
}

interface Tween {
  from: Pose;
  to: Pose;
  t: number;
  duration: number;
  done?: () => void;
}

const UP = new Vector3(0, 1, 0);
export const EYE_HEIGHT = 1.7;
const FOV: Record<CameraMode, number> = { orbit: 42, walk: 72, fly: 64 };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function lookPose(position: Vector3, target: Vector3, fov: number): Pose {
  const m = new Matrix4().lookAt(position, target, UP);
  return { position: position.clone(), quaternion: new Quaternion().setFromRotationMatrix(m), fov };
}

export function orbitPose(target: Vector3, distance: number, polar: number, azimuth: number): Pose {
  const position = new Vector3(
    target.x + Math.sin(polar) * Math.sin(azimuth) * distance,
    target.y + Math.cos(polar) * distance,
    target.z + Math.sin(polar) * Math.cos(azimuth) * distance,
  );
  return lookPose(position, target, FOV.orbit);
}

function groundAhead(camera: PerspectiveCamera, maxDistance = 900): Vector3 {
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(0, 0), camera);
  const dir = ray.ray.direction;
  if (dir.y < -0.05) {
    const t = Math.min(-camera.position.y / dir.y, maxDistance);
    return camera.position.clone().addScaledVector(dir, t).setY(0);
  }
  const flat = new Vector3(dir.x, 0, dir.z).normalize();
  return camera.position.clone().addScaledVector(flat, 90).setY(0);
}

function yawOf(camera: PerspectiveCamera): number {
  return new Euler().setFromQuaternion(camera.quaternion, 'YXZ').y;
}

function streetLevelPose(e: number, n: number, preferredYaw: number): { position: Vector3; yaw: number } {
  const collision = registry.collision;
  const spot = collision?.nearestStreetSpot(e, n);
  if (spot) {
    const diff = Math.atan2(Math.sin(spot.yaw - preferredYaw), Math.cos(spot.yaw - preferredYaw));
    return { position: new Vector3(spot.e, EYE_HEIGHT, -spot.n), yaw: Math.abs(diff) > Math.PI / 2 ? spot.yaw + Math.PI : spot.yaw };
  }
  const [fe, fn] = collision ? collision.nearestFree(e, n, 0.6) : [e, n];
  return { position: new Vector3(fe, EYE_HEIGHT, -fn), yaw: preferredYaw };
}

export function CameraDirector({ city }: { city: CityData }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const tween = useRef<Tween | null>(null);
  const previousMode = useRef<CameraMode>(useAppStore.getState().mode);

  const startTween = (to: Pose, duration: number, done?: () => void) => {
    cameraState.transitioning = true;
    tween.current = {
      from: { position: camera.position.clone(), quaternion: camera.quaternion.clone(), fov: camera.fov },
      to,
      t: 0,
      duration,
      done,
    };
  };

  useEffect(() => {
    const focus = new Vector3(city.meta.focus.e, 0, -city.meta.focus.n);
    cameraState.orbitTarget.copy(focus);
    telemetry.focusX = focus.x;
    telemetry.focusZ = focus.z;
    const start = orbitPose(focus, 4300, 0.5, 1.15);
    camera.position.copy(start.position);
    camera.quaternion.copy(start.quaternion);
    camera.fov = FOV.orbit;
    camera.updateProjectionMatrix();
    cameraState.transitioning = true;
    tween.current = {
      from: start,
      to: orbitPose(focus, 1150, 0.98, 0.55),
      t: 0,
      duration: 5.5,
      done: () => useAppStore.getState().finishIntro(),
    };
  }, [city, camera]);

  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        if (state.mode !== previous.mode) {
          const from = previousMode.current;
          const to = state.mode;
          previousMode.current = to;
          const collision = registry.collision;
          if (to === 'walk') {
            const ground = from === 'orbit' ? cameraState.orbitTarget.clone() : new Vector3(camera.position.x, 0, camera.position.z);
            const { position, yaw } = streetLevelPose(ground.x, -ground.z, yawOf(camera));
            const ahead = position.clone().add(new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)));
            startTween(lookPose(position, ahead, FOV.walk), from === 'orbit' ? 2.2 : 1.2);
          } else if (to === 'fly') {
            const position = camera.position.clone();
            if (from === 'walk') position.y += 45;
            const yaw = yawOf(camera);
            const ahead = position.clone().add(new Vector3(-Math.sin(yaw) * 10, -3, -Math.cos(yaw) * 10));
            startTween(lookPose(position, ahead, FOV.fly), from === 'walk' ? 1.4 : 0.6);
          } else {
            const target = groundAhead(camera);
            const [e, n] = collision ? collision.clampToBounds(target.x, -target.z) : [target.x, -target.z];
            target.set(e, 0, -n);
            cameraState.orbitTarget.copy(target);
            const yaw = yawOf(camera);
            startTween(orbitPose(target, 380, 0.92, yaw), 1.6);
          }
        }
        if (state.focusRequest && state.focusRequest !== previous.focusRequest) {
          const { e, n, distance } = state.focusRequest;
          const target = new Vector3(e, 0, -n);
          if (state.mode === 'orbit') {
            const offset = camera.position.clone().sub(cameraState.orbitTarget);
            const currentDistance = offset.length();
            const polar = Math.min(Math.acos(Math.min(Math.max(offset.y / currentDistance, -1), 1)), 1.15);
            const azimuth = Math.atan2(offset.x, offset.z);
            cameraState.orbitTarget.copy(target);
            startTween(orbitPose(target, distance ?? Math.min(Math.max(currentDistance, 220), 900), polar, azimuth), 1.8);
          } else if (state.mode === 'walk') {
            const { position, yaw } = streetLevelPose(e, n, yawOf(camera));
            const ahead = position.clone().add(new Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)));
            startTween(lookPose(position, ahead, FOV.walk), 1.4);
          } else {
            const position = new Vector3(e, Math.max(camera.position.y, 60), -n + 120);
            startTween(lookPose(position, target, FOV.fly), 1.6);
          }
        }
      }),
    [camera],
  );

  useFrame((_, delta) => {
    const active = tween.current;
    if (active) {
      active.t = Math.min(1, active.t + delta / active.duration);
      const k = ease(active.t);
      camera.position.lerpVectors(active.from.position, active.to.position, k);
      camera.quaternion.slerpQuaternions(active.from.quaternion, active.to.quaternion, k);
      camera.fov = active.from.fov + (active.to.fov - active.from.fov) * k;
      camera.updateProjectionMatrix();
      if (active.t >= 1) {
        tween.current = null;
        cameraState.transitioning = false;
        active.done?.();
      }
    }

    const mode = useAppStore.getState().mode;
    const height = Math.max(camera.position.y, 0.5);
    const near = mode === 'walk' ? 0.15 : mode === 'fly' ? Math.min(Math.max(height * 0.01, 0.25), 6) : Math.min(Math.max(height * 0.004, 0.4), 12);
    if (Math.abs(camera.near - near) / camera.near > 0.15 || camera.far !== 40000) {
      camera.near = near;
      camera.far = 40000;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
