import type { CityData } from '@noida/city-schema';
import { type WorkerMessage, collectTransferables } from '../types';
import { buildWorld } from './buildWorld';

const post = (message: WorkerMessage, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

self.onmessage = (event: MessageEvent<CityData>) => {
  try {
    const world = buildWorld(event.data, (label, progress) => post({ type: 'progress', label, progress }));
    post({ type: 'done', world }, collectTransferables(world));
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
