import { Vector3 } from 'three';

export const sharedUniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uSunDir: { value: new Vector3(0, 1, 0) },
};

export const GLSL_HELPERS = /* glsl */ `
float nHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(nHash(i), nHash(i + vec2(1.0, 0.0)), u.x), mix(nHash(i + vec2(0.0, 1.0)), nHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * vNoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}
float boxMask(vec2 f, vec2 lo, vec2 hi, vec2 w) {
  vec2 a = smoothstep(lo - w, lo + w, f);
  vec2 b = smoothstep(hi + w, hi - w, f);
  return a.x * a.y * b.x * b.y;
}
float lineMask(float x, float centre, float halfWidth, float aa) {
  return 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(x - centre));
}
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
`;

export function patchShader(
  shader: { vertexShader: string; fragmentShader: string },
  patches: { vertex?: [string, string][]; fragment?: [string, string][] },
) {
  for (const [token, replacement] of patches.vertex ?? []) {
    if (!shader.vertexShader.includes(token)) throw new Error(`Vertex token not found: ${token}`);
    shader.vertexShader = shader.vertexShader.replace(token, replacement);
  }
  for (const [token, replacement] of patches.fragment ?? []) {
    if (!shader.fragmentShader.includes(token)) throw new Error(`Fragment token not found: ${token}`);
    shader.fragmentShader = shader.fragmentShader.replace(token, replacement);
  }
}
