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
  // Height above the plant's base: drives wind sway (also once merged into world space).
  const pos = g.attributes.position as THREE.BufferAttribute;
  const h = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) h[i] = Math.max(0, pos.getY(i));
  g.setAttribute('aH', new THREE.BufferAttribute(h, 1));
  return g;
}

const T = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const UPV = new THREE.Vector3(0, 1, 0);

/**
 * Low-detail mode for distant trees. The same random numbers are drawn either way (so a
 * tree's LOD has the same silhouette), but segment counts drop and fine details are skipped.
 */
let LOW = false;
const seg = (n: number, low: number) => (LOW ? Math.min(n, low) : n);
/** Push a detail-only part unless building the LOD. */
const detail = (parts: THREE.BufferGeometry[], g: THREE.BufferGeometry) => {
  if (LOW) g.dispose();
  else parts.push(g);
};

/** A tapered limb from `a` to `b` (radius r0 → r1). */
function limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, sides = 5): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), seg(sides, 4), 1, true);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UPV, d.normalize()));
  return g.translate(a.x, a.y, a.z);
}

/** Leaf mass: a lumpy icosahedron. */
function blob(r: number, d = 1): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(r, LOW ? 0 : d);
}

/** Slightly shift a hex colour's hue/brightness so trees of one kind differ. */
function tone(rng: Rng, hex: number, hue = 0.02, light = 0.08): number {
  const c = new THREE.Color(hex);
  const h = { h: 0, s: 0, l: 0 };
  c.getHSL(h);
  c.setHSL((h.h + rng.range(-hue, hue) + 1) % 1, h.s * rng.range(0.9, 1.1), Math.min(1, h.l * rng.range(1 - light, 1 + light)));
  return c.getHex();
}

/** Root flare: a few low wedges around the trunk base. */
function roots(rng: Rng, parts: THREE.BufferGeometry[], r: number, color: number): void {
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const tip = new THREE.Vector3(Math.cos(a) * r * 2.4, 0.02, Math.sin(a) * r * 2.4);
    detail(parts, part(limb(new THREE.Vector3(Math.cos(a) * r * 0.5, 0.35, Math.sin(a) * r * 0.5), tip, r * 0.45, r * 0.12, 4), { color, jitter: 0.03 }));
  }
}

/** Conifer: pine (open, warm green), spruce (narrow, many drooping tiers, blue-green) or tall pine (bare trunk, high crown). */
export function pine(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const style = rng.pick(['pine', 'spruce', 'tall'] as const);
  const bark = tone(rng, style === 'tall' ? 0x6a4630 : 0x4a3426, 0.01, 0.12);
  const trunkH = style === 'tall' ? rng.range(5, 7) : rng.range(1.6, 2.8);
  const total = style === 'spruce' ? rng.range(9, 12) : rng.range(8, 11);
  parts.push(part(T(new THREE.CylinderGeometry(0.1, 0.28, total * 0.85, 7), 0, (total * 0.85) / 2, 0), { color: bark, jitter: 0.05, vary: 0.25 }));
  roots(rng, parts, 0.26, bark);
  const greens = style === 'spruce' ? [0x23402f, 0x274634, 0x1e3a2b] : [0x2c4a2a, 0x335631, 0x27432a, 0x38592f];
  const tiers = style === 'spruce' ? rng.int(6, 8) : style === 'tall' ? rng.int(3, 4) : rng.int(4, 6);
  let y = trunkH;
  let r = style === 'spruce' ? rng.range(1.9, 2.3) : style === 'tall' ? rng.range(2.2, 2.8) : rng.range(2.0, 2.6);
  const step = (total - trunkH) / (tiers + 1);
  for (let i = 0; i < tiers; i++) {
    const h = step * rng.range(1.7, 2.1);
    const cone = new THREE.ConeGeometry(r, h, seg(rng.int(7, 10), 6), LOW ? 1 : 2, true);
    // Droop the skirt: outer ring sags below the tier base.
    const pos = cone.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k);
      const z = pos.getZ(k);
      const d = Math.hypot(x, z) / r;
      if (d > 0.8) pos.setY(k, pos.getY(k) - h * 0.12 * (style === 'spruce' ? 1.4 : 1));
    }
    cone.rotateY(rng.range(0, Math.PI));
    parts.push(part(T(cone, rng.range(-0.1, 0.1), y + h / 2, rng.range(-0.1, 0.1)), { color: tone(rng, rng.pick(greens), 0.015, 0.1), jitter: 0.34, vary: 0.24, shadeBottom: 0.45 }));
    y += step;
    r *= style === 'spruce' ? 0.8 : 0.74;
  }
  return finish(parts);
}

/** Deciduous: oak (gnarled limbs, broad crown), maple (round, autumn reds), elm (vase-shaped). */
export function broadleaf(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const style = rng.pick(['oak', 'oak', 'maple', 'elm'] as const);
  const bark = tone(rng, style === 'maple' ? 0x5a4a3c : 0x4d3a2a, 0.01, 0.12);
  const trunkH = style === 'elm' ? rng.range(4, 5) : rng.range(2.6, 3.6);
  const trunkR = style === 'oak' ? rng.range(0.32, 0.42) : rng.range(0.22, 0.3);
  const base = new THREE.Vector3(0, 0, 0);
  const fork = new THREE.Vector3(rng.range(-0.2, 0.2), trunkH, rng.range(-0.2, 0.2));
  parts.push(part(limb(base, fork, trunkR, trunkR * 0.7, 8), { color: bark, jitter: 0.06, vary: 0.25 }));
  roots(rng, parts, trunkR, bark);
  const palettes: Record<string, number[]> = {
    oak: [0x4b6e2c, 0x56792f, 0x43652a, 0x5c7a34],
    maple: rng.chance(0.6) ? [0xb4502a, 0xc8662e, 0xa8402a, 0xd08a34] : [0x5f8436, 0x6b8f3a, 0x557a30],
    elm: [0x5a7d34, 0x668a3a, 0x4f7330],
  };
  const greens = palettes[style];
  const limbs = style === 'oak' ? rng.int(3, 5) : style === 'elm' ? rng.int(3, 4) : rng.int(2, 3);
  const crownR = style === 'oak' ? 3.2 : style === 'elm' ? 2.6 : 2.2;
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const spread = style === 'elm' ? rng.range(1.4, 2.0) : rng.range(1.6, 2.6);
    const end = new THREE.Vector3(fork.x + Math.cos(a) * spread, trunkH + rng.range(1.4, 2.6) + (style === 'elm' ? 1.2 : 0), fork.z + Math.sin(a) * spread);
    parts.push(part(limb(fork, end, trunkR * 0.55, trunkR * 0.25, 6), { color: bark, jitter: 0.05 }));
    // Leaf masses clustered around each limb tip.
    const n = rng.int(2, 3);
    for (let k = 0; k < n; k++) {
      const rr = rng.range(1.1, 1.7) * (crownR / 3);
      const g = blob(rr, 1);
      g.scale(1, rng.range(0.7, 0.9), 1);
      parts.push(part(T(g, end.x + rng.range(-0.8, 0.8), end.y + rng.range(-0.2, 0.9), end.z + rng.range(-0.8, 0.8)), { color: tone(rng, rng.pick(greens), 0.02, 0.1), jitter: 0.45, vary: 0.26, shadeBottom: 0.45 }));
    }
  }
  // A top mass to close the crown.
  const top = blob(crownR * 0.55, 1);
  top.scale(1, 0.75, 1);
  parts.push(part(T(top, fork.x, trunkH + 2.6 + (style === 'elm' ? 1.2 : 0), fork.z), { color: tone(rng, rng.pick(greens), 0.02, 0.1), jitter: 0.45, vary: 0.26, shadeBottom: 0.4 }));
  return finish(parts);
}

/** Birch: 1–3 pale trunks with black marks and light, airy foliage (sometimes autumn gold). */
export function birch(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunks = rng.int(1, 3);
  const gold = rng.chance(0.4);
  const greens = gold ? [0xd0a338, 0xe0b848, 0xc4952e] : [0x7d9a3a, 0x8aa443, 0x6f8f35];
  for (let t = 0; t < trunks; t++) {
    const h = rng.range(6, 8.5);
    const lean = new THREE.Vector3(rng.range(-0.5, 0.5) * (trunks > 1 ? 1 : 0.3), h, rng.range(-0.5, 0.5) * (trunks > 1 ? 1 : 0.3));
    const base = new THREE.Vector3(rng.range(-0.25, 0.25) * (trunks - 1), 0, rng.range(-0.25, 0.25) * (trunks - 1));
    const top = base.clone().add(lean);
    parts.push(part(limb(base, top, 0.16, 0.08, 6), { color: tone(rng, 0xdcd7c8, 0.01, 0.05), jitter: 0.03, vary: 0.12 }));
    // Black bark marks.
    for (let m = 0; m < rng.int(4, 7); m++) {
      const f = rng.range(0.05, 0.85);
      const p = base.clone().lerp(top, f);
      const band = new THREE.CylinderGeometry(0.165 - f * 0.07, 0.165 - f * 0.07, rng.range(0.04, 0.1), 6, 1, true, rng.range(0, 6), rng.range(1, 2.5));
      detail(parts, part(T(band, p.x, p.y, p.z), { color: 0x2a2724 }));
    }
    for (let i = 0; i < 4; i++) {
      const p = base.clone().lerp(top, 0.62 + i * 0.12);
      const g = blob(rng.range(0.7, 1.15), 0);
      parts.push(part(T(g, p.x + rng.range(-0.8, 0.8), p.y, p.z + rng.range(-0.6, 0.6)), { color: tone(rng, rng.pick(greens), 0.02, 0.1), jitter: 0.25, vary: 0.25, shadeBottom: 0.3 }));
    }
  }
  return finish(parts);
}

export function deadTree(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = rng.range(5, 7.5);
  const col = tone(rng, rng.pick([0x5c5148, 0x6b6056, 0x4f463f]), 0.01, 0.1);
  parts.push(part(T(new THREE.CylinderGeometry(0.09, 0.3, h, 6), 0, h / 2, 0), { color: col, jitter: 0.08 }));
  roots(rng, parts, 0.28, col);
  for (let i = 0; i < rng.int(3, 6); i++) {
    const y = h * rng.range(0.4, 0.88);
    const a = rng.range(0, Math.PI * 2);
    const len = rng.range(1.0, 2.4);
    const from = new THREE.Vector3(0, y, 0);
    const to = new THREE.Vector3(Math.cos(a) * len, y + len * rng.range(0.4, 1.0), Math.sin(a) * len);
    parts.push(part(limb(from, to, 0.08, 0.025, 4), { color: col }));
    // A twig off each branch.
    const mid = from.clone().lerp(to, 0.6);
    detail(parts, part(limb(mid, mid.clone().add(new THREE.Vector3(rng.range(-0.5, 0.5), rng.range(0.3, 0.7), rng.range(-0.5, 0.5))), 0.03, 0.01, 3), { color: col }));
  }
  return finish(parts);
}

/** Shrubs: round bush, spiky juniper, or a flowering shrub. Berry bushes are always round. */
export function bush(rng: Rng, berries = rng.chance(0.5)): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const style = berries ? 'round' : rng.pick(['round', 'round', 'juniper', 'flowering'] as const);
  if (style === 'juniper') {
    for (let i = 0; i < rng.int(4, 6); i++) {
      const h = rng.range(0.9, 1.6);
      const c = new THREE.ConeGeometry(rng.range(0.3, 0.45), h, 6);
      parts.push(part(T(c, rng.range(-0.5, 0.5), h / 2, rng.range(-0.4, 0.4)), { color: tone(rng, 0x31503a, 0.02, 0.1), jitter: 0.15, vary: 0.25, shadeBottom: 0.45 }));
    }
    return finish(parts);
  }
  const greens = [0x3f5f27, 0x4a6a2a, 0x557530, 0x48682e];
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.4, 0.8);
    const g = blob(r, 0);
    g.scale(1, rng.range(0.75, 1), 1);
    parts.push(part(T(g, rng.range(-0.6, 0.6), r * 0.7, rng.range(-0.4, 0.4)), { color: tone(rng, rng.pick(greens)), jitter: 0.18, vary: 0.25, shadeBottom: 0.45 }));
  }
  const dots = berries ? { col: rng.pick([0xa3263a, 0x3b2a5c, 0xc23a30]), n: 12, r: 0.07 } : style === 'flowering' ? { col: rng.pick([0xf4f0f4, 0xf2b8c8, 0xf6e27a]), n: 16, r: 0.06 } : null;
  if (dots) {
    for (let i = 0; i < dots.n; i++) {
      const a = rng.range(0, Math.PI * 2);
      parts.push(part(T(new THREE.IcosahedronGeometry(dots.r, 0), Math.cos(a) * rng.range(0.4, 0.8), rng.range(0.45, 1.1), Math.sin(a) * rng.range(0.3, 0.6)), { color: dots.col, vary: 0.1 }));
    }
  }
  return finish(parts);
}

/** Ferns with arching two-part fronds; some variants are a ring of mushrooms instead. */
export function fern(rng: Rng): THREE.BufferGeometry {
  if (rng.chance(0.3)) return mushrooms(rng);
  const parts: THREE.BufferGeometry[] = [];
  const n = rng.int(6, 10);
  const col = rng.pick([0x4e7a2e, 0x5b8a34, 0x467029, 0x6b8f3a]);
  for (let i = 0; i < n; i++) {
    const len = rng.range(0.6, 1.1);
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    for (let seg = 0; seg < 2; seg++) {
      const leaf = new THREE.ConeGeometry(0.15 * (1 - seg * 0.3), len * 0.55, 3);
      leaf.scale(1, 1, 0.22);
      leaf.translate(0, (len * 0.55) / 2, 0);
      leaf.rotateX(0.6 + seg * 0.7 + rng.range(-0.1, 0.1));
      if (seg === 1) leaf.translate(0, len * 0.42, len * 0.3);
      leaf.rotateY(a);
      parts.push(part(leaf, { color: tone(rng, col, 0.02, 0.08), vary: 0.2, shadeBottom: 0.5 }));
    }
  }
  return finish(parts);
}

/** A cluster of toadstools (red with white spots) or brown field mushrooms. */
export function mushrooms(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const red = rng.chance(0.4);
  for (let i = 0; i < rng.int(3, 6); i++) {
    const h = rng.range(0.08, 0.2);
    const x = rng.range(-0.3, 0.3);
    const z = rng.range(-0.3, 0.3);
    parts.push(part(T(new THREE.CylinderGeometry(0.018, 0.024, h, 5), x, h / 2, z), { color: 0xe8e0cc }));
    const cap = new THREE.SphereGeometry(rng.range(0.05, 0.09), 6, 3, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.7, 1);
    parts.push(part(T(cap, x, h, z), { color: red ? 0xb3261e : tone(rng, 0x8a6a48), vary: 0.15 }));
    if (red) for (let d = 0; d < 3; d++) parts.push(part(T(new THREE.IcosahedronGeometry(0.012, 0), x + rng.range(-0.04, 0.04), h + 0.04, z + rng.range(-0.04, 0.04)), { color: 0xf4efe6 }));
  }
  return finish(parts);
}

export function grassTuft(rng: Rng, flowers: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tall = rng.chance(0.35);
  const n = rng.int(6, 10);
  const palette = rng.pick([
    [0x5b8236, 0x6a8f3a, 0x7f9a44, 0x4f7530],
    [0x6f8a3a, 0x8a9a48, 0x9aa456, 0x637d34],
    [0x4f7a32, 0x5a8838, 0x476e2c],
  ]);
  for (let i = 0; i < n; i++) {
    const h = rng.range(0.3, 0.7) * (tall ? 1.5 : 1);
    const blade = new THREE.ConeGeometry(0.04, h, 3, 1, true);
    blade.translate(0, h / 2, 0);
    blade.rotateZ(rng.range(-0.4, 0.4));
    blade.rotateY(rng.range(0, Math.PI * 2));
    parts.push(part(T(blade, rng.range(-0.2, 0.2), 0, rng.range(-0.2, 0.2)), { color: rng.pick(palette), shadeBottom: 0.55, vary: 0.12 }));
  }
  if (tall && !flowers) {
    // Seed heads on the tallest stems.
    for (let i = 0; i < 3; i++) {
      const h = rng.range(0.8, 1.05);
      const x = rng.range(-0.12, 0.12);
      const z = rng.range(-0.12, 0.12);
      parts.push(part(T(new THREE.CylinderGeometry(0.008, 0.01, h, 3), x, h / 2, z), { color: 0x8a8f4a }));
      parts.push(part(T(new THREE.ConeGeometry(0.025, 0.14, 4), x, h + 0.05, z), { color: 0xc4b27a }));
    }
  }
  if (flowers) {
    const kind = rng.pick(['daisy', 'lupine', 'poppy', 'bluebell', 'buttercup'] as const);
    for (let i = 0; i < rng.int(3, 5); i++) {
      const h = rng.range(0.4, 0.7) * (kind === 'lupine' ? 1.3 : 1);
      const x = rng.range(-0.18, 0.18);
      const z = rng.range(-0.18, 0.18);
      parts.push(part(T(new THREE.CylinderGeometry(0.01, 0.012, h, 3), x, h / 2, z), { color: 0x4f7530 }));
      if (kind === 'lupine') {
        const col = rng.pick([0x7a5ad6, 0x9a6ad0, 0xd47ab4]);
        for (let k = 0; k < 5; k++) parts.push(part(T(new THREE.IcosahedronGeometry(0.035 - k * 0.004, 0), x, h - 0.05 + k * 0.05, z), { color: col, vary: 0.1 }));
      } else if (kind === 'daisy') {
        const petals = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 8);
        parts.push(part(T(petals, x, h, z), { color: 0xf6f3ea }));
        parts.push(part(T(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 6), x, h + 0.01, z), { color: 0xe8b830 }));
      } else if (kind === 'bluebell') {
        for (let k = 0; k < 3; k++) {
          const bell = new THREE.ConeGeometry(0.03, 0.05, 5);
          bell.rotateX(Math.PI);
          parts.push(part(T(bell, x + 0.03, h - k * 0.06, z), { color: 0x5a6ad8, vary: 0.1 }));
        }
      } else {
        const col = kind === 'poppy' ? 0xd23a24 : 0xf2d040;
        const cup = new THREE.SphereGeometry(0.05, 6, 3, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        parts.push(part(T(cup, x, h + 0.04, z), { color: col, vary: 0.1 }));
      }
    }
  }
  return finish(parts);
}

/** Rocks: boulder, flat slab, a cluster, or an upright crag. Moss on top, lichen spots. */
export function rock(rng: Rng, color = 0x77736b): THREE.BufferGeometry {
  const style = rng.pick(['boulder', 'boulder', 'slab', 'cluster', 'crag'] as const);
  const base = tone(rng, rng.pick([color, 0x6d6a64, 0x847d70, 0x6a665e]), 0.02, 0.1);
  const pieces: [number, number, number, number, [number, number, number]][] = [];
  if (style === 'cluster') {
    for (let i = 0; i < rng.int(3, 4); i++) pieces.push([rng.range(0.3, 0.7), rng.range(-0.8, 0.8), 0, rng.range(-0.6, 0.6), [rng.range(1, 1.4), rng.range(0.6, 0.9), rng.range(0.9, 1.2)]]);
  } else if (style === 'slab') pieces.push([rng.range(0.7, 1.1), 0, 0, 0, [rng.range(1.5, 2), rng.range(0.3, 0.45), rng.range(1.1, 1.4)]]);
  else if (style === 'crag') pieces.push([rng.range(0.5, 0.8), 0, 0, 0, [rng.range(0.8, 1), rng.range(1.3, 1.8), rng.range(0.7, 0.9)]]);
  else pieces.push([rng.range(0.5, 1), 0, 0, 0, [rng.range(1, 1.6), rng.range(0.55, 0.8), rng.range(0.9, 1.3)]]);
  const parts = pieces.map(([r, x, , z, sc]) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(...sc);
    g.rotateY(rng.range(0, Math.PI));
    g.translate(x, r * sc[1] * 0.55, z);
    const p = part(g, { color: base, jitter: r * 0.35, vary: 0.2, shadeBottom: 0.35 });
    const pos = p.attributes.position as THREE.BufferAttribute;
    const col = p.attributes.color as THREE.BufferAttribute;
    const moss = new THREE.Color(rng.pick([0x58703a, 0x4f6a34, 0x667a3e]));
    const lichen = new THREE.Color(rng.pick([0xc8a040, 0xd8d4c4, 0xa8b070]));
    const c = new THREE.Color();
    const top = r * sc[1] * 0.8;
    for (let i = 0; i < pos.count; i += 3) {
      const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const h = hash3(pos.getX(i), pos.getZ(i), 1);
      let mix: THREE.Color | null = null;
      let k = 0;
      if (cy > top && h > 0.4) {
        mix = moss;
        k = 0.6;
      } else if (h > 0.93) {
        mix = lichen;
        k = 0.7;
      }
      if (!mix) continue;
      for (let j = i; j < i + 3; j++) {
        c.setRGB(col.getX(j), col.getY(j), col.getZ(j)).lerp(mix, k);
        col.setXYZ(j, c.r, c.g, c.b);
      }
    }
    return p;
  });
  return finish(parts);
}

/** Fallen log with branch stubs, moss along the top and sometimes bracket fungi. */
export function fallenLog(rng: Rng): THREE.BufferGeometry {
  const len = rng.range(2.5, 4.5);
  const r = rng.range(0.22, 0.35);
  const bark = tone(rng, 0x5a4330, 0.01, 0.12);
  const g = new THREE.CylinderGeometry(r, r * 1.1, len, 8, 3);
  g.rotateZ(Math.PI / 2);
  g.translate(0, r * 0.8, 0);
  const parts = [part(g, { color: bark, jitter: 0.06, vary: 0.2 })];
  const moss = new THREE.Color(0x5a7038);
  const pos = parts[0].attributes.position as THREE.BufferAttribute;
  const col = parts[0].attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > r * 1.45 && hash3(pos.getX(i), 2, pos.getZ(i)) > 0.35) {
      const c = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i)).lerp(moss, 0.6);
      col.setXYZ(i, c.r, c.g, c.b);
    }
  }
  for (const s of [1, -1]) {
    const ring = new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.02, 8);
    ring.rotateZ(Math.PI / 2);
    parts.push(part(T(ring, s * (len / 2 + 0.01), r * 0.8, 0), { color: 0xa88a62 }));
  }
  for (let i = 0; i < rng.int(1, 3); i++) {
    const x = rng.range(-len / 2.5, len / 2.5);
    parts.push(part(limb(new THREE.Vector3(x, r * 1.2, 0), new THREE.Vector3(x + rng.range(-0.2, 0.2), r * 1.2 + rng.range(0.3, 0.6), rng.range(-0.4, 0.4)), 0.06, 0.03, 4), { color: bark }));
  }
  if (rng.chance(0.5)) {
    for (let i = 0; i < 3; i++) {
      const f = new THREE.SphereGeometry(0.1, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2);
      f.scale(1, 0.35, 0.8);
      parts.push(part(T(f, rng.range(-len / 3, len / 3), r * 0.8 + rng.range(-0.05, 0.1), r * 0.95), { color: 0xc89a5a }));
    }
  }
  return finish(parts);
}

export function stump(rng: Rng): THREE.BufferGeometry {
  const r = rng.range(0.28, 0.42);
  const h = rng.range(0.4, 0.8);
  const bark = tone(rng, 0x4e3b2b, 0.01, 0.12);
  const g = new THREE.CylinderGeometry(r, r * 1.25, h, 8);
  g.translate(0, h / 2, 0);
  const top = new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.02, 8);
  top.translate(0, h + 0.01, 0);
  const parts = [part(g, { color: bark, jitter: 0.05 }), part(top, { color: tone(rng, 0xb09068, 0.01, 0.1) })];
  for (let k = 1; k <= 2; k++) parts.push(part(T(new THREE.CylinderGeometry(r * 0.3 * k, r * 0.3 * k, 0.022, 8, 1, true), 0, h + 0.012, 0), { color: 0x8a6c4a }));
  roots(rng, parts, r * 0.8, bark);
  if (rng.chance(0.35)) parts.push(mushrooms(rng).translate(r * 1.1, 0, 0));
  return finish(parts.map((p) => (p.attributes.aH ? (p.deleteAttribute('aH'), p.deleteAttribute('normal'), p) : p)));
}

export function snowPine(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunkH = rng.range(1.8, 2.6);
  const bark = tone(rng, 0x45342a, 0.01, 0.1);
  parts.push(part(T(new THREE.CylinderGeometry(0.13, 0.24, trunkH + 2, 6), 0, (trunkH + 2) / 2, 0), { color: bark, jitter: 0.05 }));
  const tiers = rng.int(4, 7);
  let y = trunkH;
  let r = rng.range(1.6, 2.3);
  const snowy = rng.range(0.6, 0.95);
  for (let i = 0; i < tiers; i++) {
    const h = rng.range(1.8, 2.4);
    const cone = new THREE.ConeGeometry(r, h, seg(rng.int(7, 9), 6), 1, true);
    cone.rotateY(rng.range(0, Math.PI));
    parts.push(part(T(cone, 0, y + h / 2, 0), { color: tone(rng, 0x24392c, 0.01, 0.1), jitter: 0.3, vary: 0.2, shadeBottom: 0.35 }));
    const cap = new THREE.ConeGeometry(r * snowy, h * 0.45, seg(8, 6), 1, true);
    parts.push(part(T(cap, 0, y + h * 0.78, 0), { color: 0xeef2f6, jitter: 0.22, vary: 0.08 }));
    y += h * 0.52;
    r *= 0.75;
  }
  return finish(parts);
}

export function herb(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const flower = rng.pick([0xf2eedf, 0xe8e0c8, 0xd9c8f0, 0xf4e4a0]);
  for (let i = 0; i < 7; i++) {
    const h = rng.range(0.35, 0.6);
    parts.push(part(T(new THREE.CylinderGeometry(0.015, 0.02, h, 3), rng.range(-0.15, 0.15), h / 2, rng.range(-0.15, 0.15)), { color: 0x4d7a35 }));
    const p = parts[parts.length - 1];
    p.computeBoundingBox();
    const bb = p.boundingBox!;
    const head = new THREE.IcosahedronGeometry(0.08, 0);
    head.scale(1.3, 0.5, 1.3);
    parts.push(part(T(head, (bb.min.x + bb.max.x) / 2, h, (bb.min.z + bb.max.z) / 2), { color: flower }));
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
  const cols = [0x6e6a64, 0x7b4b33, 0x5d6166, 0x8a5a3c, 0x4e5a63, 0x6a3a2a];
  for (let i = 0; i < rng.int(6, 9); i++) {
    const r = rng.float();
    const g = r < 0.3 ? new THREE.CylinderGeometry(0.12, 0.12, rng.range(0.3, 0.9), 7) : r < 0.45 ? new THREE.TorusGeometry(0.2, 0.06, 4, 8) : new THREE.BoxGeometry(rng.range(0.3, 0.9), rng.range(0.05, 0.3), rng.range(0.3, 0.7));
    g.rotateZ(rng.range(-0.8, 0.8));
    g.rotateY(rng.range(0, Math.PI));
    parts.push(part(T(g, rng.range(-0.5, 0.5), rng.range(0.1, 0.45), rng.range(-0.3, 0.3)), { color: rng.pick(cols), jitter: 0.04 }));
  }
  return finish(parts);
}

/** Reeds with cattail heads. */
export function reeds(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < rng.int(10, 14); i++) {
    const h = rng.range(0.8, 1.5);
    const blade = new THREE.ConeGeometry(0.035, h, 3, 1, true);
    blade.translate(0, h / 2, 0);
    blade.rotateZ(rng.range(-0.25, 0.25));
    const x = rng.range(-0.3, 0.3);
    const z = rng.range(-0.3, 0.3);
    parts.push(part(T(blade, x, 0, z), { color: rng.pick([0x8a8f4a, 0x9d9a58, 0x76803e]), shadeBottom: 0.5 }));
    if (rng.chance(0.3)) parts.push(part(T(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 5), x, h * 0.85, z), { color: 0x5a3a22 }));
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
/** Tree kinds that get a low-detail twin for distant chunks. */
export const LOD_KINDS: VegKind[] = ['pine', 'broadleaf', 'birch', 'dead', 'snowpine'];

/** Shared geometry variants for every vegetation kind, built once (plus LODs for trees). */
export class VegetationLibrary {
  readonly variants: Record<VegKind, THREE.BufferGeometry[]>;
  /** Low-detail twins of the tree variants (same shapes, far fewer triangles). */
  readonly lod: Partial<Record<VegKind, THREE.BufferGeometry[]>> = {};

  constructor(seed: number) {
    const fns: [VegKind, number, (r: Rng) => THREE.BufferGeometry][] = [
      ['pine', 9, pine],
      ['broadleaf', 9, broadleaf],
      ['birch', 6, birch],
      ['dead', 4, deadTree],
      ['bush', 6, (r) => bush(r, false)],
      ['berrybush', 3, (r) => bush(r, true)],
      ['snowpine', 6, snowPine],
      ['herb', 3, herb],
      ['sticks', 3, sticks],
      ['scrap', 4, scrap],
      ['reeds', 3, reeds],
      ['drift', 3, snowDrift],
      ['fern', 6, fern],
      ['grass', 6, (r) => grassTuft(r, false)],
      ['flowers', 8, (r) => grassTuft(r, true)],
      ['rock', 10, (r) => rock(r)],
      ['log', 4, fallenLog],
      ['stump', 4, stump],
    ];
    this.variants = {} as Record<VegKind, THREE.BufferGeometry[]>;
    fns.forEach(([kind, n, f], ki) => {
      const make = (v: number) => f(new Rng((seed ^ 0xabcdef) + ki * 7919 + v * 104729));
      this.variants[kind] = Array.from({ length: n }, (_, v) => make(v));
      if (LOD_KINDS.includes(kind)) {
        LOW = true;
        try {
          this.lod[kind] = Array.from({ length: n }, (_, v) => make(v));
        } finally {
          LOW = false;
        }
      }
    });
  }
}
