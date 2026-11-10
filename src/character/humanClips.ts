import type { BoneName } from './HumanBody';
import { type Clip, type ClipDef, compile, type RotKey } from './Pose';

/*
 * Hand-keyed animation for the survivor. Conventions (degrees, character faces +z, left = +x):
 *   thigh/upperArm  x < 0 swings the limb forward
 *   shin            x > 0 bends the knee
 *   lowerArm        x < 0 bends the elbow (forearm forward)
 *   foot            x > 0 points the toes down
 *   spine/chest     x > 0 leans forward; y > 0 turns toward the left
 *   upperArm z      > 0 lifts the left arm out (right arm: < 0)
 *   shoulder z      > 0 shrugs the left shoulder (right: < 0)
 *   fingers z       curl: left < 0, right > 0
 */

type Keys = Partial<Record<BoneName, RotKey[]>>;

/** Shift a cyclic track by half a cycle (the other leg/arm). */
const half = (keys: RotKey[]): RotKey[] => keys.map(([t, ...v]) => [(t + 0.5) % 1, ...v] as RotKey);
/** Mirror a left-side track to the right side (flips y and z rotations). */
const mirror = (keys: RotKey[]): RotKey[] => keys.map(([t, x, y = 0, z = 0]) => [t, x, -y, -z]);
/** Right-side copy shifted half a cycle (gaits). */
const other = (keys: RotKey[]): RotKey[] => half(mirror(keys));
/** Same pose on both sides. */
function both(keys: Keys, side: 'L' | 'R', bone: string, k: RotKey[]): void {
  keys[`${bone}${side}` as BoneName] = k;
  keys[`${bone}${side === 'L' ? 'R' : 'L'}` as BoneName] = mirror(k);
}
const still = (x: number, y = 0, z = 0): RotKey[] => [[0, x, y, z]];

function clip(name: string, def: ClipDef): Clip {
  return compile(name, def);
}

// ------------------------------------------------------------------------------------ Locomotion

function idle(): Clip {
  const k: Keys = {
    hips: [[0, 0, 0, 1.2], [0.5, 0, 0, -1.2]],
    spine: [[0, 2.5], [0.5, 3.5]],
    chest: [[0, -1], [0.25, -2.5], [0.5, -1], [0.75, -0.5]],
    neck: [[0, 2], [0.5, 1]],
    head: [[0, 3, 2], [0.5, 4, -3]],
    shoulderL: [[0, 0, 0, 0], [0.25, 0, 0, 1.5], [0.5, 0, 0, 0]],
    shoulderR: [[0, 0, 0, 0], [0.25, 0, 0, -1.5], [0.5, 0, 0, 0]],
    upperArmL: [[0, 3, 0, 9], [0.5, 1, 0, 10]],
    upperArmR: [[0, 2, 0, -9], [0.5, 4, 0, -10]],
    lowerArmL: [[0, -14], [0.5, -16]],
    lowerArmR: [[0, -15], [0.5, -13]],
    handL: still(0, 10, -4),
    handR: still(0, -10, 4),
    fingersL: still(0, 0, -25),
    fingersR: still(0, 0, 25),
    thighL: [[0, -2, 0, 2.5], [0.5, -1, 0, 1.5]],
    thighR: [[0, -1, 0, -1.5], [0.5, -2, 0, -2.5]],
    shinL: still(3),
    shinR: still(3),
    footL: [[0, -1, 0, -2.5], [0.5, -2, 0, -1.5]],
    footR: [[0, -2, 0, 1.5], [0.5, -1, 0, 2.5]],
  };
  return clip('idle', { duration: 4.2, loop: true, keys: k, hipsOffset: [[0, 0.012, -0.004, 0], [0.5, -0.012, -0.002, 0]] });
}

/** Phase 0 = left heel strike, 0.5 = right heel strike. */
function walk(): Clip {
  const thigh: RotKey[] = [[0, -24], [0.12, -17], [0.25, -2], [0.4, 12], [0.5, 17], [0.6, 6], [0.72, -14], [0.86, -28]];
  const shin: RotKey[] = [[0, 3], [0.1, 16], [0.25, 6], [0.42, 10], [0.52, 32], [0.62, 58], [0.74, 42], [0.88, 8]];
  const foot: RotKey[] = [[0, -16], [0.1, -2], [0.25, 2], [0.42, 6], [0.52, 22], [0.62, 18], [0.75, -4], [0.9, -14]];
  const toes: RotKey[] = [[0, 0], [0.35, 0], [0.47, -18], [0.56, -26], [0.64, 0]];
  const upperArm: RotKey[] = [[0, 20, 0, 8], [0.25, 4, 0, 7], [0.5, -22, 0, 7], [0.75, -2, 0, 8]];
  const lowerArm: RotKey[] = [[0, -12], [0.25, -18], [0.5, -34], [0.75, -20]];
  const k: Keys = {
    thighL: thigh,
    thighR: other(thigh),
    shinL: shin,
    shinR: other(shin),
    footL: foot,
    footR: other(foot),
    toesL: toes,
    toesR: other(toes),
    upperArmL: upperArm,
    upperArmR: other(upperArm),
    lowerArmL: lowerArm,
    lowerArmR: other(lowerArm),
    hips: [[0, 0, -6, 0], [0.25, 0, 0, 3], [0.5, 0, 6, 0], [0.75, 0, 0, -3]],
    spine: [[0, 4, 3, 0], [0.25, 4.5, 0, -1], [0.5, 4, -3, 0], [0.75, 4.5, 0, 1]],
    chest: [[0, 1, 5, 0], [0.5, 1, -5, 0]],
    neck: still(-2),
    head: [[0, -1, -4], [0.25, 0, 0], [0.5, -1, 4], [0.75, 0, 0]],
    shoulderL: [[0, 0, 0, 0], [0.5, 0, 0, 2]],
    shoulderR: [[0, 0, 0, -2], [0.5, 0, 0, 0]],
    handL: still(0, 8, -3),
    handR: still(0, -8, 3),
    fingersL: still(0, 0, -30),
    fingersR: still(0, 0, 30),
  };
  return clip('walk', {
    duration: 1,
    loop: true,
    keys: k,
    hipsOffset: [[0, 0, -0.03, 0], [0.12, 0.006, -0.036, 0], [0.28, 0.014, 0.006, 0], [0.5, 0, -0.03, 0], [0.62, -0.006, -0.036, 0], [0.78, -0.014, 0.006, 0]],
  });
}

function run(): Clip {
  const thigh: RotKey[] = [[0, -36], [0.1, -22], [0.24, 14], [0.34, 26], [0.46, 8], [0.6, -32], [0.74, -62], [0.88, -52]];
  const shin: RotKey[] = [[0, 16], [0.1, 38], [0.24, 18], [0.34, 22], [0.46, 88], [0.6, 112], [0.74, 88], [0.88, 38]];
  const foot: RotKey[] = [[0, -6], [0.1, 6], [0.24, 18], [0.34, 38], [0.46, 32], [0.6, 12], [0.74, -10], [0.88, -12]];
  const toes: RotKey[] = [[0, 0], [0.22, -10], [0.32, -28], [0.42, 0]];
  const upperArm: RotKey[] = [[0, 38, 0, 10], [0.25, 0, 0, 12], [0.5, -55, 0, 8], [0.75, -6, 0, 12]];
  const lowerArm: RotKey[] = [[0, -70], [0.25, -84], [0.5, -100], [0.75, -86]];
  const k: Keys = {
    thighL: thigh,
    thighR: other(thigh),
    shinL: shin,
    shinR: other(shin),
    footL: foot,
    footR: other(foot),
    toesL: toes,
    toesR: other(toes),
    upperArmL: upperArm,
    upperArmR: other(upperArm),
    lowerArmL: lowerArm,
    lowerArmR: other(lowerArm),
    hips: [[0, 6, -9, 0], [0.25, 7, 0, 4], [0.5, 6, 9, 0], [0.75, 7, 0, -4]],
    spine: [[0, 9, 4], [0.25, 10, 0], [0.5, 9, -4], [0.75, 10, 0]],
    chest: [[0, 3, 11], [0.5, 3, -11]],
    neck: still(-6),
    head: [[0, -7, -6], [0.5, -7, 6]],
    handL: still(10, 0, -8),
    handR: still(10, 0, 8),
    fingersL: still(0, 0, -70),
    fingersR: still(0, 0, 70),
  };
  return clip('run', {
    duration: 1,
    loop: true,
    keys: k,
    hipsOffset: [[0, 0, -0.07, 0], [0.1, 0.008, -0.095, 0], [0.24, 0.012, -0.04, 0], [0.38, 0, 0.01, 0], [0.5, 0, -0.07, 0], [0.6, -0.008, -0.095, 0], [0.74, -0.012, -0.04, 0], [0.88, 0, 0.01, 0]],
  });
}

function jump(): Clip {
  const k: Keys = {
    thighL: still(-58),
    shinL: still(78),
    footL: still(22),
    thighR: still(8),
    shinR: still(42),
    footR: still(30),
    upperArmL: still(-70, 0, 22),
    upperArmR: still(30, 0, -18),
    lowerArmL: still(-45),
    lowerArmR: still(-35),
    spine: still(6),
    chest: still(-4),
    head: still(-10),
    fingersL: still(0, 0, -20),
    fingersR: still(0, 0, 20),
  };
  return clip('jump', { duration: 1, loop: false, keys: k });
}

function fall(): Clip {
  const k: Keys = {
    thighL: [[0, -34], [0.5, -26]],
    shinL: [[0, 46], [0.5, 36]],
    footL: still(10),
    thighR: [[0, -8], [0.5, -16]],
    shinR: [[0, 26], [0.5, 34]],
    footR: still(14),
    upperArmL: [[0, -24, 0, 48], [0.5, -16, 0, 56]],
    upperArmR: [[0, -16, 0, -56], [0.5, -24, 0, -48]],
    lowerArmL: still(-34),
    lowerArmR: still(-30),
    spine: still(-2),
    head: still(8),
    fingersL: still(0, 0, -5),
    fingersR: still(0, 0, 5),
  };
  return clip('fall', { duration: 0.8, loop: true, keys: k });
}

/** Knees absorb a landing; weight scales with impact. */
function land(): Clip {
  const k: Keys = {};
  both(k, 'L', 'thigh', [[0, -44], [0.35, -30], [1, 0]]);
  both(k, 'L', 'shin', [[0, 78], [0.35, 56], [1, 3]]);
  both(k, 'L', 'foot', [[0, -34], [0.35, -26], [1, -2]]);
  both(k, 'L', 'upperArm', [[0, -20, 0, 26], [0.4, -10, 0, 16], [1, 2, 0, 9]]);
  both(k, 'L', 'lowerArm', [[0, -40], [1, -15]]);
  k.spine = [[0, 18], [0.4, 12], [1, 3]];
  k.head = [[0, -10], [1, 2]];
  return clip('land', { duration: 0.42, loop: false, keys: k, hipsOffset: [[0, 0, -0.2, 0], [0.35, 0, -0.13, 0], [1, 0, 0, 0]] });
}

function swim(): Clip {
  const upperArm: RotKey[] = [[0, -172, 0, 10], [0.22, -120, 0, 12], [0.45, -10, 0, 6], [0.62, 10, 0, 30], [0.8, -90, 0, 40]];
  const lowerArm: RotKey[] = [[0, -8], [0.22, -40], [0.45, -18], [0.62, -40], [0.8, -95]];
  const thigh: RotKey[] = [[0, -12], [0.25, 14], [0.5, -12], [0.75, 14]];
  const shin: RotKey[] = [[0, 26], [0.25, 6], [0.5, 26], [0.75, 6]];
  const k: Keys = {
    hips: [[0, 72, 0, -4], [0.5, 72, 0, 4]],
    spine: still(-6),
    chest: [[0, -4, 12], [0.5, -4, -12]],
    neck: still(-30),
    head: [[0, -32, 8], [0.5, -32, -8]],
    upperArmL: upperArm,
    upperArmR: other(upperArm),
    lowerArmL: lowerArm,
    lowerArmR: other(lowerArm),
    thighL: thigh,
    thighR: [[0, 14], [0.25, -12], [0.5, 14], [0.75, -12]],
    shinL: shin,
    shinR: [[0, 6], [0.25, 26], [0.5, 6], [0.75, 26]],
    footL: still(40),
    footR: still(40),
    fingersL: still(0, 0, -5),
    fingersR: still(0, 0, 5),
  };
  return clip('swim', { duration: 1.5, loop: true, keys: k, hipsOffset: [[0, 0, 0.32, 0], [0.5, 0, 0.3, 0]] });
}

/** Treading water: upright, sculling arms, slow cycling legs. */
function tread(): Clip {
  const k: Keys = {
    hips: still(12),
    spine: still(-4),
    neck: still(-6),
    head: still(-6),
    upperArmL: [[0, -30, 25, 50], [0.5, -30, -25, 42]],
    upperArmR: [[0, -30, 25, -42], [0.5, -30, -25, -50]],
    lowerArmL: [[0, -60, 0, 0], [0.5, -50, 0, 0]],
    lowerArmR: [[0, -50, 0, 0], [0.5, -60, 0, 0]],
    handL: [[0, 0, 0, 20], [0.5, 0, 0, -20]],
    handR: [[0, 0, 0, 20], [0.5, 0, 0, -20]],
    thighL: [[0, -40], [0.5, -10]],
    thighR: [[0, -10], [0.5, -40]],
    shinL: [[0, 30], [0.5, 70]],
    shinR: [[0, 70], [0.5, 30]],
    footL: still(30),
    footR: still(30),
  };
  return clip('tread', { duration: 1.8, loop: true, keys: k, hipsOffset: [[0, 0, 0.2, 0], [0.5, 0, 0.16, 0]] });
}

// ------------------------------------------------------------------------------------ Overlays

/** Right arm raised forward, holding a torch or lantern up. */
function holdLight(): Clip {
  return clip('holdLight', {
    duration: 1,
    loop: false,
    keys: {
      upperArmR: still(-58, 6, -10),
      lowerArmR: still(-38, 0, 0),
      handR: still(8, 0, 0),
      fingersR: still(0, 0, 80),
    },
  });
}

/** Tool or weapon held relaxed at the side. */
function holdTool(): Clip {
  return clip('holdTool', {
    duration: 1,
    loop: false,
    keys: {
      lowerArmR: still(-26),
      handR: still(-6, 0, 0),
      fingersR: still(0, 0, 85),
    },
  });
}

/** Cold: arms hugged in, shoulders up (shivering is added procedurally). */
function cold(): Clip {
  return clip('cold', {
    duration: 1,
    loop: false,
    keys: {
      shoulderL: still(0, 0, 9),
      shoulderR: still(0, 0, -9),
      upperArmL: still(-34, -20, -6),
      upperArmR: still(-34, 20, 6),
      lowerArmL: still(-112, -20, 0),
      lowerArmR: still(-112, 20, 0),
      handL: still(0, 0, 0),
      handR: still(0, 0, 0),
      fingersL: still(0, 0, -60),
      fingersR: still(0, 0, 60),
      spine: still(9),
      neck: still(10),
      head: still(4),
    },
  });
}

/** Exhausted: slumped shoulders and hanging head. Used as an additive layer. */
function tired(): Clip {
  return clip('tired', {
    duration: 1,
    loop: false,
    keys: {
      spine: still(9),
      chest: still(5),
      neck: still(8),
      head: still(10),
      shoulderL: still(0, 0, -5),
      shoulderR: still(0, 0, 5),
      upperArmL: still(4, 0, -3),
      upperArmR: still(4, 0, 3),
    },
  });
}

/** Wading: forearms lifted out of the water. Upper body only. */
function wade(): Clip {
  return clip('wade', {
    duration: 1,
    loop: false,
    keys: {
      upperArmL: still(-14, 0, 30),
      upperArmR: still(-14, 0, -30),
      lowerArmL: still(-60),
      lowerArmR: still(-60),
      handL: still(0, 0, 20),
      handR: still(0, 0, -20),
    },
  });
}

// ------------------------------------------------------------------------------------ Actions

/** Overhead one-handed axe chop with a body twist. */
function chop(): Clip {
  return clip('chop', {
    duration: 0.5,
    loop: false,
    keys: {
      spine: [[0, 2, 0], [0.35, -8, -22], [0.55, 22, 10], [0.75, 18, 6], [1, 3, 0]],
      chest: [[0, 0, 0], [0.35, -4, -14], [0.55, 8, 10], [1, 0, 0]],
      head: [[0, 0, 0], [0.35, -4, 14], [0.55, 10, -6], [1, 0, 0]],
      shoulderR: [[0, 0, 0, 0], [0.35, 0, 0, -12], [0.55, 0, 0, 0]],
      upperArmR: [[0, -20, 0, -12], [0.35, -160, -20, -40], [0.55, -45, 10, -6], [0.75, -28, 0, -6], [1, -10, 0, -9]],
      lowerArmR: [[0, -30], [0.35, -70], [0.55, -12], [0.75, -18], [1, -20]],
      handR: [[0, 0, 0, 0], [0.35, -30, 0, 0], [0.55, 20, 0, 0], [1, 0, 0, 0]],
      fingersR: still(0, 0, 90),
      upperArmL: [[0, 0, 0, 10], [0.35, -18, 0, 16], [0.55, -8, 0, 14], [1, 2, 0, 10]],
      lowerArmL: [[0, -16], [0.35, -45], [1, -16]],
      thighL: [[0, -2], [0.55, -14], [1, -2]],
      shinL: [[0, 3], [0.55, 16], [1, 3]],
      thighR: [[0, -1], [0.55, 6], [1, -1]],
      shinR: [[0, 3], [0.55, 10], [1, 3]],
    },
    hipsOffset: [[0, 0, 0, 0], [0.55, 0, -0.06, 0.02], [1, 0, 0, 0]],
  });
}

/** Two-handed vertical pickaxe swing. */
function mine(): Clip {
  const k: Keys = {
    spine: [[0, 4], [0.38, -12], [0.56, 30], [0.75, 26], [1, 5]],
    chest: [[0, 0], [0.38, -6], [0.56, 10], [1, 0]],
    head: [[0, 0], [0.38, -10], [0.56, 12], [1, 0]],
    upperArmR: [[0, -40, 0, -6], [0.38, -175, 0, -4], [0.56, -42, 0, 4], [0.75, -36, 0, 4], [1, -30, 0, -6]],
    lowerArmR: [[0, -40], [0.38, -45], [0.56, -8], [0.75, -12], [1, -30]],
    upperArmL: [[0, -36, 0, -10], [0.38, -160, 0, -14], [0.56, -36, 0, -18], [0.75, -32, 0, -18], [1, -26, 0, -6]],
    lowerArmL: [[0, -60], [0.38, -50], [0.56, -30], [0.75, -34], [1, -40]],
    fingersL: still(0, 0, -80),
    fingersR: still(0, 0, 90),
  };
  both(k, 'L', 'thigh', [[0, -4], [0.56, -26], [0.8, -22], [1, -4]]);
  both(k, 'L', 'shin', [[0, 6], [0.56, 34], [0.8, 30], [1, 6]]);
  both(k, 'L', 'foot', [[0, -2], [0.56, -8], [1, -2]]);
  return clip('mine', { duration: 0.55, loop: false, keys: k, hipsOffset: [[0, 0, 0, 0], [0.56, 0, -0.09, 0], [0.8, 0, -0.08, 0], [1, 0, 0, 0]] });
}

/** Crouch down, pick something from the ground, stand back up. */
function gather(): Clip {
  const k: Keys = {
    spine: [[0, 3], [0.35, 34], [0.65, 32], [1, 3]],
    chest: [[0, 0], [0.35, 10], [1, 0]],
    neck: [[0, 0], [0.35, 10], [1, 0]],
    head: [[0, 0], [0.35, 16], [0.65, 10], [1, 0]],
    upperArmR: [[0, -5, 0, -9], [0.35, -58, 0, -8], [0.55, -50, 0, -10], [0.75, -30, 0, -9], [1, -5, 0, -9]],
    lowerArmR: [[0, -15], [0.35, -22], [0.55, -60], [0.75, -70], [1, -15]],
    fingersR: [[0, 0, 0, 20], [0.4, 0, 0, 10], [0.5, 0, 0, 90], [1, 0, 0, 30]],
    upperArmL: [[0, 0, 0, 10], [0.35, -20, 0, 18], [1, 0, 0, 10]],
    lowerArmL: [[0, -15], [0.35, -50], [1, -15]],
    thighL: [[0, -2], [0.35, -78], [0.65, -74], [1, -2]],
    shinL: [[0, 3], [0.35, 118], [0.65, 112], [1, 3]],
    footL: [[0, -1], [0.35, -40], [0.65, -38], [1, -1]],
    thighR: [[0, -2], [0.35, -40], [0.65, -38], [1, -2]],
    shinR: [[0, 3], [0.35, 120], [0.65, 116], [1, 3]],
    footR: [[0, -1], [0.35, 10], [0.65, 10], [1, -1]],
    toesR: [[0, 0], [0.35, -40], [0.65, -40], [1, 0]],
  };
  return clip('gather', { duration: 0.75, loop: false, keys: k, hipsOffset: [[0, 0, 0, 0], [0.35, 0, -0.38, -0.02], [0.65, 0, -0.36, -0.02], [1, 0, 0, 0]] });
}

/** Bare-handed jab. */
function punch(): Clip {
  return clip('punch', {
    duration: 0.38,
    loop: false,
    keys: {
      hips: [[0, 0, 0], [0.35, 0, 10], [1, 0, 0]],
      spine: [[0, 2, 0], [0.2, 4, -14], [0.4, 8, 22], [1, 2, 0]],
      upperArmR: [[0, -20, 0, -10], [0.2, -20, 0, -30], [0.42, -86, 0, -4], [0.65, -70, 0, -8], [1, -12, 0, -9]],
      lowerArmR: [[0, -30], [0.2, -120], [0.42, -6], [0.65, -30], [1, -20]],
      fingersR: still(0, 0, 100),
      upperArmL: [[0, -10, 0, 10], [0.4, -40, 0, 6], [1, 0, 0, 10]],
      lowerArmL: [[0, -40], [0.4, -110], [1, -16]],
      fingersL: still(0, 0, -100),
    },
  });
}

/** Diagonal knife slash from the right shoulder across the body. */
function slash(): Clip {
  return clip('slash', {
    duration: 0.4,
    loop: false,
    keys: {
      spine: [[0, 2, 0], [0.3, 0, -26], [0.55, 10, 28], [1, 2, 0]],
      chest: [[0, 0, 0], [0.3, -4, -10], [0.55, 4, 12], [1, 0, 0]],
      upperArmR: [[0, -20, 0, -10], [0.3, -110, 0, -70], [0.55, -60, 40, 20], [0.75, -40, 20, 10], [1, -12, 0, -9]],
      lowerArmR: [[0, -30], [0.3, -60], [0.55, -10], [1, -20]],
      handR: [[0, 0, 0, 0], [0.3, -20, 0, 20], [0.55, 10, 0, -20], [1, 0, 0, 0]],
      fingersR: still(0, 0, 95),
      upperArmL: [[0, 0, 0, 10], [0.4, -30, 0, 20], [1, 0, 0, 10]],
      lowerArmL: [[0, -15], [0.4, -60], [1, -15]],
    },
  });
}

/** Wide horizontal swing with a heavy tool. */
function heavySwing(): Clip {
  return clip('heavySwing', {
    duration: 0.5,
    loop: false,
    keys: {
      hips: [[0, 0, 0], [0.32, 0, -14], [0.55, 0, 16], [1, 0, 0]],
      spine: [[0, 3, 0], [0.32, -2, -30], [0.55, 12, 34], [0.75, 10, 28], [1, 3, 0]],
      chest: [[0, 0, 0], [0.32, 0, -14], [0.55, 4, 16], [1, 0, 0]],
      head: [[0, 0, 0], [0.32, 0, 24], [0.55, 4, -20], [1, 0, 0]],
      upperArmR: [[0, -20, 0, -10], [0.32, -80, -10, -78], [0.55, -82, 30, 8], [0.75, -60, 20, 0], [1, -12, 0, -9]],
      lowerArmR: [[0, -26], [0.32, -50], [0.55, -6], [1, -22]],
      fingersR: still(0, 0, 95),
      upperArmL: [[0, 0, 0, 10], [0.32, -50, 0, 10], [0.55, -20, 0, 30], [1, 0, 0, 10]],
      lowerArmL: [[0, -15], [0.32, -80], [1, -15]],
      thighL: [[0, -2], [0.55, -16], [1, -2]],
      shinL: [[0, 3], [0.55, 18], [1, 3]],
    },
    hipsOffset: [[0, 0, 0, 0], [0.55, 0, -0.05, 0], [1, 0, 0, 0]],
  });
}

function eat(): Clip {
  return clip('eat', {
    duration: 0.9,
    loop: false,
    keys: {
      upperArmR: [[0, -10, 0, -9], [0.25, -42, 0, -4], [0.75, -42, 0, -4], [1, -10, 0, -9]],
      lowerArmR: [[0, -20], [0.25, -132], [0.4, -128], [0.55, -134], [0.75, -130], [1, -20]],
      handR: [[0, 0, 0, 0], [0.25, -10, 0, 20], [1, 0, 0, 0]],
      fingersR: still(0, 0, 70),
      head: [[0, 0], [0.3, 6], [0.45, 2], [0.6, 7], [0.75, 2], [1, 0]],
      upperArmL: [[0, 0, 0, 10], [0.3, -14, 0, 6], [1, 0, 0, 10]],
      lowerArmL: [[0, -15], [0.3, -60], [1, -15]],
    },
  });
}

function drink(): Clip {
  return clip('drink', {
    duration: 1.0,
    loop: false,
    keys: {
      upperArmR: [[0, -10, 0, -9], [0.3, -56, 0, -2], [0.75, -62, 0, -2], [1, -10, 0, -9]],
      lowerArmR: [[0, -20], [0.3, -126], [0.75, -118], [1, -20]],
      handR: [[0, 0, 0, 0], [0.3, -20, 0, 10], [0.75, -40, 0, 10], [1, 0, 0, 0]],
      fingersR: still(0, 0, 70),
      neck: [[0, 0], [0.35, -12], [0.75, -16], [1, 0]],
      head: [[0, 0], [0.35, -18], [0.75, -26], [1, 0]],
      chest: [[0, 0], [0.4, -5], [1, 0]],
    },
  });
}

/** Additive flinch when hurt. */
function flinch(): Clip {
  return clip('flinch', {
    duration: 0.4,
    loop: false,
    keys: {
      spine: [[0, 0, 0, 0], [0.18, -14, 6, 4], [1, 0, 0, 0]],
      chest: [[0, 0], [0.18, -8], [1, 0]],
      head: [[0, 0, 0], [0.15, -18, -10], [1, 0, 0]],
      upperArmL: [[0, 0, 0, 0], [0.2, -22, 0, 12], [1, 0, 0, 0]],
      upperArmR: [[0, 0, 0, 0], [0.2, -18, 0, -12], [1, 0, 0, 0]],
      lowerArmL: [[0, 0], [0.2, -30], [1, 0]],
      lowerArmR: [[0, 0], [0.2, -30], [1, 0]],
    },
    hipsOffset: [[0, 0, 0, 0], [0.2, 0, -0.04, -0.03], [1, 0, 0, 0]],
  });
}

/** Knees buckle, then a fall forward onto the ground. Holds the last frame. */
function die(): Clip {
  return clip('die', {
    duration: 1.4,
    loop: false,
    keys: {
      hips: [[0, 0, 0, 0], [0.35, 8, 0, 0], [0.55, 20, 0, 4], [0.85, 86, 6, 10], [1, 88, 8, 10]],
      spine: [[0, 3], [0.35, 30], [0.55, 36], [0.85, 4], [1, 2]],
      chest: [[0, 0], [0.35, 10], [0.85, -2], [1, -2]],
      neck: [[0, 0], [0.4, 20], [0.85, -10], [1, -12]],
      head: [[0, 0, 0], [0.4, 20, 0], [0.85, -20, 60], [1, -22, 66]],
      upperArmL: [[0, 0, 0, 10], [0.35, -10, 0, 14], [0.7, -60, 0, 20], [1, -150, 0, 34]],
      lowerArmL: [[0, -15], [0.6, -50], [1, -30]],
      upperArmR: [[0, 0, 0, -10], [0.35, -10, 0, -14], [0.7, -40, 0, -30], [1, -20, 0, -55]],
      lowerArmR: [[0, -15], [0.6, -40], [1, -60]],
      fingersL: still(0, 0, -20),
      fingersR: still(0, 0, 20),
      thighL: [[0, -2], [0.35, -60], [0.55, -88], [0.85, -10], [1, -4]],
      shinL: [[0, 3], [0.35, 100], [0.55, 120], [0.85, 30], [1, 18]],
      footL: [[0, -1], [0.35, -40], [0.55, -30], [1, 30]],
      thighR: [[0, -2], [0.35, -50], [0.55, -84], [0.85, -20], [1, -14]],
      shinR: [[0, 3], [0.35, 96], [0.55, 118], [0.85, 60], [1, 46]],
      footR: [[0, -1], [0.35, -40], [0.55, -30], [1, 30]],
    },
    hipsOffset: [[0, 0, 0, 0], [0.35, 0, -0.34, 0], [0.55, 0, -0.5, 0.05], [0.85, 0, -0.78, 0.12], [1, 0, -0.8, 0.12]],
  });
}

// ------------------------------------------------------------------------------------ Fidgets

function lookAround(): Clip {
  return clip('lookAround', {
    duration: 4.2,
    loop: false,
    keys: {
      neck: [[0, 0, 0], [0.18, 0, 18], [0.45, 2, 18], [0.62, 2, -16], [0.85, 0, -14], [1, 0, 0]],
      head: [[0, 2, 0], [0.18, -2, 26], [0.45, 4, 24], [0.62, -2, -26], [0.85, 2, -22], [1, 2, 0]],
      chest: [[0, 0, 0], [0.2, 0, 6], [0.45, 0, 6], [0.62, 0, -6], [0.85, 0, -5], [1, 0, 0]],
    },
  });
}

function adjustPack(): Clip {
  return clip('adjustPack', {
    duration: 2.2,
    loop: false,
    keys: {
      upperArmL: [[0, 2, 0, 9], [0.2, -34, 0, 14], [0.75, -34, 0, 14], [1, 2, 0, 9]],
      upperArmR: [[0, 2, 0, -9], [0.2, -34, 0, -14], [0.75, -34, 0, -14], [1, 2, 0, -9]],
      lowerArmL: [[0, -15], [0.2, -118, -30], [0.75, -118, -30], [1, -15]],
      lowerArmR: [[0, -15], [0.2, -118, 30], [0.75, -118, 30], [1, -15]],
      fingersL: [[0, 0, 0, -25], [0.25, 0, 0, -90], [0.75, 0, 0, -90], [1, 0, 0, -25]],
      fingersR: [[0, 0, 0, 25], [0.25, 0, 0, 90], [0.75, 0, 0, 90], [1, 0, 0, 25]],
      shoulderL: [[0, 0, 0, 0], [0.35, 0, 0, 10], [0.45, 0, 0, 0], [0.55, 0, 0, 10], [0.7, 0, 0, 0]],
      shoulderR: [[0, 0, 0, 0], [0.35, 0, 0, -10], [0.45, 0, 0, 0], [0.55, 0, 0, -10], [0.7, 0, 0, 0]],
      pack: [[0, 0], [0.35, -6], [0.45, 4], [0.55, -6], [0.7, 2], [0.8, 0]],
      head: [[0, 0], [0.3, 8], [0.8, 6], [1, 0]],
    },
    hipsOffset: [[0, 0, 0, 0], [0.35, 0, 0.02, 0], [0.45, 0, -0.01, 0], [0.55, 0, 0.02, 0], [0.7, 0, 0, 0]],
  });
}

function stretch(): Clip {
  return clip('stretch', {
    duration: 3,
    loop: false,
    keys: {
      upperArmL: [[0, 2, 0, 9], [0.3, -165, 0, 14], [0.6, -170, 0, 18], [0.85, -10, 0, 12], [1, 2, 0, 9]],
      upperArmR: [[0, 2, 0, -9], [0.3, -165, 0, -14], [0.6, -170, 0, -18], [0.85, -10, 0, -12], [1, 2, 0, -9]],
      lowerArmL: [[0, -15], [0.3, -40], [0.6, -30], [1, -15]],
      lowerArmR: [[0, -15], [0.3, -40], [0.6, -30], [1, -15]],
      spine: [[0, 3], [0.35, -10], [0.6, -12], [0.85, 4], [1, 3]],
      chest: [[0, 0, 0, 0], [0.4, -6, 0, 6], [0.6, -6, 0, -6], [1, 0, 0, 0]],
      neck: [[0, 0], [0.4, -14], [0.7, -10], [1, 0]],
      head: [[0, 0], [0.4, -16], [0.7, -10], [1, 0]],
    },
    hipsOffset: [[0, 0, 0, 0], [0.4, 0, 0.02, 0], [0.8, 0, 0, 0]],
  });
}

/** Seated by a fire, forearms on knees (the NPC). */
function sit(): Clip {
  const k: Keys = {
    hips: still(-6),
    spine: [[0, 22], [0.5, 23.5]],
    chest: [[0, 6], [0.5, 4.5]],
    neck: still(6),
    head: [[0, 10, -8], [0.5, 12, 6]],
    upperArmL: still(-48, 0, 8),
    upperArmR: still(-52, 0, -8),
    lowerArmL: still(-64, -24),
    lowerArmR: still(-60, 24),
    fingersL: still(0, 0, -40),
    fingersR: still(0, 0, 40),
    thighL: still(-84, 0, 6),
    thighR: still(-80, 0, -6),
    shinL: still(96),
    shinR: still(90),
    footL: still(-10),
    footR: still(-8),
  };
  return clip('sit', { duration: 5, loop: true, keys: k, hipsOffset: [[0, 0, -0.52, -0.02], [0.5, 0, -0.52, -0.02]] });
}

/** All player clips, compiled once and shared by every human. */
export const CLIPS = {
  idle: idle(),
  walk: walk(),
  run: run(),
  jump: jump(),
  fall: fall(),
  land: land(),
  swim: swim(),
  tread: tread(),
  holdLight: holdLight(),
  holdTool: holdTool(),
  cold: cold(),
  tired: tired(),
  wade: wade(),
  chop: chop(),
  mine: mine(),
  gather: gather(),
  punch: punch(),
  slash: slash(),
  heavySwing: heavySwing(),
  eat: eat(),
  drink: drink(),
  flinch: flinch(),
  die: die(),
  lookAround: lookAround(),
  adjustPack: adjustPack(),
  stretch: stretch(),
  sit: sit(),
};
export type ClipName = keyof typeof CLIPS;
