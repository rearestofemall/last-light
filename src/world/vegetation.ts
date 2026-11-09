import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';

/**
 * Procedural low-poly plant and rock geometry. Each part is de-indexed, jittered by a
 * position hash (so coincident vertices move together and no cracks appear) and given a
 * per-face colour variation for a hand-painted, faceted look.
 */

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

interface PartOpts {
  color: number;
  jitter?: number;
  /** Per-face brightness variation. */
  vary?: number;
  /** Vertical gradient: bottom is darkened by this fraction. */
  shadeBottom?: number;
}

function part(geo: THREE.BufferGeometry, o: PartOpts): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const pos = g.attributes.position as THREE.BufferAttribute;
  const j = o.jitter ?? 0;
  if (j > 0) {
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const kx = Math.round(x * 1000) / 1000;
      const ky = Math.round(y * 1000) / 1000;
      const kz = Math.round(z * 1000) / 1000;
      pos.setXYZ(i, x + (hash3(kx, ky, kz) - 0.5) * j, y + (hash3(ky, kz, kx) - 0.5) * j * 0.6, z + (hash3(kz, kx, ky) - 0.5) * j);
    }
  }
  g.computeBoundingBox();
  const minY = g.boundingBox!.min.y;
  const maxY = g.boundingBox!.max.y;
  const base = new THREE.Color(o.color);
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    const v = 1 + (hash3(pos.getX(f), pos.getY(f) * 3.1, pos.getZ(f)) - 0.5) * (o.vary ?? 0.16);
    for (let k = 0; k < 3; k++) {
      const i = f + k;
      const t = maxY > minY ? (pos.getY(i) - minY) / (maxY - minY) : 1;
      const shade = 1 - (o.shadeBottom ?? 0) * (1 - t);
      c.copy(base).multiplyScalar(v * shade);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g = g as THREE.BufferGeometry;
  return g;
}

function finish(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const T = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

export function pine(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = rng.range(2.2, 3);
  parts.push(part(T(new THREE.CylinderGeometry(0.14, 0.26, trunkH + 2, 6), 0, (trunkH + 2) / 2, 0), { color: 0x4a3426, jitter: 0.05 }));
  const tiers = rng.int(4, 6);
  const greens = [0x2c4a2a, 0x305230, 0x27432a];
  let y = trunkH;
  let r = rng.range(2.0, 2.5);
  for (let i = 0; i < tiers; i++) {
    const h = rng.range(2.0, 2.6);
    const cone = new THREE.ConeGeometry(r, h, rng.int(7, 9), 1, false);
    cone.rotateY(rng.range(0, Math.PI));
    parts.push(part(T(cone, rng.range(-0.08, 0.08), y + h / 2, rng.range(-0.08, 0.08)), { color: rng.pick(greens), jitter: 0.32, vary: 0.22, shadeBottom: 0.35 }));
    y += h * 0.52;
    r *= 0.76;
  }
  return finish(parts);
}

export function broadleaf(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = rng.range(3.4, 4.4);
  parts.push(part(T(new THREE.CylinderGeometry(0.2, 0.34, trunkH + 1, 7), 0, (trunkH + 1) / 2, 0), { color: 0x4d3a2a, jitter: 0.08 }));
  for (let i = 0; i < 2; i++) {
    const br = new THREE.CylinderGeometry(0.07, 0.12, 1.8, 5);
    br.rotateZ((i ? -1 : 1) * rng.range(0.6, 0.9));
    parts.push(part(T(br, (i ? 0.6 : -0.6), trunkH - 0.2, 0), { color: 0x4d3a2a }));
  }
  const greens = [0x4b6e2c, 0x56792f, 0x5f7f34, 0x43652a];
  const blobs = rng.int(4, 6);
  for (let i = 0; i < blobs; i++) {
    const rr = rng.range(1.3, 2.1);
    const ico = new THREE.IcosahedronGeometry(rr, 1);
    ico.scale(1, rng.range(0.75, 0.95), 1);
    const a = (i / blobs) * Math.PI * 2;
    const d = i === 0 ? 0 : rng.range(0.9, 1.6);
    parts.push(part(T(ico, Math.cos(a) * d, trunkH + 1.2 + rng.range(0, 1.6) + (i === 0 ? 1 : 0), Math.sin(a) * d * 0.8), { color: rng.pick(greens), jitter: 0.4, vary: 0.24, shadeBottom: 0.4 }));
  }
  return finish(parts);
}

export function birch(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = rng.range(6, 8);
  parts.push(part(T(new THREE.CylinderGeometry(0.1, 0.17, h, 6), 0, h / 2, 0), { color: 0xd9d4c4, jitter: 0.04, vary: 0.3 }));
  const greens = [0x7d9a3a, 0x8aa443, 0x6f8f35];
  for (let i = 0; i < 4; i++) {
    const ico = new THREE.IcosahedronGeometry(rng.range(0.8, 1.2), 0);
    parts.push(part(T(ico, rng.range(-0.8, 0.8), h - 1.8 + i * 0.7, rng.range(-0.6, 0.6)), { color: rng.pick(greens), jitter: 0.25, vary: 0.25, shadeBottom: 0.3 }));
  }
  return finish(parts);
}

export function deadTree(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = rng.range(5, 7.5);
  const col = 0x5c5148;
  parts.push(part(T(new THREE.CylinderGeometry(0.09, 0.3, h, 6), 0, h / 2, 0), { color: col, jitter: 0.08 }));
  for (let i = 0; i < 4; i++) {
    const len = rng.range(1.2, 2.4);
    const br = new THREE.CylinderGeometry(0.03, 0.09, len, 4);
    br.translate(0, len / 2, 0);
    br.rotateZ(rng.range(0.5, 1.1) * (i % 2 ? 1 : -1));
    br.rotateY(rng.range(0, Math.PI * 2));
    parts.push(part(T(br, 0, h * rng.range(0.45, 0.85), 0), { color: col }));
  }
  return finish(parts);
}

export function bush(rng: Rng, berries = rng.chance(0.5)): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const greens = [0x3f5f27, 0x4a6a2a, 0x557530];
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.45, 0.8);
    const ico = new THREE.IcosahedronGeometry(r, 0);
    parts.push(part(T(ico, rng.range(-0.6, 0.6), r * 0.7, rng.range(-0.4, 0.4)), { color: rng.pick(greens), jitter: 0.18, vary: 0.25, shadeBottom: 0.45 }));
  }
  if (berries) {
    for (let i = 0; i < 9; i++) {
      const b = new THREE.IcosahedronGeometry(0.07, 0);
      parts.push(part(T(b, rng.range(-0.7, 0.7), rng.range(0.5, 1.1), rng.range(0.25, 0.65)), { color: 0xa3263a }));
    }
  }
  return finish(parts);
}

export function fern(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = rng.int(6, 9);
  for (let i = 0; i < n; i++) {
    const len = rng.range(0.7, 1.1);
    const leaf = new THREE.ConeGeometry(0.16, len, 3);
    leaf.scale(1, 1, 0.25);
    leaf.translate(0, len / 2, 0);
    leaf.rotateX(rng.range(0.7, 1.1));
    leaf.rotateY((i / n) * Math.PI * 2 + rng.range(-0.2, 0.2));
    parts.push(part(leaf, { color: rng.pick([0x4e7a2e, 0x5b8a34, 0x467029]), vary: 0.2, shadeBottom: 0.5 }));
  }
  return finish(parts);
}

export function grassTuft(rng: Rng, flowers: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    const h = rng.range(0.35, 0.75);
    const blade = new THREE.ConeGeometry(0.045, h, 3);
    blade.translate(0, h / 2, 0);
    blade.rotateZ(rng.range(-0.35, 0.35));
    blade.rotateY(rng.range(0, Math.PI * 2));
    parts.push(part(T(blade, rng.range(-0.18, 0.18), 0, rng.range(-0.18, 0.18)), { color: rng.pick([0x5b8236, 0x6a8f3a, 0x7f9a44, 0x4f7530]), shadeBottom: 0.55, vary: 0.1 }));
  }
  if (flowers) {
    const col = rng.pick([0xf1d46a, 0xf4f0e6, 0xb48ad6, 0xe07a5f]);
    for (let i = 0; i < 3; i++) {
      const h = rng.range(0.45, 0.7);
      parts.push(part(T(new THREE.CylinderGeometry(0.012, 0.012, h, 3), 0, h / 2, 0).translate(rng.range(-0.15, 0.15), 0, rng.range(-0.15, 0.15)), { color: 0x4f7530 }));
      const p = parts[parts.length - 1];
      p.computeBoundingBox();
      const bb = p.boundingBox!;
      parts.push(part(T(new THREE.IcosahedronGeometry(0.06, 0), (bb.min.x + bb.max.x) / 2, h, (bb.min.z + bb.max.z) / 2), { color: col, vary: 0.1 }));
    }
  }
  return finish(parts);
}

export function rock(rng: Rng, color = 0x77736b): THREE.BufferGeometry {
  const r = rng.range(0.5, 1);
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.scale(rng.range(1, 1.6), rng.range(0.55, 0.8), rng.range(0.9, 1.3));
  g.translate(0, r * 0.35, 0);
  const p = part(g, { color, jitter: r * 0.35, vary: 0.18, shadeBottom: 0.3 });
  // Mossy tops
  const pos = p.attributes.position as THREE.BufferAttribute;
  const col = p.attributes.color as THREE.BufferAttribute;
  const moss = new THREE.Color(0x58703a);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > r * 0.55 && hash3(pos.getX(i), pos.getZ(i), 1) > 0.45) {
      c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(moss, 0.55);
      col.setXYZ(i, c.r, c.g, c.b);
    }
  }
  return finish([p]);
}

export function fallenLog(rng: Rng): THREE.BufferGeometry {
  const len = rng.range(2.5, 4.5);
  const r = rng.range(0.22, 0.35);
  const g = new THREE.CylinderGeometry(r, r * 1.1, len, 8);
  g.rotateZ(Math.PI / 2);
  g.translate(0, r * 0.8, 0);
  const ring = new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.02, 8);
  ring.rotateZ(Math.PI / 2);
  ring.translate(len / 2 + 0.01, r * 0.8, 0);
  return finish([part(g, { color: 0x5a4330, jitter: 0.06, vary: 0.2 }), part(ring, { color: 0xa88a62 })]);
}

export function stump(rng: Rng): THREE.BufferGeometry {
  const r = rng.range(0.28, 0.42);
  const h = rng.range(0.4, 0.8);
  const g = new THREE.CylinderGeometry(r, r * 1.25, h, 8);
  g.translate(0, h / 2, 0);
  const top = new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.02, 8);
  top.translate(0, h + 0.01, 0);
  return finish([part(g, { color: 0x4e3b2b, jitter: 0.05 }), part(top, { color: 0xb09068 })]);
}

export function snowPine(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = rng.range(1.8, 2.6);
  parts.push(part(T(new THREE.CylinderGeometry(0.13, 0.24, trunkH + 2, 6), 0, (trunkH + 2) / 2, 0), { color: 0x45342a, jitter: 0.05 }));
  const tiers = rng.int(4, 6);
  let y = trunkH;
  let r = rng.range(1.7, 2.2);
  for (let i = 0; i < tiers; i++) {
    const h = rng.range(1.9, 2.4);
    const cone = new THREE.ConeGeometry(r, h, rng.int(7, 9), 1, false);
    cone.rotateY(rng.range(0, Math.PI));
    parts.push(part(T(cone, 0, y + h / 2, 0), { color: 0x24392c, jitter: 0.3, vary: 0.2, shadeBottom: 0.35 }));
    // Snow cap sitting on each tier
    const cap = new THREE.ConeGeometry(r * 0.8, h * 0.45, 8, 1, false);
    parts.push(part(T(cap, 0, y + h * 0.78, 0), { color: 0xeef2f6, jitter: 0.22, vary: 0.08 }));
    y += h * 0.52;
    r *= 0.75;
  }
  return finish(parts);
}

export function herb(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const h = rng.range(0.35, 0.6);
    parts.push(part(T(new THREE.CylinderGeometry(0.015, 0.02, h, 3), rng.range(-0.15, 0.15), h / 2, rng.range(-0.15, 0.15)), { color: 0x4d7a35 }));
    const p = parts[parts.length - 1];
    p.computeBoundingBox();
    const bb = p.boundingBox!;
    const head = new THREE.IcosahedronGeometry(0.08, 0);
    head.scale(1.3, 0.5, 1.3);
    parts.push(part(T(head, (bb.min.x + bb.max.x) / 2, h, (bb.min.z + bb.max.z) / 2), { color: rng.pick([0xf2eedf, 0xe8e0c8, 0xd9c8f0]) }));
  }
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.ConeGeometry(0.06, 0.3, 3);
    leaf.scale(1, 1, 0.3);
    leaf.translate(0, 0.15, 0);
    leaf.rotateX(1.1);
    leaf.rotateY((i / 6) * Math.PI * 2);
    parts.push(part(leaf, { color: 0x5b8a3a, shadeBottom: 0.4 }));
  }
  return finish(parts);
}

export function sticks(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const len = rng.range(0.8, 1.5);
    const g = new THREE.CylinderGeometry(0.03, 0.05, len, 5);
    g.rotateZ(Math.PI / 2 + rng.range(-0.25, 0.25));
    g.rotateY(rng.range(-0.6, 0.6));
    parts.push(part(T(g, rng.range(-0.2, 0.2), 0.05 + i * 0.045, rng.range(-0.2, 0.2)), { color: rng.pick([0x5c4632, 0x6a5139, 0x4e3b2a]) }));
  }
  return finish(parts);
}

export function scrap(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cols = [0x6e6a64, 0x7b4b33, 0x5d6166, 0x8a5a3c, 0x4e5a63];
  for (let i = 0; i < 7; i++) {
    const g = rng.chance(0.4) ? new THREE.CylinderGeometry(0.12, 0.12, rng.range(0.3, 0.9), 7) : new THREE.BoxGeometry(rng.range(0.3, 0.9), rng.range(0.05, 0.3), rng.range(0.3, 0.7));
    g.rotateZ(rng.range(-0.8, 0.8));
    g.rotateY(rng.range(0, Math.PI));
    parts.push(part(T(g, rng.range(-0.5, 0.5), rng.range(0.1, 0.45), rng.range(-0.3, 0.3)), { color: rng.pick(cols), jitter: 0.04 }));
  }
  return finish(parts);
}

export function reeds(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 11; i++) {
    const h = rng.range(0.8, 1.4);
    const blade = new THREE.ConeGeometry(0.035, h, 3);
    blade.translate(0, h / 2, 0);
    blade.rotateZ(rng.range(-0.25, 0.25));
    parts.push(part(T(blade, rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3)), { color: rng.pick([0x8a8f4a, 0x9d9a58, 0x76803e]), shadeBottom: 0.5 }));
  }
  return finish(parts);
}

export function snowDrift(rng: Rng): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(rng.range(0.7, 1.3), 1);
  g.scale(rng.range(1.4, 2.2), 0.35, rng.range(1, 1.5));
  return finish([part(g, { color: 0xeef2f6, jitter: 0.2, vary: 0.05 })]);
}

export type VegKind =
  | 'pine'
  | 'broadleaf'
  | 'birch'
  | 'dead'
  | 'bush'
  | 'fern'
  | 'grass'
  | 'flowers'
  | 'rock'
  | 'log'
  | 'stump'
  | 'snowpine'
  | 'berrybush'
  | 'herb'
  | 'sticks'
  | 'scrap'
  | 'reeds'
  | 'drift';

/** Shared geometry variants for every vegetation kind, built once. */
export class VegetationLibrary {
  readonly variants: Record<VegKind, THREE.BufferGeometry[]>;

  constructor(seed: number) {
    const rng = new Rng(seed ^ 0xabcdef);
    const many = (n: number, f: (r: Rng) => THREE.BufferGeometry) => Array.from({ length: n }, () => f(rng));
    this.variants = {
      pine: many(4, pine),
      broadleaf: many(3, broadleaf),
      birch: many(2, birch),
      dead: many(2, deadTree),
      bush: many(3, (r) => bush(r, false)),
      berrybush: many(2, (r) => bush(r, true)),
      snowpine: many(3, snowPine),
      herb: many(2, herb),
      sticks: many(2, sticks),
      scrap: many(3, scrap),
      reeds: many(2, reeds),
      drift: many(2, snowDrift),
      fern: many(2, fern),
      grass: many(3, (r) => grassTuft(r, false)),
      flowers: many(3, (r) => grassTuft(r, true)),
      rock: many(4, (r) => rock(r)),
      log: many(2, fallenLog),
      stump: many(2, stump),
    };
  }
}
