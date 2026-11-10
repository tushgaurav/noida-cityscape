import { useEffect } from 'react';
import { attachKeyboard } from './controls/input';
import { useCityLoader } from './data/useCityLoader';
import { CityScene } from './scene/CityScene';
import { Hud } from './ui/Hud';
import { LoadingScreen } from './ui/LoadingScreen';

export function App() {
  useCityLoader();
  useEffect(attachKeyboard, []);
  return (
    <main className="app">
      <CityScene />
      <Hud />
      <LoadingScreen />
    </main>
  );
}
