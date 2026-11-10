import { useRef } from 'react';
import { currentIstMinutes, formatClock } from '../lib/sun';
import { useAppStore } from '../state/store';
import { telemetry } from '../state/telemetry';
import { useAnimationFrame } from './useAnimationFrame';

const SIZE = 116;
const C = SIZE / 2;
const R = 44;

function phase(altitude: number, minutes: number): string {
  const morning = minutes < 720;
  if (altitude > 40) return 'High sun';
  if (altitude > 12) return morning ? 'Morning light' : 'Afternoon light';
  if (altitude > 0) return 'Golden hour';
  if (altitude > -6) return morning ? 'Dawn' : 'Dusk';
  if (altitude > -12) return 'Blue hour';
  return 'Night';
}

export function TimeDial() {
  const minutes = useAppStore((state) => state.minutes);
  const playing = useAppStore((state) => state.playing);
  const setMinutes = useAppStore((state) => state.setMinutes);
  const setPlaying = useAppStore((state) => state.setPlaying);
  const svg = useRef<SVGSVGElement>(null);
  const phaseRef = useRef<HTMLSpanElement>(null);
  const altitudeRef = useRef<HTMLSpanElement>(null);

  useAnimationFrame(() => {
    const { minutes: m } = useAppStore.getState();
    if (phaseRef.current) phaseRef.current.textContent = phase(telemetry.sunAltitude, m);
    if (altitudeRef.current) altitudeRef.current.textContent = `${telemetry.sunAltitude >= 0 ? '+' : '−'}${Math.abs(telemetry.sunAltitude).toFixed(0)}°`;
  }, 10);

  const theta = (minutes / 1440) * Math.PI * 2;
  const sunX = C - R * Math.sin(theta);
  const sunY = C + R * Math.cos(theta);
  const isDay = sunY < C;

  const fromPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = svg.current!.getBoundingClientRect();
    const dx = event.clientX - rect.left - (rect.width / 2);
    const dy = event.clientY - rect.top - (rect.height / 2);
    const angle = Math.atan2(-dx, dy);
    setMinutes((((angle / (Math.PI * 2)) * 1440) % 1440 + 1440) % 1440);
  };

  return (
    <section className="time-dial panel" aria-label="Time of day">
      <svg
        ref={svg}
        className="time-dial__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width={SIZE}
        height={SIZE}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setPlaying(false);
          fromPointer(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) fromPointer(event);
        }}
      >
        <defs>
          <radialGradient id="sun-glow">
            <stop offset="0%" stopColor="#ffd28a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f0a43a" stopOpacity="0" />
          </radialGradient>
          <clipPath id="below">
            <rect x="0" y={C} width={SIZE} height={C} />
          </clipPath>
        </defs>
        <circle cx={C} cy={C} r={R} className="time-dial__track" />
        <circle cx={C} cy={C} r={R} className="time-dial__night" clipPath="url(#below)" />
        {Array.from({ length: 24 }, (_, h) => {
          const a = (h / 24) * Math.PI * 2;
          const inner = h % 6 === 0 ? R - 7 : R - 3.5;
          return (
            <line
              key={h}
              x1={C - inner * Math.sin(a)}
              y1={C + inner * Math.cos(a)}
              x2={C - R * Math.sin(a)}
              y2={C + R * Math.cos(a)}
              className={h % 6 === 0 ? 'time-dial__tick time-dial__tick--major' : 'time-dial__tick'}
            />
          );
        })}
        <line x1={C - R - 8} y1={C} x2={C + R + 8} y2={C} className="time-dial__horizon" />
        <text x={C} y={C - R + 16} className="time-dial__mark">12</text>
        <text x={C - R + 13} y={C + 3} className="time-dial__mark">06</text>
        <text x={C + R - 13} y={C + 3} className="time-dial__mark">18</text>
        <line x1={C} y1={C} x2={sunX} y2={sunY} className="time-dial__hand" />
        {isDay && <circle cx={sunX} cy={sunY} r={15} fill="url(#sun-glow)" />}
        <circle cx={sunX} cy={sunY} r={isDay ? 5.5 : 4.5} className={isDay ? 'time-dial__sun' : 'time-dial__moon'} />
      </svg>
      <div className="time-dial__info">
        <p className="eyebrow">Local time · IST</p>
        <p className="time-dial__clock">{formatClock(minutes)}</p>
        <p className="time-dial__phase">
          <span ref={phaseRef} /> <span className="time-dial__alt">sun <span ref={altitudeRef} /></span>
        </p>
        <div className="time-dial__actions">
          <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={playing} title="Play day cycle (T)">
            {playing ? '❚❚ Pause' : '▶ Play day'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setMinutes(currentIstMinutes());
            }}
            title="Jump to the current time in Noida"
          >
            Now
          </button>
        </div>
        <input
          className="time-dial__range"
          type="range"
          min={0}
          max={1439}
          step={1}
          value={Math.round(minutes)}
          aria-label="Time of day"
          onChange={(event) => {
            setPlaying(false);
            setMinutes(Number(event.target.value));
          }}
        />
      </div>
    </section>
  );
}
