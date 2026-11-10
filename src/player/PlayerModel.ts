import * as THREE from 'three';
import { angleDelta, clamp, damp, lerp, smoothstep } from '../core/math';
import { type Appearance, BONE_INDEX, type BoneName, BONES, HumanBody, SHIN_LEN, THIGH_LEN } from '../character/HumanBody';
import { CLIPS, type ClipName } from '../character/humanClips';
import { solveLeg } from '../character/ik';
import { add, blend, type Clip, HIPS_OFFSET, newPose, sample } from '../character/Pose';
import type { MoveState } from './PlayerController';

/** What the model needs to know about the thing it animates (PlayerController fits). */
export interface CharacterDriver {
  body: { x: number; y: number; z: number; vx: number; vy: number; vz: number; grounded: boolean };
  prevX: number;
  prevY: number;
  prevZ: number;
  heading: number;
  state: MoveState;
}

export type WorkKind = 'chop' | 'mine' | 'gather';
export type SwingKind = 'fist' | 'knife' | 'axe' | 'pickaxe';

/** Critically damped spring for secondary motion. */
class Spring {
  v = 0;
  vel = 0;
  update(target: number, dt: number, stiffness = 90, damping = 9): number {
    const a = (target - this.v) * stiffness - this.vel * damping;
    this.vel += a * dt;
    this.v += this.vel * dt;
    return this.v;
  }
}

const FIDGETS: ClipName[] = ['lookAround', 'adjustPack', 'stretch'];
/** The fall pose without the right arm, so a held light stays up while airborne. */
const FALL_KEEP_LIGHT = CLIPS.fall.mask.map((v, i) => (i === BONE_INDEX.upperArmR || i === BONE_INDEX.lowerArmR || i === BONE_INDEX.handR ? 0 : v));
const R = (bone: BoneName, axis: number) => BONE_INDEX[bone] * 3 + axis;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

/**
 * The survivor: a skinned procedural body driven by layered keyframe clips (locomotion,
 * air, swimming, actions, fidgets) with procedural layers on top: lean into turns, head
 * look-at, foot IK on uneven ground and steps, a swinging scarf and a bouncing pack.
 */
export class PlayerModel {
  readonly body: HumanBody;
  readonly root: THREE.Group;
  /** Attach point for held items (torch, lantern, tools), inside the right fist. */
  readonly handAnchor: THREE.Group;
  /** Raises the right arm to hold a light up. */
  holdingLight = false;
  /** Grips a tool or weapon in the right hand. */
  holdingTool = false;
  /** 0–1: how cold the character feels (hug and shiver). */
  cold = 0;
  /** 0–1: exhaustion (slump). */
  tired = 0;
  dead = false;
  /** World point to glance at (an interactable), or null. */
  lookTarget: THREE.Vector3 | null = null;
  /** World heading the camera faces; idle characters glance that way. */
  viewHeading: number | null = null;
  /** Ground height under a foot: (x, z, feetY) → y. Enables foot IK. */
  ground: ((x: number, z: number, nearY: number) => number) | null = null;

  private pose = newPose();
  private tmp = newPose();
  private tmp2 = newPose();
  private time = Math.random() * 10;
  private phase = 0;
  private yaw = Math.PI / 2;
  private yawRate = 0;
  private lastHeading = 0;
  private speedPrev = 0;
  private accel = 0;
  // Layer weights.
  private moveW = 0;
  private runW = 0;
  private airW = 0;
  private riseW = 0;
  private swimW = 0;
  private swimMoveW = 0;
  private wadeW = 0;
  private lightW = 0;
  private toolW = 0;
  private coldW = 0;
  private tiredW = 0;
  private deadW = 0;
  private deadT = 0;
  // One-shots.
  private action: Clip | null = null;
  private actionT = 0;
  private landT = 1;
  private landK = 0;
  private hurtT = 1;
  private hurtK = 0;
  private fidget: Clip | null = null;
  private fidgetT = 0;
  private stillTime = 0;
  private nextFidget = 7 + Math.random() * 6;
  // Procedural.
  private lean = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private scarfX = new Spring();
  private scarfZ = new Spring();
  private packX = new Spring();
  private hipsVyPrev = 0;
  private pelvisDrop = 0;
  private ikW = 0;
  private blinkT = 2;
  private sitting = false;
  private smoothedY: number | null = null;
  private unfrozen = false;

  constructor(look: Partial<Appearance> = {}) {
    this.body = new HumanBody(look);
    this.root = this.body.root;
    this.handAnchor = this.body.handAnchor;
  }

  // ------------------------------------------------------------------------------- triggers

  swing(kind: SwingKind = 'fist'): void {
    this.play(kind === 'knife' ? 'slash' : kind === 'fist' ? 'punch' : 'heavySwing');
  }

  work(kind: WorkKind = 'gather'): void {
    this.play(kind);
  }

  eat(): void {
    this.play('eat');
  }

  drink(): void {
    this.play('drink');
  }

  hurt(amount: number): void {
    this.hurtT = 0;
    this.hurtK = clamp(0.4 + amount / 15, 0.4, 1);
  }

  /** Called on landing to absorb the impact in the knees. */
  land(impact: number): void {
    const k = clamp((impact - 3) / 14, 0, 1);
    if (k <= 0.05) return;
    this.landT = 0;
    this.landK = k;
  }

  /** Static seated pose (NPCs); call idle() each frame. */
  sit(): void {
    this.sitting = true;
    this.evaluate(0, null);
  }

  /** NPC update without a driver. */
  idle(dt: number): void {
    if (!this.unfrozen) {
      // Site objects get frozen transforms; this one moves.
      this.root.traverse((o) => (o.matrixAutoUpdate = true));
      this.unfrozen = true;
    }
    this.evaluate(dt, null);
  }

  private play(name: ClipName): void {
    this.action = CLIPS[name];
    this.actionT = 0;
    this.fidget = null;
    this.stillTime = 0;
  }

  // ------------------------------------------------------------------------------- per frame

  /** Visual update. `alpha` interpolates between the last two physics states. */
  update(dt: number, alpha: number, pc: CharacterDriver): void {
    const b = pc.body;
    // Steps and small bumps are smoothed out of the visible height; jumps and falls are not.
    const y = lerp(pc.prevY, b.y, alpha);
    if (b.grounded && this.smoothedY !== null && Math.abs(y - this.smoothedY) < 0.7) this.smoothedY = damp(this.smoothedY, y, 16, dt);
    else this.smoothedY = y;
    this.root.position.set(lerp(pc.prevX, b.x, alpha), this.smoothedY, lerp(pc.prevZ, b.z, alpha));
    if (dt > 0) {
      const d = angleDelta(this.yaw, pc.heading);
      this.yaw += d * (1 - Math.exp(-12 * dt));
      this.yawRate = damp(this.yawRate, angleDelta(this.lastHeading, pc.heading) / dt, 10, dt);
      this.lastHeading = pc.heading;
    }
    this.root.rotation.y = this.yaw;
    this.evaluate(dt, pc);
  }

  private evaluate(dt: number, pc: CharacterDriver | null): void {
    this.time += dt;
    const P = this.pose;
    P.fill(0);

    if (this.sitting || !pc) {
      sample(CLIPS.sit, this.time / CLIPS.sit.duration, P);
      this.blink(dt);
      this.applyPose();
      return;
    }

    const b = pc.body;
    const speed = Math.hypot(b.vx, b.vz);
    if (dt > 0) {
      this.accel = damp(this.accel, (speed - this.speedPrev) / dt, 8, dt);
      this.speedPrev = speed;
    }
    const swimming = pc.state === 'swim';
    const wading = pc.state === 'wade';
    const airborne = !b.grounded && !swimming && !wading;

    // ---- Layer weights ----
    this.moveW = damp(this.moveW, smoothstep(0.15, 1.4, speed), 10, dt);
    this.runW = damp(this.runW, smoothstep(4.4, 6.6, speed), 6, dt);
    this.airW = damp(this.airW, airborne ? 1 : 0, airborne ? 14 : 18, dt);
    this.riseW = damp(this.riseW, b.vy > 1 ? 1 : 0, 8, dt);
    this.swimW = damp(this.swimW, swimming ? 1 : 0, 6, dt);
    this.swimMoveW = damp(this.swimMoveW, smoothstep(0.3, 1.6, speed), 4, dt);
    this.wadeW = damp(this.wadeW, wading ? 1 : 0, 6, dt);
    this.lightW = damp(this.lightW, this.holdingLight ? 1 : 0, 8, dt);
    this.toolW = damp(this.toolW, this.holdingTool && !this.holdingLight ? 1 : 0, 8, dt);
    this.coldW = damp(this.coldW, smoothstep(0.25, 0.8, this.cold), 2, dt);
    this.tiredW = damp(this.tiredW, smoothstep(0.3, 1, this.tired), 1.5, dt);
    if (this.dead) this.deadT += dt;
    else this.deadT = 0;
    this.deadW = damp(this.deadW, this.dead ? 1 : 0, this.dead ? 30 : 3, dt);

    // ---- Locomotion ----
    const cycle = lerp(1.9, 2.8, this.runW);
    if (b.grounded || swimming || wading) this.phase += (speed / cycle) * dt;
    sample(CLIPS.idle, this.time / CLIPS.idle.duration, P);
    if (this.moveW > 0.001) {
      const L = this.tmp;
      L.fill(0);
      sample(CLIPS.walk, this.phase, L);
      if (this.runW > 0.001) {
        const R = this.tmp2;
        R.fill(0);
        sample(CLIPS.run, this.phase, R);
        blend(L, R, this.runW);
      }
      blend(P, L, this.moveW);
    }

    // ---- Idle fidgets ----
    const calm = this.moveW < 0.05 && b.grounded && !this.action && !swimming && !wading && !this.dead;
    this.stillTime = calm ? this.stillTime + dt : 0;
    if (!this.fidget && this.stillTime > this.nextFidget) {
      const options = FIDGETS.filter((f) => !(this.coldW > 0.3 && f === 'stretch') && !(this.lightW > 0.5 && f !== 'lookAround'));
      this.fidget = CLIPS[options[Math.floor(Math.random() * options.length)]];
      this.fidgetT = 0;
      this.stillTime = 0;
      this.nextFidget = 8 + Math.random() * 10;
    }
    if (this.fidget) {
      this.fidgetT += dt / this.fidget.duration;
      const w = Math.min(smoothstep(0, 0.12, this.fidgetT), 1 - smoothstep(0.85, 1, this.fidgetT)) * (calm || this.fidgetT < 0.02 ? 1 : 0);
      if (this.fidgetT >= 1 || !calm) this.fidget = null;
      else this.layer(this.fidget, this.fidgetT, w);
    }

    // ---- Posture overlays ----
    if (this.coldW > 0.01) this.layer(CLIPS.cold, 0, this.coldW * (1 - this.moveW * 0.55) * (1 - this.lightW * 0.5) * (1 - this.swimW));
    if (this.tiredW > 0.01) this.additive(CLIPS.tired, 0, this.tiredW * (1 - this.swimW));
    if (this.wadeW > 0.01) this.layer(CLIPS.wade, 0, this.wadeW * (1 - this.lightW));
    if (this.toolW > 0.01) this.layer(CLIPS.holdTool, 0, this.toolW);
    if (this.lightW > 0.01) this.layer(CLIPS.holdLight, 0, this.lightW * (1 - this.swimW));

    // ---- Air ----
    if (this.airW > 0.001) {
      const A = this.tmp;
      A.fill(0);
      sample(CLIPS.fall, this.time / CLIPS.fall.duration, A);
      if (this.riseW > 0.001) {
        const J = this.tmp2;
        J.fill(0);
        sample(CLIPS.jump, 0, J);
        blend(A, J, this.riseW);
      }
      blend(P, A, this.airW, this.lightW > 0.5 ? FALL_KEEP_LIGHT : CLIPS.fall.mask);
    }

    // ---- Landing ----
    if (this.landT < 1) {
      this.landT = Math.min(1, this.landT + dt / CLIPS.land.duration);
      this.layer(CLIPS.land, this.landT, this.landK * (1 - smoothstep(0.7, 1, this.landT)) * (1 - this.airW));
    }

    // ---- Water ----
    if (this.swimW > 0.001) {
      const S = this.tmp;
      S.fill(0);
      sample(CLIPS.tread, this.time / CLIPS.tread.duration, S);
      const M = this.tmp2;
      M.fill(0);
      sample(CLIPS.swim, this.time / CLIPS.swim.duration, M);
      blend(S, M, this.swimMoveW);
      blend(P, S, this.swimW);
    }

    // ---- Actions ----
    if (this.action) {
      this.actionT += dt / this.action.duration;
      if (this.actionT >= 1) this.action = null;
      else {
        const t = this.actionT;
        this.layer(this.action, t, Math.min(1, t / 0.12) * (1 - smoothstep(0.88, 1, t)) * (1 - this.deadW));
      }
    }
    if (this.hurtT < 1) {
      this.hurtT = Math.min(1, this.hurtT + dt / CLIPS.flinch.duration);
      this.additive(CLIPS.flinch, this.hurtT, this.hurtK);
    }

    // ---- Death ----
    if (this.deadW > 0.001) {
      const D = this.tmp;
      D.fill(0);
      sample(CLIPS.die, this.dead ? this.deadT / CLIPS.die.duration : 1, D);
      blend(P, D, this.deadW);
    }

    // ---- Procedural layers ----
    this.procedural(dt, pc, speed);
    this.applyPose();
    this.footIK(dt, pc);
    this.blink(dt);
  }

  /** Overlay a clip's channels (absolute pose) with weight w. */
  private layer(clip: Clip, t: number, w: number): void {
    if (w <= 0.001) return;
    const T = this.layerBuf;
    T.fill(0);
    sample(clip, t, T);
    blend(this.pose, T, Math.min(1, w), clip.mask);
  }

  /** Add a clip's channels on top of the pose. */
  private additive(clip: Clip, t: number, w: number): void {
    if (w <= 0.001) return;
    const T = this.layerBuf;
    T.fill(0);
    sample(clip, t, T);
    add(this.pose, T, w, clip.mask);
  }

  private layerBuf = newPose();
  private diffs = [0, 0];
  private ankles = [new THREE.Vector3(), new THREE.Vector3()];

  private procedural(dt: number, pc: CharacterDriver, speed: number): void {
    const P = this.pose;
    const grounded = pc.body.grounded && this.swimW < 0.5 && this.deadW < 0.5;

    // Lean into turns (toward the inside) and with acceleration.
    const targetLean = grounded ? clamp(-this.yawRate * speed * 0.022, -0.3, 0.3) : 0;
    this.lean = damp(this.lean, targetLean, 6, dt);
    P[R('hips', 2)] += this.lean * 0.6;
    P[R('spine', 2)] += this.lean * 0.4;
    P[R('spine', 0)] += clamp(this.accel * 0.012, -0.12, 0.12) * (grounded ? 1 : 0);

    // Shiver.
    if (this.coldW > 0.2) {
      const s = (this.coldW - 0.2) * 0.012;
      P[R('spine', 2)] += Math.sin(this.time * 41) * s;
      P[R('chest', 0)] += Math.sin(this.time * 37 + 1) * s;
      P[R('shoulderL', 2)] += Math.sin(this.time * 33) * s * 2;
      P[R('shoulderR', 2)] -= Math.sin(this.time * 35 + 2) * s * 2;
    }

    // Head: glance at the target, or where the camera looks when standing around.
    let wantYaw = 0;
    let wantPitch = 0;
    const free = !this.action && this.deadW < 0.3 && this.swimW < 0.5 && !this.fidget;
    if (free && this.lookTarget) {
      tmpV.copy(this.lookTarget).sub(this.root.position);
      const yawTo = Math.atan2(tmpV.x, tmpV.z);
      wantYaw = angleDelta(this.yaw, yawTo);
      wantPitch = -Math.atan2(tmpV.y - 1.6, Math.hypot(tmpV.x, tmpV.z));
      if (Math.abs(wantYaw) > 1.9) wantYaw = 0;
    } else if (free && this.viewHeading !== null && this.moveW < 0.3) {
      wantYaw = angleDelta(this.yaw, this.viewHeading);
      if (Math.abs(wantYaw) > 2.2) wantYaw = 0;
    }
    wantYaw = clamp(wantYaw, -1.1, 1.1);
    wantPitch = clamp(wantPitch, -0.5, 0.6);
    this.lookYaw = damp(this.lookYaw, wantYaw, 5, dt);
    this.lookPitch = damp(this.lookPitch, wantPitch, 5, dt);
    P[R('neck', 1)] += this.lookYaw * 0.35;
    P[R('head', 1)] += this.lookYaw * 0.55;
    P[R('chest', 1)] += this.lookYaw * 0.1;
    P[R('head', 0)] += this.lookPitch * 0.7;
    P[R('neck', 0)] += this.lookPitch * 0.3;

    // Scarf tail and backpack: springs driven by motion.
    const hipsVy = (P[HIPS_OFFSET + 1] - this.hipsVyPrev) / Math.max(dt, 1e-3);
    this.hipsVyPrev = P[HIPS_OFFSET + 1];
    const swingSide = Math.sin(this.phase * Math.PI * 2) * 0.12 * this.moveW;
    const scarfX = this.scarfX.update(clamp(-this.accel * 0.02 - (pc.body.grounded ? 0 : clamp(pc.body.vy * 0.03, -0.4, 0.4)) - this.runW * 0.08, -0.6, 0.06), dt, 70, 7);
    const scarfZ = this.scarfZ.update(swingSide - this.lean * 0.8 + Math.sin(this.time * 1.3) * 0.03, dt, 60, 6);
    P[R('scarf', 0)] += scarfX;
    P[R('scarf', 2)] += scarfZ;
    P[R('pack', 0)] += this.packX.update(clamp(-hipsVy * 0.05, -0.15, 0.15), dt, 160, 10);
  }

  private applyPose(): void {
    const P = this.pose;
    const bones = this.body.bones;
    for (let i = 0; i < BONES.length; i++) {
      bones[BONES[i]].rotation.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    }
    const hips = bones.hips;
    const rest = this.body.rest.hips;
    hips.position.set(rest.x + P[HIPS_OFFSET], rest.y + P[HIPS_OFFSET + 1] + this.pelvisDrop, rest.z + P[HIPS_OFFSET + 2]);
  }

  /** Plant the feet on uneven ground and steps: lower the pelvis, then bend each leg to reach. */
  private footIK(dt: number, pc: CharacterDriver): void {
    const enabled = !!this.ground && pc.body.grounded && this.swimW < 0.3 && this.deadW < 0.2 && this.airW < 0.3;
    this.ikW = damp(this.ikW, enabled ? 1 : 0, 10, dt);
    if (this.ikW < 0.01 || !this.ground) {
      this.pelvisDrop = damp(this.pelvisDrop, 0, 10, dt);
      return;
    }
    const bones = this.body.bones;
    this.root.updateMatrixWorld(true);
    const baseY = this.root.position.y;
    const oldDrop = this.pelvisDrop;
    const diffs = this.diffs;
    const ankles = this.ankles;
    (['L', 'R'] as const).forEach((side, k) => {
      const ankle = bones[`foot${side}`].getWorldPosition(ankles[k]);
      const g = this.ground!(ankle.x, ankle.z, baseY + 0.45);
      diffs[k] = Number.isFinite(g) ? clamp(g - baseY, -0.4, 0.4) : 0;
    });
    // Lower the pelvis so the lower foot can reach; the higher foot then bends more.
    const drop = Math.min(0, diffs[0], diffs[1]);
    this.pelvisDrop = damp(this.pelvisDrop, drop * this.ikW, 14, dt);
    bones.hips.position.y = this.body.rest.hips.y + this.pose[HIPS_OFFSET + 1] + this.pelvisDrop;
    this.root.updateMatrixWorld(true);

    (['L', 'R'] as const).forEach((side, k) => {
      const thigh = bones[`thigh${side}`];
      const shin = bones[`shin${side}`];
      const foot = bones[`foot${side}`];
      // Target: where the clip put the ankle (without the pelvis drop), raised or lowered by
      // the ground under that foot.
      const target = tmpV.copy(ankles[k]);
      target.y += diffs[k] - oldDrop;
      bones.hips.worldToLocal(target);
      target.sub(thigh.position);
      const sol = solveLeg(target.y, target.z, THIGH_LEN, SHIN_LEN);
      const w = this.ikW;
      const oldSum = thigh.rotation.x + shin.rotation.x;
      thigh.rotation.x = lerp(thigh.rotation.x, sol.upper, w);
      shin.rotation.x = lerp(shin.rotation.x, sol.lower, w);
      // Keep the foot's pitch, then tilt it to match the slope.
      foot.rotation.x += oldSum - (thigh.rotation.x + shin.rotation.x);
      if (this.ground) {
        const fwdX = Math.sin(this.yaw);
        const fwdZ = Math.cos(this.yaw);
        const a = tmpV2.copy(ankles[k]);
        const ahead = this.ground(a.x + fwdX * 0.15, a.z + fwdZ * 0.15, baseY + 0.45);
        const behind = this.ground(a.x - fwdX * 0.15, a.z - fwdZ * 0.15, baseY + 0.45);
        if (Number.isFinite(ahead) && Number.isFinite(behind) && Math.abs(ahead - behind) < 0.25) {
          foot.rotation.x += -Math.atan2(ahead - behind, 0.3) * 0.8 * w * (1 - this.moveW * 0.5);
        }
      }
    });
  }

  private blink(dt: number): void {
    this.blinkT -= dt;
    let s = 1;
    if (this.blinkT < 0.12) s = 0.15;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    if (this.dead && this.deadT > 1) s = 0.1;
    for (const e of this.body.eyes) e.scale.y = s;
  }
}

