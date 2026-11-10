import * as THREE from 'three';
import { along, box, deform, loft, MeshKit, rigid, type SkinFn, tube } from './MeshKit';

/** Bone order is the pose layout (see Pose.ts). Character faces +z; its left is +x. */
export const BONES = [
  'root',
  'hips',
  'spine',
  'chest',
  'neck',
  'head',
  'shoulderL',
  'upperArmL',
  'lowerArmL',
  'handL',
  'fingersL',
  'shoulderR',
  'upperArmR',
  'lowerArmR',
  'handR',
  'fingersR',
  'thighL',
  'shinL',
  'footL',
  'toesL',
  'thighR',
  'shinR',
  'footR',
  'toesR',
  'pack',
  'scarf',
] as const;
export type BoneName = (typeof BONES)[number];
export const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;

const PARENT: Record<BoneName, BoneName | null> = {
  root: null,
  hips: 'root',
  spine: 'hips',
  chest: 'spine',
  neck: 'chest',
  head: 'neck',
  shoulderL: 'chest',
  upperArmL: 'shoulderL',
  lowerArmL: 'upperArmL',
  handL: 'lowerArmL',
  fingersL: 'handL',
  shoulderR: 'chest',
  upperArmR: 'shoulderR',
  lowerArmR: 'upperArmR',
  handR: 'lowerArmR',
  fingersR: 'handR',
  thighL: 'hips',
  shinL: 'thighL',
  footL: 'shinL',
  toesL: 'footL',
  thighR: 'hips',
  shinR: 'thighR',
  footR: 'shinR',
  toesR: 'footR',
  pack: 'chest',
  scarf: 'chest',
};

/** Joint positions in model space, rest pose (arms hanging, standing on y = 0). */
const SHOULDER_X = 0.235;
const HIP_X = 0.1;
export const JOINTS: Record<BoneName, [number, number, number]> = {
  root: [0, 0, 0],
  hips: [0, 0.95, 0],
  spine: [0, 1.06, 0],
  chest: [0, 1.24, 0],
  neck: [0, 1.47, 0],
  head: [0, 1.57, 0.005],
  shoulderL: [0.05, 1.43, 0],
  upperArmL: [SHOULDER_X, 1.42, 0],
  lowerArmL: [SHOULDER_X, 1.14, 0],
  handL: [SHOULDER_X, 0.88, 0],
  fingersL: [SHOULDER_X, 0.79, 0.005],
  shoulderR: [-0.05, 1.43, 0],
  upperArmR: [-SHOULDER_X, 1.42, 0],
  lowerArmR: [-SHOULDER_X, 1.14, 0],
  handR: [-SHOULDER_X, 0.88, 0],
  fingersR: [-SHOULDER_X, 0.79, 0.005],
  thighL: [HIP_X, 0.91, 0],
  shinL: [HIP_X, 0.49, 0],
  footL: [HIP_X, 0.085, -0.01],
  toesL: [HIP_X, 0.03, 0.13],
  thighR: [-HIP_X, 0.91, 0],
  shinR: [-HIP_X, 0.49, 0],
  footR: [-HIP_X, 0.085, -0.01],
  toesR: [-HIP_X, 0.03, 0.13],
  pack: [0, 1.32, -0.2],
  scarf: [0.05, 1.47, 0.125],
};
export const THIGH_LEN = JOINTS.thighL[1] - JOINTS.shinL[1];
export const SHIN_LEN = JOINTS.shinL[1] - JOINTS.footL[1];
/** Ankle height above the sole when standing. */
export const ANKLE_H = JOINTS.footL[1];

export interface Appearance {
  jacket: number;
  pants: number;
  skin: number;
  boots: number;
  pack: number;
  scarf: number;
  hair: number;
  /** Knitted beanie colour, or null for bare hair. */
  hat: number | null;
}

export const DEFAULT_LOOK: Appearance = {
  jacket: 0x4b5434,
  pants: 0x39404b,
  skin: 0xc99f7e,
  boots: 0x3a2b20,
  pack: 0x7a5232,
  scarf: 0x9a3d2a,
  hair: 0x2a2019,
  hat: 0x8c7a5e,
};

const shadeHex = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();

/**
 * A procedurally sculpted, skinned low-poly survivor: one SkinnedMesh with vertex colours
 * (a single draw call), a 26-bone skeleton, and a hand anchor for held items.
 */
export class HumanBody {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones = {} as Record<BoneName, THREE.Bone>;
  /** Rest-pose local positions (poses only rotate bones; hips also translate). */
  readonly rest = {} as Record<BoneName, THREE.Vector3>;
  /** Item attach point inside the right fist; items point along +z. */
  readonly handAnchor = new THREE.Group();
  readonly offHandAnchor = new THREE.Group();
  /** Separate so they can blink. */
  readonly eyes: THREE.Mesh[] = [];

  constructor(look: Partial<Appearance> = {}) {
    const L = { ...DEFAULT_LOOK, ...look };
    for (const name of BONES) {
      const b = new THREE.Bone();
      b.name = name;
      const j = JOINTS[name];
      const p = PARENT[name];
      const pj = p ? JOINTS[p] : [0, 0, 0];
      b.position.set(j[0] - pj[0], j[1] - pj[1], j[2] - pj[2]);
      this.rest[name] = b.position.clone();
      this.bones[name] = b;
      if (p) this.bones[p].add(b);
    }
    const geo = buildGeometry(L);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84, metalness: 0 });
    this.mesh = new THREE.SkinnedMesh(geo, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // One small mesh always next to the camera: culling it would only cost bound updates.
    this.mesh.frustumCulled = false;
    this.mesh.add(this.bones.root);
    this.mesh.bind(new THREE.Skeleton(BONES.map((n) => this.bones[n])));
    this.root.add(this.mesh);

    this.bones.handR.add(this.handAnchor);
    this.handAnchor.position.set(0, -0.055, 0.005);
    this.bones.handL.add(this.offHandAnchor);
    this.offHandAnchor.position.set(0, -0.055, 0.005);

    // Eyes: whites with a dark iris, separate from the skin so they can blink.
    const white = new THREE.MeshStandardMaterial({ color: 0xe9e2d6, roughness: 0.35 });
    const iris = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.2 });
    const h = JOINTS.head;
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 10, 8).scale(1.25, 0.8, 0.5), white);
      e.position.set(s * 0.04, 1.687 - h[1], 0.101 - h[2]);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0078, 8, 6).scale(1, 1, 0.45), iris);
      pupil.position.set(0, -0.0005, 0.005);
      e.add(pupil);
      e.castShadow = false;
      pupil.castShadow = false;
      this.bones.head.add(e);
      this.eyes.push(e);
    }
  }

  /** Back to the rest pose. */
  reset(): void {
    for (const n of BONES) {
      this.bones[n].position.copy(this.rest[n]);
      this.bones[n].rotation.set(0, 0, 0);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Sculpting

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const DOWN = V(0, -1, 0);
const UP = V(0, 1, 0);
const I = BONES.reduce((m, b, i) => ((m[b] = i), m), {} as Record<BoneName, number>);

function buildGeometry(L: Appearance): THREE.BufferGeometry {
  const k = new MeshKit();
  const jacketDark = shadeHex(L.jacket, 0.72);
  const jacketLight = shadeHex(L.jacket, 1.12);
  const packDark = shadeHex(L.pack, 0.7);
  const sole = 0x1e1915;
  const metal = 0x8a8f94;
  const lip = shadeHex(L.skin, 0.78);
  const glove = 0x2e2a26;
  const S = true; // smooth-shaded part

  // ---- Torso (jacket) ----
  const torsoSkin = along(V(0, 0, 0), UP, [[I.hips, -Infinity], [I.spine, 1.02], [I.chest, 1.19]], 0.07);
  k.add(
    loft(
      [
        { y: 0.785, rx: 0.214, rz: 0.144, z: 0.006, n: 2.3 },
        { y: 0.86, rx: 0.206, rz: 0.136, n: 2.3 },
        { y: 0.98, rx: 0.19, rz: 0.126, n: 2.3 },
        { y: 1.1, rx: 0.196, rz: 0.129, n: 2.4 },
        { y: 1.22, rx: 0.214, rz: 0.139, z: 0.01, n: 2.5 },
        { y: 1.33, rx: 0.212, rz: 0.131, z: 0.004, n: 2.5 },
        { y: 1.405, rx: 0.203, rz: 0.116, n: 2.5 },
        { y: 1.45, rx: 0.15, rz: 0.09, n: 2.2 },
        { y: 1.475, rx: 0.075, rz: 0.068 },
      ],
      18,
    ),
    L.jacket,
    torsoSkin,
    0.02,
    S,
  );
  // Hem band, zip and pull, a stand-up collar, chest and hand-warmer pockets with flaps.
  k.add(loft([{ y: 0.775, rx: 0.218, rz: 0.148, z: 0.006, n: 2.3 }, { y: 0.83, rx: 0.214, rz: 0.144, z: 0.006, n: 2.3 }], 18), jacketDark, torsoSkin, 0.02, S);
  k.add(box(0.012, 0.64, 0.012, 0, 1.11, 0.146), jacketDark, torsoSkin);
  k.add(box(0.016, 0.03, 0.01, 0, 1.4, 0.152), metal, torsoSkin);
  k.add(loft([{ y: 1.44, rx: 0.1, rz: 0.088 }, { y: 1.52, rx: 0.094, rz: 0.084 }], 14, false), jacketDark, rigid(I.chest), 0.02, S);
  for (const s of [1, -1]) {
    k.add(box(0.1, 0.075, 0.016, s * 0.1, 0.9, 0.138), jacketDark, torsoSkin);
    k.add(box(0.104, 0.022, 0.022, s * 0.1, 0.94, 0.14), jacketLight, torsoSkin);
    k.add(box(0.085, 0.07, 0.016, s * 0.095, 1.27, 0.147), jacketDark, torsoSkin);
    k.add(box(0.09, 0.022, 0.02, s * 0.095, 1.305, 0.149), jacketLight, torsoSkin);
    k.add(box(0.012, 0.012, 0.012, s * 0.095, 1.296, 0.16), metal, torsoSkin);
  }
  // Rolled hood behind the neck.
  k.add(
    deform(new THREE.TorusGeometry(0.105, 0.042, 8, 14, Math.PI * 1.15).rotateX(Math.PI / 2).rotateY(Math.PI * 0.075 + Math.PI), (v) => {
      v.y += 1.475;
      v.z -= 0.01;
    }),
    jacketDark,
    rigid(I.chest),
    0.02,
    S,
  );

  // ---- Pelvis and legs (trousers with cargo pockets, laced boots) ----
  k.add(
    loft(
      [
        { y: 1.0, rx: 0.186, rz: 0.122, n: 2.3 },
        { y: 0.9, rx: 0.192, rz: 0.126, n: 2.3 },
        { y: 0.82, rx: 0.178, rz: 0.12, n: 2.3 },
        { y: 0.75, rx: 0.13, rz: 0.1 },
      ],
      14,
    ),
    L.pants,
    rigid(I.hips),
    0.02,
    S,
  );
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const x = s * HIP_X;
    const thigh = I[`thigh${side}` as BoneName];
    const shin = I[`shin${side}` as BoneName];
    const foot = I[`foot${side}` as BoneName];
    const toes = I[`toes${side}` as BoneName];
    const legSkin = along(V(x, 1.0, 0), DOWN, [[I.hips, -Infinity], [thigh, 0.11], [shin, 0.51]], 0.055);
    k.add(
      loft(
        [
          { y: 0.94, x, rx: 0.102, rz: 0.108 },
          { y: 0.8, x, rx: 0.095, rz: 0.1, z: 0.004 },
          { y: 0.63, x, rx: 0.082, rz: 0.087, z: 0.006 },
          { y: 0.5, x, rx: 0.074, rz: 0.08, z: 0.01 },
          { y: 0.4, x, rx: 0.069, rz: 0.075, z: 0.004 },
          { y: 0.25, x, rx: 0.063, rz: 0.068 },
          { y: 0.17, x, rx: 0.07, rz: 0.075 },
        ],
        14,
      ),
      L.pants,
      legSkin,
      0.02,
      S,
    );
    // Knee patch, cargo pocket with flap on the outer thigh.
    k.add(box(0.07, 0.08, 0.012, x, 0.5, 0.089), shadeHex(L.pants, 0.82), legSkin);
    k.add(box(0.016, 0.12, 0.09, x + s * 0.088, 0.66, 0.005), shadeHex(L.pants, 0.88), legSkin);
    k.add(box(0.02, 0.025, 0.094, x + s * 0.09, 0.725, 0.005), shadeHex(L.pants, 0.75), legSkin);
    // Boot.
    const bootSkin: SkinFn = (p) => {
      if (p.y > 0.13) {
        const w = 1 - Math.min(1, Math.max(0, (p.y - 0.14) / 0.08));
        return [shin, 1 - w, foot, w];
      }
      const w = Math.min(1, Math.max(0, (p.z - 0.08) / 0.07));
      return [foot, 1 - w, toes, w];
    };
    k.add(
      loft(
        [
          { y: 0.235, x, rx: 0.071, rz: 0.076 },
          { y: 0.15, x, rx: 0.073, rz: 0.081 },
          { y: 0.1, x, rx: 0.071, rz: 0.081 },
        ],
        12,
      ),
      L.boots,
      bootSkin,
      0.03,
      S,
    );
    k.add(loft([{ y: 0.225, x, rx: 0.077, rz: 0.082 }, { y: 0.25, x, rx: 0.075, rz: 0.08 }], 12), shadeHex(L.boots, 0.7), bootSkin, 0.02, S);
    k.add(
      deform(box(0.118, 0.1, 0.27, x, 0.065, 0.045, [3, 3, 6]), (v) => {
        const t = (v.z - 0.045) / 0.135;
        if (t > 0.2 && v.y > 0.06) v.y -= (t - 0.2) * 0.045;
        if (t > 0.6) v.x = x + (v.x - x) * (1 - (t - 0.6) * 0.4);
        if (t < -0.8 && v.y > 0.06) v.z += 0.012;
        // Round the toe.
        if (t > 0.85) v.z -= (Math.abs(v.x - x) / 0.06) ** 2 * 0.02;
      }),
      L.boots,
      bootSkin,
      0.03,
      S,
    );
    k.add(box(0.128, 0.03, 0.29, x, 0.015, 0.046), sole, bootSkin);
    k.add(box(0.124, 0.008, 0.06, x, 0.005, 0.15), 0x2c2620, bootSkin);
    // Laces across the tongue.
    for (let i = 0; i < 4; i++) k.add(box(0.06, 0.007, 0.008, x, 0.12 + i * 0.03, 0.074 - i * 0.004), 0xb8a27a, bootSkin);
  }

  // ---- Arms, cuffs and gloved hands with separate fingers ----
  for (const s of [1, -1]) {
    const side = s > 0 ? 'L' : 'R';
    const x = s * SHOULDER_X;
    const sh = I[`shoulder${side}` as BoneName];
    const ua = I[`upperArm${side}` as BoneName];
    const la = I[`lowerArm${side}` as BoneName];
    const hand = I[`hand${side}` as BoneName];
    const fingers = I[`fingers${side}` as BoneName];
    const armSkin = along(V(x, 1.5, 0), DOWN, [[sh, -Infinity], [ua, 0.05], [la, 0.36], [hand, 0.62]], 0.045);
    k.add(
      loft(
        [
          { y: 1.468, x: x - s * 0.035, rx: 0.052, rz: 0.058 },
          { y: 1.44, x: x - s * 0.006, rx: 0.074, rz: 0.074 },
          { y: 1.32, x, rx: 0.07, rz: 0.068 },
          { y: 1.15, x, rx: 0.061, rz: 0.062 },
          { y: 1.02, x, rx: 0.057, rz: 0.058 },
          { y: 0.925, x, rx: 0.06, rz: 0.061 },
        ],
        12,
      ),
      L.jacket,
      armSkin,
      0.02,
      S,
    );
    k.add(box(0.06, 0.07, 0.012, x, 1.15, -0.062), jacketDark, armSkin);
    k.add(loft([{ y: 0.945, x, rx: 0.067, rz: 0.067 }, { y: 0.92, x, rx: 0.069, rz: 0.069 }, { y: 0.893, x, rx: 0.064, rz: 0.064 }], 12), jacketDark, armSkin, 0.02, S);
    const handSkin = rigid(hand);
    const fingerSkin = rigid(fingers);
    // Fingerless glove over the palm and back of the hand.
    k.add(
      deform(box(0.038, 0.085, 0.082, x, 0.84, 0.005, [2, 3, 3]), (v) => {
        const dz = (v.z - 0.005) / 0.041;
        v.x = x + (v.x - x) * (1 - dz * dz * 0.25);
        if (v.y < 0.81) v.z *= 0.96;
      }),
      glove,
      handSkin,
      0.03,
      S,
    );
    k.add(loft([{ y: 0.885, x, rx: 0.026, rz: 0.044 }, { y: 0.87, x, rx: 0.027, rz: 0.046 }], 10), shadeHex(glove, 1.3), handSkin, 0.02, S);
    // Thumb.
    const tb = new THREE.Vector3(x - s * 0.012, 0.835, 0.04);
    k.add(tube(tb, tb.clone().add(V(-s * 0.012, -0.045, 0.022)), [[0, 0.012], [0.6, 0.011], [1, 0.008]], 8), L.skin, handSkin, 0.02, S);
    // Four fingers on the fingers bone (it curls them for a grip).
    for (let f = 0; f < 4; f++) {
      const fz = -0.026 + f * 0.0175;
      const len = [0.06, 0.068, 0.064, 0.052][f];
      const top = V(x, 0.8, fz);
      k.add(tube(top, top.clone().add(V(-s * 0.004, -len, 0.002)), [[0, 0.0095], [0.5, 0.009], [0.9, 0.008], [1, 0.004]], 7), L.skin, fingerSkin, 0.02, S);
    }
  }

  // ---- Neck and head ----
  const neckSkin = along(V(0, 0, 0), UP, [[I.chest, -Infinity], [I.neck, 1.48], [I.head, 1.585]], 0.03);
  k.add(loft([{ y: 1.45, rx: 0.052, rz: 0.05 }, { y: 1.6, rx: 0.048, rz: 0.048, z: 0.008 }], 12, false), L.skin, neckSkin, 0.01, S);
  const H = rigid(I.head);
  const hc = V(0, 1.665, 0.012);
  const stubble = shadeHex(mixHex(L.skin, L.hair, 0.28), 0.95);
  k.addPainted(
    deform(new THREE.SphereGeometry(0.118, 18, 14), (v) => {
      v.x *= 0.92;
      v.y *= 1.08;
      if (v.y < 0) {
        const t = Math.min(1, -v.y / 0.12);
        v.x *= 1 - 0.3 * t ** 1.4;
        v.z += t * 0.01;
      }
      // Cheekbones and a slight brow ridge.
      if (v.z > 0.05 && v.y > -0.01 && v.y < 0.04) v.x *= 1.03;
      if (v.z > 0.07 && v.y > 0.03 && v.y < 0.05) v.z += 0.004;
      if (v.z > 0.07) v.z = 0.07 + (v.z - 0.07) * 0.55;
      v.add(hc);
    }),
    // Stubble along the jaw, chin and upper lip.
    (c) => (c.y < 1.64 && c.z > -0.03 && !(c.y > 1.62 && Math.abs(c.x) > 0.07) ? stubble : L.skin),
    H,
    0.02,
    S,
  );
  // Nose: a bridge and a rounded tip with soft nostrils.
  k.add(new THREE.SphereGeometry(1, 10, 8).scale(0.013, 0.028, 0.016).rotateX(-0.3).translate(0, 1.664, 0.108), shadeHex(L.skin, 0.98), H, 0.01, S);
  k.add(new THREE.SphereGeometry(1, 10, 8).scale(0.017, 0.013, 0.015).translate(0, 1.642, 0.117), shadeHex(L.skin, 0.97), H, 0.01, S);
  for (const s of [1, -1]) k.add(new THREE.SphereGeometry(1, 8, 6).scale(0.008, 0.008, 0.009).translate(s * 0.013, 1.639, 0.111), shadeHex(L.skin, 0.94), H, 0.01, S);
  for (const s of [1, -1]) {
    k.add(new THREE.SphereGeometry(0.021, 8, 6).scale(0.6, 1.25, 0.95).translate(s * 0.112, 1.662, 0.0), shadeHex(L.skin, 0.93), H, 0.01, S);
    k.add(
      deform(box(0.04, 0.009, 0.012, s * 0.041, 1.714, 0.101, [2, 1, 1]), (v) => {
        v.y += (v.x * s - 0.041) * -0.2;
      }),
      L.hair,
      H,
    );
    // Sideburns below the beanie.
    k.add(box(0.012, 0.035, 0.03, s * 0.112, 1.69, 0.02), L.hair, H);
  }
  k.add(new THREE.SphereGeometry(0.02, 10, 6).scale(1.15, 0.28, 0.4).translate(0, 1.614, 0.103), lip, H, 0.01, S);

  // Hair at the back, and a ribbed knit beanie with a folded brim.
  k.add(new THREE.CylinderGeometry(0.118, 0.106, 0.07, 14, 1, true, Math.PI * 0.64, Math.PI * 0.72).translate(0, 1.68, -0.006), L.hair, H, 0.04, S);
  if (L.hat !== null) {
    const hatDark = shadeHex(L.hat, 0.8);
    k.add(
      deform(new THREE.SphereGeometry(0.128, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), (v) => {
        v.x *= 0.96;
        v.y *= 0.98;
        // Knit ribs and a backward slouch.
        const a = Math.atan2(v.z, v.x);
        const r = 1 + Math.cos(a * 14) * 0.012 * (1 - Math.max(0, v.y) / 0.13);
        v.x *= r;
        v.z *= r;
        v.z -= Math.max(0, v.y) * 0.22 + 0.006;
        v.y += 1.722;
      }),
      L.hat,
      H,
      0.02,
      S,
    );
    k.add(
      deform(
        loft(
          [
            { y: 1.708, rx: 0.13, rz: 0.134, z: -0.002 },
            { y: 1.728, rx: 0.133, rz: 0.137, z: -0.004 },
            { y: 1.76, rx: 0.129, rz: 0.133, z: -0.008 },
          ],
          28,
        ),
        (v) => {
          const a = Math.atan2(v.z, v.x);
          const r = 1 + Math.cos(a * 14) * 0.014;
          v.x *= r;
          v.z = (v.z + 0.004) * r - 0.004;
        },
      ),
      hatDark,
      H,
      0.02,
      S,
    );
  } else {
    k.add(
      deform(new THREE.SphereGeometry(0.127, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), (v) => {
        v.x *= 0.95;
        v.y *= 1.06;
        v.z -= 0.006;
        v.add(hc);
      }),
      L.hair,
      H,
      0.05,
      S,
    );
    k.add(box(0.15, 0.03, 0.03, 0.01, 1.733, 0.095), L.hair, H);
  }

  // ---- Scarf: two wraps, a knot, and a fringed tail on its own swinging bone ----
  const scarfDark = shadeHex(L.scarf, 0.78);
  const scarfSkin = along(V(0, 0, 0), UP, [[I.chest, -Infinity], [I.neck, 1.5]], 0.03);
  k.add(new THREE.TorusGeometry(0.084, 0.04, 8, 18).rotateX(Math.PI / 2).translate(0, 1.485, 0.006), L.scarf, scarfSkin, 0.05, S);
  k.add(new THREE.TorusGeometry(0.075, 0.033, 8, 18).rotateX(Math.PI / 2 - 0.25).translate(0, 1.525, 0.01), scarfDark, scarfSkin, 0.05, S);
  k.add(new THREE.SphereGeometry(0.035, 10, 8).scale(1, 0.9, 0.75).translate(0.045, 1.47, 0.11), L.scarf, rigid(I.chest), 0.04, S);
  const tailSkin = along(V(0, 0, 0), DOWN, [[I.chest, -1.5], [I.scarf, -1.45]], 0.02);
  k.add(
    deform(box(0.065, 0.27, 0.018, 0.055, 1.33, 0.128, [2, 6, 1]), (v) => {
      v.z += (1.47 - v.y) * 0.04;
    }),
    L.scarf,
    tailSkin,
    0.05,
  );
  for (let f = 0; f < 5; f++) k.add(box(0.008, 0.03, 0.008, 0.031 + f * 0.012, 1.183, 0.142), scarfDark, tailSkin);
  k.add(box(0.067, 0.012, 0.02, 0.055, 1.24, 0.14), scarfDark, tailSkin);

  // ---- Backpack (own bone) with buckled straps, bedroll, mug and a water bottle ----
  const P = rigid(I.pack);
  k.add(
    loft(
      [
        { y: 1.08, rx: 0.145, rz: 0.08, z: -0.218, n: 3 },
        { y: 1.12, rx: 0.158, rz: 0.092, z: -0.22, n: 3 },
        { y: 1.42, rx: 0.158, rz: 0.092, z: -0.22, n: 3 },
        { y: 1.48, rx: 0.14, rz: 0.08, z: -0.215, n: 3 },
      ],
      16,
    ),
    L.pack,
    P,
    0.03,
    S,
  );
  k.add(
    deform(box(0.31, 0.05, 0.2, 0, 1.48, -0.22, [3, 1, 3]), (v) => {
      if (v.z < -0.27) v.y -= 0.05;
    }),
    packDark,
    P,
  );
  k.add(box(0.22, 0.16, 0.05, 0, 1.2, -0.325), packDark, P);
  k.add(box(0.1, 0.012, 0.052, 0, 1.27, -0.326), sole, P);
  for (const s of [1, -1]) {
    k.add(box(0.03, 0.2, 0.012, s * 0.07, 1.37, -0.318), packDark, P);
    k.add(box(0.036, 0.024, 0.016, s * 0.07, 1.31, -0.322), metal, P);
    k.add(box(0.05, 0.15, 0.13, s * 0.172, 1.18, -0.22), packDark, P);
  }
  k.add(new THREE.CylinderGeometry(0.068, 0.068, 0.34, 14).rotateZ(Math.PI / 2).translate(0, 1.55, -0.235), 0x56603f, P, 0.03, S);
  for (const s of [1, -1]) k.add(new THREE.CylinderGeometry(0.072, 0.072, 0.022, 14).rotateZ(Math.PI / 2).translate(s * 0.1, 1.55, -0.235), sole, P, 0.02, S);
  k.add(new THREE.CylinderGeometry(0.036, 0.03, 0.065, 10).translate(0.13, 1.1, -0.315), metal, P, 0.02, S);
  k.add(new THREE.TorusGeometry(0.018, 0.005, 4, 8).rotateY(Math.PI / 2).translate(0.165, 1.105, -0.315), metal, P);
  k.add(new THREE.CylinderGeometry(0.035, 0.035, 0.17, 12).translate(-0.205, 1.2, -0.21), 0x3f6a7a, P, 0.02, S);
  k.add(new THREE.CylinderGeometry(0.02, 0.025, 0.03, 10).translate(-0.205, 1.3, -0.21), 0x2a2a2a, P, 0.02, S);
  for (const s of [1, -1]) {
    k.add(
      deform(box(0.045, 0.34, 0.014, s * 0.1, 1.27, 0.14, [1, 4, 1]), (v) => {
        v.z += (v.y - 1.27) * -0.05;
        v.x += (v.y - 1.27) * s * 0.06;
      }),
      packDark,
      rigid(I.chest),
    );
    k.add(box(0.05, 0.03, 0.02, s * 0.112, 1.2, 0.152), metal, rigid(I.chest));
    k.add(box(0.046, 0.016, 0.24, s * 0.11, 1.452, -0.03), packDark, rigid(I.chest));
  }
  // Sternum strap.
  k.add(box(0.18, 0.016, 0.01, 0, 1.31, 0.155), packDark, rigid(I.chest));
  return k.build();
}

function mixHex(a: number, b: number, t: number): number {
  return new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
}
