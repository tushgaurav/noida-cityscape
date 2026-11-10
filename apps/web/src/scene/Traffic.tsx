import type { CityData, RoadKind } from '@noida/city-schema';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { mulberry32, pick } from '../lib/random';
import { type Quality, useAppStore } from '../state/store';
import { createGlowAwareMaterial } from '../world/materials/materials';
import { VEHICLE_LENGTH, type VehicleKind, createVehicleGeometry } from '../world/models';
import { type Polyline3, type Sample, createPolyline, samplePolyline } from '../world/polyline';

const SPEED: Partial<Record<RoadKind, number>> = {
  motorway: 22,
  trunk: 17,
  primary: 14,
  secondary: 12,
  tertiary: 10,
  unclassified: 8,
  residential: 6.5,
  living_street: 4,
  service: 4,
};

const DENSITY: Partial<Record<RoadKind, number>> = {
  motorway: 9,
  trunk: 8,
  primary: 6,
  secondary: 6,
  tertiary: 3,
  unclassified: 1,
  residential: 0.35,
  living_street: 0.15,
  service: 0.08,
};

const TURN_WEIGHT: Partial<Record<RoadKind, number>> = {
  motorway: 2,
  trunk: 2,
  primary: 1.8,
  secondary: 1.6,
  tertiary: 1.3,
  unclassified: 0.8,
  residential: 0.55,
  living_street: 0.3,
  service: 0.12,
};

const CAR_COLOURS = ['#f2f2ef', '#f2f2ef', '#f2f2ef', '#f4f4f0', '#c7c9cb', '#b9bcbe', '#7b7f83', '#5a5e62', '#1d1f22', '#9b1c1c', '#1f3f7a', '#6d5640', '#e8e2d2'];
const BUS_COLOURS = ['#e9e5dc', '#c75426', '#2c58a4', '#3d7b47'];
const RIDER_COLOURS = ['#3a5f9a', '#c9c3b5', '#8a2b2b', '#2f2f33', '#d1b78a', '#4c6b3c', '#e0e0e0'];

const COUNTS: Record<Quality, number> = { high: 2400, balanced: 1400, low: 550 };

interface Segment {
  line: Polyline3;
  kind: RoadKind;
  from: number;
  to: number;
  oneway: boolean;
  lanes: number;
  width: number;
}

interface Vehicle {
  type: VehicleKind;
  index: number;
  seg: number;
  forward: boolean;
  s: number;
  speed: number;
  desire: number;
  lane: number;
}

interface Exit {
  seg: number;
  forward: boolean;
}

function buildNetwork(city: CityData) {
  const segments: Segment[] = [];
  const exits = new Map<number, Exit[]>();
  for (const road of city.roads) {
    if (road.tunnel || !(road.kind in SPEED) || road.points.length < 4) continue;
    const seg = segments.length;
    const line = createPolyline(road.points, road.elevation, 0.09);
    if (line.length < 2) continue;
    segments.push({ line, kind: road.kind, from: road.from, to: road.to, oneway: road.oneway, lanes: road.lanes, width: road.width });
    const add = (node: number, exit: Exit) => {
      const list = exits.get(node);
      if (list) list.push(exit);
      else exits.set(node, [exit]);
    };
    add(road.from, { seg, forward: true });
    if (!road.oneway) add(road.to, { seg, forward: false });
  }
  return { segments, exits };
}

const vehicleMix = (kind: RoadKind, roll: number): VehicleKind => {
  if (kind === 'motorway' || kind === 'trunk') return roll < 0.68 ? 'car' : roll < 0.9 ? 'bike' : 'bus';
  if (kind === 'primary' || kind === 'secondary' || kind === 'tertiary') return roll < 0.52 ? 'car' : roll < 0.76 ? 'bike' : roll < 0.93 ? 'auto' : 'bus';
  return roll < 0.5 ? 'car' : roll < 0.8 ? 'bike' : 'auto';
};

export function Traffic({ city }: { city: CityData }) {
  const quality = useAppStore((state) => state.quality);
  const network = useMemo(() => buildNetwork(city), [city]);
  const material = useMemo(() => createGlowAwareMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.45 }), []);

  const sim = useMemo(() => {
    const rand = mulberry32(2024);
    const { segments } = network;
    const weights = segments.map((segment) => segment.line.length * (DENSITY[segment.kind] ?? 0));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const cumulative: number[] = [];
    weights.reduce((sum, w) => {
      cumulative.push(sum + w);
      return sum + w;
    }, 0);

    const vehicles: Vehicle[] = [];
    const counts: Record<VehicleKind, number> = { car: 0, auto: 0, bus: 0, bike: 0 };
    const total = COUNTS[quality];
    for (let i = 0; i < total; i++) {
      const target = rand() * totalWeight;
      let lo = 0;
      let hi = cumulative.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumulative[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      const segment = segments[lo];
      const type = vehicleMix(segment.kind, rand());
      const desire = (SPEED[segment.kind] ?? 8) * (type === 'bus' ? 0.8 : type === 'auto' ? 0.75 : 0.9 + rand() * 0.25);
      vehicles.push({
        type,
        index: counts[type]++,
        seg: lo,
        forward: segment.oneway || rand() < 0.5,
        s: rand() * segment.line.length,
        speed: desire,
        desire,
        lane: Math.floor(rand() * 4),
      });
    }

    const meshes = {} as Record<VehicleKind, InstancedMesh>;
    for (const type of Object.keys(counts) as VehicleKind[]) {
      const mesh = new InstancedMesh(createVehicleGeometry(type), material, Math.max(1, counts[type]));
      mesh.count = counts[type];
      mesh.castShadow = quality === 'high';
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const colour = new Color();
      for (let i = 0; i < counts[type]; i++) {
        const palette = type === 'car' ? CAR_COLOURS : type === 'bus' ? BUS_COLOURS : type === 'bike' ? RIDER_COLOURS : ['#ffffff'];
        mesh.setColorAt(i, colour.set(pick(palette, rand)));
      }
      meshes[type] = mesh;
    }
    return { vehicles, meshes, rand };
  }, [network, material, quality]);

  useEffect(
    () => () => {
      for (const mesh of Object.values(sim.meshes)) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
    },
    [sim],
  );

  const scratch = useMemo(
    () => ({
      sample: { x: 0, y: 0, z: 0, dx: 1, dz: 0 } as Sample,
      matrix: new Matrix4(),
      quaternion: new Quaternion(),
      position: new Vector3(),
      scale: new Vector3(1, 1, 1),
      up: new Vector3(0, 1, 0),
      groups: new Map<string, Vehicle[]>(),
    }),
    [],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const { segments, exits } = network;
    const { vehicles, meshes, rand } = sim;
    const groups = scratch.groups;
    groups.clear();
    for (const v of vehicles) {
      const segment = segments[v.seg];
      const perDirection = segment.oneway ? segment.lanes : Math.max(1, Math.floor(segment.lanes / 2));
      const key = `${v.seg}:${v.forward ? 1 : 0}:${v.lane % perDirection}`;
      const group = groups.get(key);
      if (group) group.push(v);
      else groups.set(key, [v]);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => b.s - a.s);
      for (let i = 0; i < group.length; i++) {
        const v = group[i];
        let target = v.desire;
        if (i > 0) {
          const leader = group[i - 1];
          const gap = leader.s - v.s - (VEHICLE_LENGTH[leader.type] + VEHICLE_LENGTH[v.type]) / 2;
          if (gap < 3) target = 0;
          else if (gap < 14) target = Math.min(target, leader.speed * (gap / 14));
        }
        const accel = target > v.speed ? 2.2 : 6;
        v.speed += Math.sign(target - v.speed) * Math.min(Math.abs(target - v.speed), accel * dt);
      }
    }

    for (const v of vehicles) {
      v.s += v.speed * dt;
      let segment = segments[v.seg];
      let guard = 0;
      while (v.s > segment.line.length && guard++ < 4) {
        v.s -= segment.line.length;
        const node = v.forward ? segment.to : segment.from;
        const options = (exits.get(node) ?? []).filter((exit) => !(exit.seg === v.seg && exit.forward !== v.forward));
        const end = samplePolyline(segment.line, v.forward ? segment.line.length : 0, scratch.sample);
        const hx = v.forward ? end.dx : -end.dx;
        const hz = v.forward ? end.dz : -end.dz;
        let chosen: Exit | undefined;
        if (options.length) {
          let total = 0;
          const scores = options.map((exit) => {
            const next = segments[exit.seg];
            const start = samplePolyline(next.line, exit.forward ? 0 : next.line.length, scratch.sample);
            const nx = exit.forward ? start.dx : -start.dx;
            const nz = exit.forward ? start.dz : -start.dz;
            const straightness = Math.pow((hx * nx + hz * nz + 1.3) / 2.3, 3);
            const score = straightness * (TURN_WEIGHT[next.kind] ?? 0.2);
            total += score;
            return score;
          });
          let roll = rand() * total;
          chosen = options[options.length - 1];
          for (let k = 0; k < options.length; k++) {
            roll -= scores[k];
            if (roll <= 0) {
              chosen = options[k];
              break;
            }
          }
        } else if (!segment.oneway) {
          chosen = { seg: v.seg, forward: !v.forward };
        }
        if (!chosen) {
          const respawn = Math.floor(rand() * segments.length);
          chosen = { seg: respawn, forward: true };
          v.s = rand() * segments[respawn].line.length;
        }
        v.seg = chosen.seg;
        v.forward = chosen.forward;
        segment = segments[v.seg];
        v.desire = (SPEED[segment.kind] ?? 8) * (v.type === 'bus' ? 0.8 : v.type === 'auto' ? 0.75 : 0.9 + rand() * 0.25);
      }

      const s = v.forward ? v.s : segment.line.length - v.s;
      const p = samplePolyline(segment.line, s, scratch.sample);
      const dx = v.forward ? p.dx : -p.dx;
      const dz = v.forward ? p.dz : -p.dz;
      const laneWidth = segment.width / Math.max(segment.lanes, 1);
      let offset: number;
      if (segment.oneway) {
        const lane = v.lane % segment.lanes;
        offset = segment.width / 2 - laneWidth * (lane + 0.5);
      } else {
        const perDirection = Math.max(1, Math.floor(segment.lanes / 2));
        const median = segment.lanes >= 4 ? 0.75 : 0;
        offset = median + laneWidth * ((v.lane % perDirection) + 0.5);
      }
      if (v.type === 'bike') offset += laneWidth * 0.25;
      scratch.position.set(p.x + dz * offset, p.y, p.z - dx * offset);
      scratch.quaternion.setFromAxisAngle(scratch.up, Math.atan2(-dz, dx));
      meshes[v.type].setMatrixAt(v.index, scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale));
    }
    for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {Object.values(sim.meshes).map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </group>
  );
}
