import { Vector3 } from 'three';

export const pressed = new Set<string>();

let attached = false;
export function attachKeyboard() {
  if (attached) return;
  attached = true;
  const isTyping = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    return !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  };
  window.addEventListener('keydown', (event) => {
    if (!isTyping(event)) pressed.add(event.code);
  });
  window.addEventListener('keyup', (event) => pressed.delete(event.code));
  window.addEventListener('blur', () => pressed.clear());
}

export const axis = (positive: string[], negative: string[]) =>
  (positive.some((code) => pressed.has(code)) ? 1 : 0) - (negative.some((code) => pressed.has(code)) ? 1 : 0);

export const isDown = (...codes: string[]) => codes.some((code) => pressed.has(code));

export const cameraState = {
  transitioning: false,
  orbitTarget: new Vector3(),
  flySpeedMultiplier: 1,
};
