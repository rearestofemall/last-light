import * as THREE from 'three';
import { along, cone, ellipsoid, type MeshKit, rigid, type SkinFn, tube } from '../character/MeshKit';
import type { RegionId } from '../world/WorldDef';
import { QI, type QBone, Quadruped, type QuadSpec } from './Quadruped';

/*
 * Wolves, deer and rabbits, sculpted per individual: every animal gets its own size, coat
 * colours and markings (and antlers, spots or ear tips), with variants chosen by region.
 */

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DOWN = V(0, -1, 0);
const FWD = V(0, 0, 1);

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
/** Brightness/hue jitter so no two coats match exactly. */
function vary(hex: number, amount = 0.08): number {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL((hsl.h + rand(-0.015, 0.015) + 1) % 1, Math.min(1, Math.max(0, hsl.s * rand(0.85, 1.15))), Math.min(1, Math.max(0, hsl.l * rand(1 - amount, 1 + amount))));
  return c.getHex();
}
function mix(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}
function hash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 412.1 + y * 731.7 + z * 197.3) * 43758.5453;
  return s - Math.floor(s);
}

/** Torso lofted along z: rings are [z, half-width, half-height, centre height]. */
function torso(rings: [number, number, number, number][], seg = 10): THREE.BufferGeometry {
  const pos: number[] = [];
  const pts = rings.map(([z, rx, ry, yc]) => {
    const r: THREE.Vector3[] = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2 + Math.PI / seg;
      r.push(V(Math.cos(a) * rx, yc + Math.sin(a) * ry, z));
    }
    return r;
  });
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let k = 0; k + 1 < pts.length; k++) {
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      tri(pts[k][i], pts[k][j], pts[k + 1][j]);
      tri(pts[k][i], pts[k + 1][j], pts[k + 1][i]);
    }
  }
  const cap = (ring: THREE.Vector3[], front: boolean) => {
    const c = ring.reduce((m, v) => m.add(v), V(0, 0, 0)).multiplyScalar(1 / ring.length);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      if (front) tri(c, ring[i], ring[j]);
      else tri(c, ring[j], ring[i]);
    }
  };
  cap(pts[0], false);
  cap(pts[pts.length - 1], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function scaled(j: Record<QBone, [number, number, number]>, s: number): Record<QBone, [number, number, number]> {
  const out = {} as Record<QBone, [number, number, number]>;
  for (const k of Object.keys(j) as QBone[]) out[k] = [j[k][0] * s, j[k][1] * s, j[k][2] * s];
  return out;
}

/** Leg skinning: body bone at the top, then upper, lower and foot bones down the leg. */
function legSkin(x: number, top: number, z: number, body: QBone, bones: [QBone, QBone, QBone], at: [number, number, number], blend: number): SkinFn {
  return along(V(x, top, z), DOWN, [[QI[body], -Infinity], [QI[bones[0]], at[0]], [QI[bones[1]], at[1]], [QI[bones[2]], at[2]]], blend);
}

const materials: Partial<Record<string, THREE.Material>> = {};
function speciesMaterial(name: string): THREE.Material {
  return (materials[name] ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }));
}
const eyeGlow = new THREE.MeshBasicMaterial({ color: 0xffd36a });

// --------------------------------------------------------------------------------------- Wolf

export function makeWolf(region: RegionId): Quadruped {
  const s = rand(0.9, 1.12);
  const palettes = [
    { coat: 0x6b6863, back: 0x3d3a37, belly: 0xc2bbb0 }, // grey
    { coat: 0x75604c, back: 0x3e3127, belly: 0xc9b597 }, // brown
    { coat: 0x343231, back: 0x1c1b1a, belly: 0x5e5955 }, // black
    { coat: 0xb6b2aa, back: 0x88837b, belly: 0xebe7df }, // pale / arctic
  ];
  const p = region === 'frost' ? pick([palettes[3], palettes[3], palettes[0]]) : pick([palettes[0], palettes[0], palettes[1], palettes[2]]);
  const coat = vary(p.coat);
  const back = vary(p.back);
  const belly = vary(p.belly, 0.05);
  const saddle = rand(0.4, 1);
  const J = scaled(
    {
      root: [0, 0, 0],
      pelvis: [0, 0.58, -0.3],
      chest: [0, 0.6, 0.08],
      neck: [0, 0.68, 0.36],
      head: [0, 0.82, 0.55],
      jaw: [0, 0.78, 0.6],
      earL: [0.045, 0.9, 0.55],
      earR: [-0.045, 0.9, 0.55],
      tail1: [0, 0.62, -0.45],
      tail2: [0, 0.5, -0.6],
      FLu: [0.1, 0.6, 0.3],
      FLl: [0.1, 0.34, 0.3],
      FLf: [0.1, 0.09, 0.3],
      FRu: [-0.1, 0.6, 0.3],
      FRl: [-0.1, 0.34, 0.3],
      FRf: [-0.1, 0.09, 0.3],
      HLu: [0.1, 0.58, -0.32],
      HLl: [0.1, 0.3, -0.32],
      HLf: [0.1, 0.09, -0.32],
      HRu: [-0.1, 0.58, -0.32],
      HRl: [-0.1, 0.3, -0.32],
      HRf: [-0.1, 0.09, -0.32],
    },
    s,
  );
  const spec: QuadSpec = {
    joints: J,
    front: [0.26 * s, 0.25 * s],
    hind: [0.28 * s, 0.21 * s],
    footH: { front: 0.09 * s, hind: 0.09 * s },
    stride: { walk: 1.15 * s, run: 2.5 * s },
    runGait: 'gallop',
    runAt: 4,
    lift: [0.07 * s, 0.14 * s],
    bodyR: 0.17 * s,
    hop: 0,
    kind: 'wolf',
  };
  const body = (c: THREE.Vector3) => {
    const top = (c.y / s - 0.66) / 0.1;
    if (top > 0.2 && hash(c.x * 3, c.y, c.z * 2) < saddle) return mix(coat, back, Math.min(1, top));
    if (c.y / s < 0.5) return belly;
    return coat;
  };
  const sculpt = (k: MeshKit) => {
    k.addPainted(
      torso(
        [
          [-0.48, 0.07, 0.07, 0.6],
          [-0.42, 0.11, 0.12, 0.6],
          [-0.3, 0.13, 0.14, 0.6],
          [-0.1, 0.12, 0.13, 0.61],
          [0.12, 0.14, 0.17, 0.6],
          [0.3, 0.15, 0.19, 0.6],
          [0.4, 0.12, 0.15, 0.64],
          [0.45, 0.08, 0.1, 0.68],
        ].map(([z, rx, ry, y]) => [z * s, rx * s, ry * s, y * s] as [number, number, number, number]),
      ),
      body,
      along(V(0, 0, 0), FWD, [[QI.pelvis, -Infinity], [QI.chest, -0.05 * s]], 0.15 * s),
    );
    // Neck with a thick ruff.
    k.addPainted(
      tube(V(0, 0.6 * s, 0.3 * s), V(0, 0.86 * s, 0.56 * s), [[0, 0.13 * s, 0.15 * s], [0.45, 0.11 * s, 0.12 * s], [1, 0.075 * s, 0.08 * s]], 9),
      (c) => (c.z / s > 0.42 && c.y / s < 0.7 ? belly : body(c)),
      along(V(0, 0.6 * s, 0.3 * s), V(0, 0.26, 0.26).normalize(), [[QI.chest, -Infinity], [QI.neck, 0.08 * s], [QI.head, 0.3 * s]], 0.05 * s),
    );
    // Head: skull, cheek ruff, muzzle, nose, jaw, ears, eyes.
    const H = rigid(QI.head);
    k.add(ellipsoid(0, 0.84 * s, 0.58 * s, 0.085 * s, 0.08 * s, 0.1 * s), coat, H);
    for (const x of [1, -1]) k.add(ellipsoid(x * 0.06 * s, 0.8 * s, 0.56 * s, 0.05 * s, 0.06 * s, 0.06 * s, 6, 5), belly, H);
    k.addPainted(tube(V(0, 0.81 * s, 0.62 * s), V(0, 0.785 * s, 0.78 * s), [[0, 0.055 * s, 0.05 * s], [1, 0.028 * s, 0.026 * s]], 7), (c) => (c.y / s < 0.79 ? belly : mix(coat, back, 0.3)), H);
    k.add(ellipsoid(0, 0.787 * s, 0.785 * s, 0.022 * s, 0.018 * s, 0.018 * s, 6, 4), 0x141312, H);
    k.add(tube(V(0, 0.768 * s, 0.62 * s), V(0, 0.764 * s, 0.755 * s), [[0, 0.035 * s, 0.025 * s], [1, 0.02 * s, 0.016 * s]], 6), belly, rigid(QI.jaw));
    for (const x of [1, -1]) {
      k.add(new THREE.BoxGeometry(0.022 * s, 0.014 * s, 0.01 * s).translate(x * 0.046 * s, 0.846 * s, 0.665 * s), 0x16120c, H);
      const ear = x > 0 ? QI.earL : QI.earR;
      k.add(new THREE.ConeGeometry(0.032 * s, 0.09 * s, 4).scale(1, 1, 0.6).rotateZ(-x * 0.15).translate(x * 0.047 * s, 0.925 * s, 0.55 * s), back, rigid(ear));
    }
    // Bushy tail with a dark tip.
    const tailDir = V(0, -0.24, -0.28).normalize();
    k.addPainted(
      tube(V(0, 0.62 * s, -0.44 * s), V(0, 0.38 * s, -0.72 * s), [[0, 0.04 * s], [0.35, 0.075 * s], [0.75, 0.065 * s], [1, 0.015 * s]], 7),
      (c) => (c.y / s < 0.44 ? back : coat),
      along(V(0, 0.62 * s, -0.44 * s), tailDir, [[QI.pelvis, -Infinity], [QI.tail1, 0.02 * s], [QI.tail2, 0.2 * s]], 0.06 * s),
    );
    // Legs and paws.
    for (const [side, x] of [['L', 1], ['R', -1]] as const) {
      const fx = x * 0.1 * s;
      const fz = 0.3 * s;
      const legPaint = (c: THREE.Vector3) => (c.y / s < 0.3 ? mix(coat, belly, 0.5) : coat);
      k.addPainted(
        tube(V(fx, 0.74 * s, fz), V(fx, 0.06 * s, fz), [[0, 0.065 * s, 0.085 * s], [0.18, 0.055 * s, 0.07 * s], [0.45, 0.035 * s, 0.04 * s], [0.6, 0.03 * s, 0.033 * s], [0.85, 0.026 * s, 0.03 * s], [1, 0.03 * s, 0.034 * s]]),
        legPaint,
        legSkin(fx, 0.74 * s, fz, 'chest', [`F${side}u`, `F${side}l`, `F${side}f`] as [QBone, QBone, QBone], [0.12 * s, 0.39 * s, 0.64 * s], 0.04 * s),
      );
      k.add(ellipsoid(fx, 0.035 * s, fz + 0.03 * s, 0.035 * s, 0.035 * s, 0.05 * s, 6, 4), mix(coat, belly, 0.4), rigid(QI[`F${side}f` as QBone]));
      const hz = -0.32 * s;
      k.addPainted(
        tube(V(fx, 0.72 * s, hz), V(fx, 0.06 * s, hz), [[0, 0.07 * s, 0.11 * s], [0.2, 0.065 * s, 0.1 * s], [0.4, 0.04 * s, 0.055 * s], [0.5, 0.032 * s, 0.04 * s], [0.75, 0.024 * s, 0.028 * s], [1, 0.028 * s, 0.03 * s]]),
        legPaint,
        legSkin(fx, 0.72 * s, hz, 'pelvis', [`H${side}u`, `H${side}l`, `H${side}f`] as [QBone, QBone, QBone], [0.12 * s, 0.42 * s, 0.63 * s], 0.04 * s),
      );
      k.add(ellipsoid(fx, 0.035 * s, hz + 0.03 * s, 0.035 * s, 0.035 * s, 0.05 * s, 6, 4), mix(coat, belly, 0.4), rigid(QI[`H${side}f` as QBone]));
    }
  };
  const q = new Quadruped(spec, sculpt, speciesMaterial('wolf'));
  // Eyes that catch the firelight at night.
  for (const x of [1, -1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.024 * s, 0.016 * s, 0.012 * s), eyeGlow);
    const h = J.head;
    e.position.set(x * 0.046 * s - h[0], 0.846 * s - h[1], 0.668 * s - h[2]);
    e.visible = false;
    q.bones.head.add(e);
    q.eyes.push(e);
  }
  return q;
}

// --------------------------------------------------------------------------------------- Deer

export function makeDeer(region: RegionId): Quadruped {
  const r = Math.random();
  const kind = r < 0.45 ? 'buck' : r < 0.85 ? 'doe' : 'fawn';
  const s = kind === 'fawn' ? rand(0.58, 0.68) : kind === 'buck' ? rand(1.0, 1.12) : rand(0.88, 1.0);
  const winter = region === 'frost';
  const coat = vary(kind === 'fawn' ? 0xa0673d : winter ? 0x76655a : pick([0x8a6040, 0x93653f, 0x7f5a3e]));
  const dark = mix(coat, 0x2a1e16, 0.45);
  const white = vary(0xece4d4, 0.04);
  const belly = mix(coat, white, 0.7);
  const antler = vary(0xcdbb98, 0.06);
  const J = scaled(
    {
      root: [0, 0, 0],
      pelvis: [0, 0.95, -0.38],
      chest: [0, 0.97, 0.1],
      neck: [0, 1.06, 0.42],
      head: [0, 1.42, 0.62],
      jaw: [0, 1.39, 0.68],
      earL: [0.06, 1.5, 0.6],
      earR: [-0.06, 1.5, 0.6],
      tail1: [0, 1.04, -0.55],
      tail2: [0, 0.96, -0.61],
      FLu: [0.1, 0.98, 0.38],
      FLl: [0.1, 0.55, 0.38],
      FLf: [0.1, 0.14, 0.38],
      FRu: [-0.1, 0.98, 0.38],
      FRl: [-0.1, 0.55, 0.38],
      FRf: [-0.1, 0.14, 0.38],
      HLu: [0.1, 0.95, -0.38],
      HLl: [0.1, 0.52, -0.38],
      HLf: [0.1, 0.13, -0.38],
      HRu: [-0.1, 0.95, -0.38],
      HRl: [-0.1, 0.52, -0.38],
      HRf: [-0.1, 0.13, -0.38],
    },
    s,
  );
  const spec: QuadSpec = {
    joints: J,
    front: [0.43 * s, 0.41 * s],
    hind: [0.43 * s, 0.39 * s],
    footH: { front: 0.14 * s, hind: 0.13 * s },
    stride: { walk: 1.5 * s, run: 3.8 * s },
    runGait: 'bound',
    runAt: 3,
    lift: [0.1 * s, 0.28 * s],
    bodyR: 0.2 * s,
    hop: 0,
    kind: 'deer',
  };
  const spots = kind === 'fawn';
  const body = (c: THREE.Vector3) => {
    const y = c.y / s;
    const z = c.z / s;
    if (z < -0.5 && y < 1.08) return white; // rump patch
    if (y < 0.74) return belly;
    if (spots && y > 1.0 && Math.abs(c.x / s) < 0.14 && hash(c.x * 9, c.y * 7, c.z * 5) < 0.18) return white;
    return coat;
  };
  const sculpt = (k: MeshKit) => {
    k.addPainted(
      torso(
        [
          [-0.6, 0.07, 0.08, 1.0],
          [-0.53, 0.13, 0.16, 0.98],
          [-0.4, 0.17, 0.22, 0.95],
          [-0.2, 0.18, 0.25, 0.93],
          [0.05, 0.18, 0.26, 0.92],
          [0.28, 0.17, 0.27, 0.94],
          [0.44, 0.13, 0.2, 1.02],
          [0.5, 0.08, 0.12, 1.1],
        ].map(([z, rx, ry, y]) => [z * s, rx * s, ry * s, y * s] as [number, number, number, number]),
      ),
      body,
      along(V(0, 0, 0), FWD, [[QI.pelvis, -Infinity], [QI.chest, -0.1 * s]], 0.2 * s),
    );
    const neckDir = V(0, 0.44, 0.22).normalize();
    k.addPainted(
      tube(V(0, 1.02 * s, 0.4 * s), V(0, 1.47 * s, 0.62 * s), [[0, 0.1 * s, 0.13 * s], [0.55, 0.065 * s, 0.08 * s], [1, 0.055 * s, 0.065 * s]], 8),
      (c) => (c.z / s > 0.6 && c.y / s < 1.38 && c.y / s > 1.25 ? white : coat),
      along(V(0, 1.02 * s, 0.4 * s), neckDir, [[QI.chest, -Infinity], [QI.neck, 0.06 * s], [QI.head, 0.42 * s]], 0.05 * s),
    );
    const H = rigid(QI.head);
    k.add(ellipsoid(0, 1.46 * s, 0.64 * s, 0.07 * s, 0.075 * s, 0.1 * s), coat, H);
    k.addPainted(tube(V(0, 1.43 * s, 0.68 * s), V(0, 1.37 * s, 0.86 * s), [[0, 0.05 * s, 0.055 * s], [1, 0.03 * s, 0.03 * s]], 7), (c) => (c.z / s > 0.8 ? dark : coat), H);
    k.add(ellipsoid(0, 1.372 * s, 0.866 * s, 0.026 * s, 0.022 * s, 0.018 * s, 6, 4), 0x16110d, H);
    k.add(tube(V(0, 1.375 * s, 0.68 * s), V(0, 1.355 * s, 0.82 * s), [[0, 0.03 * s, 0.025 * s], [1, 0.02 * s, 0.016 * s]], 6), belly, rigid(QI.jaw));
    for (const x of [1, -1]) {
      k.add(new THREE.BoxGeometry(0.02 * s, 0.022 * s, 0.012 * s).translate(x * 0.062 * s, 1.475 * s, 0.68 * s), 0x120d09, H);
      const ear = rigid(x > 0 ? QI.earL : QI.earR);
      k.add(
        cone(0, 0, 0, 0.042 * s, 0.14 * s, 5)
          .scale(1, 1, 0.45)
          .rotateZ(-x * 0.9)
          .translate(x * 0.06 * s, 1.5 * s, 0.6 * s),
        coat,
        ear,
      );
    }
    if (kind === 'buck') {
      // Antlers: a main beam curving up and forward with 1–3 tines, different on every buck.
      const tines = 1 + Math.floor(Math.random() * 3);
      const len = rand(0.8, 1.2) * s;
      const spread = rand(0.9, 1.3);
      for (const x of [1, -1]) {
        const pts = [V(x * 0.035, 1.53, 0.6), V(x * 0.11 * spread, 1.64, 0.56), V(x * 0.16 * spread, 1.76, 0.6), V(x * 0.14 * spread, 1.86, 0.7)].map((p) =>
          V(p.x * s, 1.53 * s + (p.y - 1.53) * len, p.z * s + (p.z - 0.6) * (len - s)),
        );
        for (let i = 0; i + 1 < pts.length; i++) k.add(tube(pts[i], pts[i + 1], [[0, 0.02 * s * (1 - i * 0.2)], [1, 0.016 * s * (1 - i * 0.2)]], 5), antler, H);
        for (let t = 0; t < tines; t++) {
          const base = pts[1 + Math.min(t, 2)];
          k.add(tube(base, base.clone().add(V(x * 0.01 * s, 0.13 * len, 0.04 * s)), [[0, 0.013 * s], [1, 0.006 * s]], 4), antler, H);
        }
      }
    }
    // Short tail: brown on top, white beneath (the alarm flag when it bolts).
    const tailDir = V(0, -0.08, -0.07).normalize();
    k.addPainted(
      tube(V(0, 1.06 * s, -0.55 * s), V(0, 0.93 * s, -0.64 * s), [[0, 0.045 * s, 0.03 * s], [0.6, 0.042 * s, 0.03 * s], [1, 0.02 * s, 0.016 * s]], 6),
      (c) => (c.z / s < -0.585 + (c.y / s - 1.0) * -0.4 ? white : coat),
      along(V(0, 1.06 * s, -0.55 * s), tailDir, [[QI.pelvis, -Infinity], [QI.tail1, 0.01 * s], [QI.tail2, 0.06 * s]], 0.03 * s),
    );
    for (const [side, x] of [['L', 1], ['R', -1]] as const) {
      const fx = x * 0.1 * s;
      const legPaint = (c: THREE.Vector3) => (c.y / s < 0.3 ? mix(coat, dark, 0.4) : coat);
      for (const [end, z, top, prof, at] of [
        ['F', 0.38, 1.12, [[0, 0.07, 0.09], [0.15, 0.06, 0.08], [0.42, 0.035, 0.04], [0.5, 0.03, 0.035], [0.78, 0.022, 0.025], [1, 0.024, 0.027]], [0.15, 0.58, 0.99]],
        ['H', -0.38, 1.1, [[0, 0.08, 0.13], [0.2, 0.075, 0.12], [0.43, 0.04, 0.06], [0.52, 0.03, 0.04], [0.8, 0.022, 0.026], [1, 0.024, 0.027]], [0.15, 0.58, 0.97]],
      ] as const) {
        const zz = z * s;
        const bones = [`${end}${side}u`, `${end}${side}l`, `${end}${side}f`] as [QBone, QBone, QBone];
        k.addPainted(
          tube(V(fx, top * s, zz), V(fx, (end === 'F' ? 0.14 : 0.13) * s, zz), prof.map(([t, a, b]) => [t, a * s, b * s] as [number, number, number])),
          legPaint,
          legSkin(fx, top * s, zz, end === 'F' ? 'chest' : 'pelvis', bones, [at[0] * s, at[1] * s, at[2] * s], 0.05 * s),
        );
        const foot = rigid(QI[bones[2]]);
        const fy = (end === 'F' ? 0.14 : 0.13) * s;
        k.add(tube(V(fx, fy, zz), V(fx, 0.045 * s, zz + 0.03 * s), [[0, 0.024 * s], [1, 0.022 * s]], 5), dark, foot);
        k.add(new THREE.BoxGeometry(0.05 * s, 0.05 * s, 0.065 * s).translate(fx, 0.025 * s, zz + 0.04 * s), 0x231a14, foot);
      }
    }
  };
  return new Quadruped(spec, sculpt, speciesMaterial('deer'));
}

// ------------------------------------------------------------------------------------- Rabbit

export function makeRabbit(region: RegionId): Quadruped {
  const hare = region === 'frost';
  const s = hare ? rand(1.15, 1.3) : rand(0.85, 1.12);
  const coat = vary(hare ? 0xeeebe4 : region === 'coast' ? pick([0xa38c6c, 0x8b7d6b]) : pick([0x8b7d6b, 0x7d7569, 0x93806a]), 0.06);
  const belly = mix(coat, 0xf2ede4, 0.7);
  const tip = hare ? 0x1d1b1a : mix(coat, 0x2a2420, 0.4);
  const J = scaled(
    {
      root: [0, 0, 0],
      pelvis: [0, 0.16, -0.06],
      chest: [0, 0.15, 0.04],
      neck: [0, 0.19, 0.09],
      head: [0, 0.25, 0.13],
      jaw: [0, 0.22, 0.16],
      earL: [0.02, 0.3, 0.12],
      earR: [-0.02, 0.3, 0.12],
      tail1: [0, 0.17, -0.14],
      tail2: [0, 0.17, -0.17],
      FLu: [0.04, 0.15, 0.08],
      FLl: [0.04, 0.09, 0.08],
      FLf: [0.04, 0.025, 0.08],
      FRu: [-0.04, 0.15, 0.08],
      FRl: [-0.04, 0.09, 0.08],
      FRf: [-0.04, 0.025, 0.08],
      HLu: [0.05, 0.16, -0.07],
      HLl: [0.05, 0.1, -0.07],
      HLf: [0.05, 0.03, -0.07],
      HRu: [-0.05, 0.16, -0.07],
      HRl: [-0.05, 0.1, -0.07],
      HRf: [-0.05, 0.03, -0.07],
    },
    s,
  );
  const spec: QuadSpec = {
    joints: J,
    front: [0.06 * s, 0.065 * s],
    hind: [0.06 * s, 0.07 * s],
    footH: { front: 0.025 * s, hind: 0.03 * s },
    stride: { walk: 0.4 * s, run: 1.1 * s },
    runGait: 'bound',
    runAt: 1.0,
    lift: [0.03 * s, 0.06 * s],
    bodyR: 0.08 * s,
    hop: 0.08 * s,
    kind: 'rabbit',
  };
  const sculpt = (k: MeshKit) => {
    k.addPainted(
      torso(
        [
          [-0.16, 0.04, 0.04, 0.16],
          [-0.13, 0.07, 0.075, 0.165],
          [-0.07, 0.085, 0.09, 0.17],
          [0.0, 0.08, 0.08, 0.165],
          [0.06, 0.065, 0.07, 0.17],
          [0.1, 0.045, 0.05, 0.19],
        ].map(([z, rx, ry, y]) => [z * s, rx * s, ry * s, y * s] as [number, number, number, number]),
        9,
      ),
      (c) => (c.y / s < 0.12 ? belly : coat),
      along(V(0, 0, 0), FWD, [[QI.pelvis, -Infinity], [QI.chest, -0.01 * s]], 0.05 * s),
    );
    const H = rigid(QI.head);
    k.add(tube(V(0, 0.19 * s, 0.08 * s), V(0, 0.25 * s, 0.14 * s), [[0, 0.045 * s], [1, 0.035 * s]], 7), coat, along(V(0, 0.19 * s, 0.08 * s), V(0, 0.06, 0.06).normalize(), [[QI.chest, -Infinity], [QI.neck, 0.01 * s], [QI.head, 0.07 * s]], 0.02 * s));
    k.add(ellipsoid(0, 0.25 * s, 0.15 * s, 0.042 * s, 0.045 * s, 0.055 * s, 7, 5), coat, H);
    k.add(ellipsoid(0, 0.237 * s, 0.195 * s, 0.03 * s, 0.026 * s, 0.026 * s, 6, 4), belly, H);
    k.add(ellipsoid(0, 0.245 * s, 0.218 * s, 0.009 * s, 0.007 * s, 0.006 * s, 4, 3), 0xc98a8a, H);
    for (const x of [1, -1]) {
      k.add(new THREE.BoxGeometry(0.012 * s, 0.014 * s, 0.012 * s).translate(x * 0.034 * s, 0.262 * s, 0.17 * s), 0x120e0b, H);
      const ear = rigid(x > 0 ? QI.earL : QI.earR);
      k.addPainted(ellipsoid(x * 0.022 * s, 0.37 * s, 0.115 * s, 0.017 * s, 0.075 * s, 0.008 * s, 6, 5), (c) => (c.y / s > 0.42 ? tip : coat), ear);
    }
    k.add(ellipsoid(0, 0.19 * s, -0.165 * s, 0.026 * s, 0.026 * s, 0.024 * s, 6, 4), 0xf4f0ea, rigid(QI.tail1));
    for (const [side, x] of [['L', 1], ['R', -1]] as const) {
      const fx = x * 0.04 * s;
      k.add(
        tube(V(fx, 0.17 * s, 0.08 * s), V(fx, 0.02 * s, 0.08 * s), [[0, 0.025 * s], [0.5, 0.018 * s], [1, 0.016 * s]], 6),
        coat,
        legSkin(fx, 0.17 * s, 0.08 * s, 'chest', [`F${side}u`, `F${side}l`, `F${side}f`] as [QBone, QBone, QBone], [0.02 * s, 0.08 * s, 0.145 * s], 0.012 * s),
      );
      k.add(ellipsoid(fx, 0.012 * s, 0.09 * s, 0.014 * s, 0.012 * s, 0.022 * s, 5, 3), belly, rigid(QI[`F${side}f` as QBone]));
      const hx = x * 0.05 * s;
      k.add(
        ellipsoid(hx, 0.14 * s, -0.07 * s, 0.03 * s, 0.05 * s, 0.06 * s, 7, 5),
        coat,
        legSkin(hx, 0.19 * s, -0.07 * s, 'pelvis', [`H${side}u`, `H${side}l`, `H${side}f`] as [QBone, QBone, QBone], [0.02 * s, 0.09 * s, 0.16 * s], 0.015 * s),
      );
      k.add(
        tube(V(hx, 0.12 * s, -0.08 * s), V(hx, 0.025 * s, -0.07 * s), [[0, 0.022 * s], [1, 0.014 * s]], 5),
        coat,
        along(V(hx, 0.12 * s, -0.07 * s), DOWN, [[QI[`H${side}u` as QBone], -Infinity], [QI[`H${side}l` as QBone], 0.02 * s], [QI[`H${side}f` as QBone], 0.09 * s]], 0.012 * s),
      );
      k.add(ellipsoid(hx, 0.015 * s, -0.04 * s, 0.018 * s, 0.015 * s, 0.055 * s, 5, 4), belly, rigid(QI[`H${side}f` as QBone]));
    }
  };
  return new Quadruped(spec, sculpt, speciesMaterial('rabbit'));
}
