import { describe, expect, it } from 'vitest';
import { GORGE, PASS_RIDGE, Terrain } from '../src/world/Terrain';
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

  it('the road is walkable everywhere except the authored cliffs and the gorge', () => {
    const steep: number[] = [];
    for (let x = -876; x < 1676; x += 0.25) {
      if (Math.abs(t.slopeAt(x)) > 1.35) steep.push(x);
    }
    for (const x of steep) {
      const cliff = RIDGES.some((c) => x > c.x0 - 0.5 && x < c.x0 + c.cliff + 0.5);
      const gorge = x > GORGE.x0 - 2 && x < GORGE.x1 + 2;
      expect(cliff || gorge).toBe(true);
    }
  });

  it('the pass ridge seals the Frostlands except at the road notch', () => {
    const mid = (PASS_RIDGE.x0 + PASS_RIDGE.x1) / 2;
    expect(t.heightAt3(mid, 0) - t.heightAt3(PASS_RIDGE.x1 + 8, 0)).toBeLessThan(4);
    for (const z of [-200, -60, 40, 150]) expect(t.heightAt3(mid, z) - t.heightAt3(PASS_RIDGE.x1 + 12, z)).toBeGreaterThan(18);
  });

  it('the gorge is a deep canyon across the whole map', () => {
    for (const z of [-300, -50, 0, 120, 300]) expect(t.heightAt3((GORGE.x0 + GORGE.x1) / 2, z)).toBeLessThan(t.heightAt3(GORGE.x0 - 6, z) - 12);
  });

  it('the land is open: wide and walkable away from the road', () => {
    let gentle = 0;
    let n = 0;
    for (let x = -200; x < 1600; x += 37) {
      for (let z = -300; z <= 300; z += 41) {
        n++;
        if (t.gradientAt(x, z) < 0.6) gentle++;
      }
    }
    expect(gentle / n).toBeGreaterThan(0.8);
  });
});
