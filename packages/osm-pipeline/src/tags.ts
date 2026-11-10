export function parseLength(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const text = value.trim().toLowerCase().replace(',', '.');
  const feet = text.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in))?$/);
  if (feet) return Number(feet[1]) * 0.3048 + (feet[2] ? Number(feet[2]) * 0.0254 : 0);
  const metres = text.match(/^(-?\d+(?:\.\d+)?)\s*(?:m|meters?|metres?)?$/);
  if (metres) return Number(metres[1]);
  return undefined;
}

export function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const isYes = (value: string | undefined) => value === 'yes' || value === 'true' || value === '1';

export function parseLayer(value: string | undefined): number {
  const parsed = parseNumber(value);
  return parsed === undefined ? 0 : Math.round(parsed);
}

export function normaliseColour(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const text = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(text)) return text;
  if (/^[a-z]+$/.test(text)) return text;
  return undefined;
}
