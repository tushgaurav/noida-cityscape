import type { GeoPoint } from '@noida/city-schema';

export interface RegionConfig {
  id: string;
  name: string;
  subtitle: string;
  /** Projection origin and centre of the fetched area. */
  center: GeoPoint;
  halfWidth: number;
  halfHeight: number;
  /** Where the camera looks first. */
  focus: GeoPoint;
  seed: number;
}

export const regions: Record<string, RegionConfig> = {
  'sector-62': {
    id: 'sector-62',
    name: 'Sector 62',
    subtitle: 'Noida · Gautam Buddha Nagar · Uttar Pradesh',
    center: { lat: 28.6215, lon: 77.3655 },
    halfWidth: 2300,
    halfHeight: 2100,
    focus: { lat: 28.6218, lon: 77.3694 },
    seed: 62,
  },
};

export function getRegion(id: string): RegionConfig {
  const region = regions[id];
  if (!region) {
    throw new Error(`Unknown region "${id}". Available: ${Object.keys(regions).join(', ')}`);
  }
  return region;
}
