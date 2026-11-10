import { describe, expect, it } from 'vitest';
import { SaveManager } from '../src/persistence/SaveManager';
import { checksum, decodeRecord, encodeRecord, type SaveData, SAVE_VERSION, validateSave } from '../src/persistence/schema';
import { MemoryStore } from '../src/persistence/stores';

const clampX = (x: number) => Math.max(-238, Math.min(436, x));

function sample(x = 12): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: 1700000000000,
    playTime: 321,
    player: { x, y: 1.5, z: 4, heading: 1.2 },
    respawn: { x: -3, y: 0, z: 0 },
    world: { seed: 1914, time: 3.5, weather: { state: 'rain', timer: 120 } },
    survival: { vitals: { health: 80, hunger: 50, thirst: 40, warmth: 60, stamina: 90, energy: 70 }, wetness: 0.2, sickness: 0 },
    inventory: [{ id: 'wood', qty: 5 }, null, { id: 'axe', qty: 1, dur: 40 }],
    equipment: { selected: 2, clothing: null, lanternOn: true },
    crafting: ['campfire', 'axe'],
    containers: { 'ranger-crate': [{ id: 'cloth', qty: 2 }] },
    structures: [{ piece: 'floor', i: 10, j: 2, level: 0, base: 1.25 }],
    resources: { n4: [2, 0] },
    lights: { 'ranger-lamp': { fuel: 120, on: true } },
    story: { readNotes: ['j-note-1'], locations: ['campsite', 'trailhead'], flags: { 'tutorial:basics': true }, explored: [0, 1] },
    mode: { kind: 'free', region: 'coast', pace: 'harsh', starterKit: true, allRecipes: false, peaceful: true },
    meta: { location: 'Abandoned Campsite', region: 'The Verdant Woods', day: 3 },
  };
}

describe('save schema', () => {
  it('round-trips through encode/decode/validate', () => {
    const d = sample();
    expect(validateSave(decodeRecord(encodeRecord(d)), clampX)).toEqual(d);
  });

  it('detects tampering via checksum', () => {
    const rec = encodeRecord(sample());
    rec.payload = rec.payload.replace('321', '999');
    expect(() => decodeRecord(rec)).toThrow(/checksum/);
  });

  it('rejects saves from newer versions and malformed data', () => {
    expect(() => validateSave({ ...sample(), version: SAVE_VERSION + 1 }, clampX)).toThrow(/newer/);
    expect(() => validateSave({ ...sample(), player: { x: 'a' } }, clampX)).toThrow();
    expect(() => validateSave(null, clampX)).toThrow();
  });

  it('clamps out-of-bounds positions and drops junk flags', () => {
    const d = sample(99999) as unknown as Record<string, unknown>;
    (d.story as Record<string, unknown>).flags = { ok: 1, bad: { nested: true } };
    const v = validateSave(d, clampX);
    expect(v.player.x).toBe(436);
    expect(v.story.flags).toEqual({ ok: 1 });
  });

  it('migrates 2.5D (v2) saves: positions gain depth, structures are refunded', () => {
    const v2 = { ...sample(30), version: 2, player: { x: 30, y: 1, facing: -1 }, respawn: { x: 0, y: 0 }, structures: [{ piece: 'wall', cell: 3, level: 0, base: 1 }], inventory: [] };
    const v = validateSave(v2, clampX);
    expect(v.player.z).toBeCloseTo(1.5);
    expect(v.structures).toEqual([]);
    expect(v.inventory).toEqual([{ id: 'wall', qty: 1 }]);
  });

  it('migrates Milestone 1 (v1) saves, keeping position and story', () => {
    const v1 = {
      version: 1,
      savedAt: 1,
      playTime: 10,
      player: { x: 50, y: 0, facing: 1 },
      world: { seed: 1914, time: 99 },
      story: { readNotes: ['trail-sign'], locations: ['campsite'], flags: {} },
      meta: { location: 'x', region: 'y' },
    };
    const v = validateSave(v1, clampX);
    expect(v.version).toBe(SAVE_VERSION);
    expect(v.player.x).toBe(50);
    expect(v.story.readNotes).toEqual(['trail-sign']);
    expect(v.inventory).toEqual([]);
    expect(v.structures).toEqual([]);
    expect(v.world.weather.state).toBe('clear');
  });

  it('keeps the game mode, and treats saves without one as story games', () => {
    const back = validateSave(JSON.parse(JSON.stringify(sample())), (x) => x);
    expect(back.mode).toEqual({ kind: 'free', region: 'coast', pace: 'harsh', starterKit: true, allRecipes: false, peaceful: true });
    const old = JSON.parse(JSON.stringify(sample()));
    delete old.mode;
    expect(validateSave(old, (x) => x).mode.kind).toBe('story');
    const junk = JSON.parse(JSON.stringify(sample()));
    junk.mode = { kind: 'free', region: 'mars', pace: 'insane' };
    const m = validateSave(junk, (x) => x).mode;
    expect(m.region).toBe('woods');
    expect(m.pace).toBe('normal');
  });

  it('checksum is stable', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });
});

describe('SaveManager', () => {
  it('saves, loads, and reports none when empty', async () => {
    const m = new SaveManager(clampX);
    m.useStore(new MemoryStore());
    expect((await m.load()).ok).toBe(false);
    await m.save(sample(20));
    const r = await m.load();
    expect(r.ok && r.data.player.x).toBe(20);
  });

  it('recovers from a corrupted primary slot using the backup', async () => {
    const store = new MemoryStore();
    const m = new SaveManager(clampX);
    m.useStore(store);
    await m.save(sample(10));
    await m.save(sample(30)); // backup now holds x = 10
    await store.put('slot-0', { checksum: 'deadbeef', payload: '{"broken":' });
    const r = await m.load();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.recoveredFromBackup).toBe(true);
      expect(r.data.player.x).toBe(10);
    }
  });

  it('reports corruption when no backup exists', async () => {
    const store = new MemoryStore();
    const m = new SaveManager(clampX);
    m.useStore(store);
    await store.put('slot-0', 'garbage');
    const r = await m.load();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('corrupt');
  });
});
