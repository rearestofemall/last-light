import type { Surface } from '../world/Terrain';
import type { Collider, CollisionWorld } from './CollisionWorld';

export interface Body {
  /** Centre x. */
  x: number;
  /** Feet y. */
  y: number;
  vx: number;
  vy: number;
  halfWidth: number;
  height: number;
  grounded: boolean;
  groundSurface: Surface;
  /** The collider currently stood on (null when on terrain or airborne). */
  groundCollider: Collider | null;
}

export interface MoveParams {
  maxStep: number;
  /** Max climbable terrain slope (dy/dx). */
  maxSlope: number;
  /** Distance a grounded body sticks to descending ground. */
  snap: number;
  /** Ignore one-way platforms (dropping through). */
  dropThrough: boolean;
}

export interface MoveResult {
  landed: boolean;
  impact: number;
  hitHead: boolean;
  blockedX: boolean;
}

export const DEFAULT_MOVE: MoveParams = { maxStep: 0.55, maxSlope: 1.35, snap: 0.4, dropThrough: false };

const EPS = 0.001;
const SLOPE_PROBE = 0.4;
const scratch: Collider[] = [];

export function createBody(x: number, y: number, halfWidth = 0.3, height = 1.75): Body {
  return { x, y, vx: 0, vy: 0, halfWidth, height, grounded: false, groundSurface: 'grass', groundCollider: null };
}

/**
 * Moves a body through the world: horizontal pass (walls, steps, slopes) then vertical pass
 * (ground, platforms, ceilings). Velocities are applied as-is; gravity is the caller's job.
 */
export function moveBody(world: CollisionWorld, b: Body, dt: number, p: MoveParams = DEFAULT_MOVE): MoveResult {
  const res: MoveResult = { landed: false, impact: 0, hitHead: false, blockedX: false };
  const hw = b.halfWidth;

  // ---- Horizontal ----
  if (b.vx !== 0) {
    let nx = b.x + b.vx * dt;
    const lo = world.bounds.min + hw;
    const hi = world.bounds.max - hw;
    if (nx < lo || nx > hi) {
      nx = Math.min(hi, Math.max(lo, nx));
      res.blockedX = true;
    }
    // Terrain walls and slopes.
    const newG = world.groundAt(nx, hw);
    if (newG > b.y + EPS) {
      const rise = newG - b.y;
      // Measure slope over a short look-ahead so small sharp steps can be climbed while
      // sustained steep faces (cliffs) cannot.
      const dir = Math.sign(nx - b.x);
      const ahead = world.groundAt(nx + dir * SLOPE_PROBE, hw);
      const tooSteep = b.grounded && b.groundCollider === null && (ahead - b.y) / SLOPE_PROBE > p.maxSlope;
      if (rise > p.maxStep || tooSteep) {
        nx = b.x;
        res.blockedX = true;
      }
    }
    // Solid boxes.
    const cs = world.query(Math.min(b.x, nx) - hw, Math.max(b.x, nx) + hw, scratch);
    for (const c of cs) {
      if (c.kind !== 'solid') continue;
      if (!(b.y + b.height > c.minY + EPS && b.y < c.maxY - EPS)) continue;
      if (!(nx + hw > c.minX && nx - hw < c.maxX)) continue;
      const wasLeft = b.x + hw <= c.minX + EPS;
      const wasRight = b.x - hw >= c.maxX - EPS;
      if (!wasLeft && !wasRight) continue; // already overlapping; don't teleport
      const stepH = c.maxY - b.y;
      if (b.grounded && stepH > 0 && stepH <= p.maxStep && headroomClear(world, nx, c.maxY, b)) {
        b.y = c.maxY;
        b.groundCollider = c;
        continue;
      }
      if (wasLeft && b.vx > 0) nx = Math.min(nx, c.minX - hw - EPS);
      else if (wasRight && b.vx < 0) nx = Math.max(nx, c.maxX + hw + EPS);
      res.blockedX = true;
    }
    if (res.blockedX) b.vx = 0;
    b.x = nx;
  }

  // ---- Vertical ----
  if (b.vy > 0) {
    let ny = b.y + b.vy * dt;
    const cs = world.query(b.x - hw, b.x + hw, scratch);
    for (const c of cs) {
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

function headroomClear(world: CollisionWorld, x: number, feetY: number, b: Body): boolean {
  const cs = world.query(x - b.halfWidth, x + b.halfWidth, []);
  for (const c of cs) {
    if (c.kind !== 'solid') continue;
    if (c.minY < feetY + b.height && c.maxY > feetY + EPS) return false;
  }
  return true;
}

/** Highest surface at or below the body's feet. */
export function supportBelow(
  world: CollisionWorld,
  b: Body,
  dropThrough: boolean,
): { y: number; surface: Surface; collider: Collider | null } {
  const hw = b.halfWidth;
  let y = world.groundAt(b.x, hw);
  let surface: Surface = world.terrain.surfaceAt(b.x);
  let collider: Collider | null = null;
  const cs = world.query(b.x - hw, b.x + hw, scratch);
  for (const c of cs) {
    if (c.kind === 'oneway' && dropThrough) continue;
    if (c.maxY <= b.y + 0.02 && c.maxY > y) {
      y = c.maxY;
      surface = c.surface;
      collider = c;
    }
  }
  return { y, surface, collider };
}
