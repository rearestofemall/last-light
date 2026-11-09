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
    player: { x, y: 1.5, facing: -1 },
    world: { seed: 1914, time: 42 },
    story: { readNotes: ['j-note-1'], locations: ['campsite', 'trailhead'], flags: { 'tutorial:basics': true } },
    meta: { location: 'Abandoned Campsite', region: 'The Verdant Woods' },
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
