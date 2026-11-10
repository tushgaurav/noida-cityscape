import type { CityData } from '@noida/city-schema';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { nearestOnLine, railDeckHeight } from '../world/build/rail';
import { createGlowAwareMaterial } from '../world/materials/materials';
import { TRAIN_CAR_LENGTH, createTrainCarGeometry } from '../world/models';
import { type Polyline3, type Sample, createPolyline, samplePolyline } from '../world/polyline';

const CARS = 6;
const GAP = 0.9;
const TRAIN_LENGTH = CARS * (TRAIN_CAR_LENGTH + GAP);
const MAX_SPEED = 22;
const ACCEL = 0.9;
const DECEL = 1.1;
const DWELL = 24;

interface TrainPath {
  line: Polyline3;
  stops: number[];
  next: number;
}

interface TrainState {
  path: number;
  s: number;
  v: number;
  dwell: number;
}

function buildPaths(city: CityData): TrainPath[] {
  const elevated = city.rail.filter((line) => line.elevated && line.kind !== 'rail');
  const named = elevated.filter((line) => /blue line/i.test(line.name ?? ''));
  const lines = (named.length ? named : elevated).filter((line) => line.points.length >= 4);
  const stations = city.pois.filter((poi) => poi.kind === 'metro_station');

  const usable = lines.filter((rail) => {
    let length = 0;
    for (let i = 2; i < rail.points.length; i += 2) length += Math.hypot(rail.points[i] - rail.points[i - 2], rail.points[i + 1] - rail.points[i - 1]);
    return length > TRAIN_LENGTH * 2;
  });
  const paths = usable.map((rail) => {
    const line = createPolyline(rail.points, undefined, railDeckHeight(rail) + 0.26);
    const stops: number[] = [];
    for (const station of stations) {
      const hit = nearestOnLine(rail.points, station.e, station.n);
      if (hit.distance > 70) continue;
      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < line.cumulative.length - 1; i++) {
        const ax = line.points[i * 3];
        const az = line.points[i * 3 + 2];
        const bx = line.points[i * 3 + 3];
        const bz = line.points[i * 3 + 5];
        const segment = line.cumulative[i + 1] - line.cumulative[i] || 1;
        const t = Math.max(0, Math.min(1, ((hit.e - ax) * (bx - ax) + (-hit.n - az) * (bz - az)) / (segment * segment)));
        const d = Math.hypot(ax + (bx - ax) * t - hit.e, az + (bz - az) * t + hit.n);
        if (d < bestDistance) {
          bestDistance = d;
          best = line.cumulative[i] + segment * t;
        }
      }
      stops.push(Math.min(best + TRAIN_LENGTH / 2, line.length - 2));
    }
    stops.sort((a, b) => a - b);
    return { line, stops, next: -1, start: rail.points.slice(0, 2), end: rail.points.slice(-2) };
  });
  paths.forEach((path, i) => {
    path.next = paths.findIndex((other, j) => j !== i && Math.hypot(other.start[0] - path.end[0], other.start[1] - path.end[1]) < 25);
  });
  return paths;
}

export function Trains({ city }: { city: CityData }) {
  const paths = useMemo(() => buildPaths(city), [city]);
  const geometry = useMemo(createTrainCarGeometry, []);
  const material = useMemo(() => createGlowAwareMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.75 }), []);
  const trains = useMemo<TrainState[]>(
    () =>
      paths.flatMap((path, index) =>
        [0.25, 0.75].map((fraction) => ({ path: index, s: Math.max(TRAIN_LENGTH, path.line.length * fraction), v: 0, dwell: 0 })),
      ),
    [paths],
  );
  const mesh = useMemo(() => {
    const instanced = new InstancedMesh(geometry, material, Math.max(1, trains.length * CARS));
    instanced.count = trains.length * CARS;
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    instanced.frustumCulled = false;
    return instanced;
  }, [geometry, material, trains]);

  useEffect(() => () => mesh.dispose(), [mesh]);

  const scratch = useMemo(
    () => ({
      sample: { x: 0, y: 0, z: 0, dx: 1, dz: 0 } as Sample,
      matrix: new Matrix4(),
      q: new Quaternion(),
      p: new Vector3(),
      one: new Vector3(1, 1, 1),
      up: new Vector3(0, 1, 0),
    }),
    [],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    trains.forEach((train, t) => {
      let path = paths[train.path];
      if (train.dwell > 0) {
        train.dwell -= dt;
      } else {
        let distanceToStop = path.line.length - train.s + (path.next >= 0 ? 400 : 0);
        for (const stop of path.stops) {
          const d = stop - train.s;
          if (d > 0.5 && d < distanceToStop) distanceToStop = d;
        }
        const braking = (train.v * train.v) / (2 * DECEL);
        if (distanceToStop <= braking + 2) train.v = Math.max(0.8, train.v - DECEL * dt);
        else train.v = Math.min(MAX_SPEED, train.v + ACCEL * dt);
        train.s += train.v * dt;
        if (distanceToStop - train.v * dt < 1.2) {
          train.v = 0;
          train.dwell = DWELL;
          train.s += 1.3;
        }
        if (train.s >= path.line.length) {
          if (path.next >= 0) train.path = path.next;
          path = paths[train.path];
          train.s = TRAIN_LENGTH;
        }
      }
      for (let c = 0; c < CARS; c++) {
        const s = train.s - c * (TRAIN_CAR_LENGTH + GAP) - TRAIN_CAR_LENGTH / 2;
        const p = samplePolyline(path.line, s, scratch.sample);
        scratch.q.setFromAxisAngle(scratch.up, Math.atan2(-p.dz, p.dx));
        scratch.p.set(p.x, p.y, p.z);
        mesh.setMatrixAt(t * CARS + c, scratch.matrix.compose(scratch.p, scratch.q, scratch.one));
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!paths.length) return null;
  return <primitive object={mesh} />;
}
