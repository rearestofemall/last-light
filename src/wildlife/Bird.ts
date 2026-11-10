import * as THREE from 'three';
import { along, cone, ellipsoid, MeshKit, rigid } from '../character/MeshKit';
import { angleDelta, clamp, damp } from '../core/math';
import type { RegionId } from '../world/WorldDef';

/*
 * Small skinned birds in five varieties. On the ground they hop, peck, look about and fluff
 * their tails; in the air they flap (with a lagging wingtip), and the big ones glide.
 */

const BB = ['root', 'body', 'head', 'wingL', 'wingLt', 'wingR', 'wingRt', 'tail', 'legL', 'legR'] as const;
type BBone = (typeof BB)[number];
const BI = Object.fromEntries(BB.map((b, i) => [b, i])) as Record<BBone, number>;
const PARENT: Record<BBone, BBone | null> = {
  root: null,
  body: 'root',
  head: 'body',
  wingL: 'body',
  wingLt: 'wingL',
  wingR: 'body',
  wingRt: 'wingR',
  tail: 'body',
  legL: 'body',
  legR: 'body',
};

interface Variety {
  name: string;
  scale: number;
  back: number;
  belly: number;
  head: number;
  wing: number;
  tip: number;
  beak: number;
  /** Wingbeats per second; gliders flap slower and coast between bursts. */
  flap: number;
  glide: boolean;
}

const VARIETIES: Record<string, Variety> = {
  sparrow: { name: 'sparrow', scale: 1, back: 0x7a5a3e, belly: 0xcab79a, head: 0x6e665c, wing: 0x5e4630, tip: 0x3d2e22, beak: 0x2e2a26, flap: 13, glide: false },
  robin: { name: 'robin', scale: 1.1, back: 0x6e6152, belly: 0xd0603a, head: 0x5f5448, wing: 0x5a4f43, tip: 0x3b342d, beak: 0x2a2622, flap: 12, glide: false },
  pigeon: { name: 'pigeon', scale: 1.55, back: 0x8a8e96, belly: 0x9da1a8, head: 0x5f7a6e, wing: 0x7b7f87, tip: 0x3c3f45, beak: 0x2f2a2a, flap: 8, glide: false },
  crow: { name: 'crow', scale: 1.85, back: 0x1f1e22, belly: 0x26252a, head: 0x1a191d, wing: 0x1c1b20, tip: 0x111014, beak: 0x141316, flap: 5, glide: true },
  gull: { name: 'gull', scale: 2.2, back: 0xa9b2b9, belly: 0xf0f2f3, head: 0xf4f5f6, wing: 0xb6bec4, tip: 0x1d1e20, beak: 0xe0b33a, flap: 3.6, glide: true },
};

const REGION_BIRDS: Record<RegionId, string[]> = {
  woods: ['sparrow', 'sparrow', 'robin', 'crow'],
  frost: ['crow', 'sparrow'],
  city: ['pigeon', 'pigeon', 'crow', 'sparrow'],
  coast: ['gull', 'gull', 'sparrow'],
};

let material: THREE.Material | null = null;

function jitter(hex: number, k = 0.07): number {
  return new THREE.Color(hex).multiplyScalar(1 + (Math.random() - 0.5) * 2 * k).getHex();
}

export class Bird {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones = {} as Record<BBone, THREE.Bone>;
  readonly variety: Variety;
  yaw = 0;
  private time = Math.random() * 10;
  private flyW = 0;
  private flapPhase = Math.random();
  private peckT = 1;
  private hopT = 1;
  private nextAct = 0.5 + Math.random() * 2;
  private look = 0;
  private lookTarget = 0;
  private dead = false;
  private deadT = 0;

  constructor(region: RegionId) {
    this.variety = VARIETIES[REGION_BIRDS[region][Math.floor(Math.random() * REGION_BIRDS[region].length)]];
    const v = this.variety;
    const s = v.scale * (0.9 + Math.random() * 0.2);
    const J: Record<BBone, [number, number, number]> = {
      root: [0, 0, 0],
      body: [0, 0.07 * s, 0],
      head: [0, 0.1 * s, 0.05 * s],
      wingL: [0.03 * s, 0.095 * s, 0.02 * s],
      wingLt: [0.1 * s, 0.095 * s, 0.01 * s],
      wingR: [-0.03 * s, 0.095 * s, 0.02 * s],
      wingRt: [-0.1 * s, 0.095 * s, 0.01 * s],
      tail: [0, 0.08 * s, -0.055 * s],
      legL: [0.015 * s, 0.05 * s, 0],
      legR: [-0.015 * s, 0.05 * s, 0],
    };
    for (const n of BB) {
      const b = new THREE.Bone();
      b.name = n;
      const p = PARENT[n];
      const pj = p ? J[p] : [0, 0, 0];
      b.position.set(J[n][0] - pj[0], J[n][1] - pj[1], J[n][2] - pj[2]);
      this.bones[n] = b;
      if (p) this.bones[p].add(b);
    }
    const back = jitter(v.back);
    const belly = jitter(v.belly);
    const k = new MeshKit();
    const body = rigid(BI.body);
    k.addPainted(ellipsoid(0, 0.075 * s, 0, 0.036 * s, 0.034 * s, 0.065 * s, 8, 6), (c) => (c.y < 0.07 * s || (c.z > 0.03 * s && c.y < 0.085 * s) ? belly : back), body);
    const H = rigid(BI.head);
    k.add(ellipsoid(0, 0.108 * s, 0.062 * s, 0.026 * s, 0.026 * s, 0.028 * s, 7, 5), jitter(v.head), H);
    k.add(cone(0, 0, 0, 0.008 * s, 0.026 * s, 4).rotateX(Math.PI / 2).translate(0, 0.104 * s, 0.086 * s), v.beak, H);
    for (const x of [1, -1]) k.add(new THREE.BoxGeometry(0.006 * s, 0.007 * s, 0.006 * s).translate(x * 0.022 * s, 0.113 * s, 0.075 * s), 0x0c0b0a, H);
    // Wings: an inner panel and a tapering tip panel on their own bones.
    for (const x of [1, -1]) {
      const inner = x > 0 ? BI.wingL : BI.wingR;
      const tip = x > 0 ? BI.wingLt : BI.wingRt;
      const ws = along(new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, 0, 0), [[inner, -Infinity], [tip, 0.1 * s]], 0.01 * s);
      const g = new THREE.BoxGeometry(0.16 * s, 0.006 * s, 0.06 * s, 4, 1, 1);
      g.translate(x * 0.105 * s, 0.095 * s, -0.008 * s);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const ax = Math.abs(pos.getX(i)) / s;
        if (ax > 0.1) pos.setZ(i, pos.getZ(i) * (1 - (ax - 0.1) * 6) - (ax - 0.1) * 0.12 * s);
      }
      k.addPainted(g, (c) => (Math.abs(c.x) > 0.15 * s ? v.tip : jitter(v.wing, 0.03)), ws);
    }
    k.add(new THREE.BoxGeometry(0.045 * s, 0.006 * s, 0.06 * s).translate(0, 0.082 * s, -0.08 * s), jitter(v.wing), rigid(BI.tail));
    for (const x of [1, -1]) {
      const leg = rigid(x > 0 ? BI.legL : BI.legR);
      k.add(new THREE.CylinderGeometry(0.003 * s, 0.003 * s, 0.05 * s, 4).translate(x * 0.015 * s, 0.025 * s, 0.003 * s), 0x3a2d22, leg);
      k.add(new THREE.BoxGeometry(0.012 * s, 0.003 * s, 0.022 * s).translate(x * 0.015 * s, 0.002 * s, 0.008 * s), 0x3a2d22, leg);
    }
    material ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    this.mesh = new THREE.SkinnedMesh(k.build(), material);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.add(this.bones.root);
    this.mesh.bind(new THREE.Skeleton(BB.map((n) => this.bones[n])));
    this.root.add(this.mesh);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }

  die(): void {
    this.dead = true;
  }

  update(dt: number, flying: boolean, climbing: boolean): void {
    const B = this.bones;
    const v = this.variety;
    this.time += dt;
    this.root.rotation.set(0, this.yaw, 0);
    if (this.dead) {
      this.deadT = Math.min(1, this.deadT + dt * 3);
      this.mesh.rotation.z = this.deadT * 1.5;
      return;
    }
    this.flyW = damp(this.flyW, flying ? 1 : 0, 10, dt);

    // Flapping: gliders flap in bursts, small birds beat constantly. Takeoff beats harder.
    let beat = v.flap * (climbing ? 1.25 : 1);
    let amp = 1;
    if (v.glide && !climbing) {
      const cycle = (this.time * 0.6) % 1;
      if (cycle > 0.45) {
        amp = 0.15;
        beat *= 0.3;
      }
    }
    this.flapPhase += dt * beat;
    const f = Math.sin(this.flapPhase * Math.PI * 2);
    const ft = Math.sin(this.flapPhase * Math.PI * 2 - 0.9);
    const flapL = (0.15 + f * 0.85 * amp) * this.flyW;
    const tipL = (ft * 0.5 * amp) * this.flyW;
    // Folded at rest: wings swept back along the body.
    const fold = 1 - this.flyW;
    B.wingL.rotation.set(0, fold * 1.45, flapL - fold * 0.25);
    B.wingR.rotation.set(0, -fold * 1.45, -flapL + fold * 0.25);
    B.wingLt.rotation.set(0, fold * 0.2, tipL);
    B.wingRt.rotation.set(0, -fold * 0.2, -tipL);
    B.body.rotation.x = this.flyW * (climbing ? -0.35 : -0.05 + f * 0.04);
    B.body.position.y = 0.07 * v.scale + this.flyW * f * 0.01 * v.scale;
    B.legL.rotation.x = B.legR.rotation.x = this.flyW * 1.2;
    B.tail.rotation.x = this.flyW * 0.1;

    // Ground life: pecks, hops, glances and tail flicks.
    if (!flying) {
      this.nextAct -= dt;
      if (this.nextAct < 0) {
        this.nextAct = 0.6 + Math.random() * 2.2;
        const r = Math.random();
        if (r < 0.45) this.peckT = 0;
        else if (r < 0.7) this.hopT = 0;
        else this.lookTarget = (Math.random() - 0.5) * 2;
      }
    }
    this.peckT = Math.min(1, this.peckT + dt / 0.35);
    this.hopT = Math.min(1, this.hopT + dt / 0.3);
    const peck = Math.sin(this.peckT * Math.PI) * (1 - this.flyW);
    const hop = Math.sin(this.hopT * Math.PI) * (1 - this.flyW);
    this.look = damp(this.look, this.lookTarget, 10, dt);
    B.head.rotation.set(peck * 1.0, this.look * (1 - this.flyW), 0);
    B.body.rotation.x += peck * 0.35;
    B.body.position.y += hop * 0.03 * v.scale;
    B.root.position.z = this.hopT < 1 ? hop * 0.01 : 0;
    B.tail.rotation.x += Math.max(0, Math.sin(this.time * 3)) ** 12 * -0.6 * (1 - this.flyW);
  }

  turnToward(target: number, dt: number, rate = 10): void {
    this.yaw += angleDelta(this.yaw, target) * clamp(dt * rate, 0, 1);
  }
}
