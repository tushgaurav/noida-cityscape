import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { type BloomEffect, ToneMappingMode } from 'postprocessing';
import { useRef } from 'react';
import { CameraDirector } from '../controls/CameraDirector';
import { FirstPersonRig } from '../controls/FirstPersonRig';
import { OrbitRig } from '../controls/OrbitRig';
import { Picker } from '../controls/Picker';
import { type Quality, useAppStore } from '../state/store';
import { telemetry } from '../state/telemetry';
import { Atmosphere } from './Atmosphere';
import { CityMeshes } from './CityMeshes';
import { Labels } from './Labels';
import { Selection } from './Selection';
import { Traffic } from './Traffic';
import { Trains } from './Trains';

function useNightBloom() {
  const bloom = useRef<BloomEffect>(null);
  useFrame(() => {
    if (bloom.current) bloom.current.intensity = 0.22 + telemetry.night * 0.85;
  });
  return bloom;
}

function HighEffects({ quality }: { quality: Quality }) {
  const bloom = useNightBloom();
  return (
    <EffectComposer multisampling={quality === 'high' ? 4 : 2}>
      <N8AO aoRadius={4.5} distanceFalloff={1.1} intensity={2.6} quality={quality === 'high' ? 'medium' : 'performance'} />
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.25} intensity={0.3} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.32} darkness={0.42} />
    </EffectComposer>
  );
}

function LowEffects() {
  const bloom = useNightBloom();
  return (
    <EffectComposer multisampling={0}>
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.25} intensity={0.3} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <SMAA />
    </EffectComposer>
  );
}

export function CityScene() {
  const city = useAppStore((state) => state.city);
  const world = useAppStore((state) => state.world);
  const quality = useAppStore((state) => state.quality);
  const layers = useAppStore((state) => state.layers);
  const dpr: [number, number] = quality === 'high' ? [1, 2] : quality === 'balanced' ? [1, 1.5] : [0.75, 1];

  return (
    <Canvas
      className="city-canvas"
      shadows="percentage"
      dpr={dpr}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 42, near: 1, far: 40000, position: [0, 3000, 3000] }}
      onCreated={({ gl }) => gl.setClearColor('#14130f')}
    >
      {city && <Atmosphere lat={city.meta.origin.lat} lon={city.meta.origin.lon} />}
      {city && world && (
        <>
          <CityMeshes city={city} world={world} />
          {layers.traffic && <Traffic city={city} />}
          {layers.metro && <Trains city={city} />}
          {layers.labels && <Labels city={city} />}
          <Selection city={city} />
          <CameraDirector city={city} />
          <OrbitRig />
          <FirstPersonRig />
          <Picker />
          {quality === 'low' ? <LowEffects /> : <HighEffects quality={quality} />}
        </>
      )}
    </Canvas>
  );
}
