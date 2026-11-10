import { AdditiveBlending, Color, DoubleSide, MeshStandardMaterial, ShaderMaterial } from 'three';
import { GLSL_HELPERS, patchShader, sharedUniforms } from './shaderLib';

const WORLD_VARYING_VERTEX: [string, string] = [
  '#include <worldpos_vertex>',
  `#include <worldpos_vertex>
  {
    vec4 wpos = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      wpos = instanceMatrix * wpos;
    #endif
    vWorldPos = (modelMatrix * wpos).xyz;
  }`,
];

export function createFacadeMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = sharedUniforms.uNight;
    patchShader(shader, {
      vertex: [
        ['#include <common>', '#include <common>\nattribute vec4 facade;\nvarying vec4 vFacade;\nvarying vec2 vWallUv;\nvarying vec3 vObjNormal;'],
        ['#include <uv_vertex>', '#include <uv_vertex>\nvFacade = facade;\nvWallUv = uv;\nvObjNormal = normal;'],
      ],
      fragment: [
        [
          '#include <common>',
          `#include <common>
uniform float uNight;
varying vec4 vFacade;
varying vec2 vWallUv;
varying vec3 vObjNormal;
${GLSL_HELPERS}`,
        ],
        [
          '#include <metalnessmap_fragment>',
          /* glsl */ `#include <metalnessmap_fragment>
vec3 facadeEmissive = vec3(0.0);
{
  vec3 base = diffuseColor.rgb;
  float style = floor(vFacade.x + 0.5);
  float seed = vFacade.y;
  float floorH = vFacade.z;
  float topH = vFacade.w;
  if (abs(vObjNormal.y) < 0.5) {
    vec2 uvm = vWallUv;
    float bay = style < 0.5 ? 1.5 : style < 1.5 ? 2.8 + seed * 0.8 : style < 3.5 ? 3.0 + seed * 0.9 : style < 4.5 ? 6.0 : 4.2;
    vec2 cell = vec2(uvm.x / bay, uvm.y / floorH);
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    vec2 fw = max(fwidth(cell), vec2(1e-4));
    float detail = 1.0 - smoothstep(0.22, 0.55, max(fw.x, fw.y));
    float parapet = step(topH - 1.0, uvm.y);
    float groundFloor = step(uvm.y, floorH) * step(0.0, uvm.y);
    float rnd = nHash(id + seed * 113.0);
    float winMask = 0.0;
    vec3 winColor = vec3(0.05);
    vec3 wallColor = base;
    float winRough = 0.15;
    float winMetal = 0.5;
    float wallRough = 0.9;
    float wallMetal = 0.0;
    float litChance = 0.4;
    float coverage = 0.3;
    float glow = 2.2;
    vec3 litColor = vec3(1.0, 0.8, 0.55);

    if (style < 0.5) {
      winMask = boxMask(f, vec2(0.035, 0.12), vec2(0.965, 0.95), fw);
      winColor = base * (0.65 + 0.45 * rnd);
      wallColor = vec3(0.42, 0.44, 0.46);
      wallRough = 0.35;
      wallMetal = 0.8;
      winRough = 0.04;
      winMetal = 0.92;
      litChance = 0.3;
      coverage = 0.8;
      glow = 1.1;
      litColor = vec3(0.95, 0.93, 0.85);
    } else if (style < 1.5) {
      winMask = boxMask(f, vec2(0.05, 0.3), vec2(0.95, 0.87), fw);
      winColor = vec3(0.045, 0.06, 0.075) + 0.04 * rnd;
      winRough = 0.08;
      winMetal = 0.8;
      litChance = 0.38;
      coverage = 0.48;
      glow = 1.6;
      litColor = vec3(0.95, 0.96, 0.92);
    } else if (style < 3.5) {
      float hasWindow = step(0.12, rnd);
      winMask = boxMask(f, vec2(0.3, 0.3), vec2(0.7, 0.76), fw) * hasWindow;
      winColor = mix(vec3(0.04, 0.045, 0.05), vec3(0.2, 0.15, 0.1), step(0.72, nHash(id + 7.0)));
      winRough = 0.2;
      winMetal = 0.35;
      float chajja = boxMask(f, vec2(0.2, 0.79), vec2(0.8, 0.85), fw) * hasWindow;
      wallColor = mix(wallColor, wallColor * 0.5, chajja * detail);
      if (style > 2.5) {
        vec2 bc = vec2(uvm.x / 0.24 + 0.5 * mod(floor(uvm.y / 0.08), 2.0), uvm.y / 0.08);
        vec2 bw = fwidth(bc);
        float mortar = 1.0 - boxMask(fract(bc), vec2(0.06, 0.12), vec2(0.94, 0.88), bw);
        float brickDetail = 1.0 - smoothstep(0.3, 0.7, max(bw.x, bw.y));
        wallColor = mix(wallColor, vec3(0.42, 0.38, 0.34), mortar * 0.55 * brickDetail) * (0.9 + 0.2 * nHash(floor(bc)));
      }
      litChance = 0.45;
      coverage = 0.2;
      litColor = vec3(1.0, 0.7, 0.4);
    } else if (style < 4.5) {
      float rib = 0.5 + 0.5 * sin(uvm.x * 6.2831 / 0.3);
      float ribDetail = 1.0 - smoothstep(0.02, 0.08, fwidth(uvm.x));
      wallColor *= mix(1.0, 0.88 + 0.12 * rib, ribDetail);
      winMask = boxMask(f, vec2(0.08, 0.62), vec2(0.92, 0.82), fw) * step(0.35, rnd);
      winColor = vec3(0.1, 0.12, 0.13);
      wallRough = 0.55;
      wallMetal = 0.4;
      litChance = 0.3;
      coverage = 0.1;
      litColor = vec3(0.95, 0.95, 0.88);
    } else {
      winMask = boxMask(f, vec2(0.08, 0.16), vec2(0.92, 0.96), fw);
      winColor = vec3(0.025);
      winRough = 0.95;
      winMetal = 0.0;
      litChance = 0.04;
      coverage = 0.6;
    }

    if (groundFloor > 0.5 && style < 2.5) {
      winMask = max(winMask, boxMask(f, vec2(0.04, 0.06), vec2(0.96, 0.8), fw) * step(0.3, nHash(id + 11.0)));
    }
    winMask *= (1.0 - parapet) * step(0.0, uvm.y);

    float streak = nHash(vec2(floor(uvm.x * 1.3), seed * 57.0));
    float drip = smoothstep(topH - 0.5, topH - 7.0, uvm.y);
    wallColor *= mix(1.0, 0.84 + 0.16 * streak, 0.35 + 0.65 * (1.0 - drip) * detail);
    wallColor *= mix(0.72, 1.0, smoothstep(-0.2, 1.4, uvm.y));
    wallColor *= 0.94 + 0.12 * nHash(vec2(seed * 31.0, 1.0));

    float m = mix(coverage * (1.0 - parapet), winMask, detail);
    diffuseColor.rgb = mix(wallColor, winColor, m);
    roughnessFactor = mix(wallRough, winRough, m);
    metalnessFactor = mix(wallMetal, winMetal, m);

    float lit = step(nHash(id * 1.37 + seed * 71.0), litChance);
    float warmth = nHash(id + 5.3);
    vec3 lampColor = mix(litColor, vec3(1.0, 0.62, 0.32), step(0.8, warmth));
    float lightAmount = mix(litChance * 0.7, lit * (0.6 + 0.4 * nHash(id + 3.1)), detail);
    facadeEmissive = lampColor * m * lightAmount * uNight * glow;
  } else {
    vec2 rp = vWallUv;
    float n1 = vNoise(rp / 3.0);
    float n2 = nHash(floor(rp / 0.6) + 17.0);
    float edgeStain = vNoise(rp / 9.0 + seed * 10.0);
    diffuseColor.rgb = base * (0.8 + 0.25 * n1) * (0.95 + 0.06 * n2) * (0.9 + 0.12 * edgeStain);
    roughnessFactor = style > 3.5 && style < 4.5 ? 0.55 : 0.95;
    metalnessFactor = style > 3.5 && style < 4.5 ? 0.35 : 0.0;
  }
}`,
        ],
        ['#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += facadeEmissive;'],
      ],
    });
  };
  return material;
}

export function createRoadMaterial(polygonOffset: number): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: polygonOffset,
    polygonOffsetUnits: polygonOffset * 4,
  });
  material.onBeforeCompile = (shader) => {
    patchShader(shader, {
      vertex: [
        [
          '#include <common>',
          '#include <common>\nattribute vec4 aRoad;\nattribute vec4 aSpan;\nvarying vec4 vRoad;\nvarying vec4 vSpan;\nvarying vec2 vRoadUv;\nvarying vec3 vWorldPos;',
        ],
        ['#include <uv_vertex>', '#include <uv_vertex>\nvRoad = aRoad;\nvSpan = aSpan;\nvRoadUv = uv;'],
        WORLD_VARYING_VERTEX,
      ],
      fragment: [
        ['#include <common>', `#include <common>\nvarying vec4 vRoad;\nvarying vec4 vSpan;\nvarying vec2 vRoadUv;\nvarying vec3 vWorldPos;\n${GLSL_HELPERS}`],
        [
          '#include <metalnessmap_fragment>',
          /* glsl */ `#include <metalnessmap_fragment>
{
  float kind = floor(vRoad.x + 0.5);
  float lanes = max(vRoad.y, 1.0);
  float oneway = vRoad.z;
  float width = vRoad.w;
  float hw = width * 0.5;
  float s = vRoadUv.x;
  float vm = vRoadUv.y * hw;
  float av = abs(vm);
  vec2 wp = vWorldPos.xz;
  vec3 col;
  if (kind < 2.5) col = srgb(vec3(0.3, 0.302, 0.31));
  else if (kind < 4.5) col = srgb(vec3(0.33, 0.33, 0.333));
  else if (kind < 7.5) col = srgb(vec3(0.38, 0.372, 0.36));
  else if (kind < 8.5) col = srgb(vec3(0.41, 0.4, 0.38));
  else if (kind < 9.5) col = srgb(vec3(0.6, 0.56, 0.5));
  else if (kind < 10.5) col = srgb(vec3(0.54, 0.47, 0.38));
  else if (kind < 11.5) col = srgb(vec3(0.62, 0.61, 0.58));
  else if (kind < 12.5) col = srgb(vec3(0.55, 0.36, 0.3));
  else if (kind < 13.5) col = srgb(vec3(0.56, 0.49, 0.4));
  else col = srgb(vec3(0.64, 0.62, 0.58));
  float patchNoise = vNoise(wp / 4.0);
  float grain = nHash(floor(wp / 0.35));
  col *= 0.82 + 0.3 * patchNoise;
  col *= 0.94 + 0.1 * grain;
  float tyreTracks = kind < 8.5 ? smoothstep(0.6, 1.0, vNoise(vec2(s / 30.0, vm * 1.6))) * 0.12 : 0.0;
  col *= 1.0 - tyreTracks;
  float dustAmount = kind > 4.5 && kind < 8.5 ? 0.6 : 0.3;
  col = mix(col, srgb(vec3(0.64, 0.59, 0.51)), smoothstep(hw - 1.1, hw, av) * dustAmount * (0.6 + 0.4 * patchNoise));

  float L = vSpan.x;
  float c0 = vSpan.y;
  float c1 = vSpan.z;
  float aa = max(fwidth(vm), 1e-4);
  float fade = 1.0 - smoothstep(0.06, 0.22, aa);
  float paint = 0.0;
  float median = 0.0;
  if (kind < 4.5 && L > 0.0) {
    float inSpan = step(c0, s) * step(s, L - c1);
    float dash = step(fract(s / 7.5), 0.4);
    paint = max(paint, lineMask(av, hw - 0.45, 0.075, aa));
    if (oneway > 0.5) {
      float laneW = width / lanes;
      for (int k = 1; k < 6; k++) {
        paint = max(paint, lineMask(vm, -hw + laneW * float(k), 0.07, aa) * dash * step(float(k) + 0.5, lanes));
      }
    } else if (lanes >= 3.5) {
      median = step(av, 0.75) * inSpan;
      float perSide = floor(lanes * 0.5);
      float laneW = (hw - 0.75) / perSide;
      for (int k = 1; k < 4; k++) {
        paint = max(paint, lineMask(av, 0.75 + laneW * float(k), 0.07, aa) * dash * step(float(k) + 0.5, perSide));
      }
    } else {
      paint = max(paint, lineMask(vm, 0.0, 0.07, aa) * dash);
    }
    paint *= inSpan;
    float zebra = step(0.5, c0) * step(c0, s) * step(s, c0 + 3.2) + step(0.5, c1) * step(L - c1 - 3.2, s) * step(s, L - c1);
    paint = max(paint, min(zebra, 1.0) * step(0.5, fract(vm / 1.1)) * step(av, hw - 0.6));
  }
  col = mix(col, srgb(vec3(0.86, 0.85, 0.8)), paint * fade * 0.85);
  if (median > 0.5) {
    float curbBand = step(0.5, av);
    float stripe = step(0.5, fract(s / 2.0));
    vec3 curb = mix(srgb(vec3(0.08, 0.08, 0.08)), srgb(vec3(0.85, 0.7, 0.12)), mix(0.5, stripe, fade));
    vec3 shrub = srgb(vec3(0.27, 0.36, 0.17)) * (0.7 + 0.5 * vNoise(wp * 1.7));
    col = mix(shrub, curb, curbBand);
  }
  diffuseColor.rgb = col;
  roughnessFactor = mix(0.9, 0.65, paint);
}`,
        ],
      ],
    });
  };
  return material;
}

export function createSidewalkMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    roughness: 0.9,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -16,
  });
  material.onBeforeCompile = (shader) => {
    patchShader(shader, {
      vertex: [
        ['#include <common>', '#include <common>\nattribute vec2 aWalk;\nvarying vec2 vWalk;\nvarying vec2 vWalkUv;\nvarying vec3 vWorldPos;'],
        ['#include <uv_vertex>', '#include <uv_vertex>\nvWalk = aWalk;\nvWalkUv = uv;'],
        WORLD_VARYING_VERTEX,
      ],
      fragment: [
        ['#include <common>', `#include <common>\nvarying vec2 vWalk;\nvarying vec2 vWalkUv;\nvarying vec3 vWorldPos;\n${GLSL_HELPERS}`],
        [
          '#include <metalnessmap_fragment>',
          /* glsl */ `#include <metalnessmap_fragment>
{
  float roadHalf = vWalk.x;
  float outer = vWalk.y;
  float d = abs(vWalkUv.y);
  vec2 wp = vWorldPos.xz;
  vec2 tile = wp / 0.3;
  vec2 tw = fwidth(tile);
  float detail = 1.0 - smoothstep(0.3, 0.75, max(tw.x, tw.y));
  float redTiles = step(0.62, nHash(floor(wp / 1.2)));
  vec3 paver = mix(srgb(vec3(0.68, 0.66, 0.62)), srgb(vec3(0.68, 0.47, 0.37)), redTiles);
  paver *= 0.88 + 0.22 * nHash(floor(tile));
  float joints = 1.0 - boxMask(fract(tile), vec2(0.07), vec2(0.93), tw);
  paver = mix(paver, paver * 0.7, joints * detail);
  float broken = smoothstep(0.62, 0.85, vNoise(wp / 5.0));
  paver = mix(paver, srgb(vec3(0.64, 0.58, 0.5)), broken * 0.5);
  vec3 col = mix(paver, srgb(vec3(0.64, 0.58, 0.5)), smoothstep(outer - 0.5, outer, d) * 0.5);
  float curb = step(roadHalf - 0.05, d) * step(d, roadHalf + 0.32);
  float stripe = step(0.5, fract((wp.x + wp.y) * 0.5));
  float stripeAA = 1.0 - smoothstep(0.15, 0.4, fwidth((wp.x + wp.y) * 0.5));
  vec3 curbColour = mix(srgb(vec3(0.07, 0.07, 0.07)), srgb(vec3(0.86, 0.7, 0.1)), mix(0.45, stripe, stripeAA));
  col = mix(col, curbColour, curb);
  diffuseColor.rgb = col;
  roughnessFactor = 0.88;
}`,
        ],
      ],
    });
  };
  return material;
}

export function createGroundMaterial(bounds: { minE: number; minN: number; maxE: number; maxN: number }): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBounds = { value: [bounds.minE, -bounds.maxN, bounds.maxE, -bounds.minN] };
    patchShader(shader, {
      vertex: [
        ['#include <common>', '#include <common>\nvarying vec3 vWorldPos;'],
        WORLD_VARYING_VERTEX,
      ],
      fragment: [
        ['#include <common>', `#include <common>\nuniform vec4 uBounds;\nvarying vec3 vWorldPos;\n${GLSL_HELPERS}`],
        [
          '#include <metalnessmap_fragment>',
          /* glsl */ `#include <metalnessmap_fragment>
{
  vec2 wp = vWorldPos.xz;
  float large = fbm(wp / 180.0);
  float medium = fbm(wp / 28.0 + 7.0);
  float fine = vNoise(wp / 0.6) * 0.5 + vNoise(wp / 2.3) * 0.5;
  vec3 soil = srgb(vec3(0.63, 0.56, 0.44));
  vec3 darkSoil = srgb(vec3(0.5, 0.43, 0.33));
  vec3 dryGrass = srgb(vec3(0.55, 0.54, 0.36));
  vec3 scrub = srgb(vec3(0.42, 0.45, 0.28));
  vec3 col = mix(soil, darkSoil, smoothstep(0.35, 0.7, medium));
  col = mix(col, dryGrass, smoothstep(0.45, 0.75, large) * 0.8);
  col = mix(col, scrub, smoothstep(0.6, 0.8, medium * large * 1.6) * 0.6);
  col *= 0.92 + 0.12 * fine;
  vec2 inside = step(uBounds.xy, wp) * step(wp, uBounds.zw);
  float outside = 1.0 - inside.x * inside.y;
  col = mix(col, col * 0.92 + srgb(vec3(0.05, 0.05, 0.03)), outside);
  diffuseColor.rgb = col;
  roughnessFactor = 1.0;
}`,
        ],
      ],
    });
  };
  return material;
}

export function createAreaMaterial(layer: number): MeshStandardMaterial {
  const offset = -1 - layer;
  const material = new MeshStandardMaterial({
    roughness: 0.95,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset * 4,
  });
  material.onBeforeCompile = (shader) => {
    patchShader(shader, {
      vertex: [
        ['#include <common>', '#include <common>\nattribute float aKind;\nvarying float vKind;\nvarying vec3 vWorldPos;'],
        ['#include <uv_vertex>', '#include <uv_vertex>\nvKind = aKind;'],
        WORLD_VARYING_VERTEX,
      ],
      fragment: [
        ['#include <common>', `#include <common>\nvarying float vKind;\nvarying vec3 vWorldPos;\n${GLSL_HELPERS}`],
        [
          '#include <metalnessmap_fragment>',
          /* glsl */ `#include <metalnessmap_fragment>
{
  float k = floor(vKind + 0.5);
  vec2 wp = vWorldPos.xz;
  float n1 = fbm(wp / 22.0);
  float n2 = vNoise(wp / 1.7) * 0.6 + vNoise(wp / 0.45) * 0.4;
  vec3 col;
  float rough = 0.95;
  float metal = 0.0;
  float dusty = fbm(wp / 35.0 + 3.0);
  if (k < 0.5) col = mix(vec3(0.64, 0.58, 0.48), vec3(0.56, 0.55, 0.42), smoothstep(0.45, 0.75, dusty));
  else if (k < 1.5) col = mix(vec3(0.66, 0.62, 0.54), vec3(0.6, 0.57, 0.5), dusty);
  else if (k < 2.5) col = mix(vec3(0.62, 0.57, 0.49), vec3(0.55, 0.5, 0.42), dusty);
  else if (k < 3.5) col = mix(vec3(0.67, 0.62, 0.54), vec3(0.6, 0.56, 0.48), dusty);
  else if (k < 4.5) col = vec3(0.5, 0.54, 0.38);
  else if (k < 5.5) col = vec3(0.58, 0.59, 0.5);
  else if (k < 6.5) col = vec3(0.62, 0.6, 0.56);
  else if (k < 7.5) col = vec3(0.68, 0.63, 0.54);
  else if (k < 8.5) col = vec3(0.56, 0.48, 0.38);
  else if (k < 9.5) col = vec3(0.6, 0.54, 0.42);
  else if (k < 10.5) col = vec3(0.54, 0.54, 0.33);
  else if (k < 11.5) col = vec3(0.46, 0.51, 0.32);
  else if (k < 12.5) col = mix(vec3(0.38, 0.5, 0.24), vec3(0.5, 0.52, 0.3), n1);
  else if (k < 13.5) col = mix(vec3(0.36, 0.5, 0.22), vec3(0.46, 0.54, 0.28), n1);
  else if (k < 14.5) col = mix(vec3(0.5, 0.53, 0.3), vec3(0.6, 0.57, 0.38), n1);
  else if (k < 15.5) col = mix(vec3(0.27, 0.37, 0.18), vec3(0.34, 0.4, 0.22), n1);
  else if (k < 16.5) col = mix(vec3(0.45, 0.47, 0.29), vec3(0.55, 0.5, 0.36), n1);
  else if (k < 17.5) col = vec3(0.76, 0.68, 0.53);
  else if (k < 18.5) col = vec3(0.65, 0.6, 0.52);
  else if (k < 19.5) col = vec3(0.36, 0.45, 0.34);
  else if (k < 20.5) { col = vec3(0.37, 0.365, 0.355); rough = 0.85; }
  else if (k < 21.5) col = mix(vec3(0.34, 0.52, 0.26), vec3(0.4, 0.58, 0.3), step(0.5, fract(wp.x / 6.0)));
  else if (k < 22.5) col = vec3(0.7, 0.6, 0.45);
  else if (k < 23.5) col = vec3(0.7, 0.66, 0.59);
  else if (k < 24.5) { col = mix(vec3(0.24, 0.33, 0.31), vec3(0.3, 0.37, 0.32), n1); rough = 0.08; }
  else { col = vec3(0.28, 0.66, 0.74); rough = 0.05; }
  col = srgb(col);
  if (k < 24.5) col *= 0.9 + 0.16 * n2 * (k > 11.5 && k < 19.5 ? 1.0 : 0.6);
  diffuseColor.rgb = col;
  roughnessFactor = rough;
  metalnessFactor = metal;
}`,
        ],
      ],
    });
  };
  return material;
}

export function createFoliageMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    patchShader(shader, {
      vertex: [
        ['#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPart;\nattribute float aTint;'],
        [
          '#include <color_vertex>',
          `#include <color_vertex>
{
  vec3 leafA = vec3(0.06, 0.11, 0.03);
  vec3 leafB = vec3(0.1, 0.145, 0.045);
  vec3 leafC = vec3(0.16, 0.165, 0.075);
  vec3 tint = aTint < 0.5 ? mix(leafA, leafB, aTint * 2.0) : mix(leafB, leafC, aTint * 2.0 - 1.0);
  vColor.rgb = mix(color.rgb, color.r * tint * 1.6, aPart);
}`,
        ],
        [
          '#include <begin_vertex>',
          `#include <begin_vertex>
{
  vec2 rootPos = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  float phase = uTime * 1.1 + rootPos.x * 0.07 + rootPos.y * 0.05;
  float sway = (sin(phase) + 0.5 * sin(phase * 2.3 + 1.7)) * 0.035 * aPart * max(position.y - 1.5, 0.0);
  transformed.x += sway;
  transformed.z += sway * 0.6;
}`,
        ],
      ],
    });
  };
  return material;
}

export function createGlowAwareMaterial(params: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial {
  const material = new MeshStandardMaterial(params);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = sharedUniforms.uNight;
    patchShader(shader, {
      vertex: [
        ['#include <common>', '#include <common>\nattribute float aLight;\nvarying float vLight;'],
        ['#include <uv_vertex>', '#include <uv_vertex>\nvLight = aLight;'],
      ],
      fragment: [
        ['#include <common>', '#include <common>\nuniform float uNight;\nvarying float vLight;'],
        [
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
{
  float l = floor(vLight + 0.5);
  if (l > 0.5 && l < 1.5) totalEmissiveRadiance += vec3(1.0, 0.92, 0.75) * 6.0 * uNight;
  else if (l > 1.5 && l < 2.5) totalEmissiveRadiance += vec3(1.0, 0.06, 0.03) * (0.6 + 3.0 * uNight);
  else if (l > 2.5 && l < 3.5) totalEmissiveRadiance += vec3(0.85, 0.95, 1.0) * 1.8 * uNight;
  else if (l > 3.5) totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * 9.0 * uNight;
}`,
        ],
      ],
    });
  };
  return material;
}

export function createLightPoolMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uNight: sharedUniforms.uNight, uColor: { value: new Color(1.0, 0.68, 0.38) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float falloff = pow(clamp(1.0 - d, 0.0, 1.0), 2.2);
        gl_FragColor = vec4(uColor * falloff * uNight * 0.3, 1.0);
      }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -10,
    polygonOffsetUnits: -40,
  });
}
