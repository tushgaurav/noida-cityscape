import { useEffect } from 'react';
import { cameraState } from '../controls/input';
import { type CameraMode, useAppStore } from '../state/store';
import { BuildingCard } from './BuildingCard';
import { Minimap } from './Minimap';
import { ModeSwitch } from './ModeSwitch';
import { TimeDial } from './TimeDial';
import { TitleBlock } from './TitleBlock';

const HINTS: Record<CameraMode, [string, string][]> = {
  orbit: [
    ['Drag', 'pan'],
    ['Right-drag', 'rotate'],
    ['Scroll', 'zoom'],
    ['WASD', 'glide'],
    ['Click', 'inspect building'],
  ],
  walk: [
    ['WASD', 'walk'],
    ['Shift', 'run'],
    ['Space', 'jump'],
    ['Mouse', 'look'],
    ['Click', 'inspect'],
    ['Esc', 'free cursor'],
  ],
  fly: [
    ['WASD', 'fly'],
    ['Space / E', 'rise'],
    ['Q / C', 'sink'],
    ['Shift', 'boost'],
    ['Scroll', 'speed'],
    ['Esc', 'free cursor'],
  ],
};

function useHotkeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const state = useAppStore.getState();
      if (event.repeat || !state.introDone) return;
      if (event.code === 'Digit1') state.setMode('orbit');
      else if (event.code === 'Digit2') state.setMode('walk');
      else if (event.code === 'Digit3') state.setMode('fly');
      else if (event.code === 'KeyT') state.setPlaying(!state.playing);
      else if (event.code === 'KeyL') state.toggleLayer('labels');
      else if (event.code === 'BracketLeft') state.setMinutes(state.minutes - 30);
      else if (event.code === 'BracketRight') state.setMinutes(state.minutes + 30);
      else if (event.code === 'Escape' && !state.pointerLocked) state.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function Hud() {
  const ready = useAppStore((state) => state.loading.stage === 'ready');
  const introDone = useAppStore((state) => state.introDone);
  const mode = useAppStore((state) => state.mode);
  const locked = useAppStore((state) => state.pointerLocked);
  useHotkeys();

  if (!ready) return null;
  const firstPerson = mode !== 'orbit';
  return (
    <div className={`hud ${introDone ? 'hud--live' : ''}`}>
      <TitleBlock />
      <ModeSwitch />
      <TimeDial />
      <Minimap />
      <BuildingCard />
      <footer className="hints">
        {HINTS[mode].map(([key, action]) => (
          <span key={key} className="hints__item">
            <kbd>{key}</kbd>
            {action}
          </span>
        ))}
      </footer>
      <p className="attribution">
        Map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        contributors · heights partly estimated
      </p>
      {firstPerson && locked && <div className="crosshair" aria-hidden />}
      {firstPerson && !locked && !cameraState.transitioning && (
        <div className="look-prompt" aria-live="polite">
          <span className="look-prompt__title">{mode === 'walk' ? 'Street level' : 'Drone mode'}</span>
          <span>Click the scene to look around</span>
        </div>
      )}
    </div>
  );
}
