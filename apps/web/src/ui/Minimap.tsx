import type { AreaKind, CityData, RoadKind } from '@noida/city-schema';
import { useMemo, useRef } from 'react';
import { useAppStore } from '../state/store';
import { telemetry } from '../state/telemetry';
import { useAnimationFrame } from './useAnimationFrame';

const SCALE = 2.2;
const SIZE = 196;

const AREA_FILL: Partial<Record<AreaKind, string>> = {
  park: '#2c3d24',
  garden: '#2c3d24',
  grass: '#2f3a25',
  forest: '#253620',
  scrub: '#2f3725',
  pitch: '#2f4426',
  water: '#1b3944',
  pool: '#1f4a58',
  parking: '#2a2927',
  campus: '#25241f',
  residential: '#211f1c',
  commercial: '#23211e',
  industrial: '#22201c',
};

const ROAD_STROKE: Partial<Record<RoadKind, string>> = {
  motorway: '#e7a94b',
  trunk: '#e7a94b',
  primary: '#ddd5c5',
  secondary: '#d4ccbb',
  tertiary: '#b6ae9e',
  unclassified: '#8b8476',
  residential: '#7a7468',
  living_street: '#6d675c',
  service: '#55504a',
};

function renderBaseMap(city: CityData): HTMLCanvasElement {
  const { minE, maxE, minN, maxN } = city.meta.bounds;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((maxE - minE) / SCALE);
  canvas.height = Math.ceil((maxN - minN) / SCALE);
  const ctx = canvas.getContext('2d')!;
  const px = (e: number) => (e - minE) / SCALE;
  const py = (n: number) => (maxN - n) / SCALE;
  ctx.fillStyle = '#191815';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const ring = (coords: number[]) => {
    ctx.moveTo(px(coords[0]), py(coords[1]));
    for (let i = 2; i < coords.length; i += 2) ctx.lineTo(px(coords[i]), py(coords[i + 1]));
    ctx.closePath();
  };
  for (const area of city.areas) {
    const fill = AREA_FILL[area.kind];
    if (!fill) continue;
    ctx.fillStyle = fill;
    ctx.beginPath();
    area.polygon.forEach(ring);
    ctx.fill('evenodd');
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const order: RoadKind[] = ['service', 'living_street', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway'];
  for (const kind of order) {
    ctx.strokeStyle = ROAD_STROKE[kind]!;
    for (const road of city.roads) {
      if (road.kind !== kind || road.tunnel) continue;
      ctx.lineWidth = Math.max(road.width / SCALE, 0.7);
      ctx.beginPath();
      ctx.moveTo(px(road.points[0]), py(road.points[1]));
      for (let i = 2; i < road.points.length; i += 2) ctx.lineTo(px(road.points[i]), py(road.points[i + 1]));
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#5a554c';
  for (const building of city.buildings) {
    ctx.beginPath();
    building.polygon.forEach(ring);
    ctx.fill('evenodd');
  }
  ctx.strokeStyle = '#4d86ff';
  ctx.lineWidth = 2;
  for (const line of city.rail) {
    if (!line.elevated) continue;
    ctx.beginPath();
    ctx.moveTo(px(line.points[0]), py(line.points[1]));
    for (let i = 2; i < line.points.length; i += 2) ctx.lineTo(px(line.points[i]), py(line.points[i + 1]));
    ctx.stroke();
  }
  for (const poi of city.pois) {
    if (poi.kind !== 'metro_station') continue;
    ctx.fillStyle = '#f3eee4';
    ctx.strokeStyle = '#4d86ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px(poi.e), py(poi.n), 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  return canvas;
}

export function Minimap() {
  const city = useAppStore((state) => state.city);
  const requestFocus = useAppStore((state) => state.requestFocus);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef<HTMLSpanElement>(null);
  const view = useRef({ centerE: 0, centerN: 0, span: 1500 });
  const base = useMemo(() => (city ? renderBaseMap(city) : null), [city]);

  useAnimationFrame(() => {
    const canvas = canvasRef.current;
    if (!canvas || !city || !base) return;
    const ctx = canvas.getContext('2d')!;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== SIZE * ratio) {
      canvas.width = SIZE * ratio;
      canvas.height = SIZE * ratio;
    }
    const mode = useAppStore.getState().mode;
    const altitude = Math.max(telemetry.y, 1);
    const span = mode === 'walk' ? 380 : mode === 'fly' ? Math.min(Math.max(altitude * 4, 500), 3200) : Math.min(Math.max(altitude * 2.6, 600), 4200);
    const centerE = mode === 'orbit' ? telemetry.focusX : telemetry.x;
    const centerN = mode === 'orbit' ? -telemetry.focusZ : -telemetry.z;
    view.current = { centerE, centerN, span };

    const { minE, maxN } = city.meta.bounds;
    const sx = (centerE - span / 2 - minE) / SCALE;
    const sy = (maxN - (centerN + span / 2)) / SCALE;
    const sw = span / SCALE;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#12110f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, sx, sy, sw, sw, 0, 0, SIZE, SIZE);

    const toPx = (e: number, n: number): [number, number] => [((e - centerE) / span + 0.5) * SIZE, (0.5 - (n - centerN) / span) * SIZE];
    const [cx, cy] = toPx(telemetry.x, -telemetry.z);
    const heading = telemetry.heading;
    const fov = Math.min(((telemetry.fov * Math.PI) / 180) * 1.2, 1.6);
    const reach = mode === 'orbit' ? 26 : 38;
    ctx.save();
    ctx.translate(Math.min(Math.max(cx, 6), SIZE - 6), Math.min(Math.max(cy, 6), SIZE - 6));
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
    gradient.addColorStop(0, 'rgba(240,164,58,0.55)');
    gradient.addColorStop(1, 'rgba(240,164,58,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, reach, heading - Math.PI / 2 - fov / 2, heading - Math.PI / 2 + fov / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f0a43a';
    ctx.strokeStyle = '#12110f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    if (mode === 'orbit') {
      const [fx, fy] = toPx(telemetry.focusX, -telemetry.focusZ);
      ctx.strokeStyle = 'rgba(243,238,228,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx - 7, fy);
      ctx.lineTo(fx + 7, fy);
      ctx.moveTo(fx, fy - 7);
      ctx.lineTo(fx, fy + 7);
      ctx.stroke();
    }
    if (scaleRef.current) {
      const metres = span / 4;
      const nice = metres > 700 ? Math.round(metres / 500) * 500 : metres > 150 ? Math.round(metres / 100) * 100 : Math.round(metres / 50) * 50;
      scaleRef.current.textContent = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
      scaleRef.current.style.width = `${(nice / span) * SIZE}px`;
    }
  }, 30);

  if (!city) return null;
  return (
    <section className="minimap panel" aria-label="Minimap">
      <div className="minimap__frame">
        <canvas
          ref={canvasRef}
          style={{ width: SIZE, height: SIZE }}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const { centerE, centerN, span } = view.current;
            const e = centerE + ((event.clientX - rect.left) / rect.width - 0.5) * span;
            const n = centerN - ((event.clientY - rect.top) / rect.height - 0.5) * span;
            requestFocus(e, n);
          }}
        />
        <span className="minimap__north" aria-hidden>
          N
        </span>
      </div>
      <div className="minimap__footer">
        <span className="minimap__scale">
          <span ref={scaleRef} />
        </span>
        <span className="minimap__hint">Click to travel</span>
      </div>
    </section>
  );
}
