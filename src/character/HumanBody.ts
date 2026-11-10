import * as THREE from 'three';
import { along, box, deform, loft, MeshKit, rigid, type SkinFn } from './MeshKit';

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
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 });
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

    // Eyes: dark, slightly glossy beads on the head bone.
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x18120e, roughness: 0.3 });
    for (const s of [1, -1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.02, 0.012), eyeMat);
      const h = JOINTS.head;
      e.position.set(s * 0.04, 1.688 - h[1], 0.104 - h[2]);
      e.castShadow = false;
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
const FWD = V(0, 0, 1);
const I = BONES.reduce((m, b, i) => ((m[b] = i), m), {} as Record<BoneName, number>);

function buildGeometry(L: Appearance): THREE.BufferGeometry {
  const k = new MeshKit();
  const jacketDark = shadeHex(L.jacket, 0.72);
  const jacketLight = shadeHex(L.jacket, 1.12);
  const packDark = shadeHex(L.pack, 0.7);
  const sole = 0x1e1915;
  const lip = shadeHex(L.skin, 0.78);

  // ---- Torso (jacket) ----
  const torsoSkin = along(V(0, 0, 0), UP, [[I.hips, -Infinity], [I.spine, 1.02], [I.chest, 1.19]], 0.07);
  k.add(
    loft(
      [
        { y: 0.79, rx: 0.212, rz: 0.142, z: 0.006, n: 2.4 },
        { y: 0.86, rx: 0.205, rz: 0.135, n: 2.4 },
        { y: 0.98, rx: 0.19, rz: 0.125, n: 2.4 },
        { y: 1.1, rx: 0.196, rz: 0.128, n: 2.5 },
        { y: 1.22, rx: 0.214, rz: 0.138, z: 0.01, n: 2.6 },
        { y: 1.33, rx: 0.212, rz: 0.13, z: 0.004, n: 2.6 },
        { y: 1.405, rx: 0.205, rz: 0.115, n: 2.6 },
        { y: 1.45, rx: 0.15, rz: 0.09, n: 2.2 },
        { y: 1.475, rx: 0.075, rz: 0.068 },
      ],
      12,
    ),
    L.jacket,
    torsoSkin,
  );
  // Hem band, zip, chest seam, pockets.
  k.add(loft([{ y: 0.78, rx: 0.216, rz: 0.146, z: 0.006, n: 2.4 }, { y: 0.83, rx: 0.212, rz: 0.142, z: 0.006, n: 2.4 }], 12), jacketDark, torsoSkin);
  k.add(box(0.014, 0.62, 0.012, 0, 1.11, 0.146), jacketDark, torsoSkin);
  for (const s of [1, -1]) {
    k.add(box(0.1, 0.075, 0.016, s * 0.1, 0.9, 0.137), jacketDark, torsoSkin);
    k.add(box(0.1, 0.012, 0.02, s * 0.1, 0.94, 0.138), jacketLight, torsoSkin);
    k.add(box(0.09, 0.06, 0.016, s * 0.1, 1.27, 0.146), jacketDark, torsoSkin);
  }
  // Rolled hood behind the neck.
  k.add(
    deform(new THREE.TorusGeometry(0.105, 0.042, 5, 10, Math.PI * 1.15).rotateX(Math.PI / 2).rotateY(Math.PI * 0.075 + Math.PI), (v) => {
      v.y += 1.475;
      v.z -= 0.01;
    }),
    jacketDark,
    rigid(I.chest),
  );

  // ---- Pelvis and legs (trousers, boots) ----
  k.add(
    loft(
      [
        { y: 1.0, rx: 0.186, rz: 0.122, n: 2.3 },
        { y: 0.9, rx: 0.192, rz: 0.126, n: 2.3 },
        { y: 0.82, rx: 0.178, rz: 0.12, n: 2.3 },
        { y: 0.75, rx: 0.13, rz: 0.1 },
      ],
      10,
    ),
    L.pants,
    rigid(I.hips),
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
          { y: 0.8, x, rx: 0.094, rz: 0.1, z: 0.004 },
          { y: 0.63, x, rx: 0.081, rz: 0.087, z: 0.006 },
          { y: 0.5, x, rx: 0.073, rz: 0.08, z: 0.01 },
          { y: 0.4, x, rx: 0.069, rz: 0.075, z: 0.004 },
          { y: 0.25, x, rx: 0.062, rz: 0.067 },
          { y: 0.17, x, rx: 0.068, rz: 0.073 },
        ],
        9,
      ),
      L.pants,
      legSkin,
    );
    // Knee patch.
    k.add(box(0.07, 0.08, 0.012, x, 0.5, 0.088), shadeHex(L.pants, 0.82), legSkin);
    // Boot: a shaft around the ankle and a foot block with a sloped toe.
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
          { y: 0.23, x, rx: 0.069, rz: 0.074 },
          { y: 0.15, x, rx: 0.072, rz: 0.08 },
          { y: 0.1, x, rx: 0.07, rz: 0.08 },
        ],
        9,
      ),
      L.boots,
      bootSkin,
    );
    k.add(
      deform(box(0.118, 0.1, 0.27, x, 0.065, 0.045, [2, 2, 4]), (v) => {
        const t = (v.z - 0.045) / 0.135;
        if (t > 0.2 && v.y > 0.06) v.y -= (t - 0.2) * 0.045;
        if (t > 0.6) v.x = x + (v.x - x) * (1 - (t - 0.6) * 0.35);
        if (t < -0.8 && v.y > 0.06) v.z += 0.012;
      }),
      L.boots,
      bootSkin,
    );
    k.add(box(0.126, 0.026, 0.285, x, 0.013, 0.046), sole, bootSkin);
    k.add(box(0.122, 0.012, 0.05, x, 0.18, 0.0), shadeHex(L.boots, 0.75), bootSkin);
  }

  // ---- Arms ----
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
        8,
      ),
      L.jacket,
      armSkin,
    );
    // Elbow patch and cuff.
    k.add(box(0.06, 0.07, 0.012, x, 1.15, -0.062), jacketDark, armSkin);
    k.add(loft([{ y: 0.935, x, rx: 0.066, rz: 0.066 }, { y: 0.895, x, rx: 0.063, rz: 0.063 }], 8), jacketDark, armSkin);
    // Hand: palm (faces the body), thumb, and a fingers block on its own bone for gripping.
    const handSkin: SkinFn = (p) => (p.y < 0.79 ? [fingers, 1, fingers, 0] : [hand, 1, hand, 0]);
    k.add(
      deform(box(0.036, 0.095, 0.08, x, 0.835, 0.005, [1, 2, 2]), (v) => {
        if (v.y < 0.82) v.z *= 0.95;
      }),
      L.skin,
      handSkin,
    );
    k.add(
      deform(box(0.024, 0.055, 0.026, x - s * 0.012, 0.83, 0.05), (v) => {
        // Lean the thumb forward/inward.
        const dy = v.y - 0.85;
        v.z += -dy * 0.35;
        v.x -= s * dy * 0.2;
      }),
      L.skin,
      handSkin,
    );
    k.add(
      deform(box(0.032, 0.08, 0.074, x, 0.75, 0.006, [1, 2, 1]), (v) => {
        if (v.y < 0.75) v.x -= s * 0.008;
      }),
      L.skin,
      handSkin,
    );
  }

  // ---- Neck and head ----
  const neckSkin = along(V(0, 0, 0), UP, [[I.chest, -Infinity], [I.neck, 1.48], [I.head, 1.585]], 0.03);
  k.add(loft([{ y: 1.45, rx: 0.052, rz: 0.05 }, { y: 1.6, rx: 0.048, rz: 0.048, z: 0.008 }], 8, false), L.skin, neckSkin);
  const H = rigid(I.head);
  const hc = V(0, 1.665, 0.012);
  k.add(
    deform(new THREE.SphereGeometry(0.118, 10, 8), (v) => {
      v.x *= 0.92;
      v.y *= 1.08;
      if (v.y < 0) {
        // Narrow toward the jaw and chin.
        const t = Math.min(1, -v.y / 0.12);
        v.x *= 1 - 0.3 * t ** 1.4;
        v.z += t * 0.01;
      }
      if (v.z > 0.07) v.z = 0.07 + (v.z - 0.07) * 0.55; // flatter face
      v.add(hc);
    }),
    L.skin,
    H,
  );
  // Nose, ears, brows, mouth.
  k.add(
    deform(box(0.03, 0.05, 0.034, 0, 1.656, 0.112, [1, 2, 1]), (v) => {
      if (v.y > 1.66) {
        v.x *= 0.6;
        v.z -= 0.012;
      }
    }),
    L.skin,
    H,
  );
  for (const s of [1, -1]) {
    k.add(box(0.022, 0.048, 0.036, s * 0.111, 1.66, 0.0), shadeHex(L.skin, 0.94), H);
    k.add(
      deform(box(0.042, 0.011, 0.014, s * 0.041, 1.713, 0.1), (v) => {
        v.y += (v.x * s - 0.041) * -0.18;
      }),
      L.hair,
      H,
    );
  }
  k.add(box(0.042, 0.008, 0.008, 0, 1.612, 0.103), lip, H);

  // Hair, and a knit beanie with a folded brim.
  k.add(
    new THREE.CylinderGeometry(0.118, 0.106, 0.07, 10, 1, true, Math.PI * 0.64, Math.PI * 0.72).translate(0, 1.68, -0.006),
    L.hair,
    H,
  );
  if (L.hat !== null) {
    const hatDark = shadeHex(L.hat, 0.8);
    k.add(
      deform(new THREE.SphereGeometry(0.128, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), (v) => {
        v.x *= 0.96;
        v.y *= 0.98;
        // Slight backward slouch.
        v.z -= Math.max(0, v.y) * 0.22 + 0.006;
        v.y += 1.722;
      }),
      L.hat,
      H,
    );
    k.add(
      loft(
        [
          { y: 1.71, rx: 0.13, rz: 0.134, z: -0.002 },
          { y: 1.728, rx: 0.132, rz: 0.136, z: -0.004 },
          { y: 1.758, rx: 0.128, rz: 0.132, z: -0.008 },
        ],
        10,
      ),
      hatDark,
      H,
    );
  } else {
    k.add(
      deform(new THREE.SphereGeometry(0.127, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), (v) => {
        v.x *= 0.95;
        v.y *= 1.06;
        v.z -= 0.006;
        v.add(hc);
      }),
      L.hair,
      H,
    );
    k.add(box(0.15, 0.03, 0.03, 0.01, 1.733, 0.095), L.hair, H);
  }

  // ---- Scarf: two wraps, a knot, and a tail on its own swinging bone ----
  const scarfDark = shadeHex(L.scarf, 0.78);
  const scarfSkin = along(V(0, 0, 0), UP, [[I.chest, -Infinity], [I.neck, 1.5]], 0.03);
  k.add(new THREE.TorusGeometry(0.084, 0.04, 6, 12).rotateX(Math.PI / 2).translate(0, 1.485, 0.006), L.scarf, scarfSkin);
  k.add(new THREE.TorusGeometry(0.075, 0.033, 6, 12).rotateX(Math.PI / 2 - 0.25).translate(0, 1.525, 0.01), scarfDark, scarfSkin);
  k.add(box(0.06, 0.055, 0.045, 0.045, 1.47, 0.11), L.scarf, rigid(I.chest));
  const tailSkin = along(V(0, 0, 0), DOWN, [[I.chest, -1.5], [I.scarf, -1.45]], 0.02);
  k.add(
    deform(box(0.065, 0.27, 0.018, 0.055, 1.33, 0.128, [1, 3, 1]), (v) => {
      v.z += (1.47 - v.y) * 0.04;
    }),
    L.scarf,
    tailSkin,
  );
  k.add(box(0.067, 0.022, 0.02, 0.055, 1.2, 0.141), scarfDark, tailSkin);

  // ---- Backpack (own bone, bounces when moving) with straps, bedroll and a mug ----
  const P = rigid(I.pack);
  k.add(
    loft(
      [
        { y: 1.08, rx: 0.145, rz: 0.08, z: -0.218, n: 3 },
        { y: 1.12, rx: 0.158, rz: 0.092, z: -0.22, n: 3 },
        { y: 1.42, rx: 0.158, rz: 0.092, z: -0.22, n: 3 },
        { y: 1.48, rx: 0.14, rz: 0.08, z: -0.215, n: 3 },
      ],
      10,
    ),
    L.pack,
    P,
  );
  k.add(
    deform(box(0.31, 0.05, 0.2, 0, 1.48, -0.22, [2, 1, 2]), (v) => {
      if (v.z < -0.27) v.y -= 0.05;
    }),
    packDark,
    P,
  );
  k.add(box(0.22, 0.16, 0.05, 0, 1.2, -0.325), packDark, P);
  k.add(box(0.1, 0.012, 0.052, 0, 1.27, -0.326), sole, P);
  for (const s of [1, -1]) k.add(box(0.05, 0.15, 0.13, s * 0.172, 1.18, -0.22), packDark, P);
  k.add(new THREE.CylinderGeometry(0.068, 0.068, 0.34, 8).rotateZ(Math.PI / 2).translate(0, 1.55, -0.235), 0x56603f, P);
  for (const s of [1, -1]) k.add(new THREE.CylinderGeometry(0.072, 0.072, 0.022, 8).rotateZ(Math.PI / 2).translate(s * 0.1, 1.55, -0.235), sole, P);
  k.add(new THREE.CylinderGeometry(0.036, 0.03, 0.065, 7).translate(0.13, 1.1, -0.315), 0x8a8f94, P);
  for (const s of [1, -1]) {
    k.add(
      deform(box(0.045, 0.34, 0.014, s * 0.1, 1.27, 0.14, [1, 3, 1]), (v) => {
        v.z += (v.y - 1.27) * -0.05;
        v.x += (v.y - 1.27) * s * 0.06;
      }),
      packDark,
      rigid(I.chest),
    );
    k.add(box(0.046, 0.016, 0.24, s * 0.11, 1.452, -0.03), packDark, rigid(I.chest));
  }
  void FWD;
  return k.build();
}
