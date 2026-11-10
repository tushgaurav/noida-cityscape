import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  Color,
  type DirectionalLight,
  FogExp2,
  type HemisphereLight,
  Mesh,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Vector3,
  type WebGLRenderTarget,
} from 'three';
import { istDate, solarPosition } from '../lib/sun';
import { useAppStore } from '../state/store';
import { telemetry } from '../state/telemetry';
import { sharedUniforms } from '../world/materials/shaderLib';
import { createSkyMaterial } from './skyMaterial';
import { createSkyState, sampleSky } from './skyPalette';

const MOON_DIR = new Vector3(-0.35, 0.78, 0.52).normalize();
const MOON_COLOR = new Color('#9fb4e0');
const UP = new Vector3(0, 1, 0);
const DEG = 180 / Math.PI;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export function Atmosphere({ lat, lon }: { lat: number; lon: number }) {
  const { scene, gl, camera } = useThree();
  const quality = useAppStore((state) => state.quality);
  const sunRef = useRef<DirectionalLight>(null);
  const hemiRef = useRef<HemisphereLight>(null);
  const skyMaterial = useMemo(createSkyMaterial, []);
  const skyGeometry = useMemo(() => new SphereGeometry(20000, 48, 24), []);
  const fog = useMemo(() => new FogExp2('#c9c3b4', 0.0004), []);
  const sky = useMemo(createSkyState, []);
  const scratch = useMemo(
    () => ({ dir: new Vector3(), focus: new Vector3(), right: new Vector3(), up: new Vector3(), snapped: new Vector3() }),
    [],
  );
  const env = useMemo(() => {
    const envScene = new Scene();
    envScene.add(new Mesh(new SphereGeometry(50, 32, 16), skyMaterial));
    return { scene: envScene, pmrem: new PMREMGenerator(gl), target: null as WebGLRenderTarget | null, key: '', last: 0 };
  }, [gl, skyMaterial]);

  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  useEffect(
    () => () => {
      env.target?.dispose();
      env.pmrem.dispose();
    },
    [env],
  );

  useEffect(() => {
    const light = sunRef.current;
    if (!light) return;
    const size = quality === 'high' ? 4096 : 2048;
    light.castShadow = quality !== 'low';
    if (light.shadow.mapSize.x !== size) {
      light.shadow.mapSize.set(size, size);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
  }, [quality]);

  useFrame((state, delta) => {
    const store = useAppStore.getState();
    if (store.playing) store.setMinutes(store.minutes + delta * 14);
    sharedUniforms.uTime.value = state.clock.elapsedTime;

    const { altitude, bearing } = solarPosition(istDate(store.minutes), lat, lon);
    const altDeg = altitude * DEG;
    const sunDir = sharedUniforms.uSunDir.value.set(
      Math.sin(bearing) * Math.cos(altitude),
      Math.sin(altitude),
      -Math.cos(bearing) * Math.cos(altitude),
    );
    sampleSky(altDeg, sky);
    const night = smoothstep(3, -7, altDeg);
    sharedUniforms.uNight.value = night;
    telemetry.sunAltitude = altDeg;
    telemetry.night = night;

    skyMaterial.uniforms.uZenith.value.copy(sky.zenith);
    skyMaterial.uniforms.uHorizon.value.copy(sky.horizon);
    skyMaterial.uniforms.uSunColor.value.copy(sky.sun);
    skyMaterial.uniforms.uMoonDir.value.copy(MOON_DIR);
    fog.color.copy(sky.horizon);
    fog.density = sky.fogDensity;
    scene.environmentIntensity = sky.envIntensity;

    const hemi = hemiRef.current;
    if (hemi) {
      hemi.color.copy(sky.hemiSky);
      hemi.groundColor.copy(sky.hemiGround);
      hemi.intensity = sky.hemiIntensity;
    }

    const light = sunRef.current;
    if (light) {
      const useSun = altDeg > -3;
      scratch.dir.copy(useSun ? sunDir : MOON_DIR);
      light.intensity = useSun ? sky.sunIntensity * smoothstep(-3, 1, altDeg) : 0.2 * smoothstep(-3, -9, altDeg);
      light.color.copy(useSun ? sky.sun : MOON_COLOR);

      scratch.focus.set(telemetry.focusX, 0, telemetry.focusZ);
      const distance = camera.position.distanceTo(scratch.focus);
      const half = Math.min(Math.max(distance * 0.85, 70), 1100);
      const texel = (2 * half) / light.shadow.mapSize.x;
      scratch.right.crossVectors(scratch.dir, UP);
      if (scratch.right.lengthSq() < 1e-6) scratch.right.set(1, 0, 0);
      scratch.right.normalize();
      scratch.up.crossVectors(scratch.right, scratch.dir).normalize();
      const r = Math.round(scratch.focus.dot(scratch.right) / texel) * texel;
      const u = Math.round(scratch.focus.dot(scratch.up) / texel) * texel;
      const f = scratch.focus.dot(scratch.dir);
      scratch.snapped.copy(scratch.right).multiplyScalar(r).addScaledVector(scratch.up, u).addScaledVector(scratch.dir, f);

      const cam = light.shadow.camera;
      if (Math.abs(cam.right - half) > 1) {
        cam.left = -half;
        cam.right = half;
        cam.top = half;
        cam.bottom = -half;
        cam.near = 10;
        cam.far = 6000;
        cam.updateProjectionMatrix();
      }
      light.shadow.normalBias = texel * 1.4;
      light.shadow.bias = -0.0002;
      light.position.copy(scratch.snapped).addScaledVector(scratch.dir, 2500);
      light.target.position.copy(scratch.snapped);
      light.target.updateMatrixWorld();
    }

    const key = `${Math.round(altDeg * 2)}:${Math.round(bearing * DEG * 0.5)}`;
    if (key !== env.key && state.clock.elapsedTime - env.last > 0.3) {
      env.key = key;
      env.last = state.clock.elapsedTime;
      const target = env.pmrem.fromScene(env.scene, 0.02, 0.1, 100);
      env.target?.dispose();
      env.target = target;
      scene.environment = target.texture;
    }
  });

  return (
    <>
      <mesh geometry={skyGeometry} material={skyMaterial} frustumCulled={false} renderOrder={-1} />
      <hemisphereLight ref={hemiRef} />
      <directionalLight ref={sunRef} />
    </>
  );
}
