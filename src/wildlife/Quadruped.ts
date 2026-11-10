import * as THREE from 'three';
import { MeshKit } from '../character/MeshKit';
import { solveLeg } from '../character/ik';
import { angleDelta, clamp, damp, lerp, smoothstep } from '../core/math';

/*
 * Skinned procedural quadruped (wolves, deer, rabbits). Faces +z. Each species supplies joint
 * positions and sculpts its own mesh; this class owns the skeleton and the animation:
 *  - gaits (walk, trot, gallop, bound, hop) with feet placed on the ground by two-bone IK
 *  - behaviour poses (graze, alert, sleep, stalk, sit/howl) blended with damped weights
 *  - one-shots (bite, flinch) and death (rolls onto its side, legs go limp)
 *  - idle life: breathing, ear flicks, tail sway, glances
 */

export const QBONES = [
  'root',
  'pelvis',
  'chest',
  'neck',
  'head',
  'jaw',
  'earL',
  'earR',
  'tail1',
  'tail2',
  'FLu',
  'FLl',
  'FLf',
  'FRu',
  'FRl',
  'FRf',
  'HLu',
  'HLl',
  'HLf',
  'HRu',
  'HRl',
  'HRf',
] as const;
export type QBone = (typeof QBONES)[number];
export const QI = Object.fromEntries(QBONES.map((b, i) => [b, i])) as Record<QBone, number>;

const PARENT: Record<QBone, QBone | null> = {
  root: null,
  pelvis: 'root',
  chest: 'pelvis',
  neck: 'chest',
  head: 'neck',
  jaw: 'head',
  earL: 'head',
  earR: 'head',
  tail1: 'pelvis',
  tail2: 'tail1',
  FLu: 'chest',
  FLl: 'FLu',
  FLf: 'FLl',
  FRu: 'chest',
  FRl: 'FRu',
  FRf: 'FRl',
  HLu: 'pelvis',
  HLl: 'HLu',
  HLf: 'HLl',
  HRu: 'pelvis',
  HRl: 'HRu',
  HRf: 'HRl',
};

export type Gait = 'walk' | 'trot' | 'gallop' | 'bound';
/** Phase offsets per leg [FL, FR, HL, HR] and the fraction of the cycle each foot is down. */
const GAITS: Record<Gait, { off: [number, number, number, number]; duty: number }> = {
  walk: { off: [0.25, 0.75, 0, 0.5], duty: 0.64 },
  trot: { off: [0, 0.5, 0.5, 0], duty: 0.48 },
  gallop: { off: [0.58, 0.68, 0, 0.1], duty: 0.36 },
  bound: { off: [0.5, 0.56, 0, 0.04], duty: 0.32 },
};

export interface QuadSpec {
  joints: Record<QBone, [number, number, number]>;
  /** Upper/lower leg lengths (front, hind): the IK chain. */
  front: [number, number];
  hind: [number, number];
  /** Height of the foot bone above the ground when standing. */
  footH: { front: number; hind: number };
  /** Distance travelled per gait cycle. */
  stride: { walk: number; run: number };
  runGait: Gait;
  /** Speed (m/s) where the gait switches from walk to run. */
  runAt: number;
  /** Foot lift in the swing phase (walk, run). */
  lift: [number, number];
  /** Body half-height, for lying down and dying. */
  bodyR: number;
  /** Hop arc height for bounding species (rabbits), 0 otherwise. */
  hop: number;
  /** Behaviour flavour. */
  kind: 'wolf' | 'deer' | 'rabbit';
}

export interface AnimInput {
  dt: number;
  /** Horizontal speed (m/s). */
  speed: number;
  state: string;
  /** Turn rate (rad/s) for leaning. */
  turn: number;
  /** World-space ground height under a point. */
  ground: (x: number, z: number) => number;
  /** Bearing to the player relative to the body (rad), for glances; null to ignore. */
  look: number | null;
  /** Night: wolves' eyes catch the light. */
  dark: boolean;
}

export class Quadruped {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones = {} as Record<QBone, THREE.Bone>;
  readonly rest = {} as Record<QBone, THREE.Vector3>;
  readonly eyes: THREE.Mesh[] = [];
  /** World yaw (set by the owner). */
  yaw = 0;

  private phase = Math.random();
  private time = Math.random() * 100;
  private runW = 0;
  private moveW = 0;
  private grazeW = 0;
  private alertW = 0;
  private sleepW = 0;
  private stalkW = 0;
  private sitW = 0;
  private lean = 0;
  private lookYaw = 0;
  private biteT = 1;
  private hurtT = 1;
  private howlT = 1;
  private deadT = -1;
  private earFlick = [0, 0];
  private earTimer = 1 + Math.random() * 3;
  private glanceT = 4 + Math.random() * 6;
  private glance = 0;
  private hop = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private legLen: Record<'F' | 'H', [number, number]>;

  constructor(
    readonly spec: QuadSpec,
    sculpt: (kit: MeshKit, spec: QuadSpec) => void,
    material: THREE.Material,
  ) {
    for (const name of QBONES) {
      const b = new THREE.Bone();
      b.name = name;
      const j = spec.joints[name];
      const p = PARENT[name];
      const pj = p ? spec.joints[p] : [0, 0, 0];
      b.position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]);
      this.rest[name] = b.position.clone();
      this.bones[name] = b;
      if (p) this.bones[p].add(b);
    }
    const kit = new MeshKit();
    sculpt(kit, spec);
    this.mesh = new THREE.SkinnedMesh(kit.build(), material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.add(this.bones.root);
    this.mesh.bind(new THREE.Skeleton(QBONES.map((n) => this.bones[n])));
    this.root.add(this.mesh);
    this.legLen = { F: spec.front, H: spec.hind };
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    for (const e of this.eyes) e.geometry.dispose();
  }

  bite(): void {
    this.biteT = 0;
  }
  hurt(): void {
    this.hurtT = 0;
  }
  howl(): void {
    this.howlT = 0;
  }
  die(): void {
    if (this.deadT < 0) this.deadT = 0;
  }
  get dead(): boolean {
    return this.deadT >= 0;
  }

  update(inp: AnimInput): void {
    const { dt, speed } = inp;
    const S = this.spec;
    const B = this.bones;
    this.time += dt;
    for (const n of QBONES) {
      B[n].position.copy(this.rest[n]);
      B[n].rotation.set(0, 0, 0);
    }
    this.root.rotation.set(0, this.yaw, 0);

    // ---- Death: roll onto the side, legs limp ----
    if (this.deadT >= 0) {
      this.deadT += dt;
      const k = smoothstep(0, 0.7, this.deadT);
      // Rolling about the feet swings the body centre (at hip height h) to (-h, 0);
      // shift it back over the spot and up by the body's half-height so it rests on the ground.
      this.mesh.rotation.z = (k * Math.PI) / 2;
      this.mesh.position.set(k * S.joints.pelvis[1], k * S.bodyR * 0.9, 0);
      const limp = (b: QBone, v: number) => (B[b].rotation.x = v * k);
      limp('FLu', -0.3);
      limp('FLl', -0.4);
      limp('FRu', -0.5);
      limp('FRl', -0.3);
      limp('HLu', 0.3);
      limp('HLl', 0.4);
      limp('HRu', 0.45);
      limp('HRl', 0.5);
      B.neck.rotation.x = k * 0.4;
      B.head.rotation.x = k * 0.3;
      B.jaw.rotation.x = k * 0.15;
      B.tail1.rotation.x = k * 0.6;
      for (const e of this.eyes) e.visible = false;
      return;
    }
    this.mesh.rotation.z = 0;
    this.mesh.position.set(0, 0, 0);

    // ---- Behaviour weights ----
    const st = inp.state;
    this.moveW = damp(this.moveW, smoothstep(0.05, 0.6, speed), 8, dt);
    this.runW = damp(this.runW, speed > S.runAt ? 1 : 0, 6, dt);
    this.grazeW = damp(this.grazeW, st === 'graze' && speed < 0.4 ? 1 : 0, 3, dt);
    const near = inp.look !== null;
    this.alertW = damp(this.alertW, (st === 'idle' && near) || st === 'circle' ? 1 : 0, 4, dt);
    this.sleepW = damp(this.sleepW, st === 'sleep' ? 1 : 0, 1.5, dt);
    this.stalkW = damp(this.stalkW, st === 'stalk' || st === 'circle' ? 1 : 0, 4, dt);
    const howling = this.howlT < 1;
    this.sitW = damp(this.sitW, howling ? 1 : 0, 4, dt);
    this.lean = damp(this.lean, clamp(-inp.turn * speed * 0.03, -0.35, 0.35), 6, dt);

    // ---- Gait phase and hop arc ----
    const stride = lerp(S.stride.walk, S.stride.run, this.runW);
    this.phase += (speed / stride) * dt;
    const g0 = GAITS.walk;
    const g1 = GAITS[S.runGait];
    const breathe = Math.sin(this.time * (this.stalkW > 0.5 ? 4 : 1.7)) * 0.012;

    // ---- Body pose ----
    // A little below full leg length even when standing, so knees never lock straight.
    const stance = S.joints.pelvis[1] * 0.045;
    const drop = stance + this.sleepW * (S.joints.pelvis[1] - S.bodyR * 1.05 - stance) + this.stalkW * S.joints.pelvis[1] * 0.14 + this.grazeW * 0.02;
    const bob = Math.cos(this.phase * Math.PI * 4) * 0.012 * this.moveW * (1 + this.runW * 2) * S.joints.pelvis[1];
    let hopY = 0;
    if (S.hop > 0 && this.moveW > 0.05) {
      // Rabbits: a bouncing arc each cycle.
      const q = this.phase % 1;
      hopY = Math.max(0, Math.sin(((q - 0.05) / 0.6) * Math.PI)) * S.hop * this.moveW * (q > 0.05 && q < 0.65 ? 1 : 0);
      this.hop = hopY;
    }
    // Sitting (to howl) drops the rump rather than lifting the chest.
    B.pelvis.position.y += -drop + bob + hopY + breathe * 0.2 - this.sitW * S.joints.pelvis[1] * 0.3;
    const gallopPitch = this.runW * (S.runGait === 'gallop' || S.runGait === 'bound' ? Math.sin(this.phase * Math.PI * 2) * 0.12 : 0);
    B.pelvis.rotation.x = gallopPitch - this.sitW * 0.42 + this.stalkW * 0.04;
    B.pelvis.rotation.z = this.lean * 0.5;
    B.chest.rotation.x = -gallopPitch * 0.6 + breathe + this.sitW * 0.12;
    B.chest.rotation.z = this.lean * 0.3;

    // ---- Head, neck, ears, jaw ----
    this.glanceT -= dt;
    if (this.glanceT < 0) {
      this.glanceT = 3 + Math.random() * 7;
      this.glance = (Math.random() - 0.5) * 1.2;
    }
    const wantLook = inp.look !== null ? clamp(inp.look, -1.2, 1.2) : this.moveW > 0.5 ? 0 : this.glance;
    this.lookYaw = damp(this.lookYaw, wantLook, 4, dt);
    const headBob = Math.sin(this.phase * Math.PI * 4) * 0.05 * this.moveW;
    const chew = this.grazeW * Math.max(0, Math.sin(this.time * 9)) * 0.12;
    const neckDown = this.grazeW * (S.kind === 'rabbit' ? 0.5 : S.kind === 'deer' ? 1.85 : 1.3) + this.sleepW * 0.5 + this.stalkW * 0.35 - this.alertW * 0.2 - this.sitW * 0.5;
    B.neck.rotation.x = neckDown + headBob + this.runW * 0.15 * (S.kind === 'deer' ? -1 : 1);
    B.neck.rotation.y = this.lookYaw * 0.5 * (1 - this.grazeW);
    B.head.rotation.x = this.grazeW * (S.kind === 'deer' ? -0.35 : 0.35) + this.sleepW * 0.3 - this.sitW * 0.9 - headBob * 0.6;
    B.head.rotation.y = this.lookYaw * 0.5 * (1 - this.grazeW);
    B.jaw.rotation.x = chew;

    this.earTimer -= dt;
    if (this.earTimer < 0) {
      this.earTimer = 1.5 + Math.random() * 4;
      this.earFlick[Math.random() < 0.5 ? 0 : 1] = 1;
    }
    for (let i = 0; i < 2; i++) {
      this.earFlick[i] = Math.max(0, this.earFlick[i] - dt * 5);
      const ear = B[i === 0 ? 'earL' : 'earR'];
      const s = i === 0 ? 1 : -1;
      const flat = this.stalkW * 0.9 + this.sleepW * 0.6 + this.runW * 0.5;
      ear.rotation.x = flat * 0.9 - this.alertW * 0.2;
      ear.rotation.z = s * (Math.sin(this.earFlick[i] * Math.PI * 3) * 0.35 + flat * 0.4);
    }

    // ---- Tail ----
    const tailWag = Math.sin(this.time * (this.alertW > 0.5 ? 3 : 1.4)) * (0.15 + this.moveW * 0.1);
    let tailLift = 0;
    if (S.kind === 'wolf') tailLift = -this.stalkW * 0.5 + this.runW * 0.25 + this.alertW * 0.25 - this.sleepW * 0.4;
    else if (S.kind === 'deer') tailLift = st === 'flee' ? -1.1 : Math.max(0, Math.sin(this.time * 2.3)) ** 8 * -0.6;
    else tailLift = Math.sin(this.time * 8) * 0.1 * this.moveW;
    B.tail1.rotation.x = tailLift + this.runW * 0.2;
    B.tail1.rotation.y = tailWag;
    B.tail2.rotation.y = tailWag * 0.8;
    B.tail2.rotation.x = tailLift * 0.4;

    // ---- One-shots ----
    if (this.biteT < 1) {
      this.biteT = Math.min(1, this.biteT + dt / 0.55);
      const t = this.biteT;
      const lunge = t < 0.25 ? -t / 0.25 : t < 0.45 ? -1 + ((t - 0.25) / 0.2) * 2.2 : 1.2 * (1 - (t - 0.45) / 0.55);
      B.pelvis.position.z += lunge * 0.12;
      B.chest.rotation.x += lunge * 0.12;
      B.neck.rotation.x -= lunge * 0.25;
      B.head.rotation.x += lunge * 0.1;
      B.jaw.rotation.x = Math.max(B.jaw.rotation.x, t > 0.15 && t < 0.5 ? 0.6 * Math.sin(((t - 0.15) / 0.35) * Math.PI) : 0);
    }
    if (this.hurtT < 1) {
      this.hurtT = Math.min(1, this.hurtT + dt / 0.35);
      const k = Math.sin(this.hurtT * Math.PI) * (1 - this.hurtT);
      B.pelvis.rotation.z += k * 0.25;
      B.chest.rotation.x -= k * 0.3;
      B.neck.rotation.x -= k * 0.4;
    }
    if (this.howlT < 1) {
      this.howlT = Math.min(1, this.howlT + dt / 3.2);
      const k = smoothstep(0, 0.2, this.howlT) * (1 - smoothstep(0.85, 1, this.howlT));
      B.neck.rotation.x -= k * 0.6;
      B.head.rotation.x -= k * 0.4;
      B.jaw.rotation.x = Math.max(B.jaw.rotation.x, k * (0.25 + Math.sin(this.time * 3) * 0.05));
    }

    // ---- Legs: feet planted on the ground by IK ----
    this.root.updateMatrixWorld(true);
    const legs: [QBone, QBone, QBone, 'F' | 'H', number][] = [
      ['FLu', 'FLl', 'FLf', 'F', 0],
      ['FRu', 'FRl', 'FRf', 'F', 1],
      ['HLu', 'HLl', 'HLf', 'H', 2],
      ['HRu', 'HRl', 'HRf', 'H', 3],
    ];
    const rootY = this.root.position.y;
    const fwdX = Math.sin(this.yaw);
    const fwdZ = Math.cos(this.yaw);
    for (const [u, l, f, end, i] of legs) {
      const [L1, L2] = this.legLen[end];
      const footH = end === 'F' ? S.footH.front : S.footH.hind;
      const restFoot = S.joints[f];
      // Gait offsets for walk and run, blended.
      const off = (gait: { off: number[]; duty: number }, len: number, liftH: number) => {
        const q = (((this.phase + gait.off[i]) % 1) + 1) % 1;
        const reach = len * gait.duty * 0.5;
        if (q < gait.duty) return { dz: lerp(reach, -reach, q / gait.duty), lift: 0 };
        const t = (q - gait.duty) / (1 - gait.duty);
        return { dz: lerp(-reach, reach, t * t * (3 - 2 * t)), lift: Math.sin(Math.PI * t) * liftH };
      };
      const a = off(g0, S.stride.walk, S.lift[0]);
      const b = off(g1, S.stride.run, S.lift[1]);
      let dz = lerp(a.dz, b.dz, this.runW) * this.moveW;
      let lift = lerp(a.lift, b.lift, this.runW) * this.moveW;
      // Lying down: tuck the legs under the body; sitting (howl): fold the hind legs.
      dz += this.sleepW * (end === 'F' ? 0.25 : -0.15) * S.joints.pelvis[1];
      if (end === 'H') dz += this.sitW * 0.35 * S.joints.pelvis[1];
      if (S.hop > 0) lift += this.hop * (end === 'F' ? 0.4 : 0.2);
      // Target in world space: under the rest foot, on the ground.
      const lx = restFoot[0];
      const lz = restFoot[2] + dz;
      const wx = this.root.position.x + lx * fwdZ + lz * fwdX;
      const wz = this.root.position.z - lx * fwdX + lz * fwdZ;
      let gy = inp.ground(wx, wz);
      if (!Number.isFinite(gy) || Math.abs(gy - rootY) > 0.5) gy = rootY;
      const target = this.tmp.set(wx, gy + footH + lift, wz);
      // Into the leg root's parent space, relative to the leg root.
      const upper = B[u];
      upper.parent!.worldToLocal(target);
      target.sub(upper.position);
      const front = end === 'F';
      // Front legs bend backward at the "knee" (carpus): mirror the solve.
      const sol = solveLeg(target.y, front ? -target.z : target.z, L1, L2);
      upper.rotation.x = front ? -sol.upper : sol.upper;
      B[l].rotation.x = front ? -sol.lower : sol.lower;
      // Keep the foot level with the ground, curling it a little while it swings.
      const parentPitch = this.worldPitch(upper.parent!);
      B[f].rotation.x = -(upper.rotation.x + B[l].rotation.x) - parentPitch + (lift > 0.01 ? (front ? 0.6 : -0.4) * Math.min(1, lift * 8) : 0);
    }

    const glow = inp.dark && S.kind === 'wolf';
    for (const e of this.eyes) e.visible = glow && this.sleepW < 0.5;
  }

  /** Pitch of a bone in the animal's frame (sum of x rotations up the chain). */
  private worldPitch(o: THREE.Object3D): number {
    let p = 0;
    let n: THREE.Object3D | null = o;
    while (n && n !== this.mesh) {
      p += n.rotation.x;
      n = n.parent;
    }
    return p;
  }

  /** Smoothly turn toward a world yaw. */
  turnToward(target: number, dt: number, rate = 8): void {
    this.yaw += angleDelta(this.yaw, target) * clamp(dt * rate, 0, 1);
  }

  /** For tests and debugging. */
  footWorld(f: QBone, out = this.tmp2): THREE.Vector3 {
    return this.bones[f].getWorldPosition(out);
  }
}
