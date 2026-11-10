const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const toDays = (date: Date) => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;

export interface SolarPosition {
  /** Radians above the horizon. */
  altitude: number;
  /** Compass bearing in radians, clockwise from north. */
  bearing: number;
}

export function solarPosition(date: Date, lat: number, lon: number): SolarPosition {
  const d = toDays(date);
  const meanAnomaly = RAD * (357.5291 + 0.98560028 * d);
  const center = RAD * (1.9148 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly) + 0.0003 * Math.sin(3 * meanAnomaly));
  const eclipticLongitude = meanAnomaly + center + RAD * 102.9372 + Math.PI;
  const declination = Math.asin(Math.sin(OBLIQUITY) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(Math.sin(eclipticLongitude) * Math.cos(OBLIQUITY), Math.cos(eclipticLongitude));
  const phi = RAD * lat;
  const hourAngle = RAD * (280.16 + 360.9856235 * d) + RAD * lon - rightAscension;
  const altitude = Math.asin(
    Math.sin(phi) * Math.sin(declination) + Math.cos(phi) * Math.cos(declination) * Math.cos(hourAngle),
  );
  const azimuthFromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(phi) - Math.tan(declination) * Math.cos(phi),
  );
  return { altitude, bearing: azimuthFromSouth + Math.PI };
}

export const IST_OFFSET_MINUTES = 330;

/** Builds the UTC instant for a wall-clock time (minutes since midnight, IST) on today's IST date. */
export function istDate(minutes: number, reference = new Date()): Date {
  const ist = new Date(reference.valueOf() + IST_OFFSET_MINUTES * 60_000);
  const midnightUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return new Date(midnightUtc + (minutes - IST_OFFSET_MINUTES) * 60_000);
}

export function currentIstMinutes(now = new Date()): number {
  const ist = new Date(now.valueOf() + IST_OFFSET_MINUTES * 60_000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes() + ist.getUTCSeconds() / 60;
}

export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
