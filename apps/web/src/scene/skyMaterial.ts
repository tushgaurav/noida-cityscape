import { BackSide, Color, ShaderMaterial, Vector3 } from 'three';
import { sharedUniforms } from '../world/materials/shaderLib';

export function createSkyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new Color() },
      uHorizon: { value: new Color() },
      uSunColor: { value: new Color() },
      uSunDir: sharedUniforms.uSunDir,
      uMoonDir: { value: new Vector3(0.3, 0.7, 0.6).normalize() },
      uSunVisible: { value: 1 },
      uNight: sharedUniforms.uNight,
      uTime: sharedUniforms.uTime,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      uniform float uSunVisible;
      uniform float uNight;
      uniform float uTime;
      varying vec3 vDir;

      float hash3(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
        col = mix(col, uHorizon, smoothstep(0.03, -0.06, h));
        float haze = exp(-max(h, 0.0) * 9.0);
        col = mix(col, uHorizon * 1.04, haze * 0.35);

        vec3 sunDir = normalize(uSunDir);
        float sunDot = max(dot(d, sunDir), 0.0);
        float aboveHorizon = smoothstep(-0.04, 0.02, sunDir.y);
        col += uSunColor * (pow(sunDot, 5.0) * 0.22 + pow(sunDot, 48.0) * 0.5) * uSunVisible * aboveHorizon;
        col += uSunColor * smoothstep(0.99955, 0.99975, sunDot) * 18.0 * uSunVisible * aboveHorizon * smoothstep(-0.01, 0.03, h);

        if (uNight > 0.01) {
          vec3 moonDir = normalize(uMoonDir);
          float moonDot = max(dot(d, moonDir), 0.0);
          col += vec3(0.85, 0.88, 0.95) * smoothstep(0.99965, 0.9998, moonDot) * 2.5 * uNight;
          col += vec3(0.25, 0.3, 0.42) * pow(moonDot, 30.0) * 0.08 * uNight;
          vec3 cell = floor(d * 220.0);
          float r = hash3(cell);
          float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + r * 4.0) + r * 40.0);
          float star = step(0.9965, r) * smoothstep(0.42, 0.0, length(fract(d * 220.0) - 0.5));
          col += vec3(0.9, 0.92, 1.0) * star * twinkle * uNight * smoothstep(0.06, 0.45, h) * 0.9;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
