import type { CityData } from '@noida/city-schema';
import { create } from 'zustand';
import type { WorldBuffers } from '../world/types';

export type CameraMode = 'orbit' | 'walk' | 'fly';
export type Quality = 'high' | 'balanced' | 'low';
export type LayerKey = 'trees' | 'traffic' | 'metro' | 'labels' | 'lights';

export interface LoadingState {
  stage: 'fetching' | 'building' | 'ready' | 'error';
  label: string;
  progress: number;
  error?: string;
}

export interface FocusRequest {
  e: number;
  n: number;
  distance?: number;
  nonce: number;
}

interface AppState {
  city: CityData | null;
  world: WorldBuffers | null;
  loading: LoadingState;
  introDone: boolean;
  mode: CameraMode;
  pointerLocked: boolean;
  minutes: number;
  playing: boolean;
  quality: Quality;
  layers: Record<LayerKey, boolean>;
  selected: number | null;
  focusRequest: FocusRequest | null;
  setLoading: (loading: Partial<LoadingState>) => void;
  setCity: (city: CityData) => void;
  setWorld: (world: WorldBuffers) => void;
  finishIntro: () => void;
  setMode: (mode: CameraMode) => void;
  setPointerLocked: (locked: boolean) => void;
  setMinutes: (minutes: number) => void;
  setPlaying: (playing: boolean) => void;
  setQuality: (quality: Quality) => void;
  toggleLayer: (layer: LayerKey) => void;
  select: (index: number | null) => void;
  requestFocus: (e: number, n: number, distance?: number) => void;
}

const defaultQuality = (): Quality => {
  if (typeof navigator === 'undefined') return 'high';
  const cores = navigator.hardwareConcurrency ?? 4;
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  return mobile ? 'low' : cores <= 4 ? 'balanced' : 'high';
};

export const useAppStore = create<AppState>((set) => ({
  city: null,
  world: null,
  loading: { stage: 'fetching', label: 'Downloading OpenStreetMap extract', progress: 0 },
  introDone: false,
  mode: 'orbit',
  pointerLocked: false,
  minutes: 16 * 60 + 45,
  playing: false,
  quality: defaultQuality(),
  layers: { trees: true, traffic: true, metro: true, labels: true, lights: true },
  selected: null,
  focusRequest: null,
  setLoading: (loading) => set((state) => ({ loading: { ...state.loading, ...loading } })),
  setCity: (city) => set({ city }),
  setWorld: (world) => set({ world }),
  finishIntro: () => set({ introDone: true }),
  setMode: (mode) => set({ mode }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setMinutes: (minutes) => set({ minutes: ((minutes % 1440) + 1440) % 1440 }),
  setPlaying: (playing) => set({ playing }),
  setQuality: (quality) => set({ quality }),
  toggleLayer: (layer) => set((state) => ({ layers: { ...state.layers, [layer]: !state.layers[layer] } })),
  select: (selected) => set({ selected }),
  requestFocus: (e, n, distance) => set({ focusRequest: { e, n, distance, nonce: Date.now() } }),
}));
