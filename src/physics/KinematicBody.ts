import type { Surface } from '../world/Terrain';
import type { Collider, CollisionWorld } from './CollisionWorld';

export interface Body {
  x: number;
  /** Feet height. */
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Half-extent of the square footprint. */
  r: number;
  height: number;
  grounded: boolean;
  groundSurface: Surface;
  groundCollider: Collider | null;
}

export interface MoveParams {
  maxStep: number;
  /** Max climbable terrain slope (rise/run). */
  maxSlope: number;
  /** Distance a grounded body sticks to descending ground. */
  snap: number;
  dropThrough: boolean;
}

export interface MoveResult {
  landed: boolean;
  impact: number;
  hitHead: boolean;
  blockedX: boolean;
  blockedZ: boolean;
}

export const DEFAULT_MOVE: MoveParams = { maxStep: 0.55, maxSlope: 1.25, snap: 0.45, dropThrough: false };

const EPS = 0.001;
const SLOPE_PROBE = 0.45;
const scratch: Collider[] = [];

export function createBody(x: number, y: number, z: number, r = 0.3, height = 1.75): Body {
  return { x, y, z, vx: 0, vy: 0, vz: 0, r, height, grounded: false, groundSurface: 'grass', groundCollider: null };
}

/** One horizontal axis of motion: terrain steps/slopes, then boxes (with step-up). */
function moveAxis(world: CollisionWorld, b: Body, axis: 'x' | 'z', delta: number, p: MoveParams): boolean {
  if (delta === 0) return false;
  const r = b.r;
  const bounds = world.bounds;
  let blocked = false;
  let nx = b.x;
  let nz = b.z;
  if (axis === 'x') nx += delta;
  else nz += delta;
  const lo = axis === 'x' ? bounds.minX + r : bounds.minZ + r;
  const hi = axis === 'x' ? bounds.maxX - r : bounds.maxZ - r;
  const v = axis === 'x' ? nx : nz;
  if (v < lo || v > hi) {
    if (axis === 'x') nx = Math.min(hi, Math.max(lo, nx));
    else nz = Math.min(hi, Math.max(lo, nz));
    blocked = true;
  }
  // Terrain walls and slopes.
  const newG = world.groundAt(nx, nz, r, b.y);
  if (newG > b.y + EPS) {
    const rise = newG - b.y;
    const dir = Math.sign(delta);
    const ax = axis === 'x' ? nx + dir * SLOPE_PROBE : nx;
    const az = axis === 'z' ? nz + dir * SLOPE_PROBE : nz;
    const ahead = world.groundAt(ax, az, r, b.y);
    const tooSteep = b.grounded && b.groundCollider === null && (ahead - b.y) / SLOPE_PROBE > p.maxSlope;
    if (rise > p.maxStep || tooSteep) {
      nx = b.x;
      nz = b.z;
      blocked = true;
    }
  }
  // Boxes.
  const cs = world.query(Math.min(b.x, nx) - r, Math.max(b.x, nx) + r, Math.min(b.z, nz) - r, Math.max(b.z, nz) + r, scratch);
  for (const c of cs) {
    if (c.kind !== 'solid') continue;
    if (!(b.y + b.height > c.minY + EPS && b.y < c.maxY - EPS)) continue;
    if (!(nx + r > c.minX && nx - r < c.maxX && nz + r > c.minZ && nz - r < c.maxZ)) continue;
    const cur = axis === 'x' ? b.x : b.z;
    const cmin = axis === 'x' ? c.minX : c.minZ;
    const cmax = axis === 'x' ? c.maxX : c.maxZ;
    const before = cur + r <= cmin + EPS;
    const after = cur - r >= cmax - EPS;
    if (!before && !after) continue; // already overlapping; don't teleport
    const stepH = c.maxY - b.y;
    if (b.grounded && stepH > 0 && stepH <= p.maxStep && headroom(world, nx, nz, c.maxY, b)) {
      b.y = c.maxY;
      b.groundCollider = c;
      continue;
    }
    if (before && delta > 0) {
      if (axis === 'x') nx = Math.min(nx, c.minX - r - EPS);
      else nz = Math.min(nz, c.minZ - r - EPS);
    } else if (after && delta < 0) {
      if (axis === 'x') nx = Math.max(nx, c.maxX + r + EPS);
      else nz = Math.max(nz, c.maxZ + r + EPS);
    }
    blocked = true;
  }
  b.x = nx;
  b.z = nz;
  return blocked;
}

function headroom(world: CollisionWorld, x: number, z: number, feetY: number, b: Body): boolean {
  for (const c of world.query(x - b.r, x + b.r, z - b.r, z + b.r, [])) {
    if (c.kind !== 'solid') continue;
    if (c.minY < feetY + b.height && c.maxY > feetY + EPS) return false;
  }
  return true;
}

/** Highest surface at or below the body's feet. */
export function supportBelow(world: CollisionWorld, b: Body, dropThrough: boolean): { y: number; surface: Surface; collider: Collider | null } {
  const r = b.r;
  let y = world.groundAt(b.x, b.z, r, b.y);
  let surface: Surface = y === -Infinity ? 'rock' : world.terrain.surfaceAt(b.x, b.z);
  let collider: Collider | null = null;
  for (const c of world.query(b.x - r, b.x + r, b.z - r, b.z + r, scratch)) {
    if (c.kind === 'oneway' && dropThrough) continue;
    if (c.maxY <= b.y + 0.02 && c.maxY > y) {
      y = c.maxY;
      surface = c.surface;
      collider = c;
    }
  }
  return { y, surface, collider };
}

/**
 * Moves a body: X, then Z (walls, steps, slopes), then Y (ground, platforms, ceilings).
 * Gravity is the caller's job.
 */
export function moveBody(world: CollisionWorld, b: Body, dt: number, p: MoveParams = DEFAULT_MOVE): MoveResult {
  const res: MoveResult = { landed: false, impact: 0, hitHead: false, blockedX: false, blockedZ: false };
  res.blockedX = moveAxis(world, b, 'x', b.vx * dt, p);
  if (res.blockedX) b.vx = 0;
  res.blockedZ = moveAxis(world, b, 'z', b.vz * dt, p);
  if (res.blockedZ) b.vz = 0;

  const r = b.r;
  if (b.vy > 0) {
    let ny = b.y + b.vy * dt;
    for (const c of world.query(b.x - r, b.x + r, b.z - r, b.z + r, scratch)) {
      if (c.kind !== 'solid') continue;
      if (b.y + b.height <= c.minY + EPS && ny + b.height > c.minY) {
        ny = c.minY - b.height;
        b.vy = 0;
        res.hitHead = true;
      }
    }
    b.y = ny;
    b.grounded = false;
    b.groundCollider = null;
    return res;
  }

  const support = supportBelow(world, b, p.dropThrough);
  const ny = b.y + b.vy * dt;
  if (b.grounded && b.y - support.y <= p.snap) {
    b.y = support.y;
    b.vy = 0;
  } else if (ny <= support.y) {
    res.landed = !b.grounded;
    res.impact = -b.vy;
    b.y = support.y;
    b.vy = 0;
    b.grounded = true;
  } else {
    b.y = ny;
    b.grounded = false;
    b.groundCollider = null;
    return res;
  }
  b.grounded = true;
  b.groundCollider = support.collider;
  b.groundSurface = support.surface;
  return res;
}
