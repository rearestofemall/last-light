import * as THREE from 'three';
import { smoothstep } from '../core/math';

/** Up to two bone influences for a vertex: [boneA, weightA, boneB, weightB]. */
export type Influence = [number, number, number, number];
/** Maps a rest-pose vertex position to its bone influences. */
export type SkinFn = (p: THREE.Vector3) => Influence;

/** Every vertex on one bone. */
export const rigid =
  (bone: number): SkinFn =>
  () => [bone, 1, bone, 0];

/**
 * A chain of bones laid along an axis (e.g. upper arm → forearm → hand). `segments` lists each
 * bone with the distance along `axis` (from `origin`) where it starts, in increasing order.
 * Vertices within `blend` of a boundary are shared between the two bones, so joints bend smoothly.
 */
export function along(origin: THREE.Vector3, axis: THREE.Vector3, segments: [number, number][], blend: number): SkinFn {
  const d = new THREE.Vector3();
  return (p) => {
    const s = d.subVectors(p, origin).dot(axis);
    let k = 0;
    while (k + 1 < segments.length && s >= segments[k + 1][1]) k++;
    const next = segments[k + 1];
    if (next && s > next[1] - blend) {
      const w = smoothstep(next[1] - blend, next[1] + blend, s);
      return [segments[k][0], 1 - w, next[0], w];
    }
    const cur = segments[k];
    if (k > 0 && s < cur[1] + blend) {
      const w = smoothstep(cur[1] - blend, cur[1] + blend, s);
      return [segments[k - 1][0], 1 - w, cur[0], w];
    }
    return [cur[0], 1, cur[0], 0];
  };
}

export interface Ring {
  /** Height of the ring. */
  y: number;
  /** Half-width (x) and half-depth (z). */
  rx: number;
  rz: number;
  /** Centre offset. */
  x?: number;
  z?: number;
  /** Superellipse exponent: 2 = ellipse, higher = squarer (cloth over a boxy frame). */
  n?: number;
}

/**
 * A closed tube through a list of horizontal rings (bottom to top or top to bottom), capped at
 * both ends. The workhorse for torsos, limbs, sleeves and boots.
 */
export function loft(rings: Ring[], seg = 8, caps = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const pts = rings.map((r) => {
    const out: THREE.Vector3[] = [];
    const e = 2 / (r.n ?? 2);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2 + Math.PI / seg;
      const c = Math.cos(a);
      const s = Math.sin(a);
      out.push(new THREE.Vector3((r.x ?? 0) + r.rx * Math.sign(c) * Math.abs(c) ** e, r.y, (r.z ?? 0) + r.rz * Math.sign(s) * Math.abs(s) ** e));
    }
    return out;
  });
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const up = rings.length > 1 && rings[rings.length - 1].y > rings[0].y;
  for (let k = 0; k + 1 < pts.length; k++) {
    const A = pts[k];
    const B = pts[k + 1];
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      if (up) {
        tri(A[i], B[j], A[j]);
        tri(A[i], B[i], B[j]);
      } else {
        tri(A[i], A[j], B[j]);
        tri(A[i], B[j], B[i]);
      }
    }
  }
  if (caps) {
    const cap = (ring: THREE.Vector3[], top: boolean) => {
      const c = ring.reduce((m, v) => m.add(v), new THREE.Vector3()).multiplyScalar(1 / ring.length);
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        if (top) tri(c, ring[j], ring[i]);
        else tri(c, ring[i], ring[j]);
      }
    };
    cap(pts[0], !up);
    cap(pts[pts.length - 1], up);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** A lofted tube from `a` to `b`; profile entries are [t (0–1 along), rx, rz?]. */
export function tube(a: THREE.Vector3, b: THREE.Vector3, profile: [number, number, number?][], seg = 7): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const L = d.length();
  const g = loft(
    profile.map(([t, rx, rz]) => ({ y: t * L, rx, rz: rz ?? rx })),
    seg,
  );
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Low-poly ellipsoid centred at (x, y, z). */
export function ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number, w = 8, h = 6): THREE.BufferGeometry {
  return new THREE.SphereGeometry(1, w, h).scale(rx, ry, rz).translate(x, y, z);
}

/** Cone pointing along +y from its base centre (x, y, z). */
export function cone(x: number, y: number, z: number, r: number, h: number, seg = 5): THREE.BufferGeometry {
  return new THREE.ConeGeometry(r, h, seg).translate(x, y + h / 2, z);
}

/** Box centred at (x, y, z) with optional subdivisions (for deforming). */
export function box(w: number, h: number, d: number, x: number, y: number, z: number, segs: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d, ...segs).translate(x, y, z);
}

/** Moves every vertex through `fn` (in place). */
export function deform(g: THREE.BufferGeometry, fn: (v: THREE.Vector3) => void): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  return g;
}

/** Cheap deterministic hash for per-face shade variation. */
function hash(a: number, b: number, c: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Accumulates coloured, skinned parts into a single geometry: the whole character is one
 * draw call with flat shading. Each triangle gets a slight random shade so the low-poly
 * facets read like hand-painted cloth.
 */
export class MeshKit {
  private pos: number[] = [];
  private col: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];
  private v = new THREE.Vector3();
  private c = new THREE.Color();

  add(geo: THREE.BufferGeometry, color: number, skin: SkinFn, shade = 0.06): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position as THREE.BufferAttribute;
    const base = this.c.setHex(color);
    for (let t = 0; t + 2 < p.count; t += 3) {
      this.v.fromBufferAttribute(p, t);
      const k = 1 + (hash(this.v.x, this.v.y, this.v.z) - 0.5) * shade;
      for (let i = t; i < t + 3; i++) {
        this.v.fromBufferAttribute(p, i);
        this.pos.push(this.v.x, this.v.y, this.v.z);
        this.col.push(base.r * k, base.g * k, base.b * k);
        const [a, wa, b, wb] = skin(this.v);
        this.si.push(a, b, 0, 0);
        const sum = wa + wb || 1;
        this.sw.push(wa / sum, wb / sum, 0, 0);
      }
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  /**
   * Like add(), but each triangle's colour comes from `paint(centroid)` — for coat
   * markings (darker saddles, pale bellies, spots) baked into one material.
   */
  addPainted(geo: THREE.BufferGeometry, paint: (c: THREE.Vector3) => number, skin: SkinFn, shade = 0.07): void {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position as THREE.BufferAttribute;
    const cen = new THREE.Vector3();
    for (let t = 0; t + 2 < p.count; t += 3) {
      cen.set(0, 0, 0);
      for (let i = t; i < t + 3; i++) cen.add(this.v.fromBufferAttribute(p, i));
      cen.multiplyScalar(1 / 3);
      const base = this.c.setHex(paint(cen));
      const k = 1 + (hash(cen.x, cen.y, cen.z) - 0.5) * shade;
      for (let i = t; i < t + 3; i++) {
        this.v.fromBufferAttribute(p, i);
        this.pos.push(this.v.x, this.v.y, this.v.z);
        this.col.push(base.r * k, base.g * k, base.b * k);
        const [a, wa, b, wb] = skin(this.v);
        this.si.push(a, b, 0, 0);
        const sum = wa + wb || 1;
        this.sw.push(wa / sum, wb / sum, 0, 0);
      }
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
