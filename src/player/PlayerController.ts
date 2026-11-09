import { approach, clamp } from '../core/math';
import type { Input } from '../core/Input';
import type { GameEventBus } from '../core/events';
import type { CollisionWorld } from '../physics/CollisionWorld';
import { type Body, createBody, DEFAULT_MOVE, moveBody } from '../physics/KinematicBody';

export type MoveState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'wade' | 'swim';

export const PLAYER_TUNING = {
  walkSpeed: 4.1,
  runSpeed: 7.2,
  swimSpeed: 2.5,
  wadeMul: 0.6,
  groundAccel: 46,
  groundDecel: 38,
  airAccel: 20,
  gravity: 32,
  fallGravityMul: 1.35,
  maxFall: 30,
  jumpSpeed: 10.6,
  jumpCut: 0.5,
  swimJumpSpeed: 8.4,
  coyoteTime: 0.1,
  jumpBuffer: 0.13,
  dropThroughTime: 0.28,
  strideWalk: 1.45,
  strideRun: 2.15,
  /** Submersion (m of water above feet) at which the player starts swimming. */
  swimDepth: 1.25,
  /** Feet depth below the surface while floating. */
  floatDepth: 1.3,
};

/**
 * Modifiers other systems (survival, encumbrance, weather) can apply to movement.
 * Kept here as plain data so the controller stays the single owner of movement rules.
 */
export interface MovementModifiers {
  speedMul: number;
  canSprint: boolean;
  canJump: boolean;
}

/** Owns the player's physical state and movement rules. */
export class PlayerController {
  readonly body: Body;
  prevX: number;
  prevY: number;
  facing: 1 | -1 = 1;
  state: MoveState = 'idle';
  /** True while the sprint input is producing sprint speed (for stamina drain in M2). */
  sprinting = false;
  /** Depth of water above the feet (0 when dry). */
  submersion = 0;
  waterSurfaceY: number | null = null;
  modifiers: MovementModifiers = { speedMul: 1, canSprint: true, canJump: true };

  private coyote = 0;
  private jumpBuffer = 0;
  private dropTimer = 0;
  private jumpCutDone = true;
  private strideAcc = 0;
  /** Seconds since the controller became active; suppresses landing effects on spawn. */
  private age = 0;

  constructor(
    private world: CollisionWorld,
    private events: GameEventBus,
    x: number,
    y: number,
  ) {
    this.body = createBody(x, y);
    this.prevX = x;
    this.prevY = y;
  }

  /** Teleport, e.g. when loading a save. Snaps to the ground if y is not given. */
  placeAt(x: number, y?: number): void {
    const b = this.body;
    b.x = x;
    b.y = this.world.resolveSpawnY(x, y ?? this.world.groundAt(x, b.halfWidth), b.halfWidth, b.height) + 0.02;
    b.vx = b.vy = 0;
    b.grounded = false;
    this.prevX = b.x;
    this.prevY = b.y;
    this.age = 0;
  }

  get speed(): number {
    return Math.abs(this.body.vx);
  }

  update(dt: number, input: Input): void {
    const t = PLAYER_TUNING;
    const b = this.body;
    this.prevX = b.x;
    this.prevY = b.y;
    this.age += dt;

    // --- Water state ---
    const water = this.world.isUnderground(b.x, b.y) ? null : this.world.terrain.waterAt(b.x);
    const wasSub = this.submersion;
    this.waterSurfaceY = water ? water.surfaceY : null;
    this.submersion = water ? Math.max(0, water.surfaceY - b.y) : 0;
    const swimming = this.submersion > t.swimDepth;
    if (this.submersion > 0.15 && wasSub <= 0.15 && b.vy < -4 && this.age > 0.5) {
      this.events.emit('player:splash', { intensity: clamp(-b.vy / 14, 0.2, 1) });
    }

    // --- Horizontal intent ---
    const dir = (input.held('right') ? 1 : 0) - (input.held('left') ? 1 : 0);
    if (dir !== 0) this.facing = dir > 0 ? 1 : -1;
    this.sprinting = dir !== 0 && input.held('sprint') && this.modifiers.canSprint && !swimming && b.grounded;
    let maxSpeed = this.sprinting ? t.runSpeed : t.walkSpeed;
    if (swimming) maxSpeed = t.swimSpeed;
    else if (this.submersion > 0.35) maxSpeed *= t.wadeMul;
    maxSpeed *= this.modifiers.speedMul;

    const accel = b.grounded || swimming ? (dir !== 0 ? t.groundAccel : t.groundDecel) : t.airAccel;
    b.vx = approach(b.vx, dir * maxSpeed, accel * dt);

    // --- Jump input ---
    if (input.consume('jump')) this.jumpBuffer = t.jumpBuffer;
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    const jumpHeldNow = input.held('jump');

    if (b.grounded) this.coyote = t.coyoteTime;
    else this.coyote = Math.max(0, this.coyote - dt);
    this.dropTimer = Math.max(0, this.dropTimer - dt);

    if (this.jumpBuffer > 0 && this.modifiers.canJump) {
      const onOneWay = b.grounded && b.groundCollider?.kind === 'oneway';
      if (onOneWay && input.held('down')) {
        // Drop through the platform instead of jumping.
        this.dropTimer = t.dropThroughTime;
        b.grounded = false;
        b.groundCollider = null;
        b.y -= 0.05;
        this.jumpBuffer = 0;
      } else if (swimming) {
        if (this.waterSurfaceY !== null && b.y > this.waterSurfaceY - t.floatDepth - 0.25) {
          b.vy = t.swimJumpSpeed;
          this.jumpBuffer = 0;
          this.events.emit('player:splash', { intensity: 0.35 });
        }
      } else if (this.coyote > 0) {
        b.vy = t.jumpSpeed;
        b.grounded = false;
        b.groundCollider = null;
        this.coyote = 0;
        this.jumpBuffer = 0;
        this.jumpCutDone = false;
        this.events.emit('player:jump', { surface: b.groundSurface });
      }
    }
    // Variable jump height: releasing early cuts upward velocity once.
    if (!this.jumpCutDone && !jumpHeldNow && b.vy > 0) {
      b.vy *= t.jumpCut;
      this.jumpCutDone = true;
    }
    if (b.vy <= 0) this.jumpCutDone = true;

    // --- Gravity / buoyancy ---
    if (swimming && this.waterSurfaceY !== null && b.vy <= 2) {
      const target = this.waterSurfaceY - t.floatDepth;
      b.vy += (target - b.y) * 14 * dt;
      b.vy *= Math.exp(-4 * dt);
    } else if (!b.grounded) {
      const g = b.vy < 0 ? t.gravity * t.fallGravityMul : t.gravity;
      b.vy = Math.max(-t.maxFall, b.vy - g * dt);
      if (this.submersion > 0.3) b.vy *= Math.exp(-2.5 * dt); // water drag
    } else {
      b.vy = Math.min(b.vy, 0) - t.gravity * dt;
    }

    const res = moveBody(this.world, b, dt, { ...DEFAULT_MOVE, dropThrough: this.dropTimer > 0 });
    if (res.landed && this.age > 0.3) {
      this.events.emit('player:land', { impact: res.impact, surface: b.groundSurface });
      this.strideAcc = 0;
    }

    // --- State + footsteps ---
    const speed = Math.abs(b.vx);
    if (swimming && !b.grounded) this.state = 'swim';
    else if (!b.grounded) this.state = b.vy > 0 ? 'jump' : 'fall';
    else if (this.submersion > 0.35) this.state = 'wade';
    else if (speed < 0.2) this.state = 'idle';
    else this.state = speed > (t.walkSpeed + t.runSpeed) / 2 ? 'run' : 'walk';

    if (b.grounded && speed > 0.3) {
      this.strideAcc += speed * dt;
      const stride = this.state === 'run' ? t.strideRun : t.strideWalk;
      if (this.strideAcc >= stride) {
        this.strideAcc -= stride;
        this.events.emit('player:footstep', {
          surface: this.submersion > 0.1 ? 'water' : b.groundSurface,
          intensity: this.state === 'run' ? 1 : 0.65,
          x: b.x,
        });
      }
    }
  }
}
