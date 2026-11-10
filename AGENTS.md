# noida-city

3D cityscape of Sector 62, Noida, generated from OpenStreetMap data. pnpm + Turborepo monorepo.

## Layout

- `packages/city-schema` — `CityData` types shared by pipeline and web, plus `createProjection` (lat/lon ⇄ local metres, +e east, +n north).
- `packages/osm-pipeline` — Node CLI. `fetch` pulls raw OSM via Overpass (mirror fallback, set `OVERPASS_URL` to override) into `packages/osm-pipeline/data/raw/` (gitignored). `build:data` turns it into `apps/web/public/data/<region>.city.json` (committed). Regions live in `src/regions.ts`.
- `apps/web` — Vite + React 19 + React Three Fiber.
  - `src/world/build/*` — pure geometry builders that run inside `world.worker.ts` and return typed arrays (`WorldBuffers`).
  - `src/world/materials/materials.ts` — `MeshStandardMaterial`s patched via `onBeforeCompile` (procedural facades, road markings, sidewalks, ground, foliage, night glow). Shared uniforms (`uNight`, `uTime`, `uSunDir`) are in `shaderLib.ts`.
  - `src/scene/*` — R3F components (atmosphere/sun, city meshes, traffic, metro trains, labels, selection).
  - `src/controls/*` — camera modes. `CameraDirector` owns transitions/tweens; `OrbitRig` (MapControls, mounted only in orbit mode because drei calls `update()` every frame even when disabled) and `FirstPersonRig` (walk + fly).
  - `src/ui/*` — HUD. Per-frame readouts use `state/telemetry.ts` (mutable object) instead of React state.
- three.js convention: x = east, z = −north, y = up.

## Commands

- `pnpm install`
- `pnpm dev` — web app on http://localhost:5173
- `pnpm build` — typecheck + production build
- `pnpm typecheck`
- `pnpm test` — vitest (schema + pipeline)
- `pnpm data` — refetch OSM and rebuild city JSON (`pnpm data:build` alone reuses the cached raw file)

## Notes

- Pin dependency versions; prefer releases older than 7 days.
- `N8AO` must not use `halfRes` (its multi-render-target class is incompatible with three r187).
- In dev, `window.__city` (zustand store), `window.__registry` and `window.__telemetry` are exposed for debugging.
- Repo dir is owned by `BUILTIN\Administrators`; git commands may need `-c safe.directory=C:/Workspace/noida-city`.
