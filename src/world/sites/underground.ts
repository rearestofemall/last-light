import * as THREE from 'three';
import { Rng } from '../../core/rng';
import { worldUvBox } from '../../render/textures';
import { mesh, type SiteContext, solid } from './kit';

/** Floor height of every underground level (well below the terrain surface). */
export const UG_Y = -60;

export type TunnelStyle = 'metro' | 'cave' | 'lab';

/**
 * An enclosed underground level: floor, ceiling, end walls and a back wall, dressed per style.
 * Underground spaces count as fully sheltered and switch the renderer to interior lighting.
 */
export function tunnel(ctx: SiteContext, x0: number, x1: number, style: TunnelStyle): THREE.Group {
  const g = new THREE.Group();
  ctx.group.add(g);
  const y = UG_Y;
  const H = style === 'cave' ? 5 : 4.4;
  const zb = -4.5;
  const zf = 3;
  const D = zf - zb;
  const zc = (zb + zf) / 2;
  const L = x1 - x0;
  const cx = (x0 + x1) / 2;
  const m = ctx.mats;
  const wallMat = style === 'metro' ? m.tile : style === 'lab' ? m.white : m.rock;
  const floorMat = style === 'cave' ? m.rock : m.concrete;
  mesh(worldUvBox(L + 2, 1, D + 2, 2), floorMat, cx, y - 0.5, zc, g);
  mesh(worldUvBox(L + 2, 1, D + 2, 2), style === 'cave' ? m.rock : m.concrete, cx, y + H + 0.5, zc, g);
  mesh(worldUvBox(L + 2, H, 0.4, style === 'metro' ? 1 : 2), wallMat, cx, y + H / 2, zb, g);
  for (const ex of [x0 - 0.5, x1 + 0.5]) mesh(worldUvBox(1, H + 1, D + 2, 2), style === 'cave' ? m.rock : m.concrete, ex, y + H / 2, zc, g);
  solid(ctx, x0 - 1, x1 + 1, y - 3, y, style === 'cave' ? 'rock' : 'rock');
  solid(ctx, x0 - 1, x1 + 1, y + H, y + H + 2, 'rock', 'roof');
  solid(ctx, x0 - 3, x0, y - 3, y + H + 2, 'rock');
  solid(ctx, x1, x1 + 3, y - 3, y + H + 2, 'rock');
  ctx.interiors.push({ x0, x1, y0: y - 1, y1: y + H });
  const rng = new Rng(Math.floor(x0 * 13));
  if (style === 'metro') {
    // Platform edge, rails, pillars, dead signage.
    mesh(worldUvBox(L, 0.15, 0.3), m.white, cx, y + 0.08, 1.2, g, false);
    for (const rz of [-2.2, -1.2]) mesh(new THREE.BoxGeometry(L, 0.08, 0.1), m.metal, cx, y + 0.05, rz, g, false);
    for (let x = x0 + 4; x < x1; x += 2) mesh(new THREE.BoxGeometry(0.25, 0.06, 1.6), m.woodDark, x, y + 0.02, -1.7, g, false);
    for (let x = x0 + 6; x < x1 - 2; x += 9) {
      mesh(worldUvBox(0.6, H, 0.6), m.tile, x, y + H / 2, -3.4, g);
      mesh(new THREE.BoxGeometry(2.2, 0.5, 0.08), m.white, x + 3.5, y + 2.6, zb + 0.25, g, false);
    }
    for (let x = x0 + 3; x < x1; x += 12) mesh(new THREE.BoxGeometry(1.2, 0.08, 0.3), m.glass, x, y + H - 0.1, -1, g, false);
  } else if (style === 'cave') {
    for (let i = 0; i < L / 2; i++) {
      const s = rng.range(0.6, 1.6);
      const r = mesh(new THREE.DodecahedronGeometry(s, 0), m.rock, x0 + rng.float() * L, y + H - rng.range(0, 0.4), rng.range(zb, zf - 1), g);
      r.scale.y = rng.range(1.2, 2.4);
      const b = mesh(new THREE.DodecahedronGeometry(s * 0.8, 0), m.rock, x0 + rng.float() * L, y + rng.range(-0.2, 0.3), rng.range(zb, -2), g);
      b.rotation.set(rng.float(), rng.float(), 0);
    }
    for (let i = 0; i < L / 3; i++) {
      const st = mesh(new THREE.ConeGeometry(rng.range(0.1, 0.25), rng.range(0.6, 1.6), 5), m.rock, x0 + rng.float() * L, y + H - 0.5, rng.range(zb + 0.5, zf - 0.5), g);
      st.rotation.x = Math.PI;
    }
  } else {
    for (let x = x0 + 2; x < x1; x += 4) {
      mesh(new THREE.BoxGeometry(0.15, H, 0.15), m.metal, x, y + H / 2, zb + 0.3, g);
      mesh(new THREE.BoxGeometry(1.4, 0.05, 0.6), m.glass, x + 2, y + H - 0.05, -1, g, false);
    }
    for (const pz of [zb + 0.4, zb + 0.7]) mesh(new THREE.CylinderGeometry(0.12, 0.12, L, 8).rotateZ(Math.PI / 2), m.metal, cx, y + H - 0.4 - (pz - zb) * 2, pz, g);
  }
  return g;
}
