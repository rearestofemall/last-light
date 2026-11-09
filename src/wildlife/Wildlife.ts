import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { GameEventBus } from '../core/events';
import type { Interactable, InteractionSystem } from '../interaction/InteractionSystem';
import type { CollisionWorld } from '../physics/CollisionWorld';
import { type Body, createBody, DEFAULT_MOVE, moveBody } from '../physics/KinematicBody';
import { regionAt, type RegionId } from '../world/WorldDef';

export type Species = 'deer' | 'rabbit' | 'wolf' | 'bird';
type State = 'idle' | 'graze' | 'wander' | 'flee' | 'sleep' | 'stalk' | 'circle' | 'attack' | 'fly' | 'dead';

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

const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true });
const MATS = {
  deer: mat(0x8a6040),
  deerLight: mat(0xd9c4a0),
  antler: mat(0xcdbb98),
  rabbit: mat(0x8b7d6b),
  rabbitW: mat(0xe8e2d6),
  wolf: mat(0x5d5a57),
  wolfDark: mat(0x3a3836),
  eye: new THREE.MeshBasicMaterial({ color: 0xffd36a }),
  bird: mat(0x4b3d33),
  birdB: mat(0xb2543a),
  black: mat(0x1a1a1a),
};

interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  wings?: THREE.Group[];
  eyes?: THREE.Mesh[];
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Procedural quadruped: body, neck/head, four jointed legs. Faces +x. */
function quadruped(sp: 'deer' | 'wolf' | 'rabbit'): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const head = new THREE.Group();
  const legs: THREE.Group[] = [];
  let eyes: THREE.Mesh[] | undefined;
  if (sp === 'deer') {
    body.position.y = 1.0;
    body.add(box(1.2, 0.5, 0.42, MATS.deer));
    body.add(box(0.5, 0.2, 0.36, MATS.deerLight, -0.1, -0.2, 0));
    body.add(box(0.12, 0.18, 0.12, MATS.deerLight, -0.65, 0.12, 0));
    head.position.set(0.55, 0.25, 0);
    body.add(head);
    const neck = box(0.18, 0.55, 0.2, MATS.deer, 0.08, 0.22, 0);
    neck.rotation.z = -0.4;
    head.add(neck);
    head.add(box(0.36, 0.2, 0.2, MATS.deer, 0.28, 0.5, 0));
    head.add(box(0.1, 0.08, 0.14, MATS.black, 0.47, 0.47, 0));
    for (const s of [-1, 1]) {
      const ear = box(0.06, 0.16, 0.08, MATS.deer, 0.15, 0.66, s * 0.12);
      ear.rotation.x = s * 0.6;
      head.add(ear);
      const a1 = box(0.04, 0.4, 0.04, MATS.antler, 0.18, 0.82, s * 0.09);
      a1.rotation.x = s * 0.25;
      head.add(a1);
      const a2 = box(0.03, 0.22, 0.03, MATS.antler, 0.28, 0.9, s * 0.13);
      a2.rotation.z = -0.7;
      head.add(a2);
    }
  } else if (sp === 'wolf') {
    body.position.y = 0.72;
    body.add(box(0.95, 0.38, 0.32, MATS.wolf));
    body.add(box(0.4, 0.42, 0.36, MATS.wolfDark, 0.25, 0.04, 0));
    const tail = box(0.5, 0.1, 0.1, MATS.wolfDark, -0.65, 0.02, 0);
    tail.rotation.z = 0.4;
    body.add(tail);
    head.position.set(0.5, 0.12, 0);
    body.add(head);
    head.add(box(0.3, 0.26, 0.26, MATS.wolf, 0.12, 0.05, 0));
    head.add(box(0.24, 0.12, 0.14, MATS.wolfDark, 0.34, -0.02, 0));
    eyes = [];
    for (const s of [-1, 1]) {
      head.add(box(0.06, 0.12, 0.06, MATS.wolfDark, 0.05, 0.24, s * 0.08));
      const eye = box(0.03, 0.03, 0.03, MATS.eye, 0.27, 0.11, s * 0.08);
      eye.castShadow = false;
      head.add(eye);
      eyes.push(eye);
    }
  } else {
    body.position.y = 0.2;
    body.add(box(0.32, 0.2, 0.2, MATS.rabbit));
    body.add(box(0.08, 0.08, 0.08, MATS.rabbitW, -0.18, 0.04, 0));
    head.position.set(0.17, 0.1, 0);
    body.add(head);
    head.add(box(0.14, 0.13, 0.13, MATS.rabbit, 0.03, 0.02, 0));
    for (const s of [-1, 1]) head.add(box(0.04, 0.18, 0.05, MATS.rabbit, -0.02, 0.15, s * 0.04));
  }
  const legLen = sp === 'deer' ? 0.95 : sp === 'wolf' ? 0.62 : 0.14;
  const legW = sp === 'deer' ? 0.08 : sp === 'wolf' ? 0.09 : 0.06;
  const legX = sp === 'deer' ? 0.48 : sp === 'wolf' ? 0.36 : 0.11;
  const legZ = sp === 'deer' ? 0.13 : sp === 'wolf' ? 0.1 : 0.07;
  const lm = sp === 'deer' ? MATS.deer : sp === 'wolf' ? MATS.wolf : MATS.rabbit;
  for (const lx of [legX, -legX]) {
    for (const lz of [legZ, -legZ]) {
      const leg = new THREE.Group();
      leg.position.set(lx, body.position.y - (sp === 'rabbit' ? 0.05 : 0.15), lz);
      leg.add(box(legW, legLen, legW, lm, 0, -legLen / 2 + (sp === 'rabbit' ? 0 : 0.1), 0));
      root.add(leg);
      legs.push(leg);
    }
  }
  return { root, body, head, legs, eyes };
}

function birdRig(): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.12;
  root.add(body);
  body.add(box(0.18, 0.1, 0.1, MATS.bird));
  body.add(box(0.06, 0.06, 0.08, MATS.birdB, 0.06, -0.02, 0));
  body.add(box(0.12, 0.03, 0.06, MATS.bird, -0.13, 0.02, 0));
  const head = new THREE.Group();
  head.position.set(0.1, 0.06, 0);
  head.add(box(0.07, 0.07, 0.07, MATS.bird));
  head.add(box(0.04, 0.015, 0.015, MATS.black, 0.05, -0.01, 0));
  body.add(head);
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(0, 0.03, s * 0.05);
    const blade = box(0.14, 0.015, 0.2, MATS.bird, 0, 0, s * 0.1);
    w.add(blade);
    body.add(w);
    wings.push(w);
  }
  const legs: THREE.Group[] = [];
  return { root, body, head, legs, wings };
}

export interface WildlifeHost {
  events: GameEventBus;
  interactions: InteractionSystem;
  playerX(): number;
  playerY(): number;
  /** Light level at a point from fires, torches, lanterns. */
  lightAt(x: number, y: number): number;
  /** 0 day … 1 night */
  darkness(): number;
  damagePlayer(amount: number, cause: string): void;
  giveLoot(id: string, qty: number): number;
  hasKnife(): boolean;
  isUnderground(x: number, y: number): boolean;
}

let nextId = 0;

class Animal {
  readonly id = `a${nextId++}`;
  body: Body;
  state: State = 'idle';
  timer = 0;
  dir: 1 | -1 = 1;
  hp: number;
  rig: Rig;
  phase = Math.random() * 10;
  attackCd = 0;
  hurtFlash = 0;
  growlCd = 0;
  carcass: Interactable | null = null;
  deadTime = 0;
  flyY = 0;
  yaw = 0;

  constructor(
    readonly species: Species,
    x: number,
    y: number,
  ) {
    const def = SPECIES[species];
    this.hp = def.hp;
    this.body = createBody(x, y, species === 'deer' ? 0.5 : species === 'wolf' ? 0.4 : 0.15, def.size);
    this.rig = species === 'bird' ? birdRig() : quadruped(species);
    this.rig.root.traverse((o) => (o.castShadow = true));
  }
}

/**
 * Spawns and simulates animals around the player. Each species runs a small state machine;
 * time of day, light and the player's behaviour drive transitions.
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

  /** 0–1: how close the nearest hunting wolf is (drives tension music). */
  get threat(): number {
    let t = 0;
    const px = this.host.playerX();
    for (const a of this.animals) {
      if (a.species !== 'wolf' || (a.state !== 'stalk' && a.state !== 'attack' && a.state !== 'circle')) continue;
      t = Math.max(t, 1 - Math.min(1, Math.abs(a.body.x - px) / 25));
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
    this.group.remove(a.rig.root);
    if (a.carcass) this.host.interactions.remove(a.carcass);
  }

  /** Attack animals in front of the player. Returns true if something was hit. */
  strike(x: number, y: number, facing: number, reach: number, damage: number): boolean {
    let hit = false;
    for (const a of this.animals) {
      if (a.state === 'dead') continue;
      const dx = (a.body.x - x) * facing;
      if (dx < -0.4 || dx > reach + a.body.halfWidth || Math.abs(a.body.y - y) > 1.6) continue;
      a.hp -= damage;
      a.hurtFlash = 0.25;
      hit = true;
      if (a.hp <= 0) this.kill(a);
      else if (a.species === 'wolf') {
        a.state = a.hp < SPECIES.wolf.hp * 0.35 ? 'flee' : 'attack';
        a.timer = 4;
      } else {
        a.state = 'flee';
        a.timer = 6;
        a.dir = a.body.x > x ? 1 : -1;
      }
    }
    return hit;
  }

  private kill(a: Animal): void {
    a.state = 'dead';
    a.deadTime = 0;
    a.body.vx = 0;
    const def = SPECIES[a.species];
    if (!def.loot.length) {
      a.deadTime = 999;
      return;
    }
    const it: Interactable = {
      id: `carcass-${a.id}`,
      x: a.body.x,
      y: a.body.y + 0.5,
      radius: 1.6,
      verb: 'Butcher',
      label: def.label.toLowerCase(),
      onInteract: () => {
        const knife = this.host.hasKnife();
        let got = 0;
        for (const [id, mn, mx] of def.loot) {
          let q = mn + Math.floor(Math.random() * (mx - mn + 1));
          if (!knife && id === 'hide') q = Math.max(0, q - 1);
          if (q > 0) got += this.host.giveLoot(id, q);
        }
        if (!knife) this.host.events.emit('toast', { text: 'Without a knife, you salvage less.', kind: 'info', duration: 3 });
        this.host.events.emit('sfx', { name: 'gather', x: a.body.x });
        if (got >= 0) {
          this.host.interactions.remove(it);
          a.carcass = null;
          a.deadTime = 999;
        }
      },
    };
    a.carcass = it;
    this.host.interactions.add(it);
  }

  private spawn(region: RegionId, night: boolean, px: number): void {
    const pop = POPULATION[region];
    const counts: Partial<Record<Species, number>> = {};
    for (const a of this.animals) if (a.state !== 'dead') counts[a.species] = (counts[a.species] ?? 0) + 1;
    const options = (Object.keys(pop) as Species[]).filter((s) => {
      const def = SPECIES[s];
      const active = night ? def.nocturnal || (s === 'wolf' && region === 'frost') : def.diurnal || (s === 'wolf' && region === 'frost' && Math.random() < 0.3);
      const max = (pop[s] ?? 0) * (s === 'wolf' && night ? 1.5 : 1);
      return active && (counts[s] ?? 0) < max;
    });
    if (!options.length) return;
    const sp = options[Math.floor(Math.random() * options.length)];
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = px + side * (34 + Math.random() * 30);
    if (x < this.world.bounds.min + 5 || x > this.world.bounds.max - 5) return;
    if (this.world.terrain.waterAt(x)) return;
    const y = this.world.resolveSpawnY(x, this.world.groundAt(x, 0.5), 0.5, 1);
    if (this.host.isUnderground(x, y)) return;
    const a = new Animal(sp, x, y);
    a.dir = side > 0 ? -1 : 1;
    a.state = sp === 'wolf' ? 'wander' : 'graze';
    a.timer = 2 + Math.random() * 4;
    if (sp === 'bird') a.state = 'idle';
    this.animals.push(a);
    this.group.add(a.rig.root);
  }

  update(dt: number): void {
    const px = this.host.playerX();
    const py = this.host.playerY();
    const night = this.host.darkness() > 0.55;
    const region = regionAt(px).id;
    const underground = this.host.isUnderground(px, py);

    if (this.enabled && !underground) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 3 + Math.random() * 3;
        this.spawn(region, night, px);
      }
      if (night) {
        this.howlTimer -= dt;
        if (this.howlTimer <= 0) {
          this.howlTimer = 40 + Math.random() * 70;
          if (this.animals.some((a) => a.species === 'wolf' && a.state !== 'dead')) this.host.events.emit('sfx', { name: 'howl' });
        }
      }
    }

    for (let i = this.animals.length - 1; i >= 0; i--) {
      const a = this.animals[i];
      const far = Math.abs(a.body.x - px) > 110;
      const gone = a.state === 'dead' ? (a.deadTime += dt) > 240 : false;
      const outOfTime = a.state !== 'dead' && a.state !== 'attack' && a.state !== 'stalk' && Math.abs(a.body.x - px) > 45 && ((night && SPECIES[a.species].diurnal && a.species !== 'deer') || (!night && a.species === 'wolf' && region !== 'frost'));
      if (far || gone || (a.state === 'fly' && a.timer <= 0) || outOfTime || (a.deadTime >= 999)) {
        this.despawn(a);
        this.animals.splice(i, 1);
        continue;
      }
      this.think(a, dt, px, py, night);
      this.move(a, dt);
      this.animate(a, dt);
    }
  }

  private think(a: Animal, dt: number, px: number, py: number, night: boolean): void {
    const def = SPECIES[a.species];
    a.timer -= dt;
    a.attackCd -= dt;
    a.growlCd -= dt;
    a.hurtFlash = Math.max(0, a.hurtFlash - dt);
    if (a.state === 'dead') return;
    const dx = px - a.body.x;
    const dist = Math.abs(dx);
    const toward: 1 | -1 = dx > 0 ? 1 : -1;

    if (a.species === 'bird') {
      if (a.state !== 'fly' && dist < def.shy) {
        a.state = 'fly';
        a.timer = 4;
        a.dir = toward === 1 ? -1 : 1;
      }
      if (a.state === 'idle' && a.timer <= 0) {
        a.timer = 1 + Math.random() * 3;
        if (Math.random() < 0.3) a.dir = a.dir === 1 ? -1 : 1;
      }
      return;
    }

    if (a.species === 'wolf') {
      const playerLight = this.host.lightAt(px, py);
      const wolfLight = this.host.lightAt(a.body.x, a.body.y);
      const huntRange = night ? 26 : 12;
      if (a.state === 'flee') {
        a.dir = toward === 1 ? -1 : 1;
        if (a.timer <= 0) a.state = 'wander';
        return;
      }
      if (wolfLight > 0.25) {
        // Light is life: wolves back away from fire and circle at its edge.
        a.state = 'circle';
        a.dir = toward === 1 ? -1 : 1;
        a.timer = 1.5;
        if (a.growlCd <= 0 && dist < 16) {
          a.growlCd = 6 + Math.random() * 6;
          this.host.events.emit('sfx', { name: 'growl', x: a.body.x });
        }
        return;
      }
      if (dist < huntRange && playerLight < 0.3) {
        a.state = dist < 1.8 ? 'attack' : 'stalk';
        a.dir = toward;
        if (a.state === 'attack' && a.attackCd <= 0 && Math.abs(py - a.body.y) < 1.4) {
          a.attackCd = 1.5;
          this.host.damagePlayer(9 + Math.random() * 6, 'wolves');
          this.host.events.emit('sfx', { name: 'growl', x: a.body.x });
        }
        return;
      }
      if (a.state === 'circle' || a.state === 'stalk') {
        // Prowl just outside the light, waiting for it to fail.
        a.state = dist < huntRange + 6 && playerLight >= 0.3 ? 'circle' : 'wander';
        a.dir = a.state === 'circle' ? (dist < 12 ? (toward === 1 ? -1 : 1) : toward) : a.dir;
        a.timer = 1;
        return;
      }
      if (a.timer <= 0) {
        a.state = Math.random() < 0.6 ? 'wander' : 'idle';
        a.timer = 2 + Math.random() * 5;
        if (Math.random() < 0.5) a.dir = a.dir === 1 ? -1 : 1;
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
      a.dir = toward === 1 ? -1 : 1;
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
      if (Math.random() < 0.4) a.dir = a.dir === 1 ? -1 : 1;
    }
  }

  private move(a: Animal, dt: number): void {
    const def = SPECIES[a.species];
    const b = a.body;
    if (a.species === 'bird') {
      if (a.state === 'fly') {
        b.x += a.dir * def.run * dt;
        a.flyY += dt * 4;
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
        speed = def.walk * 1.5;
        break;
      case 'attack':
        speed = def.run * 0.8;
        break;
      case 'circle':
        speed = def.walk * 1.2;
        break;
      case 'dead':
      case 'sleep':
      case 'graze':
      case 'idle':
        speed = 0;
    }
    if (a.state === 'attack' && Math.abs(this.host.playerX() - b.x) < 1.1) speed = 0;
    // Avoid water and world edges by turning around.
    const ahead = b.x + a.dir * 1.5;
    if (speed > 0 && (this.world.terrain.waterAt(ahead) || ahead < this.world.bounds.min + 3 || ahead > this.world.bounds.max - 3)) {
      a.dir = a.dir === 1 ? -1 : 1;
      if (a.state === 'flee') a.timer = Math.min(a.timer, 0.5);
    }
    b.vx = damp(b.vx, a.dir * speed, 6, dt);
    if (!b.grounded) b.vy = Math.max(-25, b.vy - 30 * dt);
    else b.vy = -1;
    const res = moveBody(this.world, b, dt, DEFAULT_MOVE);
    if (res.blockedX && b.grounded && speed > 0) {
      // Hop small obstacles; otherwise turn back.
      if (a.species !== 'wolf' || a.state === 'wander') a.dir = a.dir === 1 ? -1 : 1;
      else b.vy = 7;
    }
    if (b.y < -400) a.deadTime = 999;
  }

  private animate(a: Animal, dt: number): void {
    const r = a.rig;
    const b = a.body;
    r.root.position.set(b.x, b.y, a.species === 'bird' ? -0.6 : -0.9);
    const targetYaw = a.dir === 1 ? -0.25 : Math.PI + 0.25;
    a.yaw += (targetYaw - a.yaw) * clamp(dt * 8, 0, 1);
    r.root.rotation.y = a.yaw;
    const speed = Math.abs(b.vx);
    a.phase += dt * (2 + speed * 2.2);
    if (a.species === 'bird') {
      const flap = a.state === 'fly' ? Math.sin(a.phase * 5) * 0.9 : 0;
      r.wings![0].rotation.x = flap;
      r.wings![1].rotation.x = -flap;
      r.head.rotation.z = a.state === 'idle' ? Math.sin(a.phase * 3) * 0.3 - 0.2 : 0;
      r.body.position.y = 0.12 + (a.state === 'idle' ? Math.abs(Math.sin(a.phase * 2)) * 0.02 : 0);
      return;
    }
    if (a.state === 'dead') {
      r.root.rotation.x = damp(r.root.rotation.x, Math.PI / 2, 6, dt);
      r.root.position.y = b.y + 0.15;
      return;
    }
    const swing = Math.min(1, speed / 3) * 0.6;
    r.legs.forEach((leg, i) => {
      const off = i === 0 || i === 3 ? 0 : Math.PI;
      leg.rotation.z = Math.sin(a.phase + off) * swing;
    });
    const sleeping = a.state === 'sleep';
    r.body.rotation.z = damp(r.body.rotation.z, a.state === 'graze' ? -0.08 : a.state === 'flee' ? 0.05 : 0, 6, dt);
    r.head.rotation.z = damp(r.head.rotation.z, a.state === 'graze' ? -1.1 : a.state === 'stalk' || a.state === 'circle' ? -0.35 : 0, 5, dt);
    const lower = sleeping ? (a.species === 'deer' ? 0.55 : 0.35) : a.state === 'stalk' ? 0.12 : 0;
    r.root.position.y = b.y - lower + (a.species === 'rabbit' && speed > 0.5 ? Math.abs(Math.sin(a.phase)) * 0.15 : 0);
    if (r.eyes) for (const e of r.eyes) e.visible = this.host.darkness() > 0.4;
  }
}
