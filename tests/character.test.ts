import { describe, expect, it } from 'vitest';
import { BONE_INDEX, BONES, HumanBody, SHIN_LEN, THIGH_LEN } from '../src/character/HumanBody';
import { CLIPS } from '../src/character/humanClips';
import { legEnd, solveLeg } from '../src/character/ik';
import { blend, compile, mask, newPose, rot, sample } from '../src/character/Pose';

describe('two-bone leg IK', () => {
  it('reaches targets inside the leg range', () => {
    for (const [ty, tz] of [
      [-0.8, 0],
      [-0.6, 0.15],
      [-0.5, -0.2],
      [-0.7, 0.3],
      [-0.45, 0],
    ]) {
      const s = solveLeg(ty, tz, THIGH_LEN, SHIN_LEN);
      const e = legEnd(s.upper, s.lower, THIGH_LEN, SHIN_LEN);
      expect(e.y).toBeCloseTo(ty, 4);
      expect(e.z).toBeCloseTo(tz, 4);
      expect(s.lower).toBeGreaterThanOrEqual(0); // knees bend forward only
    }
  });

  it('straightens toward an out-of-reach target', () => {
    const s = solveLeg(-2, 0, THIGH_LEN, SHIN_LEN);
    expect(s.lower).toBeLessThan(0.05);
    expect(Math.abs(s.upper)).toBeLessThan(0.05);
  });
});

describe('animation clips', () => {
  it('pass through their keys', () => {
    const c = compile('t', { duration: 1, loop: false, keys: { spine: [[0, 10], [0.5, 30], [1, -20]] } });
    const p = newPose();
    for (const [t, deg] of [
      [0, 10],
      [0.5, 30],
      [1, -20],
    ]) {
      sample(c, t, p);
      expect(rot(p, 'spine', 0)).toBeCloseTo((deg * Math.PI) / 180, 5);
    }
  });

  it('loop seamlessly', () => {
    for (const name of ['walk', 'run', 'idle', 'swim'] as const) {
      const a = newPose();
      const b = newPose();
      sample(CLIPS[name], 0.9999, a);
      sample(CLIPS[name], 0, b);
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.01);
    }
  });

  it('only drive the bones they key', () => {
    expect(CLIPS.holdLight.mask[BONE_INDEX.upperArmR]).toBe(1);
    expect(CLIPS.holdLight.mask[BONE_INDEX.thighL]).toBe(0);
    const p = newPose();
    const q = newPose().fill(1);
    blend(p, q, 1, mask(['head']));
    expect(rot(p, 'head', 0)).toBe(1);
    expect(rot(p, 'neck', 0)).toBe(0);
  });

  it('mirror the gait between legs', () => {
    const p = newPose();
    const q = newPose();
    sample(CLIPS.walk, 0.1, p);
    sample(CLIPS.walk, 0.6, q);
    expect(rot(p, 'thighL', 0)).toBeCloseTo(rot(q, 'thighR', 0), 5);
    expect(rot(p, 'shinL', 0)).toBeCloseTo(rot(q, 'shinR', 0), 5);
  });
});

describe('human body', () => {
  it('is one skinned mesh with valid, normalised weights', () => {
    const h = new HumanBody();
    const g = h.mesh.geometry;
    const idx = g.attributes.skinIndex;
    const w = g.attributes.skinWeight;
    expect(g.attributes.position.count).toBeGreaterThan(1000);
    // One skinned draw call; ~8.7k triangles at most keeps the hero character cheap.
    expect(g.attributes.position.count).toBeLessThan(26000);
    for (let i = 0; i < idx.count; i++) {
      expect(idx.getX(i)).toBeLessThan(BONES.length);
      expect(idx.getY(i)).toBeLessThan(BONES.length);
      expect(w.getX(i) + w.getY(i)).toBeCloseTo(1, 5);
    }
    expect(h.mesh.skeleton.bones.length).toBe(BONES.length);
  });

  it('stands on the ground in the rest pose', () => {
    const h = new HumanBody();
    h.mesh.geometry.computeBoundingBox();
    const bb = h.mesh.geometry.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0, 2);
    expect(bb.max.y).toBeGreaterThan(1.75);
    expect(bb.max.y).toBeLessThan(1.95);
  });
});
