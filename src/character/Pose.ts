import { BONES, BONE_INDEX, type BoneName } from './HumanBody';

/**
 * A pose is a flat array: Euler XYZ (radians) per bone in BONES order, then the hips offset
 * (metres). Rotations are absolute relative to the rest pose (rest = all zeros), so poses can
 * be blended by plain interpolation.
 */
export type Pose = Float32Array;
export const NB = BONES.length;
export const HIPS_OFFSET = NB * 3;
export const POSE_SIZE = NB * 3 + 3;
export const newPose = (): Pose => new Float32Array(POSE_SIZE);

/** Which channels a clip drives: one flag per bone, plus one for the hips offset. */
export type Mask = Uint8Array;
export function mask(bones: BoneName[], hips = false): Mask {
  const m = new Uint8Array(NB + 1);
  for (const b of bones) m[BONE_INDEX[b]] = 1;
  if (hips) m[NB] = 1;
  return m;
}
export const FULL: Mask = new Uint8Array(NB + 1).fill(1);

/** Authoring format: times are fractions of the clip (0–1), angles are degrees. */
export type RotKey = [t: number, x: number, y?: number, z?: number];
export type HipsKey = [t: number, x: number, y: number, z: number];
export interface ClipDef {
  /** Seconds (one-shots) or seconds per cycle (loops, also used with a phase). */
  duration: number;
  loop: boolean;
  keys: Partial<Record<BoneName, RotKey[]>>;
  /** Hips translation keys (metres) and optional extra hips rotation keys go in `keys.hips`. */
  hipsOffset?: HipsKey[];
}

interface Track {
  /** Channel index into the pose (bone * 3 + axis, or HIPS_OFFSET + axis). */
  channel: number;
  times: Float32Array;
  values: Float32Array;
}

export interface Clip {
  readonly name: string;
  readonly duration: number;
  readonly loop: boolean;
  readonly mask: Mask;
  readonly tracks: Track[];
}

const DEG = Math.PI / 180;

export function compile(name: string, def: ClipDef): Clip {
  const tracks: Track[] = [];
  const m = new Uint8Array(NB + 1);
  const sorted = <T extends readonly (number | undefined)[]>(keys: T[]) => [...keys].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  for (const [bone, keys] of Object.entries(def.keys) as [BoneName, RotKey[]][]) {
    if (!keys?.length) continue;
    const bi = BONE_INDEX[bone];
    m[bi] = 1;
    const ks = sorted(keys);
    for (let axis = 0; axis < 3; axis++) {
      tracks.push({
        channel: bi * 3 + axis,
        times: Float32Array.from(ks.map((k) => k[0])),
        values: Float32Array.from(ks.map((k) => (k[axis + 1] ?? 0) * DEG)),
      });
    }
  }
  if (def.hipsOffset?.length) {
    m[NB] = 1;
    const ks = sorted(def.hipsOffset);
    for (let axis = 0; axis < 3; axis++) {
      tracks.push({ channel: HIPS_OFFSET + axis, times: Float32Array.from(ks.map((k) => k[0])), values: Float32Array.from(ks.map((k) => k[axis + 1])) });
    }
  }
  return { name, duration: def.duration, loop: def.loop, mask: m, tracks };
}

/** Catmull-Rom through the keys; wraps around for loops, holds the ends otherwise. */
function sampleTrack(tr: Track, t: number, loop: boolean): number {
  const T = tr.times;
  const Vv = tr.values;
  const n = T.length;
  if (n === 1) return Vv[0];
  let i: number;
  let j: number;
  let t0: number;
  let t1: number;
  if (loop) {
    t -= Math.floor(t);
    // Last key at or before t; before the first key we are still in the wrapping segment.
    i = n - 1;
    for (let k = 0; k < n; k++) if (T[k] <= t) i = k;
    j = (i + 1) % n;
    t0 = T[i] > t ? T[i] - 1 : T[i];
    t1 = T[j] <= t0 ? T[j] + 1 : T[j];
  } else {
    if (t <= T[0]) return Vv[0];
    if (t >= T[n - 1]) return Vv[n - 1];
    i = 0;
    for (let k = 0; k < n - 1; k++) if (T[k] <= t) i = k;
    j = i + 1;
    t0 = T[i];
    t1 = T[j];
  }
  const u = (t - t0) / Math.max(1e-6, t1 - t0);
  const ip = loop ? (i - 1 + n) % n : Math.max(0, i - 1);
  const jn = loop ? (j + 1) % n : Math.min(n - 1, j + 1);
  const p0 = Vv[ip];
  const p1 = Vv[i];
  const p2 = Vv[j];
  const p3 = Vv[jn];
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** Writes the clip's channels at normalised time `t` (0–1) into `out`; other channels untouched. */
export function sample(clip: Clip, t: number, out: Pose): Pose {
  for (const tr of clip.tracks) out[tr.channel] = sampleTrack(tr, t, clip.loop);
  return out;
}

/** dst = lerp(dst, src, w) over the masked channels. */
export function blend(dst: Pose, src: Pose, w: number, m: Mask = FULL): void {
  if (w <= 0) return;
  for (let b = 0; b < NB; b++) {
    if (!m[b]) continue;
    const o = b * 3;
    dst[o] += (src[o] - dst[o]) * w;
    dst[o + 1] += (src[o + 1] - dst[o + 1]) * w;
    dst[o + 2] += (src[o + 2] - dst[o + 2]) * w;
  }
  if (m[NB]) for (let a = 0; a < 3; a++) dst[HIPS_OFFSET + a] += (src[HIPS_OFFSET + a] - dst[HIPS_OFFSET + a]) * w;
}

/** dst += src * w over the masked channels (for additive layers). */
export function add(dst: Pose, src: Pose, w: number, m: Mask = FULL): void {
  if (w === 0) return;
  for (let b = 0; b < NB; b++) {
    if (!m[b]) continue;
    const o = b * 3;
    dst[o] += src[o] * w;
    dst[o + 1] += src[o + 1] * w;
    dst[o + 2] += src[o + 2] * w;
  }
  if (m[NB]) for (let a = 0; a < 3; a++) dst[HIPS_OFFSET + a] += src[HIPS_OFFSET + a] * w;
}

/** Reads one bone's rotation (radians) from a pose. */
export function rot(p: Pose, bone: BoneName, axis: 0 | 1 | 2): number {
  return p[BONE_INDEX[bone] * 3 + axis];
}

export function setRot(p: Pose, bone: BoneName, axis: 0 | 1 | 2, v: number): void {
  p[BONE_INDEX[bone] * 3 + axis] = v;
}
