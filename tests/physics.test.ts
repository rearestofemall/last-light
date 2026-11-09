import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../src/physics/CollisionWorld';
import { createBody, DEFAULT_MOVE, moveBody } from '../src/physics/KinematicBody';
import type { Terrain } from '../src/world/Terrain';

/** Flat terrain stub at y = 0, with an optional step function. */
function flatTerrain(step?: { x: number; h: number }): Terrain {
  const heightAt = (x: number) => (step && x >= step.x ? step.h : 0);
  return {
    heightAt,
    surfaceAt: () => 'grass',
    waterAt: () => null,
  } as unknown as Terrain;
}

const dt = 1 / 60;
function simulate(world: CollisionWorld, b: ReturnType<typeof createBody>, steps: number, vx = 0, gravity = 32, drop = false) {
  for (let i = 0; i < steps; i++) {
    b.vx = vx;
    if (!b.grounded) b.vy -= gravity * dt;
    else b.vy = Math.min(b.vy, 0) - gravity * dt;
    moveBody(world, b, dt, { ...DEFAULT_MOVE, dropThrough: drop });
  }
}

describe('KinematicBody', () => {
  it('falls and lands on terrain', () => {
    const w = new CollisionWorld(flatTerrain(), { min: -100, max: 100 });
    const b = createBody(0, 5);
    simulate(w, b, 120);
    expect(b.grounded).toBe(true);
    expect(b.y).toBeCloseTo(0, 5);
  });

  it('reports impact speed on landing', () => {
    const w = new CollisionWorld(flatTerrain(), { min: -100, max: 100 });
    const b = createBody(0, 3);
    let impact = 0;
    for (let i = 0; i < 120 && !b.grounded; i++) {
      b.vy -= 32 * dt;
      const r = moveBody(w, b, dt);
      if (r.landed) impact = r.impact;
    }
    expect(impact).toBeGreaterThan(10);
  });

  it('steps up small terrain ledges but is blocked by tall ones', () => {
    const small = new CollisionWorld(flatTerrain({ x: 2, h: 0.4 }), { min: -100, max: 100 });
    const b = createBody(0, 0);
    b.grounded = true;
    simulate(small, b, 60, 4);
    expect(b.x).toBeGreaterThan(2);
    expect(b.y).toBeCloseTo(0.4, 3);

    const tall = new CollisionWorld(flatTerrain({ x: 2, h: 1.5 }), { min: -100, max: 100 });
    const c = createBody(0, 0);
    c.grounded = true;
    simulate(tall, c, 60, 4);
    expect(c.x).toBeLessThan(2);
    expect(c.y).toBeCloseTo(0, 3);
  });

  it('is blocked by solid boxes and steps onto low ones', () => {
    const w = new CollisionWorld(flatTerrain(), { min: -100, max: 100 });
    w.add({ minX: 3, maxX: 4, minY: 0, maxY: 3, kind: 'solid', surface: 'rock' });
    const b = createBody(0, 0);
    b.grounded = true;
    simulate(w, b, 90, 4);
    expect(b.x + b.halfWidth).toBeLessThanOrEqual(3.0001);

    const w2 = new CollisionWorld(flatTerrain(), { min: -100, max: 100 });
    w2.add({ minX: 3, maxX: 6, minY: -1, maxY: 0.4, kind: 'solid', surface: 'wood' });
    const c = createBody(0, 0);
    c.grounded = true;
    simulate(w2, c, 60, 4);
    expect(c.x).toBeGreaterThan(3.5);
    expect(c.y).toBeCloseTo(0.4, 3);
    expect(c.groundSurface).toBe('wood');
  });

  it('one-way platforms: pass from below, land from above, drop through', () => {
    const w = new CollisionWorld(flatTerrain(), { min: -100, max: 100 });
    w.add({ minX: -2, maxX: 2, minY: 1.2, maxY: 1.5, kind: 'oneway', surface: 'wood' });
    const b = createBody(0, 0);
    b.vy = 10;
    simulate(w, b, 90);
    expect(b.grounded).toBe(true);
    expect(b.y).toBeCloseTo(1.5, 3);
    simulate(w, b, 60, 0, 32, true);
    expect(b.y).toBeCloseTo(0, 3);
  });

  it('hits its head on solid ceilings', () => {
    const w = new CollisionWorld(flatTerrain(), { min: -100, max: 100 });
    w.add({ minX: -2, maxX: 2, minY: 2.2, maxY: 3, kind: 'solid', surface: 'wood' });
    const b = createBody(0, 0);
    b.vy = 12;
    let maxY = 0;
    for (let i = 0; i < 60; i++) {
      b.vy -= 32 * dt;
      moveBody(w, b, dt);
      maxY = Math.max(maxY, b.y + b.height);
    }
    expect(maxY).toBeLessThanOrEqual(2.2001);
  });

  it('respects world bounds', () => {
    const w = new CollisionWorld(flatTerrain(), { min: -5, max: 5 });
    const b = createBody(0, 0);
    b.grounded = true;
    simulate(w, b, 200, 6);
    expect(b.x).toBeLessThanOrEqual(5 - b.halfWidth + 1e-6);
  });
});
