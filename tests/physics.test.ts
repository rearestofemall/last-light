import { describe, expect, it } from 'vitest';
import { CollisionWorld, type Collider } from '../src/physics/CollisionWorld';
import { createBody, DEFAULT_MOVE, moveBody } from '../src/physics/KinematicBody';
import type { Terrain } from '../src/world/Terrain';

/** Flat terrain stub at y = 0, with an optional step along x. */
function flatTerrain(step?: { x: number; h: number }): Terrain {
  const heightAt3 = (x: number) => (step && x >= step.x ? step.h : 0);
  return { heightAt3, heightAt: heightAt3, surfaceAt: () => 'grass', waterAt: () => null } as unknown as Terrain;
}

const B = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
const box = (c: Omit<Collider, 'minZ' | 'maxZ'> & Partial<Collider>): Collider => ({ minZ: -2, maxZ: 2, ...c });
const dt = 1 / 60;
function simulate(world: CollisionWorld, b: ReturnType<typeof createBody>, steps: number, vx = 0, vz = 0, drop = false) {
  for (let i = 0; i < steps; i++) {
    b.vx = vx;
    b.vz = vz;
    if (!b.grounded) b.vy -= 32 * dt;
    else b.vy = Math.min(b.vy, 0) - 32 * dt;
    moveBody(world, b, dt, { ...DEFAULT_MOVE, dropThrough: drop });
  }
}

describe('KinematicBody (3D)', () => {
  it('falls and lands on terrain', () => {
    const w = new CollisionWorld(flatTerrain(), B);
    const b = createBody(0, 5, 0);
    simulate(w, b, 120);
    expect(b.grounded).toBe(true);
    expect(b.y).toBeCloseTo(0, 5);
  });

  it('steps up small ledges but is blocked by tall ones', () => {
    const small = new CollisionWorld(flatTerrain({ x: 2, h: 0.4 }), B);
    const b = createBody(0, 0, 0);
    b.grounded = true;
    simulate(small, b, 60, 4);
    expect(b.x).toBeGreaterThan(2);
    expect(b.y).toBeCloseTo(0.4, 3);
    const tall = new CollisionWorld(flatTerrain({ x: 2, h: 1.5 }), B);
    const c = createBody(0, 0, 0);
    c.grounded = true;
    simulate(tall, c, 60, 4);
    expect(c.x).toBeLessThan(2);
  });

  it('walls block on both axes, and you can walk around them', () => {
    const w = new CollisionWorld(flatTerrain(), B);
    w.add(box({ minX: 3, maxX: 4, minY: 0, maxY: 3, kind: 'solid', surface: 'rock', minZ: -1, maxZ: 1 }));
    const b = createBody(0, 0, 0);
    b.grounded = true;
    simulate(w, b, 90, 4);
    expect(b.x + b.r).toBeLessThanOrEqual(3.0001);
    const c = createBody(0, 0, 3);
    c.grounded = true;
    simulate(w, c, 90, 4);
    expect(c.x).toBeGreaterThan(4);
    const d = createBody(3.5, 0, 5);
    d.grounded = true;
    simulate(w, d, 90, 0, -4);
    expect(d.z - d.r).toBeGreaterThanOrEqual(0.999);
  });

  it('steps onto low boxes', () => {
    const w = new CollisionWorld(flatTerrain(), B);
    w.add(box({ minX: 3, maxX: 6, minY: -1, maxY: 0.4, kind: 'solid', surface: 'wood' }));
    const c = createBody(0, 0, 0);
    c.grounded = true;
    simulate(w, c, 60, 4);
    expect(c.y).toBeCloseTo(0.4, 3);
    expect(c.groundSurface).toBe('wood');
  });

  it('one-way platforms: pass from below, land from above, drop through', () => {
    const w = new CollisionWorld(flatTerrain(), B);
    w.add(box({ minX: -2, maxX: 2, minY: 1.2, maxY: 1.5, kind: 'oneway', surface: 'wood' }));
    const b = createBody(0, 0, 0);
    b.vy = 10;
    simulate(w, b, 90);
    expect(b.y).toBeCloseTo(1.5, 3);
    simulate(w, b, 60, 0, 0, true);
    expect(b.y).toBeCloseTo(0, 3);
  });

  it('hits its head on ceilings', () => {
    const w = new CollisionWorld(flatTerrain(), B);
    w.add(box({ minX: -2, maxX: 2, minY: 2.2, maxY: 3, kind: 'solid', surface: 'wood' }));
    const b = createBody(0, 0, 0);
    b.vy = 12;
    let maxY = 0;
    for (let i = 0; i < 60; i++) {
      b.vy -= 32 * dt;
      moveBody(w, b, dt);
      maxY = Math.max(maxY, b.y + b.height);
    }
    expect(maxY).toBeLessThanOrEqual(2.2001);
  });

  it('respects world bounds on both axes', () => {
    const w = new CollisionWorld(flatTerrain(), { minX: -5, maxX: 5, minZ: -5, maxZ: 5 });
    const b = createBody(0, 0, 0);
    b.grounded = true;
    simulate(w, b, 200, 6, 6);
    expect(b.x).toBeLessThanOrEqual(5 - b.r + 1e-6);
    expect(b.z).toBeLessThanOrEqual(5 - b.r + 1e-6);
  });
});
