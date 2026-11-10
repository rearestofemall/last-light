import * as THREE from 'three';
import { paintedPlankTexture, worldUvBox } from '../../render/textures';
import { fadeMaterial, type Fadeable, mesh, oneway, type SiteContext, type SiteMaterials, solid } from './kit';

export type HouseStyle = 'timber' | 'cottage' | 'brick' | 'concrete' | 'station' | 'hut';

export interface CabinSpec {
  x: number;
  width: number;
  /** Storey height above each floor. */
  height: number;
  zBack: number;
  zFront: number;
  floors?: number;
  style?: HouseStyle;
  roof?: 'gable' | 'flat';
  loft?: { x0: number; x1: number; height: number };
  /** Override ground height (e.g. for buildings set into a slope). */
  ground?: number;
  /** Omit the doorway on one side (e.g. tower against a cliff). */
  noDoor?: 'left' | 'right';
  /** Depth position of the building (0 = on the road). */
  z?: number;
  /** Painted bands across the facade every other storey (lighthouse). */
  bands?: THREE.MeshStandardMaterial;
}

export interface CabinResult {
  group: THREE.Group;
  /** World y of the ground-floor surface. */
  floorY: number;
  /** World x of the centre. */
  x: number;
  /** World y of each storey's floor. */
  storeys: number[];
}

const FLOOR = 0.4;
const DOOR_H = 2.35;
const DOOR_HALF = 1.0;

const styleCache = new Map<string, { wall: THREE.Material; trim: THREE.Material; roof: THREE.Material }>();

function styleMats(mats: SiteMaterials, style: HouseStyle) {
  const k = style;
  let s = styleCache.get(k);
  if (s) return s;
  const tint = (m: THREE.MeshStandardMaterial, c: number) => {
    const n = m.clone();
    n.color.setHex(c);
    return n;
  };
  switch (style) {
    case 'cottage': {
      const painted = mats.wood.clone();
      painted.map = paintedPlankTexture();
      painted.color.setHex(0xffffff);
      s = { wall: painted, trim: tint(mats.woodDark, 0x5f7684), roof: tint(mats.roof, 0xa89488) };
      break;
    }
    case 'brick':
      s = { wall: tint(mats.brick, 0xf2e6de), trim: tint(mats.concrete, 0x8d8a83), roof: mats.concrete };
      break;
    case 'concrete':
      s = { wall: tint(mats.concrete, 0xb2aea4), trim: tint(mats.concrete, 0x77746d), roof: tint(mats.concrete, 0x6c6a66) };
      break;
    case 'station':
      s = { wall: tint(mats.metal, 0xa9b0b5), trim: tint(mats.metal, 0x58616a), roof: tint(mats.metal, 0x7d868e) };
      break;
    case 'hut':
      s = { wall: tint(mats.wood, 0x9f8466), trim: mats.woodDark, roof: tint(mats.roof, 0xd9dde2) };
      break;
    default:
      s = { wall: mats.wood, trim: mats.woodDark, roof: mats.roof };
  }
  styleCache.set(k, s);
  return s;
}

/**
 * A cut-away building straddling the gameplay plane. Doorways in the side walls let the
 * player walk through; internal stair ledges link storeys. The front wall and roof fade
 * out while the player is inside.
 */
export function buildCabin(ctx: SiteContext, spec: CabinSpec): CabinResult {
  const { mats, terrain } = ctx;
  const oz = spec.z ?? 0;
  const g = spec.ground ?? terrain.heightAt3(spec.x, oz);
  const group = new THREE.Group();
  group.position.set(spec.x, g, oz);
  ctx.group.add(group);
  const base = styleMats(mats, spec.style ?? 'timber');
  // Per-building clones so the whole shell can fade while the player is inside.
  const wallFade = fadeMaterial(base.wall);
  const trimFade = fadeMaterial(base.trim);
  const roofBackFade = fadeMaterial(base.roof);
  const st = { wall: wallFade, trim: trimFade, roof: roofBackFade };

  const W = spec.width;
  const H = spec.height;
  const nf = spec.floors ?? 1;
  const TH = H * nf;
  const zb = spec.zBack;
  const zf = spec.zFront;
  const D = zf - zb;
  const zc = (zf + zb) / 2;
  const fy = FLOOR;
  const storeys: number[] = [];
  for (let i = 0; i < nf; i++) storeys.push(g + fy + i * H);

  // Foundation + floor
  for (const sx of [-1, 1]) for (const z of [zb + 0.4, zf - 0.4]) mesh(worldUvBox(0.7, 1.4, 0.7), mats.stone, sx * (W / 2 - 0.35), -0.5, z, group);
  mesh(worldUvBox(W, 0.3, D, 1.4), mats.woodDark, 0, fy - 0.15, zc, group);
  for (const sx of [-1, 1]) if (spec.noDoor !== (sx < 0 ? 'left' : 'right')) mesh(worldUvBox(0.7, 0.2, 2.2), mats.woodDark, sx * (W / 2 + 0.35), 0.1, 0, group);
  solid(ctx, spec.x - W / 2, spec.x + W / 2, g - 3, g + fy, 'wood', undefined, zb + oz, zf + oz);

  // Back wall
  mesh(worldUvBox(W, TH, 0.25), st.wall, 0, fy + TH / 2, zb + 0.125, group);
  for (let i = 0; i < nf; i++) {
    for (const wx of nf > 1 || W > 10 ? [-W * 0.25, W * 0.25] : [W * 0.18]) {
      const win = new THREE.Group();
      win.position.set(wx, fy + i * H + 1.9, zb + 0.27);
      group.add(win);
      mesh(new THREE.PlaneGeometry(1.4, 1.0), mats.glass, 0, 0, 0, win, false);
      for (const [w, h, x, y] of [
        [1.6, 0.12, 0, 0.56],
        [1.6, 0.12, 0, -0.56],
        [0.12, 1.2, 0.74, 0],
        [0.12, 1.2, -0.74, 0],
      ] as const) {
        mesh(new THREE.BoxGeometry(w, h, 0.08), st.trim, x, y, 0.02, win);
      }
    }
  }

  // Side walls with doorways on the ground floor (solid above).
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.125);
    const backLen = -DOOR_HALF - zb;
    const frontLen = zf - DOOR_HALF;
    const blocked = spec.noDoor === (sx < 0 ? 'left' : 'right');
    if (blocked) {
      mesh(worldUvBox(0.25, TH, D), st.wall, x, fy + TH / 2, zc, group);
      solid(ctx, spec.x + x - 0.15, spec.x + x + 0.15, g + fy, g + fy + TH, 'wood', undefined, zb + oz, zf + oz);
      continue;
    }
    mesh(worldUvBox(0.25, H, backLen), st.wall, x, fy + H / 2, zb + backLen / 2, group);
    mesh(worldUvBox(0.25, H, frontLen), st.wall, x, fy + H / 2, DOOR_HALF + frontLen / 2, group);
    mesh(worldUvBox(0.25, TH - DOOR_H, DOOR_HALF * 2), st.wall, x, fy + DOOR_H + (TH - DOOR_H) / 2, 0, group);
    if (nf > 1) {
      mesh(worldUvBox(0.25, TH - H, backLen), st.wall, x, fy + H + (TH - H) / 2, zb + backLen / 2, group);
      mesh(worldUvBox(0.25, TH - H, frontLen), st.wall, x, fy + H + (TH - H) / 2, DOOR_HALF + frontLen / 2, group);
    }
    const door = new THREE.Group();
    door.position.set(sx * (W / 2 + 0.05), fy, -DOOR_HALF);
    door.rotation.y = sx * (Math.PI - 0.12);
    group.add(door);
    mesh(worldUvBox(0.08, DOOR_H - 0.05, DOOR_HALF * 2 - 0.1), st.trim, 0, (DOOR_H - 0.05) / 2, DOOR_HALF - 0.05, door);
    // Wall segments either side of the doorway, and the lintel above it.
    solid(ctx, spec.x + x - 0.15, spec.x + x + 0.15, g + fy + DOOR_H, g + fy + TH, 'wood', undefined, -DOOR_HALF + oz, DOOR_HALF + oz);
    solid(ctx, spec.x + x - 0.15, spec.x + x + 0.15, g + fy, g + fy + TH, 'wood', undefined, zb + oz, -DOOR_HALF + oz);
    solid(ctx, spec.x + x - 0.15, spec.x + x + 0.15, g + fy, g + fy + TH, 'wood', undefined, DOOR_HALF + oz, zf + oz);
  }

  // Front wall with window openings — fades when inside.
  const frontMat = fadeMaterial(st.wall);
  const postMat = fadeMaterial(st.trim);
  const roofMat = fadeMaterial(st.roof);
  const front = new THREE.Group();
  front.position.set(0, fy, zf - 0.1);
  group.add(front);
  for (let i = 0; i < nf; i++) {
    const y0 = i * H;
    mesh(worldUvBox(W, 1.0, 0.2), frontMat, 0, y0 + 0.5, 0, front);
    mesh(worldUvBox(W, H - 2.2, 0.2), frontMat, 0, y0 + 2.2 + (H - 2.2) / 2, 0, front);
    const winW = 1.5;
    const wins = W > 10 ? [-W * 0.3, 0, W * 0.3] : [-W * 0.22, W * 0.24];
    const edges = [-W / 2, ...wins.flatMap((c) => [c - winW / 2, c + winW / 2]), W / 2];
    for (let k = 0; k < edges.length; k += 2) {
      const w = edges[k + 1] - edges[k];
      if (w > 0.01) mesh(worldUvBox(w, 1.2, 0.2), frontMat, (edges[k] + edges[k + 1]) / 2, y0 + 1.6, 0, front);
    }
    for (const c of wins) mesh(new THREE.BoxGeometry(winW + 0.2, 0.1, 0.35), postMat, c, y0 + 1.02, 0.05, front);
  }
  const fadeExtra: THREE.Material[] = [];
  if (spec.bands) {
    const bandMat = fadeMaterial(spec.bands);
    fadeExtra.push(bandMat);
    for (let i = 1; i < nf; i += 2) mesh(worldUvBox(W + 0.1, 0.8, 0.3), bandMat, 0, i * H + 2.6, 0.05, front);
  }
  for (const sx of [-1, 1]) {
    mesh(new THREE.CylinderGeometry(0.16, 0.18, TH + 0.3, 7), postMat, sx * (W / 2), TH / 2, 0.05, front);
    mesh(new THREE.CylinderGeometry(0.16, 0.18, TH + 0.3, 7), st.trim, sx * (W / 2), fy + TH / 2, zb + 0.1, group);
  }

  // Upper floors: one-way slabs (S/Z + Space drops through) reached by walkable flights of
  // solid steps. Flights alternate between two strips along the back wall so a flight never
  // sits over the head of the one below; each slab has a stairwell over its arriving flight.
  const RUN = 0.62;
  for (let i = 1; i < nf; i++) {
    const y = fy + i * H;
    const left = i % 2 === 1;
    const steps = Math.ceil(H / 0.5);
    const rise = H / steps;
    const len = steps * RUN;
    const fz0 = left ? zb + 0.25 : zb + 1.45;
    const fz1 = fz0 + 1.2;
    const fx0 = left ? -W / 2 + 0.3 : W / 2 - 0.3 - len;
    for (let k = 1; k <= steps; k++) {
      const top = y - H + k * rise;
      const sx0 = left ? fx0 + (k - 1) * RUN : fx0 + len - k * RUN;
      mesh(worldUvBox(RUN, k * rise, fz1 - fz0, 0.8), mats.woodDark, sx0 + RUN / 2, y - H + (k * rise) / 2, (fz0 + fz1) / 2, group);
      solid(ctx, spec.x + sx0, spec.x + sx0 + RUN, g + y - H, g + top, 'wood', undefined, fz0 + oz, fz1 + oz);
    }
    // Slab with a stairwell over the flight.
    const X0 = -W / 2 + 0.15;
    const X1 = W / 2 - 0.15;
    const Z0 = zb;
    const Z1 = zf;
    const hx0 = fx0;
    const hx1 = fx0 + len;
    const rects: [number, number, number, number][] = [
      [X0, X1, fz1, Z1],
      [X0, X1, Z0, fz0],
      [X0, hx0, fz0, fz1],
      [hx1, X1, fz0, fz1],
    ];
    for (const [x0, x1, z0, z1] of rects) {
      if (x1 - x0 < 0.05 || z1 - z0 < 0.05) continue;
      mesh(worldUvBox(x1 - x0, 0.22, z1 - z0, 1.4), mats.woodDark, (x0 + x1) / 2, y - 0.11, (z0 + z1) / 2, group);
      oneway(ctx, spec.x + x0, spec.x + x1, g + y, 'wood', undefined, z0 + oz, z1 + oz);
    }
  }

  // Roof
  const roofTop = fy + TH;
  const ridgeZ = (zb + zf) / 2;
  if ((spec.roof ?? 'gable') === 'gable') {
    const ridgeY = roofTop + 2.1;
    const eave = 0.7;
    const slope = (z0: number, y0: number, z1: number, y1: number, mat: THREE.Material) => {
      const len = Math.hypot(z1 - z0, y1 - y0);
      const m = mesh(worldUvBox(W + 1.0, 0.16, len, 2), mat, 0, (y0 + y1) / 2, (z0 + z1) / 2, group);
      m.rotation.x = Math.atan2(y1 - y0, z0 - z1);
    };
    slope(zf + eave, roofTop - 0.35, ridgeZ, ridgeY, roofMat);
    slope(ridgeZ, ridgeY, zb - eave, roofTop - 0.35, st.roof);
    mesh(new THREE.CylinderGeometry(0.12, 0.12, W + 1.1, 6).rotateZ(Math.PI / 2), st.trim, 0, ridgeY + 0.05, ridgeZ, group);
    const gableShape = new THREE.Shape();
    gableShape.moveTo(zb, 0);
    gableShape.lineTo(zf, 0);
    gableShape.lineTo(ridgeZ, ridgeY - roofTop);
    gableShape.closePath();
    for (const sx of [-1, 1]) {
      const geo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.2, bevelEnabled: false });
      geo.rotateY(-Math.PI / 2);
      mesh(geo, st.wall, sx * (W / 2) + 0.1, roofTop, 0, group);
    }
  } else {
    mesh(worldUvBox(W + 0.6, 0.35, D + 0.6, 2), roofMat, 0, roofTop + 0.17, zc, group);
    mesh(worldUvBox(W + 0.6, 0.6, 0.25, 2), st.trim, 0, roofTop + 0.5, zb - 0.2, group);
  }
  for (let i = 0; i < nf; i++) {
    for (let bx = -W / 2 + 1.5; bx < W / 2; bx += 2.5) mesh(new THREE.BoxGeometry(0.2, 0.25, D), mats.woodDark, bx, fy + (i + 1) * H - 0.12, zc, group);
  }
  solid(ctx, spec.x - W / 2 - 0.3, spec.x + W / 2 + 0.3, g + roofTop, g + roofTop + 0.5, 'wood', 'roof', zb - 0.7 + oz, zf + 0.7 + oz);
  // Back and front walls.
  solid(ctx, spec.x - W / 2, spec.x + W / 2, g + fy, g + roofTop, 'wood', undefined, zb + oz, zb + 0.25 + oz);
  solid(ctx, spec.x - W / 2, spec.x + W / 2, g + fy, g + roofTop, 'wood', undefined, zf - 0.2 + oz, zf + oz);

  // Optional loft (one-way platform reached by a short staircase)
  if (spec.loft) {
    const L = spec.loft;
    const lw = L.x1 - L.x0;
    mesh(worldUvBox(lw, 0.18, D - 0.4, 1.4), mats.woodDark, (L.x0 + L.x1) / 2, fy + L.height - 0.09, zc, group);
    mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), mats.woodDark, L.x1 - 0.06, fy + L.height + 0.45, zf - 1.5, group);
    mesh(new THREE.BoxGeometry(0.1, 0.1, D - 1.8), mats.woodDark, L.x1 - 0.06, fy + L.height + 0.9, (zb + 0.3 + zf - 1.5) / 2, group);
    for (const z of [zb + 0.6, zf - 1.5]) mesh(new THREE.BoxGeometry(0.2, L.height, 0.2), mats.woodDark, L.x1 - 0.1, fy + L.height / 2, z, group);
    // A short flight of solid steps down from the loft edge along the front wall.
    const n = Math.ceil(L.height / 0.45);
    const lr = L.height / n;
    const z0 = zf - 1.45;
    const z1 = zf - 0.25;
    for (let k = 1; k <= n; k++) {
      const sx0 = L.x1 + (n - k) * 0.62;
      mesh(worldUvBox(0.62, k * lr, z1 - z0, 0.8), mats.woodDark, sx0 + 0.31, fy + (k * lr) / 2, (z0 + z1) / 2, group);
      solid(ctx, spec.x + sx0, spec.x + sx0 + 0.62, g + fy, g + fy + k * lr, 'wood', undefined, z0 + oz, z1 + oz);
    }
    oneway(ctx, spec.x + L.x0, spec.x + L.x1, g + fy + L.height, 'wood', undefined, zb + oz, zf + oz);
  }

  const fade: Fadeable = {
    x0: spec.x - W / 2 - 0.4,
    x1: spec.x + W / 2 + 0.4,
    y0: g - 0.5,
    y1: g + fy + TH + 1,
    z0: zb - 0.3 + oz,
    z1: zf + 0.3 + oz,
    materials: [frontMat, postMat, roofMat, wallFade, trimFade, roofBackFade, ...fadeExtra],
    meshes: [],
    opacity: 1,
  };
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && fade.materials.includes(m.material as THREE.Material)) fade.meshes.push(m);
  });
  ctx.fadeables.push(fade);
  ctx.interiors.push({ x0: spec.x - W / 2, x1: spec.x + W / 2, y0: g, y1: g + fy + TH, z0: zb + oz, z1: zf + oz, floor0: g + fy, storeyH: H, storeys: nf });

  return { group, floorY: g + fy, x: spec.x, storeys };
}

/** Simple furniture helpers placed in cabin-local coordinates (floor at y = 0.4). */
export const furniture = {
  table(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, w = 1.8, y = FLOOR): number {
    const top = y + 0.85;
    mesh(worldUvBox(w, 0.08, 0.9), ctx.mats.woodDark, x, top - 0.04, z, parent);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.08, 0.81, 0.08), ctx.mats.woodDark, x + sx * (w / 2 - 0.1), y + 0.4, z + sz * 0.35, parent);
    return top;
  },
  chair(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, rot = 0, y = FLOOR): void {
    const c = new THREE.Group();
    c.position.set(x, y, z);
    c.rotation.y = rot;
    parent.add(c);
    mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), ctx.mats.woodDark, 0, 0.48, 0, c);
    mesh(new THREE.BoxGeometry(0.5, 0.55, 0.06), ctx.mats.woodDark, 0, 0.78, -0.22, c);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(0.05, 0.48, 0.05), ctx.mats.woodDark, sx * 0.2, 0.24, sz * 0.2, c);
  },
  bed(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, y = FLOOR): void {
    mesh(worldUvBox(2.1, 0.35, 1.0), ctx.mats.woodDark, x, y - 0.15, z, parent);
    mesh(new THREE.BoxGeometry(1.95, 0.16, 0.9), ctx.mats.cloth, x, y + 0.1, z, parent);
    mesh(new THREE.BoxGeometry(1.3, 0.1, 0.92), ctx.mats.fabric, x + 0.3, y + 0.2, z, parent);
    mesh(new THREE.BoxGeometry(0.45, 0.12, 0.6), ctx.mats.bone, x - 0.72, y + 0.23, z, parent);
  },
  stove(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, h: number, y = FLOOR): void {
    mesh(new THREE.BoxGeometry(0.8, 0.8, 0.7), ctx.mats.metal, x, y + 0.4, z, parent);
    mesh(new THREE.CylinderGeometry(0.09, 0.09, h + 1.5, 8), ctx.mats.metal, x, y + 0.8 + (h + 1.5) / 2, z - 0.15, parent);
  },
  shelf(ctx: SiteContext, parent: THREE.Object3D, x: number, y: number, z: number, w = 1.6): void {
    mesh(new THREE.BoxGeometry(w, 0.06, 0.35), ctx.mats.woodDark, x, y, z, parent);
    const cols = [0x6b4b2e, 0x3f5a6b, 0x7a6a3a, 0x5a3a3a];
    for (let i = 0; i < 5; i++) {
      const hh = 0.18 + ((i * 37) % 10) / 60;
      mesh(new THREE.BoxGeometry(0.12, hh, 0.22), ctx.mats.books[i % cols.length], x - w / 2 + 0.2 + i * 0.16, y + 0.03 + hh / 2, z, parent);
    }
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), ctx.mats.metal, x + w / 2 - 0.3, y + 0.13, z, parent);
  },
  crate(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, s = 0.8, y = FLOOR): void {
    mesh(worldUvBox(s, s, s, 0.8), ctx.mats.woodDark, x, y + s / 2, z, parent);
  },
  rug(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, y = FLOOR): void {
    mesh(new THREE.BoxGeometry(2.6, 0.02, 1.6), ctx.mats.rug, x, y + 0.01, z, parent, false);
  },
  paper(ctx: SiteContext, parent: THREE.Object3D, x: number, y: number, z: number, rot = 0.2): THREE.Mesh {
    const m = mesh(new THREE.BoxGeometry(0.32, 0.01, 0.42), ctx.mats.paper, x, y + 0.006, z, parent, false);
    m.rotation.y = rot;
    return m;
  },
  counter(ctx: SiteContext, parent: THREE.Object3D, x: number, z: number, w: number, y = FLOOR): void {
    mesh(worldUvBox(w, 1.0, 0.7), ctx.mats.woodDark, x, y + 0.5, z, parent);
    mesh(worldUvBox(w + 0.1, 0.06, 0.8), ctx.mats.concrete, x, y + 1.03, z, parent);
  },
};

export { FLOOR as CABIN_FLOOR };
