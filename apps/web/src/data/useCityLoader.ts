import { CITY_DATA_VERSION, type CityData } from '@noida/city-schema';
import { useEffect } from 'react';
import { useAppStore } from '../state/store';
import type { WorkerMessage } from '../world/types';

const REGION = 'sector-62';

async function downloadCity(onProgress: (fraction: number) => void, signal: AbortSignal): Promise<CityData> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${REGION}.city.json`, { signal });
  if (!response.ok) throw new Error(`Could not load city data (HTTP ${response.status}). Run "pnpm data" to generate it.`);
  const total = Number(response.headers.get('content-length')) || 3_700_000;
  const reader = response.body?.getReader();
  if (!reader) return (await response.json()) as CityData;
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(received / total, 0.99));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const city = JSON.parse(new TextDecoder().decode(bytes)) as CityData;
  if (city.version !== CITY_DATA_VERSION) throw new Error(`City data version ${city.version} is not supported (expected ${CITY_DATA_VERSION}).`);
  return city;
}

export function useCityLoader() {
  useEffect(() => {
    const { setLoading, setCity, setWorld } = useAppStore.getState();
    const controller = new AbortController();
    const worker = new Worker(new URL('../world/build/world.worker.ts', import.meta.url), { type: 'module' });

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.type === 'progress') setLoading({ stage: 'building', label: message.label, progress: 0.25 + message.progress * 0.75 });
      else if (message.type === 'error') setLoading({ stage: 'error', error: message.message });
      else {
        setWorld(message.world);
        setLoading({ stage: 'ready', label: 'Ready', progress: 1 });
      }
    };
    worker.onerror = (event) => setLoading({ stage: 'error', error: event.message || 'Geometry worker crashed' });

    downloadCity((fraction) => setLoading({ stage: 'fetching', progress: fraction * 0.25 }), controller.signal)
      .then((city) => {
        setCity(city);
        setLoading({ stage: 'building', label: 'Preparing geometry', progress: 0.25 });
        worker.postMessage(city);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoading({ stage: 'error', error: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      controller.abort();
      worker.terminate();
    };
  }, []);
}
