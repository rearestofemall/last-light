import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp } from '../core/math';
import type { PlayerController } from './PlayerController';

interface Limb {
  upper: THREE.Group;
  lower: THREE.Group;
}

const mat = (color: number, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

function part(geo: THREE.BufferGeometry, m: THREE.Material, y = 0, x = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Procedurally built, procedurally animated character.
 * The rig is a hierarchy of pivots; poses for ground, air and swimming are blended
 * and every joint is critically damped toward its target for smooth transitions.
 */
export class PlayerModel {
  readonly root = new THREE.Group();
  /** Attach point for held items (torch, lantern) in later milestones. */
  readonly handAnchor = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private armL: Limb;
  private armR: Limb;
  private legL: Limb;
  private legR: Limb;
  private yaw = Math.PI / 2;
  private phase = 0;
  private airW = 0;
  private swimW = 0;
  private time = 0;
  private landSquash = 0;
  private actionT = 0;
  private actionDur = 0;
  private actionKind: 'swing' | 'work' | 'eat' | null = null;
  /** Raises the right arm when carrying a light. */
  holdingLight = false;

  private sitting = false;

  constructor(opts: { jacket?: number; scarf?: number; hair?: number } = {}) {
    const jacket = mat(opts.jacket ?? 0x4b5434);
    const jacketDark = mat(new THREE.Color(opts.jacket ?? 0x4b5434).multiplyScalar(0.78).getHex());
    const pants = mat(0x353a44);
    const skin = mat(0xc99f7e, 0.7);
    const boots = mat(0x2b231d, 0.95);
    const pack = mat(0x6e4b2c);
    const scarf = mat(opts.scarf ?? 0x9a3d2a);
    const hair = mat(opts.hair ?? 0x2a2019);

    this.root.add(this.hips);
    this.hips.position.y = 0.94;

    // Torso
    this.hips.add(this.torso);
    const chest = part(new THREE.CapsuleGeometry(0.2, 0.34, 4, 10), jacket, 0.33);
    chest.scale.set(1.08, 1, 0.78);
    this.torso.add(chest);
    const belt = part(new THREE.CylinderGeometry(0.2, 0.21, 0.08, 10), mat(0x2a2420), 0.06);
    belt.scale.z = 0.8;
    this.torso.add(belt);
    const scarfMesh = part(new THREE.TorusGeometry(0.13, 0.055, 6, 12), scarf, 0.63);
    scarfMesh.rotation.x = Math.PI / 2;
    this.torso.add(scarfMesh);
    const backpack = part(new THREE.BoxGeometry(0.32, 0.42, 0.2), pack, 0.38, 0, -0.22);
    this.torso.add(backpack);
    const roll = part(new THREE.CylinderGeometry(0.08, 0.08, 0.38, 8), mat(0x56603f), 0.64, 0, -0.22);
    roll.rotation.z = Math.PI / 2;
    this.torso.add(roll);

    // Head
    this.torso.add(this.head);
    this.head.position.y = 0.7;
    const skull = part(new THREE.SphereGeometry(0.135, 14, 10), skin, 0.1);
    skull.scale.set(0.95, 1.08, 1);
    this.head.add(skull);
    const hairCap = part(new THREE.SphereGeometry(0.142, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0.12, 0, -0.01);
    this.head.add(hairCap);
    const hood = part(new THREE.TorusGeometry(0.12, 0.05, 6, 12, Math.PI * 1.3), jacketDark, 0.07, 0, -0.05);
    hood.rotation.set(Math.PI / 2 + 0.3, 0, Math.PI * 0.85);
    this.head.add(hood);
    const nose = part(new THREE.ConeGeometry(0.025, 0.06, 5), skin, 0.08, 0, 0.13);
    nose.rotation.x = Math.PI / 2;
    this.head.add(nose);

    // Limbs
    const limb = (x: number, y: number, parent: THREE.Object3D, upperLen: number, lowerLen: number, r: number, mUp: THREE.Material, mLow: THREE.Material, end?: THREE.Mesh): Limb => {
      const upper = new THREE.Group();
      upper.position.set(x, y, 0);
      parent.add(upper);
      upper.add(part(new THREE.CapsuleGeometry(r, upperLen - r * 2, 3, 8), mUp, -upperLen / 2));
      const lower = new THREE.Group();
      lower.position.y = -upperLen;
      upper.add(lower);
      lower.add(part(new THREE.CapsuleGeometry(r * 0.88, lowerLen - r * 2, 3, 8), mLow, -lowerLen / 2));
      if (end) lower.add(end);
      return { upper, lower };
    };
    const boot = () => part(new THREE.BoxGeometry(0.13, 0.11, 0.26), boots, -0.45, 0, 0.05);
    this.legL = limb(0.105, 0, this.hips, 0.46, 0.46, 0.085, pants, pants, boot());
    this.legR = limb(-0.105, 0, this.hips, 0.46, 0.46, 0.085, pants, pants, boot());
    const hand = () => part(new THREE.SphereGeometry(0.05, 8, 6), skin, -0.36);
    this.armL = limb(0.26, 0.56, this.torso, 0.32, 0.32, 0.062, jacket, jacket, hand());
    this.armR = limb(-0.26, 0.56, this.torso, 0.32, 0.32, 0.062, jacket, jacketDark, hand());
    this.armR.lower.add(this.handAnchor);
    this.handAnchor.position.y = -0.38;
  }

  /** Visual update. `alpha` interpolates between the last two physics states. */
  update(dt: number, alpha: number, pc: PlayerController): void {
    this.time += dt;
    const b = pc.body;
    const x = lerp(pc.prevX, b.x, alpha);
    const y = lerp(pc.prevY, b.y, alpha);
    this.root.position.set(x, y, 0);

    // Facing: turn three-quarters toward the camera so the face stays readable.
    const targetYaw = pc.facing > 0 ? Math.PI / 2 - 0.4 : -Math.PI / 2 + 0.4;
    this.yaw += angleDelta(this.yaw, targetYaw) * (1 - Math.exp(-12 * dt));
    this.root.rotation.y = this.yaw;

    const speed = Math.abs(b.vx);
    const run = clamp((speed - 3.5) / 3.5, 0, 1);
    const moving = clamp(speed / 3, 0, 1);
    const airborne = !b.grounded && pc.state !== 'swim' && pc.state !== 'wade';
    this.airW = damp(this.airW, airborne ? 1 : 0, 10, dt);
    this.swimW = damp(this.swimW, pc.state === 'swim' ? 1 : 0, 6, dt);

    // Advance gait phase by distance travelled (no foot sliding).
    const strideLen = lerp(1.45, 2.15, run);
    if (b.grounded || pc.state === 'swim') this.phase += (speed / strideLen) * Math.PI * dt;
    else this.phase += dt * 2;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);

    // ---- Ground pose ----
    const swing = lerp(0.45, 0.85, run) * moving;
    const breathe = Math.sin(this.time * 2.1) * 0.012;
    const g = {
      hipsY: 0.94 - Math.abs(c) * 0.05 * moving - run * 0.04 + breathe,
      lean: 0.05 * moving + 0.18 * run,
      legLU: s * swing,
      legRU: -s * swing,
      legLL: -Math.max(0, -c) * swing * 1.4 - 0.05,
      legRL: -Math.max(0, c) * swing * 1.4 - 0.05,
      armLU: s * swing * 0.85,
      armRU: -s * swing * 0.85,
      armLL: -0.25 - run * 0.9,
      armRL: -0.25 - run * 0.9,
      headX: -0.05 * run + Math.sin(this.time * 0.7) * 0.03 * (1 - moving),
    };
    // ---- Air pose ----
    const rising = b.vy > 0 ? 1 : 0;
    const a = {
      hipsY: 0.94,
      lean: 0.1,
      legLU: 0.6 * rising + 0.25,
      legRU: -0.2 + 0.1 * rising,
      legLL: -1.1 * rising - 0.4,
      legRL: -0.5,
      armLU: -0.4 - 1.2 * rising,
      armRU: 0.5 + 0.6 * (1 - rising),
      armLL: -0.5,
      armRL: -0.3,
      headX: rising ? -0.15 : 0.12,
    };
    // ---- Swim pose ----
    const sw = Math.sin(this.time * 4);
    // Body floats horizontally at the surface (feet are ~1.3 m under water).
    const w = {
      hipsY: 1.2,
      lean: 1.2,
      legLU: sw * 0.4,
      legRU: -sw * 0.4,
      legLL: -0.3,
      legRL: -0.3,
      armLU: -2.4 + Math.sin(this.time * 3) * 0.9,
      armRU: -2.4 + Math.sin(this.time * 3 + Math.PI) * 0.9,
      armLL: -0.4,
      armRL: -0.4,
      headX: -0.9,
    };
    const blend = (k: keyof typeof g) => lerp(lerp(g[k], a[k], this.airW), w[k], this.swimW);

    const r = 18;
    this.landSquash = damp(this.landSquash, 0, 8, dt);
    this.hips.position.y = damp(this.hips.position.y, blend('hipsY') - this.landSquash * 0.18, r, dt);
    this.torso.rotation.x = damp(this.torso.rotation.x, blend('lean'), r, dt);
    this.head.rotation.x = damp(this.head.rotation.x, blend('headX'), r * 0.6, dt);
    this.legL.upper.rotation.x = damp(this.legL.upper.rotation.x, -blend('legLU'), r, dt);
    this.legR.upper.rotation.x = damp(this.legR.upper.rotation.x, -blend('legRU'), r, dt);
    this.legL.lower.rotation.x = damp(this.legL.lower.rotation.x, -blend('legLL'), r, dt);
    this.legR.lower.rotation.x = damp(this.legR.lower.rotation.x, -blend('legRL'), r, dt);
    this.armL.upper.rotation.x = damp(this.armL.upper.rotation.x, blend('armLU'), r, dt);
    this.armR.upper.rotation.x = damp(this.armR.upper.rotation.x, blend('armRU'), r, dt);
    this.armL.lower.rotation.x = damp(this.armL.lower.rotation.x, blend('armLL'), r, dt);
    this.armR.lower.rotation.x = damp(this.armR.lower.rotation.x, blend('armRL'), r, dt);
    this.armL.upper.rotation.z = damp(this.armL.upper.rotation.z, 0.08 + this.airW * 0.3, r, dt);
    this.armR.upper.rotation.z = damp(this.armR.upper.rotation.z, -0.08 - this.airW * 0.3, r, dt);

    // Action overlays on the right arm.
    if (this.actionT > 0) {
      this.actionT = Math.max(0, this.actionT - dt);
      const t = 1 - this.actionT / this.actionDur;
      if (this.actionKind === 'eat') {
        this.armR.upper.rotation.x = -1.3 - Math.sin(t * Math.PI) * 0.3;
        this.armR.lower.rotation.x = -1.7;
        this.head.rotation.x = 0.15;
      } else {
        // Wind up, then strike down and forward.
        const k = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
        const raise = this.actionKind === 'swing' ? 2.7 : 2.2;
        this.armR.upper.rotation.x = t < 0.35 ? -raise * k : -raise + (raise + 0.5) * (1 - k);
        this.armR.lower.rotation.x = -0.3;
        this.torso.rotation.x += t > 0.35 ? 0.15 * k : -0.1 * k;
      }
    } else if (this.holdingLight && this.swimW < 0.5) {
      this.armR.upper.rotation.x = damp(this.armR.upper.rotation.x, -0.95, 10, dt);
      this.armR.lower.rotation.x = damp(this.armR.lower.rotation.x, -0.6, 10, dt);
    }
  }

  /** Static seated pose (NPCs). Call update() each frame for breathing. */
  sit(): void {
    this.sitting = true;
    this.hips.position.y = 0.42;
    this.legL.upper.rotation.x = -1.45;
    this.legR.upper.rotation.x = -1.35;
    this.legL.lower.rotation.x = 1.5;
    this.legR.lower.rotation.x = 1.4;
    this.armL.upper.rotation.x = -0.7;
    this.armR.upper.rotation.x = -0.8;
    this.armL.lower.rotation.x = -0.9;
    this.armR.lower.rotation.x = -0.9;
    this.torso.rotation.x = 0.25;
    this.head.rotation.x = 0.2;
  }

  /** Idle animation for a seated NPC. */
  idle(dt: number): void {
    if (!this.sitting) return;
    this.time += dt;
    this.torso.rotation.x = 0.25 + Math.sin(this.time * 1.6) * 0.02;
    this.head.rotation.y = Math.sin(this.time * 0.3) * 0.25;
  }

  swing(): void {
    this.actionKind = 'swing';
    this.actionT = this.actionDur = 0.4;
  }

  work(): void {
    this.actionKind = 'work';
    this.actionT = this.actionDur = 0.42;
  }

  eat(): void {
    this.actionKind = 'eat';
    this.actionT = this.actionDur = 0.7;
  }

  /** Called on landing to add a short squash. */
  land(impact: number): void {
    this.landSquash = clamp(impact / 16, 0, 1);
  }
}
