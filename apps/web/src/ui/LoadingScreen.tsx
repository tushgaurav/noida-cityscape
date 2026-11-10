import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';

export function LoadingScreen() {
  const loading = useAppStore((state) => state.loading);
  const city = useAppStore((state) => state.city);
  const [gone, setGone] = useState(false);
  const ready = loading.stage === 'ready';

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setGone(true), 1600);
    return () => clearTimeout(timer);
  }, [ready]);

  if (gone) return null;
  const stats = city?.meta.stats;
  return (
    <div className={`loading ${ready ? 'loading--done' : ''}`} role="status" aria-live="polite">
      <div className="loading__grain" />
      <div className="loading__contours" />
      <div className="loading__inner">
        <p className="eyebrow">Noida · Uttar Pradesh · 28.62° N 77.37° E</p>
        <h1 className="loading__title">
          Sector <em>62</em>
        </h1>
        <p className="loading__lede">A street-accurate model built from OpenStreetMap — every footprint, road and tree where it really stands.</p>
        {loading.stage === 'error' ? (
          <p className="loading__error">{loading.error}</p>
        ) : (
          <>
            <div className="loading__bar">
              <span style={{ transform: `scaleX(${Math.max(loading.progress, 0.02)})` }} />
            </div>
            <p className="loading__label">
              <span>{loading.label}</span>
              <span>{Math.round(loading.progress * 100)}%</span>
            </p>
          </>
        )}
        {stats && (
          <dl className="loading__stats">
            <div>
              <dt>Buildings</dt>
              <dd>{stats.buildings.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Road</dt>
              <dd>{stats.roadKm} km</dd>
            </div>
            <div>
              <dt>Trees</dt>
              <dd>{stats.trees.toLocaleString()}</dd>
            </div>
            <div>
              <dt>Places</dt>
              <dd>{stats.pois}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
