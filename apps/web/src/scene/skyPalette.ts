import { Color } from 'three';

interface Key {
  altitude: number;
  zenith: string;
  horizon: string;
  sun: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  envIntensity: number;
  fogDensity: number;
}

const KEYS: Key[] = [
  { altitude: -18, zenith: '#05080f', horizon: '#2a221e', sun: '#8ea4d6', sunIntensity: 0.16, hemiSky: '#344062', hemiGround: '#221b14', hemiIntensity: 0.55, envIntensity: 0.25, fogDensity: 0.00034 },
  { altitude: -7, zenith: '#16223d', horizon: '#5b4f60', sun: '#9fb2dc', sunIntensity: 0.12, hemiSky: '#4a5880', hemiGround: '#2a241f', hemiIntensity: 0.5, envIntensity: 0.38, fogDensity: 0.0003 },
  { altitude: -1, zenith: '#3f5479', horizon: '#c98663', sun: '#ff7a3d', sunIntensity: 0.25, hemiSky: '#878ba3', hemiGround: '#55432f', hemiIntensity: 0.6, envIntensity: 0.55, fogDensity: 0.00028 },
  { altitude: 5, zenith: '#6a85ad', horizon: '#e3b086', sun: '#ffac66', sunIntensity: 1.9, hemiSky: '#a7b3c6', hemiGround: '#6d5b45', hemiIntensity: 0.78, envIntensity: 0.8, fogDensity: 0.00025 },
  { altitude: 18, zenith: '#6d91bd', horizon: '#d6cebd', sun: '#ffe0b8', sunIntensity: 3.0, hemiSky: '#b7c6d8', hemiGround: '#7a6a53', hemiIntensity: 0.9, envIntensity: 0.95, fogDensity: 0.00021 },
  { altitude: 60, zenith: '#6890c0', horizon: '#d2cec4', sun: '#fff4e4', sunIntensity: 3.5, hemiSky: '#c1cfe0', hemiGround: '#806f57', hemiIntensity: 0.95, envIntensity: 1.0, fogDensity: 0.0002 },
];

export interface SkyState {
  zenith: Color;
  horizon: Color;
  sun: Color;
  sunIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  envIntensity: number;
  fogDensity: number;
}

const parsed = KEYS.map((key) => ({
  ...key,
  zenithC: new Color(key.zenith),
  horizonC: new Color(key.horizon),
  sunC: new Color(key.sun),
  hemiSkyC: new Color(key.hemiSky),
  hemiGroundC: new Color(key.hemiGround),
}));

export function createSkyState(): SkyState {
  return {
    zenith: new Color(),
    horizon: new Color(),
    sun: new Color(),
    sunIntensity: 0,
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemiIntensity: 0,
    envIntensity: 1,
    fogDensity: 0.0004,
  };
}

export function sampleSky(altitudeDeg: number, out: SkyState): SkyState {
  let i = 0;
  while (i < parsed.length - 2 && altitudeDeg > parsed[i + 1].altitude) i++;
  const a = parsed[i];
  const b = parsed[i + 1];
  const t = Math.min(Math.max((altitudeDeg - a.altitude) / (b.altitude - a.altitude), 0), 1);
  const k = t * t * (3 - 2 * t);
  out.zenith.copy(a.zenithC).lerp(b.zenithC, k);
  out.horizon.copy(a.horizonC).lerp(b.horizonC, k);
  out.sun.copy(a.sunC).lerp(b.sunC, k);
  out.hemiSky.copy(a.hemiSkyC).lerp(b.hemiSkyC, k);
  out.hemiGround.copy(a.hemiGroundC).lerp(b.hemiGroundC, k);
  out.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * k;
  out.hemiIntensity = a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * k;
  out.envIntensity = a.envIntensity + (b.envIntensity - a.envIntensity) * k;
  out.fogDensity = a.fogDensity + (b.fogDensity - a.fogDensity) * k;
  return out;
}
