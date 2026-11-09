import { clamp } from '../core/math';
import type { GameEventBus } from '../core/events';
import type { MovementModifiers } from '../player/PlayerController';

export interface Vitals {
  health: number;
  hunger: number;
  thirst: number;
  /** Body warmth: 50 is comfortable, below 25 is cold, below 10 is freezing. */
  warmth: number;
  stamina: number;
  energy: number;
}

export type VitalKey = keyof Vitals;

/** What the world is doing to the player this tick. Built by the Game from other systems. */
export interface SurvivalContext {
  sprinting: boolean;
  moving: boolean;
  swimming: boolean;
  /** Ambient temperature in °C (region, time, weather, season). */
  ambientC: number;
  /** 0–1 heat from nearby fires. */
  fireHeat: number;
  /** 0 = exposed, 1 = under a roof, 2 = fully enclosed. */
  shelter: number;
  /** Extra insulation from clothing (warmth points). */
  clothing: number;
  /** Rain/snow intensity reaching the player (0 when sheltered). */
  precipitation: number;
  inWater: boolean;
}

export const RATES = {
  hungerPerSec: 100 / (40 * 60),
  thirstPerSec: 100 / (26 * 60),
  energyPerSec: 100 / (30 * 60),
  sprintStamina: 20,
  swimStamina: 7,
  jumpStamina: 9,
  staminaRegen: 24,
  warmthRate: 0.6,
  healthRegen: 0.35,
};

/**
 * The six vital attributes and how the world pushes on them.
 * Each one has consequences: empty hunger/thirst/warmth drains health; low stamina blocks
 * sprinting and jumping; low energy slows movement and recovery; zero health is death.
 */
export class Survival {
  vitals: Vitals = Survival.fresh();
  /** 0–1, how soaked the player is. Wet clothing makes cold far worse. */
  wetness = 0;
  /** Seconds of stomach sickness remaining (from raw meat or dirty water). */
  sickness = 0;
  dead = false;
  deathCause = '';
  private exhausted = false;
  private warnCooldown: Partial<Record<string, number>> = {};
  /** Temperature target the body is drifting towards (for the HUD's trend arrow). */
  warmthTarget = 50;
  /** Invulnerable while true (cutscenes, sleeping). */
  frozen = false;

  constructor(private events: GameEventBus) {}

  static fresh(): Vitals {
    return { health: 100, hunger: 85, thirst: 80, warmth: 55, stamina: 100, energy: 90 };
  }

  reset(): void {
    this.vitals = Survival.fresh();
    this.wetness = 0;
    this.sickness = 0;
    this.dead = false;
    this.exhausted = false;
  }

  /** Movement penalties derived from the current state. */
  modifiers(out: MovementModifiers): MovementModifiers {
    const v = this.vitals;
    let speed = 1;
    if (v.energy < 20) speed *= 0.86;
    if (v.energy <= 0) speed *= 0.82;
    if (v.warmth < 12) speed *= 0.85;
    if (v.health < 20) speed *= 0.9;
    out.speedMul = speed;
    out.canSprint = !this.exhausted && v.stamina > 0;
    out.canJump = v.stamina >= RATES.jumpStamina * 0.5;
    return out;
  }

  onJump(): void {
    this.vitals.stamina = Math.max(0, this.vitals.stamina - RATES.jumpStamina);
  }

  apply(effects: Partial<Vitals>): void {
    for (const [k, v] of Object.entries(effects) as [VitalKey, number][]) {
      this.vitals[k] = clamp(this.vitals[k] + v, 0, 100);
    }
  }

  damage(amount: number, cause: string): void {
    if (this.dead || this.frozen || amount <= 0) return;
    this.vitals.health = Math.max(0, this.vitals.health - amount);
    this.events.emit('player:damaged', { amount, cause });
    if (this.vitals.health <= 0) this.die(cause);
  }

  private die(cause: string): void {
    this.dead = true;
    this.deathCause = cause;
    this.events.emit('player:died', { cause });
  }

  /** Fast-forward for sleep: hours of rest. */
  sleep(hours: number, quality: number): void {
    const v = this.vitals;
    v.energy = clamp(v.energy + hours * 12 * quality, 0, 100);
    v.hunger = clamp(v.hunger - hours * 2.2, 0, 100);
    v.thirst = clamp(v.thirst - hours * 3, 0, 100);
    v.stamina = 100;
    if (v.hunger > 20 && v.thirst > 20) v.health = clamp(v.health + hours * 4 * quality, 0, 100);
    this.wetness = 0;
  }

  update(dt: number, c: SurvivalContext): void {
    if (this.dead || this.frozen) return;
    const v = this.vitals;
    const R = RATES;

    // Hunger & thirst. Activity and heat make them fall faster.
    const exertion = c.sprinting ? 1.8 : c.swimming ? 1.6 : c.moving ? 1.15 : 1;
    v.hunger -= R.hungerPerSec * exertion * (v.warmth < 25 ? 1.3 : 1) * dt;
    v.thirst -= R.thirstPerSec * exertion * (v.warmth > 80 ? 1.6 : 1) * (this.sickness > 0 ? 1.5 : 1) * dt;
    v.energy -= R.energyPerSec * (c.sprinting ? 1.6 : 1) * dt;

    // Stamina
    if (c.sprinting) v.stamina -= R.sprintStamina * dt;
    else if (c.swimming && c.moving) v.stamina -= R.swimStamina * dt;
    else {
      const regen = R.staminaRegen * (v.energy < 20 ? 0.45 : 1) * (v.hunger < 10 ? 0.6 : 1) * (c.moving ? 0.6 : 1);
      v.stamina += regen * dt;
    }
    if (v.stamina <= 0) this.exhausted = true;
    if (this.exhausted && v.stamina > 30) this.exhausted = false;

    // Wetness: rain soaks, swimming drenches, fire and shelter dry.
    if (c.inWater) this.wetness = Math.min(1, this.wetness + dt * 0.8);
    else if (c.precipitation > 0) this.wetness = Math.min(1, this.wetness + c.precipitation * dt * 0.02);
    else this.wetness = Math.max(0, this.wetness - dt * (0.006 + c.fireHeat * 0.05 + (c.shelter > 0 ? 0.004 : 0)));

    // Warmth drifts towards a target set by the environment.
    let target = 50 + (c.ambientC - 14) * 2.6;
    target += c.fireHeat * 45 + c.shelter * 7 + c.clothing;
    target -= this.wetness * 22;
    if (c.inWater) target -= 12;
    if (c.moving) target += 3;
    this.warmthTarget = clamp(target, 0, 100);
    const rate = R.warmthRate * (c.fireHeat > 0.2 ? 3 : 1);
    v.warmth += clamp(this.warmthTarget - v.warmth, -rate * dt, rate * dt);

    // Sickness
    if (this.sickness > 0) {
      this.sickness -= dt;
      v.hunger -= 0.05 * dt;
      v.health -= 0.05 * dt;
    }

    // Health: drains from deprivation, slowly regenerates when needs are met.
    let drain = 0;
    const causes: string[] = [];
    if (v.hunger <= 0) {
      drain += 0.45;
      causes.push('starvation');
    }
    if (v.thirst <= 0) {
      drain += 0.7;
      causes.push('dehydration');
    }
    if (v.warmth < 12) {
      drain += (12 - v.warmth) * 0.04;
      causes.push('the cold');
    }
    if (v.energy <= 0) {
      drain += 0.12;
      causes.push('exhaustion');
    }
    if (drain > 0) {
      v.health -= drain * dt;
    } else if (v.hunger > 40 && v.thirst > 40 && v.warmth > 30 && v.energy > 15 && this.sickness <= 0) {
      v.health += R.healthRegen * (v.energy > 60 ? 1.4 : 1) * dt;
    }

    for (const k of Object.keys(v) as VitalKey[]) v[k] = clamp(v[k], 0, 100);
    if (v.health <= 0) this.die(causes[0] ?? 'your wounds');

    this.warnings(dt);
  }

  private warnings(dt: number): void {
    const v = this.vitals;
    for (const k of Object.keys(this.warnCooldown)) this.warnCooldown[k]! -= dt;
    const warn = (key: string, cond: boolean, text: string) => {
      if (!cond || (this.warnCooldown[key] ?? 0) > 0) return;
      this.warnCooldown[key] = 75;
      this.events.emit('toast', { text, kind: 'warn', duration: 5 });
    };
    warn('hunger', v.hunger < 15, v.hunger <= 0 ? 'You are starving.' : 'Your stomach aches with hunger.');
    warn('thirst', v.thirst < 15, v.thirst <= 0 ? 'You are severely dehydrated.' : 'Your throat is parched.');
    warn('cold', v.warmth < 22, v.warmth < 12 ? 'You are freezing. Find fire or shelter.' : 'You are getting cold.');
    warn('energy', v.energy < 15, 'You can barely keep your eyes open. Find somewhere to sleep.');
    warn('wet', this.wetness > 0.6 && v.warmth < 45, 'Your clothes are soaked through.');
    warn('health', v.health < 25, 'You are badly hurt.');
  }

  serialize(): { vitals: Vitals; wetness: number; sickness: number } {
    return { vitals: { ...this.vitals }, wetness: this.wetness, sickness: this.sickness };
  }

  deserialize(d: { vitals?: Partial<Vitals>; wetness?: number; sickness?: number }): void {
    const f = Survival.fresh();
    for (const k of Object.keys(f) as VitalKey[]) {
      const val = d.vitals?.[k];
      this.vitals[k] = typeof val === 'number' && Number.isFinite(val) ? clamp(val, 0, 100) : f[k];
    }
    this.vitals.health = Math.max(5, this.vitals.health);
    this.wetness = clamp(d.wetness ?? 0, 0, 1);
    this.sickness = Math.max(0, d.sickness ?? 0);
    this.dead = false;
  }
}
