import { describe, expect, it } from 'vitest';
import { Terrain } from '../src/world/Terrain';
import { FLATTEN, RIVERS, RIDGES, WORLD_SEED } from '../src/world/WorldDef';

const t = new Terrain(WORLD_SEED);

describe('Terrain', () => {
  it('is deterministic for a seed', () => {
    const other = new Terrain(WORLD_SEED);
    for (let x = -200; x < 400; x += 17.3) expect(other.heightAt3(x, -20)).toBe(t.heightAt3(x, -20));
  });

  it('gameplay profile equals the 3D field at z = 0', () => {
    for (let x = -200; x < 400; x += 11) expect(t.heightAt(x)).toBeCloseTo(t.heightAt3(x, 0), 6);
  });

  it('flattens authored building plots', () => {
    for (const f of FLATTEN) {
      let h0: number | null = null;
      for (let dx = -f.radius * 0.6; dx <= f.radius * 0.6; dx += 1) {
        // Rivers carve their own channel inside their plot, so skip the channel itself.
        const r = RIVERS.find((rv) => Math.abs(f.x + dx - rv.x) < rv.width / 2 + rv.bank);
        if (r) continue;
        h0 ??= t.heightAt(f.x + dx);
        expect(Math.abs(t.heightAt(f.x + dx) - h0)).toBeLessThan(0.35);
      }
    }
  });

  it('rivers hold water deeper than the bed at the plane', () => {
    for (const r of RIVERS) {
      if (r.frozen) {
        expect(t.waterAt(r.x)).toBeNull();
        expect(t.surfaceAt(r.x)).toBe('ice');
        continue;
      }
      const w = t.waterAt(r.x);
      expect(w).not.toBeNull();
      expect(w!.depth).toBeGreaterThan(r.waterDepth * 0.7);
      expect(t.surfaceAt(r.x)).toBe('water');
    }
    expect(t.waterAt(0)).toBeNull();
  });

  it('walkable everywhere except the authored cliff', () => {
    const steep: number[] = [];
    for (let x = -876; x < 1676; x += 0.25) {
      if (Math.abs(t.slopeAt(x)) > 1.35) steep.push(x);
    }
    for (const x of steep) expect(RIDGES.some((c) => x > c.x0 - 0.5 && x < c.x0 + c.cliff + 0.5)).toBe(true);
    expect(steep.length).toBeGreaterThan(0);
  });

  it('background falls away so the horizon stays low', () => {
    // Screen-space height of the far terrain must stay well below the top of a 20-unit view.
    const sinP = Math.sin((9 * Math.PI) / 180);
    for (let x = -200; x < 400; x += 23) {
      const proj = t.heightAt3(x, -100) - t.heightAt(x) + 100 * sinP;
      expect(proj).toBeLessThan(12);
    }
  });
});
