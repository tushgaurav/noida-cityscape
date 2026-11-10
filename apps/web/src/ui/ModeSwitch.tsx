import { type CameraMode, type LayerKey, type Quality, useAppStore } from '../state/store';

const MODES: { id: CameraMode; label: string; key: string; hint: string }[] = [
  { id: 'orbit', label: 'Orbit', key: '1', hint: 'Map view' },
  { id: 'walk', label: 'Walk', key: '2', hint: 'Street level' },
  { id: 'fly', label: 'Fly', key: '3', hint: 'Drone' },
];

const LAYERS: { id: LayerKey; label: string }[] = [
  { id: 'labels', label: 'Place names' },
  { id: 'traffic', label: 'Traffic' },
  { id: 'metro', label: 'Blue Line metro' },
  { id: 'trees', label: 'Trees' },
  { id: 'lights', label: 'Street lights' },
];

const QUALITIES: Quality[] = ['high', 'balanced', 'low'];

export function ModeSwitch() {
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const layers = useAppStore((state) => state.layers);
  const toggleLayer = useAppStore((state) => state.toggleLayer);
  const quality = useAppStore((state) => state.quality);
  const setQuality = useAppStore((state) => state.setQuality);

  return (
    <div className="control-stack">
      <nav className="mode-switch panel" aria-label="Camera mode">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mode-switch__item ${mode === item.id ? 'is-active' : ''}`}
            onClick={() => setMode(item.id)}
            aria-pressed={mode === item.id}
          >
            <kbd>{item.key}</kbd>
            <span className="mode-switch__label">{item.label}</span>
            <span className="mode-switch__hint">{item.hint}</span>
          </button>
        ))}
      </nav>
      <details className="layers panel">
        <summary>
          <span>Layers &amp; quality</span>
          <span className="layers__chevron" aria-hidden>
            ⌄
          </span>
        </summary>
        <ul>
          {LAYERS.map((layer) => (
            <li key={layer.id}>
              <label className="toggle">
                <input type="checkbox" checked={layers[layer.id]} onChange={() => toggleLayer(layer.id)} />
                <span className="toggle__track" aria-hidden />
                <span>{layer.label}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="segmented" role="radiogroup" aria-label="Render quality">
          {QUALITIES.map((q) => (
            <button key={q} type="button" role="radio" aria-checked={quality === q} className={quality === q ? 'is-active' : ''} onClick={() => setQuality(q)}>
              {q}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
