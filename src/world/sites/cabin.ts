import * as THREE from 'three';
import { worldUvBox } from '../../render/textures';
import { fadeMaterial, type Fadeable, mesh, oneway, type SiteContext, solid } from './kit';

export interface CabinSpec {
  x: number;
  width: number;
  /** Wall height above the floor. */
  height: number;
  zBack: number;
  zFront: number;
  loft?: { x0: number; x1: number; height: number };
}

export interface CabinResult {
  group: THREE.Group;
  /** World y of the floor surface. */
  floorY: number;
  /** World x of the cabin centre. */
  x: number;
}

const FLOOR = 0.4;
const DOOR_H = 2.35;
const DOOR_HALF = 1.0;

/**
 * A cut-away timber cabin straddling the gameplay plane. Doorways in the side walls let the
 * player walk through; the front wall and front roof slope fade out while the player is inside.
 */
export function buildCabin(ctx: SiteContext, spec: CabinSpec): CabinResult {
  const { mats, terrain } = ctx;
  const g = terrain.heightAt(spec.x);
  const group = new THREE.Group();
  group.position.set(spec.x, g, 0);
  ctx.group.add(group);

  const W = spec.width;
  const H = spec.height;
  const zb = spec.zBack;
  const zf = spec.zFront;
  const D = zf - zb;
  const zc = (zf + zb) / 2;
  const fy = FLOOR;

  // Foundation + floor
  for (const sx of [-1, 1]) {
    for (const z of [zb + 0.4, zf - 0.4]) mesh(worldUvBox(0.7, 1.2, 0.7), mats.stone, sx * (W / 2 - 0.35), -0.4, z, group);
  }
  mesh(worldUvBox(W, 0.3, D, 1.4), mats.woodDark, 0, fy - 0.15, zc, group);
  // Steps at both doors
  for (const sx of [-1, 1]) mesh(worldUvBox(0.7, 0.2, 2.2), mats.woodDark, sx * (W / 2 + 0.35), 0.1, 0, group);

  // Back wall
  mesh(worldUvBox(W, H, 0.25), mats.wood, 0, fy + H / 2, zb + 0.125, group);
  // Back window (dark glass in a frame)
  const win = new THREE.Group();
  win.position.set(W * 0.18, fy + 1.9, zb + 0.27);
  group.add(win);
  mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshStandardMaterial({ color: 0x1d2a30, roughness: 0.2, metalness: 0.3 }), 0, 0, 0, win, false);
  for (const [w, h, x, y] of [
    [1.6, 0.12, 0, 0.56],
    [1.6, 0.12, 0, -0.56],
    [0.12, 1.2, 0.74, 0],
    [0.12, 1.2, -0.74, 0],
    [0.06, 1.0, 0, 0],
  ] as const) {
    mesh(new THREE.BoxGeometry(w, h, 0.08), mats.woodDark, x, y, 0.02, win);
  }

  // Side walls with doorways at the gameplay plane
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.125);
    const backLen = -DOOR_HALF - zb;
    const frontLen = zf - DOOR_HALF;
    mesh(worldUvBox(0.25, H, backLen), mats.wood, x, fy + H / 2, zb + backLen / 2, group);
    mesh(worldUvBox(0.25, H, frontLen), mats.wood, x, fy + H / 2, DOOR_HALF + frontLen / 2, group);
    mesh(worldUvBox(0.25, H - DOOR_H, DOOR_HALF * 2), mats.wood, x, fy + DOOR_H + (H - DOOR_H) / 2, 0, group);
    // Door leaf, swung open outward
    const door = new THREE.Group();
    door.position.set(sx * (W / 2 + 0.05), fy, -DOOR_HALF);
    door.rotation.y = sx * (Math.PI - 0.12);
    group.add(door);
    mesh(worldUvBox(0.08, DOOR_H - 0.05, DOOR_HALF * 2 - 0.1), mats.woodDark, 0, (DOOR_H - 0.05) / 2, DOOR_HALF - 0.05, door);
    solid(ctx, spec.x + x - 0.15, spec.x + x + 0.15, g + fy + DOOR_H, g + fy + H, 'wood');
  }

  // Front wall with two window openings — fades when inside.
  const frontMat = fadeMaterial(mats.wood);
  const postMat = fadeMaterial(mats.woodDark);
  const front = new THREE.Group();
  front.position.set(0, fy, zf - 0.1);
  group.add(front);
  mesh(worldUvBox(W, 1.0, 0.2), frontMat, 0, 0.5, 0, front);
  mesh(worldUvBox(W, H - 2.2, 0.2), frontMat, 0, 2.2 + (H - 2.2) / 2, 0, front);
  const winW = 1.5;
  const wins = [-W * 0.22, W * 0.24];
  const edges = [-W / 2, ...wins.flatMap((c) => [c - winW / 2, c + winW / 2]), W / 2];
  for (let i = 0; i < edges.length; i += 2) {
    const w = edges[i + 1] - edges[i];
    if (w > 0.01) mesh(worldUvBox(w, 1.2, 0.2), frontMat, (edges[i] + edges[i + 1]) / 2, 1.6, 0, front);
  }
  for (const c of wins) mesh(new THREE.BoxGeometry(winW + 0.2, 0.1, 0.35), postMat, c, 1.02, 0.05, front);
  // Corner posts
  for (const sx of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(0.16, 0.18, H + 0.3, 7), postMat, sx * (W / 2), H / 2, 0.05, front);
    mesh(new THREE.CylinderGeometry(0.16, 0.18, H + 0.3, 7), mats.woodDark, sx * (W / 2), fy + H / 2, zb + 0.1, group);
  }

  // Roof: gable along x. Front slope fades.
  const ridgeZ = (zb + zf) / 2;
  const ridgeY = fy + H + 2.1;
  const eave = 0.7;
  const roofMat = fadeMaterial(mats.roof);
  const slope = (z0: number, y0: number, z1: number, y1: number, mat: THREE.Material) => {
    const len = Math.hypot(z1 - z0, y1 - y0);
    const m = mesh(worldUvBox(W + 1.0, 0.16, len, 2), mat, 0, (y0 + y1) / 2, (z0 + z1) / 2, group);
    m.rotation.x = Math.atan2(y1 - y0, z0 - z1);
    return m;
  };
  slope(zf + eave, fy + H - 0.35, ridgeZ, ridgeY, roofMat);
  slope(ridgeZ, ridgeY, zb - eave, fy + H - 0.35, mats.roof);
  mesh(new THREE.CylinderGeometry(0.12, 0.12, W + 1.1, 6).rotateZ(Math.PI / 2), mats.woodDark, 0, ridgeY + 0.05, ridgeZ, group);
  // Gable ends
  const gableShape = new THREE.Shape();
  gableShape.moveTo(zb, 0);
  gableShape.lineTo(zf, 0);
  gableShape.lineTo(ridgeZ, ridgeY - fy - H);
  gableShape.closePath();
  for (const sx of [-1, 1]) {
    const geo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.2, bevelEnabled: false });
    geo.rotateY(-Math.PI / 2);
    mesh(geo, mats.wood, sx * (W / 2) + 0.1, fy + H, 0, group);
  }
  // Ceiling beams (visible inside)
  for (let bx = -W / 2 + 1.5; bx < W / 2; bx += 2.5) {
    mesh(new THREE.BoxGeometry(0.2, 0.25, D), mats.woodDark, bx, fy + H - 0.12, zc, group);
  }
  solid(ctx, spec.x - W / 2 - 0.3, spec.x + W / 2 + 0.3, g + fy + H, g + fy + H + 0.5, 'wood');

  // Floor collider — raised wooden floor
  solid(ctx, spec.x - W / 2, spec.x + W / 2, g - 3, g + fy, 'wood');

  // Optional loft (one-way platform reached by jumping from furniture)
  if (spec.loft) {
    const L = spec.loft;
    const lw = L.x1 - L.x0;
    mesh(worldUvBox(lw, 0.18, D - 0.4, 1.4), mats.woodDark, (L.x0 + L.x1) / 2, fy + L.height - 0.09, zc, group);
    mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), mats.woodDark, L.x1 - 0.06, fy + L.height + 0.45, zf - 0.4, group);
    mesh(new THREE.BoxGeometry(0.1, 0.1, D - 0.6), mats.woodDark, L.x1 - 0.06, fy + L.height + 0.9, zc, group);
    for (const z of [zb + 0.6, zf - 0.6]) mesh(new THREE.BoxGeometry(0.2, L.height, 0.2), mats.woodDark, L.x1 - 0.1, fy + L.height / 2, z, group);
    // Ladder
    const ladder = new THREE.Group();
    ladder.position.set(L.x1 + 0.35, fy, -1.6);
    ladder.rotation.z = -0.15;
    group.add(ladder);
    for (const lz of [-0.25, 0.25]) mesh(new THREE.BoxGeometry(0.07, L.height + 0.6, 0.07), mats.woodDark, 0, (L.height + 0.6) / 2, lz, ladder);
    for (let r = 0.35; r < L.height + 0.4; r += 0.38) mesh(new THREE.BoxGeometry(0.06, 0.05, 0.56), mats.woodDark, 0, r, 0, ladder);
    oneway(ctx, spec.x + L.x0, spec.x + L.x1, g + fy + L.height, 'wood');
  }

  // Cut-away fade region
  const fade: Fadeable = {
    x0: spec.x - W / 2 - 0.4,
    x1: spec.x + W / 2 + 0.4,
    y0: g - 0.5,
    y1: g + fy + H + 1,
    materials: [frontMat, postMat, roofMat],
    meshes: [],
    opacity: 1,
  };
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && fade.materials.includes(m.material as THREE.Material)) fade.meshes.push(m);
  });
  ctx.fadeables.push(fade);

  return { group, floorY: g + fy, x: spec.x };
}

/** Simple furniture helpers placed in cabin-local coordinates (floor at y = 0.4). */
export const furniture = {
  table(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, w = 1.8): number {
    const top = FLOOR + 0.85;
    mesh(worldUvBox(w, 0.08, 0.9), ctx.mats.woodDark, x, top - 0.04, z, parent);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.08, 0.81, 0.08), ctx.mats.woodDark, x + sx * (w / 2 - 0.1), FLOOR + 0.4, z + sz * 0.35, parent);
    return top;
  },
  chair(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, rot = 0): void {
    const c = new THREE.Group();
    c.position.set(x, FLOOR, z);
    c.rotation.y = rot;
    parent.add(c);
    mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), ctx.mats.woodDark, 0, 0.48, 0, c);
    mesh(new THREE.BoxGeometry(0.5, 0.55, 0.06), ctx.mats.woodDark, 0, 0.78, -0.22, c);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.05, 0.48, 0.05), ctx.mats.woodDark, sx * 0.2, 0.24, sz * 0.2, c);
  },
  bed(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number): void {
    mesh(worldUvBox(2.1, 0.35, 1.0), ctx.mats.woodDark, x, FLOOR + 0.25, z, parent);
    mesh(new THREE.BoxGeometry(1.95, 0.16, 0.9), ctx.mats.cloth, x, FLOOR + 0.5, z, parent);
    mesh(new THREE.BoxGeometry(1.3, 0.1, 0.92), ctx.mats.fabric, x + 0.3, FLOOR + 0.6, z, parent);
    mesh(new THREE.BoxGeometry(0.45, 0.12, 0.6), ctx.mats.bone, x - 0.72, FLOOR + 0.63, z, parent);
  },
  stove(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, h: number): void {
    mesh(new THREE.BoxGeometry(0.8, 0.8, 0.7), ctx.mats.metal, x, FLOOR + 0.4, z, parent);
    mesh(new THREE.CylinderGeometry(0.09, 0.09, h + 1.5, 8), ctx.mats.metal, x, FLOOR + 0.8 + (h + 1.5) / 2, z - 0.15, parent);
  },
  shelf(ctx: SiteContext, parent: THREE.Object3D, x: number, y: number, z: number, w = 1.6): void {
    mesh(new THREE.BoxGeometry(w, 0.06, 0.35), ctx.mats.woodDark, x, y, z, parent);
    const cols = [0x6b4b2e, 0x3f5a6b, 0x7a6a3a, 0x5a3a3a];
    for (let i = 0; i < 5; i++) {
      const hh = 0.18 + ((i * 37) % 10) / 60;
      mesh(new THREE.BoxGeometry(0.12, hh, 0.22), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.9 }), x - w / 2 + 0.2 + i * 0.16, y + 0.03 + hh / 2, z, parent);
    }
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), ctx.mats.metal, x + w / 2 - 0.3, y + 0.13, z, parent);
  },
  crate(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, s = 0.8, y = FLOOR): void {
    mesh(worldUvBox(s, s, s, 0.8), ctx.mats.woodDark, x, y + s / 2, z, parent);
  },
  rug(_ctx: SiteContext, parent: THREE.Object3D, x: number, z: number): void {
    mesh(new THREE.BoxGeometry(2.6, 0.02, 1.6), new THREE.MeshStandardMaterial({ color: 0x6e3a2a, roughness: 1 }), x, FLOOR + 0.01, z, parent, false);
  },
  paper(ctx: SiteContext, parent: THREE.Object3D, x: number, y: number, z: number, rot = 0.2): THREE.Mesh {
    const m = mesh(new THREE.BoxGeometry(0.32, 0.01, 0.42), ctx.mats.paper, x, y + 0.006, z, parent, false);
    m.rotation.y = rot;
    return m;
  },
};

export { FLOOR as CABIN_FLOOR };
