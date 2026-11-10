import * as THREE from 'three';
import { angleDelta, damp } from '../core/math';
import type { GameEventBus } from '../core/events';
import type { Interactable, InteractionSystem } from '../interaction/InteractionSystem';
import type { CollisionWorld } from '../physics/CollisionWorld';
import { type Body, createBody, DEFAULT_MOVE, moveBody } from '../physics/KinematicBody';
import { regionAt, type RegionId } from '../world/WorldDef';
import { Bird } from './Bird';
import type { Quadruped } from './Quadruped';
import { makeDeer, makeRabbit, makeWolf } from './species';

export type Species = 'deer' | 'rabbit' | 'wolf' | 'bird';
type State = 'idle' | 'graze' | 'wander' | 'flee' | 'sleep' | 'stalk' | 'circle' | 'attack' | 'fly' | 'dead' | 'howl';

interface SpeciesDef {
  hp: number;
  walk: number;
  run: number;
  size: number;
  /** Distance at which the animal notices the player and flees. */
  shy: number;
  nocturnal: boolean;
  diurnal: boolean;
  loot: [string, number, number][];
  label: string;
}

export const SPECIES: Record<Species, SpeciesDef> = {
  deer: { hp: 40, walk: 1.6, run: 8.5, size: 1, shy: 10, nocturnal: false, diurnal: true, loot: [['raw_meat', 2, 3], ['hide', 2, 2]], label: 'Deer' },
  rabbit: { hp: 10, walk: 1.2, run: 7, size: 0.35, shy: 6, nocturnal: false, diurnal: true, loot: [['raw_meat', 1, 1], ['hide', 0, 1]], label: 'Rabbit' },
  wolf: { hp: 45, walk: 2.2, run: 7.4, size: 0.85, shy: 0, nocturnal: true, diurnal: false, loot: [['raw_meat', 1, 2], ['hide', 2, 2]], label: 'Wolf' },
  bird: { hp: 4, walk: 0.8, run: 9, size: 0.2, shy: 6, nocturnal: false, diurnal: true, loot: [], label: 'Bird' },
};

const POPULATION: Record<RegionId, Partial<Record<Species, number>>> = {
  woods: { deer: 3, rabbit: 3, wolf: 2, bird: 4 },
  frost: { deer: 1, rabbit: 2, wolf: 4, bird: 1 },
  city: { rabbit: 2, wolf: 2, bird: 5 },
  coast: { deer: 1, rabbit: 2, wolf: 1, bird: 6 },
};

export interface WildlifeHost {
  events: GameEventBus;
  interactions: InteractionSystem;
  playerX(): number;
  playerY(): number;
  playerZ(): number;
  /** Light level at a point from fires, torches, lanterns. */
  lightAt(x: number, y: number, z: number): number;
  /** 0 day … 1 night */
  darkness(): number;
  damagePlayer(amount: number, cause: string): void;
  giveLoot(id: string, qty: number): number;
  hasKnife(): boolean;
  isUnderground(x: number, z: number, y: number): boolean;
}

let nextId = 0;

class Animal {
  readonly id = `a${nextId++}`;
  body: Body;
  state: State = 'idle';
  timer = 0;
  /** Travel direction (radians, 0 = +z). */
  heading = Math.random() * Math.PI * 2;
  hp: number;
  /** Skinned model; birds and quadrupeds animate differently. */
  model: Quadruped | Bird;
  phase = Math.random() * 10;
  lastYaw = 0;
  turn = 0;
  /** Simulated time not yet shown by the animation. */
  animDt = 0;
  /** Spreads throttled updates across frames. */
  readonly slot = Math.floor(Math.random() * 4);
  attackCd = 0;
  hurtFlash = 0;
  growlCd = 0;
  carcass: Interactable | null = null;
  deadTime = 0;
  circleDir = Math.random() < 0.5 ? 1 : -1;

  constructor(
    readonly species: Species,
    x: number,
    y: number,
    z: number,
    region: RegionId,
  ) {
    const def = SPECIES[species];
    this.hp = def.hp;
    this.body = createBody(x, y, z, species === 'deer' ? 0.45 : species === 'wolf' ? 0.38 : 0.15, def.size);
    this.model = species === 'bird' ? new Bird(region) : species === 'wolf' ? makeWolf(region) : species === 'deer' ? makeDeer(region) : makeRabbit(region);
    this.model.yaw = this.heading;
    this.lastYaw = this.heading;
  }

  get quad(): Quadruped | null {
    return this.model instanceof Bird ? null : this.model;
  }
}

const angleTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);

/**
 * Spawns and simulates animals around the player. Each species runs a small state machine;
 * time of day, light and the player's behaviour drive transitions. Movement is steering on
 * the ground plane (the open land needs no pathfinding; obstacles make animals turn).
 */
export class Wildlife {
  readonly group = new THREE.Group();
  private animals: Animal[] = [];
  private spawnTimer = 1;
  private howlTimer = 30;
  enabled = true;

  constructor(
    private world: CollisionWorld,
    private host: WildlifeHost,
  ) {
    this.group.name = 'wildlife';
  }

  get threat(): number {
    let t = 0;
    const px = this.host.playerX();
    const pz = this.host.playerZ();
    for (const a of this.animals) {
      if (a.species !== 'wolf' || (a.state !== 'stalk' && a.state !== 'attack' && a.state !== 'circle')) continue;
      t = Math.max(t, 1 - Math.min(1, Math.hypot(a.body.x - px, a.body.z - pz) / 25));
    }
    return t;
  }

  get count(): number {
    return this.animals.filter((a) => a.state !== 'dead').length;
  }

  clear(): void {
    for (const a of this.animals) this.despawn(a);
    this.animals = [];
  }

  private despawn(a: Animal): void {
    this.group.remove(a.model.root);
    a.model.dispose();
    if (a.carcass) this.host.interactions.remove(a.carcass);
  }

  /** Attack animals in front of the player. Returns true if something was hit. */
  /** Closest living animal within range (for melee aim assist). */
  nearest(x: number, y: number, z: number, range: number): { x: number; z: number } | null {
    let best: { x: number; z: number } | null = null;
    let bd = range;
    for (const a of this.animals) {
      if (a.state === 'dead' || Math.abs(a.body.y - y) > 1.6) continue;
      const d = Math.hypot(a.body.x - x, a.body.z - z) - a.body.r;
      if (d < bd) {
        bd = d;
        best = { x: a.body.x, z: a.body.z };
      }
    }
    return best;
  }

  strike(x: number, y: number, z: number, fx: number, fz: number, reach: number, damage: number): boolean {
    let hit = false;
    for (const a of this.animals) {
      if (a.state === 'dead') continue;
      const dx = a.body.x - x;
      const dz = a.body.z - z;
      const d = Math.hypot(dx, dz);
      if (d > reach + a.body.r || Math.abs(a.body.y - y) > 1.6) continue;
      if (d > 0.4 && (dx * fx + dz * fz) / d < 0.25) continue;
      a.hp -= damage;
      a.hurtFlash = 0.25;
      a.quad?.hurt();
      hit = true;
      if (a.hp <= 0) this.kill(a);
      else if (a.species === 'wolf') {
        a.state = a.hp < SPECIES.wolf.hp * 0.35 ? 'flee' : 'attack';
        a.timer = 4;
      } else {
        a.state = 'flee';
        a.timer = 6;
      }
    }
    return hit;
  }

  private kill(a: Animal): void {
    a.state = 'dead';
    a.model.die();
    a.deadTime = 0;
    a.body.vx = a.body.vz = 0;
    const def = SPECIES[a.species];
    if (!def.loot.length) {
      a.deadTime = 999;
      return;
    }
    const it: Interactable = {
      id: `carcass-${a.id}`,
      x: a.body.x,
      y: a.body.y + 0.5,
      z: a.body.z,
      radius: 1.8,
      verb: 'Butcher',
      label: def.label.toLowerCase(),
      onInteract: () => {
        const knife = this.host.hasKnife();
        for (const [id, mn, mx] of def.loot) {
          let q = mn + Math.floor(Math.random() * (mx - mn + 1));
          if (!knife && id === 'hide') q = Math.max(0, q - 1);
          if (q > 0) this.host.giveLoot(id, q);
        }
        if (!knife) this.host.events.emit('toast', { text: 'Without a knife, you salvage less.', kind: 'info', duration: 3 });
        this.host.events.emit('sfx', { name: 'gather', x: a.body.x });
        this.host.interactions.remove(it);
        a.carcass = null;
        a.deadTime = 999;
      },
    };
    a.carcass = it;
    this.host.interactions.add(it);
  }

  /** Spawn an animal at a point (debug and scripted encounters). */
  spawnAt(sp: Species, x: number, z = this.host.playerZ()): void {
    const y = this.world.resolveSpawnY(x, z, this.world.groundAt(x, z, 0.5), 0.5, 1);
    const a = new Animal(sp, x, y, z, regionAt(x).id);
    a.state = 'wander';
    this.animals.push(a);
    this.group.add(a.model.root);
  }

  private spawn(region: RegionId, night: boolean, px: number, pz: number): void {
    const pop = POPULATION[region];
    const counts: Partial<Record<Species, number>> = {};
    for (const a of this.animals) if (a.state !== 'dead') counts[a.species] = (counts[a.species] ?? 0) + 1;
    const options = (Object.keys(pop) as Species[]).filter((s) => {
      const def = SPECIES[s];
      const active = night ? def.nocturnal || (s === 'wolf' && region === 'frost') : def.diurnal || (s === 'wolf' && region === 'frost' && Math.random() < 0.3);
      const max = (pop[s] ?? 0) * (s === 'wolf' && night ? 1.5 : 1) * 1.5;
      return active && (counts[s] ?? 0) < max;
    });
    if (!options.length) return;
    const sp = options[Math.floor(Math.random() * options.length)];
    const ang = Math.random() * Math.PI * 2;
    const dist = 36 + Math.random() * 30;
    const x = px + Math.sin(ang) * dist;
    const z = pz + Math.cos(ang) * dist;
    const b = this.world.bounds;
    if (x < b.minX + 5 || x > b.maxX - 5 || z < b.minZ + 5 || z > b.maxZ - 5) return;
    if (this.world.terrain.waterAt(x, z)) return;
    if (this.world.terrain.gradientAt(x, z) > 0.9) return;
    const y = this.world.resolveSpawnY(x, z, this.world.groundAt(x, z, 0.5), 0.5, 1);
    if (this.host.isUnderground(x, z, y)) return;
    const a = new Animal(sp, x, y, z, region);
    a.state = sp === 'wolf' ? 'wander' : sp === 'bird' ? 'idle' : 'graze';
    a.timer = 2 + Math.random() * 4;
    this.animals.push(a);
    this.group.add(a.model.root);
  }

  update(dt: number): void {
    const px = this.host.playerX();
    const py = this.host.playerY();
    const pz = this.host.playerZ();
    const night = this.host.darkness() > 0.55;
    const region = regionAt(px).id;
    const underground = this.host.isUnderground(px, pz, py);

    if (this.enabled && !underground) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 2.5 + Math.random() * 2.5;
        this.spawn(region, night, px, pz);
      }
      if (night) {
        this.howlTimer -= dt;
        if (this.howlTimer <= 0) {
          this.howlTimer = 40 + Math.random() * 70;
          const wolves = this.animals.filter((a) => a.species === 'wolf' && (a.state === 'wander' || a.state === 'idle'));
          if (wolves.length) {
            this.host.events.emit('sfx', { name: 'howl' });
            // One of them sits back and howls.
            const w = wolves[Math.floor(Math.random() * wolves.length)];
            w.state = 'howl';
            w.timer = 3.3;
            w.quad?.howl();
          }
        }
      }
    }

    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      const dist = Math.hypot(a.body.x - px, a.body.z - pz);
      const far = dist > 110;
      const gone = a.state === 'dead' ? (a.deadTime += dt) > 240 : false;
      const outOfTime = a.state !== 'dead' && a.state !== 'attack' && a.state !== 'stalk' && dist > 45 && ((night && SPECIES[a.species].diurnal && a.species !== 'deer') || (!night && a.species === 'wolf' && region !== 'frost'));
      if (far || gone || (a.state === 'fly' && a.timer <= 0) || outOfTime || a.deadTime >= 999) {
        this.despawn(a);
        this.animals.splice(i, 1);
        continue;
      }
      this.think(a, dt, px, py, pz, night);
      this.move(a, dt, px, pz);
      a.animDt += dt;
    }
  }

  private think(a: Animal, dt: number, px: number, py: number, pz: number, night: boolean): void {
    const def = SPECIES[a.species];
    a.timer -= dt;
    a.attackCd -= dt;
    a.growlCd -= dt;
    a.hurtFlash = Math.max(0, a.hurtFlash - dt);
    if (a.state === 'dead') return;
    const b = a.body;
    const dist = Math.hypot(px - b.x, pz - b.z);
    const toward = angleTo(b.x, b.z, px, pz);
    const away = toward + Math.PI;

    if (a.species === 'bird') {
      if (a.state !== 'fly' && dist < def.shy) {
        a.state = 'fly';
        a.timer = 4;
        a.heading = away + (Math.random() - 0.5);
      }
      if (a.state === 'idle' && a.timer <= 0) a.timer = 1 + Math.random() * 3;
      return;
    }

    if (a.species === 'wolf') {
      const playerLight = this.host.lightAt(px, py + 1, pz);
      const wolfLight = this.host.lightAt(b.x, b.y + 0.5, b.z);
      const huntRange = night ? 28 : 12;
      if (a.state === 'flee') {
        a.heading = away;
        if (a.timer <= 0) a.state = 'wander';
        return;
      }
      if (wolfLight > 0.25) {
        // Light is life: wolves back away from fire and circle at its edge.
        a.state = 'circle';
        a.heading = away + a.circleDir * 0.9;
        a.timer = 1.2;
        if (a.growlCd <= 0 && dist < 16) {
          a.growlCd = 6 + Math.random() * 6;
          this.host.events.emit('sfx', { name: 'growl', x: b.x });
        }
        return;
      }
      if (dist < huntRange && playerLight < 0.3) {
        a.state = dist < 1.8 ? 'attack' : 'stalk';
        a.heading = toward;
        if (a.state === 'attack' && a.attackCd <= 0 && Math.abs(py - b.y) < 1.4) {
          a.attackCd = 1.5;
          a.quad?.bite();
          this.host.damagePlayer(9 + Math.random() * 6, 'wolves');
          this.host.events.emit('sfx', { name: 'growl', x: b.x });
        }
        return;
      }
      if (a.state === 'circle' || a.state === 'stalk') {
        // Prowl just outside the light, waiting for it to fail.
        if (dist < huntRange + 8 && playerLight >= 0.3) {
          a.state = 'circle';
          a.heading = toward + a.circleDir * (dist < 12 ? 2.2 : 1.4);
        } else a.state = 'wander';
        a.timer = 1;
        return;
      }
      if (a.timer <= 0) {
        a.state = Math.random() < 0.6 ? 'wander' : 'idle';
        a.timer = 2 + Math.random() * 5;
        a.heading += (Math.random() - 0.5) * 2;
      }
      return;
    }

    // Prey
    if (night && a.species === 'deer' && a.state !== 'flee') {
      if (a.state !== 'sleep') {
        a.state = 'sleep';
        a.timer = 30;
      }
      if (dist < def.shy * 0.5) {
        a.state = 'flee';
        a.timer = 5;
      }
      return;
    }
    if (a.state !== 'flee' && dist < def.shy) {
      a.state = 'flee';
      a.timer = 4 + Math.random() * 3;
    }
    if (a.state === 'flee') {
      a.heading = away + Math.sin(a.phase * 0.7) * 0.4;
      if (a.timer <= 0 && dist > def.shy * 1.5) {
        a.state = 'idle';
        a.timer = 2;
      }
      return;
    }
    if (a.timer <= 0) {
      const r = Math.random();
      a.state = r < 0.45 ? 'graze' : r < 0.85 ? 'wander' : 'idle';
      a.timer = 2 + Math.random() * 5;
      a.heading += (Math.random() - 0.5) * 2.4;
    }
  }

  private move(a: Animal, dt: number, px: number, pz: number): void {
    const def = SPECIES[a.species];
    const b = a.body;
    if (a.species === 'bird') {
      if (a.state === 'fly') {
        b.x += Math.sin(a.heading) * def.run * dt;
        b.z += Math.cos(a.heading) * def.run * dt;
        b.y += dt * 4;
      }
      return;
    }
    let speed = 0;
    switch (a.state) {
      case 'wander':
        speed = def.walk;
        break;
      case 'flee':
        speed = def.run;
        break;
      case 'stalk':
        speed = def.walk * 1.6;
        break;
      case 'attack':
        speed = def.run * 0.8;
        break;
      case 'circle':
        speed = def.walk * 1.3;
        break;
      default:
        speed = 0;
    }
    if (a.state === 'attack' && Math.hypot(px - b.x, pz - b.z) < 1.2) speed = 0;
    // Steer away from water, steep ground and the edges of the world.
    const lx = b.x + Math.sin(a.heading) * 2;
    const lz = b.z + Math.cos(a.heading) * 2;
    const wb = this.world.bounds;
    if (speed > 0 && (this.world.terrain.waterAt(lx, lz) || this.world.terrain.gradientAt(lx, lz) > 1 || lx < wb.minX + 3 || lx > wb.maxX - 3 || lz < wb.minZ + 3 || lz > wb.maxZ - 3)) {
      a.heading += a.circleDir * 1.2;
    }
    b.vx = damp(b.vx, Math.sin(a.heading) * speed, 6, dt);
    b.vz = damp(b.vz, Math.cos(a.heading) * speed, 6, dt);
    if (!b.grounded) b.vy = Math.max(-25, b.vy - 30 * dt);
    else b.vy = -1;
    const res = moveBody(this.world, b, dt, DEFAULT_MOVE);
    if ((res.blockedX || res.blockedZ) && b.grounded && speed > 0) {
      if (a.species === 'wolf' && a.state !== 'wander' && Math.random() < 0.3) b.vy = 7;
      else a.heading += a.circleDir * (1 + Math.random());
    }
    if (b.y < -400) a.deadTime = 999;
  }

  /**
   * Pose the animals once per rendered frame (not per physics step). Distant animals update
   * less often, and those beyond the fog are not drawn at all.
   */
  render(): void {
    const px = this.host.playerX();
    const pz = this.host.playerZ();
    this.frame++;
    for (const a of this.animals) {
      const d = Math.hypot(a.body.x - px, a.body.z - pz);
      a.model.root.visible = d < 120;
      if (!a.model.root.visible) continue;
      const every = d > 70 ? 4 : d > 30 ? 2 : 1;
      if (a.animDt <= 0 || (this.frame + a.slot) % every !== 0) {
        a.model.root.position.set(a.body.x, a.body.y, a.body.z);
        continue;
      }
      this.animate(a, Math.min(a.animDt, 0.1), px, pz);
      a.animDt = 0;
    }
  }

  private frame = 0;
  /** Feet only need the drawn surface height (cached grid). */
  private groundFn = (x: number, z: number) => this.world.terrain.surfaceY(x, z);

  private animate(a: Animal, dt: number, px: number, pz: number): void {
    const b = a.body;
    const m = a.model;
    m.root.position.set(b.x, b.y, b.z);
    const sp = Math.hypot(b.vx, b.vz);
    const face = sp > 0.3 ? Math.atan2(b.vx, b.vz) : a.heading;
    if (a.state !== 'dead') m.turnToward(face, dt, a.species === 'bird' ? 12 : 6);
    a.turn = damp(a.turn, angleDelta(a.lastYaw, m.yaw) / Math.max(dt, 1e-3), 8, dt);
    a.lastYaw = m.yaw;
    if (m instanceof Bird) {
      m.update(dt, a.state === 'fly', a.state === 'fly' && a.timer > 2.5);
      return;
    }
    const dist = Math.hypot(px - b.x, pz - b.z);
    const watching = dist < 16 && a.state !== 'flee' && a.state !== 'dead' && a.state !== 'sleep';
    m.update({
      dt,
      speed: sp,
      state: a.state,
      turn: a.turn,
      ground: this.groundFn,
      look: watching ? angleDelta(m.yaw, Math.atan2(px - b.x, pz - b.z)) : null,
      dark: this.host.darkness() > 0.4,
    });
  }
}
