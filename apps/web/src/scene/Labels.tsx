import type { CityData, Poi, PoiKind } from '@noida/city-schema';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Vector3 } from 'three';
import { useAppStore } from '../state/store';

const GLYPH: Record<PoiKind, string> = {
  metro_station: 'M',
  hospital: '+',
  university: 'U',
  college: 'U',
  school: 'S',
  mall: '◆',
  office: '▣',
  hotel: 'H',
  worship: '◎',
  bank: '₹',
  fuel: 'F',
  food: '•',
  park: '♣',
  government: '▲',
  shop: '•',
  residential: '⌂',
  locality: '',
  landmark: '★',
};

const HIDDEN_KINDS = new Set<PoiKind>(['shop', 'food', 'bank']);
const MAX_VISIBLE = 16;

interface Label {
  poi: Poi;
  position: Vector3;
  reach: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function Labels({ city }: { city: CityData }) {
  const size = useThree((state) => state.size);
  const labels = useMemo<Label[]>(() => {
    const heights = new Map(city.buildings.map((b) => [b.id, b.height]));
    return city.pois
      .filter((poi) => !HIDDEN_KINDS.has(poi.kind) || poi.importance > 30)
      .slice(0, 120)
      .map((poi) => {
        const base =
          poi.kind === 'metro_station' ? 22 : poi.kind === 'locality' ? 60 : (poi.buildingId ? (heights.get(poi.buildingId) ?? 8) : 6) + 5;
        return { poi, position: new Vector3(poi.e, base, -poi.n), reach: 160 + poi.importance * 17 };
      });
  }, [city]);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const widths = useRef<number[]>([]);
  const requestFocus = useAppStore((state) => state.requestFocus);
  const projected = useMemo(() => new Vector3(), []);

  useFrame(({ camera }) => {
    const walk = useAppStore.getState().mode === 'walk';
    const placed: Rect[] = [];
    let shown = 0;
    labels.forEach((label, i) => {
      const element = refs.current[i];
      if (!element) return;
      const distance = camera.position.distanceTo(label.position);
      const isLocality = label.poi.kind === 'locality';
      const reach = walk ? Math.min(label.reach, 380) : label.reach;
      let visible = isLocality ? camera.position.y > 700 && distance < 5500 : distance < reach && (walk || camera.position.y > 25);
      if (visible) {
        projected.copy(label.position).project(camera);
        if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) visible = false;
        else {
          const x = (projected.x * 0.5 + 0.5) * size.width;
          const y = (-projected.y * 0.5 + 0.5) * size.height;
          if (!widths.current[i]) widths.current[i] = element.offsetWidth || label.poi.name.length * 7 + 30;
          const w = widths.current[i] / 2 + 6;
          const rect = { x0: x - w, x1: x + w, y0: y - 30, y1: y + 6 };
          const overlaps = placed.some((r) => rect.x0 < r.x1 && rect.x1 > r.x0 && rect.y0 < r.y1 && rect.y1 > r.y0);
          if (overlaps || (!isLocality && shown >= MAX_VISIBLE)) visible = false;
          else {
            placed.push(rect);
            if (!isLocality) shown++;
          }
        }
      }
      const fade = isLocality ? Math.min(1, (camera.position.y - 700) / 400) : Math.min(1, (reach - distance) / (reach * 0.25));
      element.style.opacity = visible ? String(Math.max(fade, 0)) : '0';
      element.style.visibility = visible ? 'visible' : 'hidden';
    });
  });

  return (
    <group>
      {labels.map((label, i) => (
        <Html key={label.poi.id} position={label.position} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div
            ref={(element) => {
              refs.current[i] = element;
            }}
            className={`map-label map-label--${label.poi.kind}`}
            style={{ visibility: 'hidden' }}
          >
            {label.poi.kind === 'locality' ? (
              <span className="map-label__locality">{label.poi.name}</span>
            ) : (
              <button type="button" className="map-label__chip" onClick={() => requestFocus(label.poi.e, label.poi.n)}>
                <span className="map-label__glyph">{GLYPH[label.poi.kind]}</span>
                <span className="map-label__name">{label.poi.name}</span>
              </button>
            )}
            {label.poi.kind !== 'locality' && <span className="map-label__stem" />}
          </div>
        </Html>
      ))}
    </group>
  );
}
