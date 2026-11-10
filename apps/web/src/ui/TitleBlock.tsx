import { createProjection } from '@noida/city-schema';
import { useMemo, useRef } from 'react';
import { useAppStore } from '../state/store';
import { telemetry } from '../state/telemetry';
import { useAnimationFrame } from './useAnimationFrame';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function TitleBlock() {
  const city = useAppStore((state) => state.city);
  const mode = useAppStore((state) => state.mode);
  const projection = useMemo(() => (city ? createProjection(city.meta.origin) : null), [city]);
  const coords = useRef<HTMLSpanElement>(null);
  const alt = useRef<HTMLSpanElement>(null);
  const heading = useRef<HTMLSpanElement>(null);
  const speed = useRef<HTMLSpanElement>(null);

  useAnimationFrame(() => {
    if (!projection) return;
    const focusing = mode === 'orbit';
    const [lat, lon] = projection.toGeo(focusing ? telemetry.focusX : telemetry.x, -(focusing ? telemetry.focusZ : telemetry.z));
    if (coords.current) coords.current.textContent = `${lat.toFixed(5)}° N  ${lon.toFixed(5)}° E`;
    if (alt.current) alt.current.textContent = `${Math.round(telemetry.y)} m`;
    const degrees = Math.round((telemetry.heading * 180) / Math.PI) % 360;
    if (heading.current) heading.current.textContent = `${String(degrees).padStart(3, '0')}° ${COMPASS[Math.round(degrees / 45) % 8]}`;
    if (speed.current) {
      speed.current.textContent = mode === 'orbit' ? `${Math.round(telemetry.fps)} fps` : `${(telemetry.speed * 3.6).toFixed(0)} km/h`;
    }
  }, 15);

  if (!city) return null;
  return (
    <header className="title-block panel">
      <p className="eyebrow">Noida · Gautam Buddha Nagar · 201309</p>
      <h1 className="title-block__name">
        Sector <em>62</em>
      </h1>
      <dl className="readout">
        <div className="readout__wide">
          <dt>{mode === 'orbit' ? 'Focus' : 'Position'}</dt>
          <dd>
            <span ref={coords} />
          </dd>
        </div>
        <div>
          <dt>Alt</dt>
          <dd>
            <span ref={alt} />
          </dd>
        </div>
        <div>
          <dt>Hdg</dt>
          <dd>
            <span ref={heading} />
          </dd>
        </div>
        <div>
          <dt>{mode === 'orbit' ? 'Render' : 'Speed'}</dt>
          <dd>
            <span ref={speed} />
          </dd>
        </div>
      </dl>
    </header>
  );
}
