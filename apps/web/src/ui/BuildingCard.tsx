import type { Building, CityData } from '@noida/city-schema';
import { useMemo } from 'react';
import { ringCentroid, signedArea } from '../lib/geo2d';
import { useAppStore } from '../state/store';

const KIND_LABEL: Record<Building['kind'], string> = {
  residential: 'Residential',
  apartments: 'Apartments',
  house: 'House',
  commercial: 'Commercial',
  office: 'Office',
  retail: 'Retail',
  industrial: 'Industrial',
  warehouse: 'Warehouse',
  education: 'Education',
  hospital: 'Healthcare',
  religious: 'Place of worship',
  civic: 'Civic',
  transport: 'Transport',
  hotel: 'Hotel',
  construction: 'Under construction',
  shelter: 'Shed / outbuilding',
  roof: 'Canopy',
  utility: 'Utility',
  generic: 'Building',
};

const SOURCE_LABEL: Record<Building['heightSource'], { tag: string; note: string }> = {
  tagged: { tag: 'OSM height', note: 'Height comes straight from the OpenStreetMap height tag.' },
  levels: { tag: 'From floors', note: 'Height derived from the number of floors mapped in OpenStreetMap.' },
  estimated: {
    tag: 'Estimated',
    note: 'OpenStreetMap has no height for this building, so floors are inferred from its footprint and surrounding land use.',
  },
};

function poisFor(city: CityData, building: Building) {
  return city.pois.filter((poi) => poi.buildingId === building.id).slice(0, 4);
}

export function BuildingCard() {
  const city = useAppStore((state) => state.city);
  const selected = useAppStore((state) => state.selected);
  const select = useAppStore((state) => state.select);
  const requestFocus = useAppStore((state) => state.requestFocus);
  const setMode = useAppStore((state) => state.setMode);

  const details = useMemo(() => {
    if (!city || selected == null) return null;
    const building = city.buildings[selected];
    const outer = building.polygon[0];
    const area = Math.abs(signedArea(outer)) - building.polygon.slice(1).reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0);
    const [e, n] = ringCentroid(outer);
    const osmType = building.id.startsWith('r') ? 'relation' : 'way';
    const osmId = building.id.slice(1).split('-')[0];
    return { building, area, e, n, osmUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`, pois: poisFor(city, building) };
  }, [city, selected]);

  if (!details) return null;
  const { building, area, e, n, osmUrl, pois } = details;
  const source = SOURCE_LABEL[building.heightSource];
  return (
    <aside className="building-card panel" aria-label="Selected building">
      <button type="button" className="building-card__close" onClick={() => select(null)} aria-label="Close">
        ×
      </button>
      <p className="eyebrow">{KIND_LABEL[building.kind]}</p>
      <h2 className="building-card__name">{building.name ?? 'Unnamed building'}</h2>
      {building.address && <p className="building-card__address">{building.address}</p>}
      <dl className="facts">
        <div>
          <dt>Height</dt>
          <dd>
            {building.height.toFixed(1)} m <span className={`badge badge--${building.heightSource}`}>{source.tag}</span>
          </dd>
        </div>
        <div>
          <dt>Floors</dt>
          <dd>{building.levels}</dd>
        </div>
        <div>
          <dt>Footprint</dt>
          <dd>{Math.round(area).toLocaleString()} m²</dd>
        </div>
        <div>
          <dt>Facade</dt>
          <dd className="facts__cap">{building.facade}</dd>
        </div>
        <div>
          <dt>OSM tag</dt>
          <dd>building={building.osmType}</dd>
        </div>
      </dl>
      {pois.length > 0 && (
        <ul className="building-card__pois">
          {pois.map((poi) => (
            <li key={poi.id}>{poi.name}</li>
          ))}
        </ul>
      )}
      <p className="building-card__note">{source.note}</p>
      <div className="building-card__actions">
        <button type="button" onClick={() => requestFocus(e, n, Math.max(180, building.height * 6))}>
          Fly to
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('walk');
            setTimeout(() => requestFocus(e, n), 2300);
          }}
        >
          Walk here
        </button>
        <a href={osmUrl} target="_blank" rel="noreferrer">
          OSM ↗
        </a>
      </div>
    </aside>
  );
}
