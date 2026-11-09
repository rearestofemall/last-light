import { describe, expect, it } from 'vitest';
import { createEventBus } from '../src/core/events';
import { Crafting } from '../src/crafting/Crafting';
import { RECIPE_BY_ID, RECIPES } from '../src/crafting/recipes';
import { ambientTemperature } from '../src/environment/Climate';
import { Weather } from '../src/environment/Weather';
import { WorldClock } from '../src/environment/WorldClock';
import { ContainerRegistry, Inventory } from '../src/inventory/Inventory';
import { ITEMS } from '../src/inventory/items';
import { NOTES } from '../src/story/notes';
import { MAIN_QUEST, Quests } from '../src/story/Quests';
import { StoryState } from '../src/story/StoryState';
import { Survival, type SurvivalContext } from '../src/survival/Survival';

const calm: SurvivalContext = { sprinting: false, moving: false, swimming: false, ambientC: 14, fireHeat: 0, shelter: 0, clothing: 0, precipitation: 0, inWater: false };

describe('Inventory', () => {
  it('stacks, overflows into new slots and reports leftovers', () => {
    const inv = new Inventory(3);
    expect(inv.add('wood', 50)).toBe(0); // 30 + 20
    expect(inv.count('wood')).toBe(50);
    expect(inv.add('wood', 50)).toBe(10); // 10 more fit (third slot holds 30)
    expect(inv.count('wood')).toBe(90);
    expect(inv.add('axe', 1)).toBe(1); // full
  });

  it('removes from stacks and never goes negative', () => {
    const inv = new Inventory(4);
    inv.add('stone', 12);
    expect(inv.remove('stone', 5)).toBe(5);
    expect(inv.remove('stone', 50)).toBe(7);
    expect(inv.count('stone')).toBe(0);
    expect(inv.slots.every((s) => s === null)).toBe(true);
  });

  it('tools do not stack and carry durability', () => {
    const inv = new Inventory(4);
    inv.add('axe', 2);
    expect(inv.slots.filter(Boolean).length).toBe(2);
    expect(inv.slots[0]!.dur).toBe(ITEMS.axe.durability);
  });

  it('drag-and-drop merges, swaps and splits', () => {
    const a = new Inventory(4);
    const b = new Inventory(4);
    a.add('fiber', 10);
    b.add('fiber', 25);
    Inventory.move(a, 0, b, 0); // merge up to the stack limit of 30
    expect(b.slots[0]!.qty).toBe(30);
    expect(a.slots[0]!.qty).toBe(5);
    b.setSlot(1, { id: 'stone', qty: 3 });
    Inventory.move(b, 1, a, 0); // different items: swap
    expect(a.slots[0]!.id).toBe('stone');
    expect(b.slots[1]!.id).toBe('fiber');
    Inventory.move(b, 0, b, 2, true); // split in half
    expect(b.slots[0]!.qty + b.slots[2]!.qty).toBe(30);
  });

  it('serialises and ignores unknown items on load', () => {
    const inv = new Inventory(3);
    inv.add('berries', 4);
    const data = inv.serialize();
    const other = new Inventory(3);
    other.deserialize([...data, { id: 'unobtainium', qty: 9 }]);
    expect(other.count('berries')).toBe(4);
  });

  it('containers keep their contents by id', () => {
    const reg = new ContainerRegistry();
    reg.register('crate', 'Crate', 4, [['cloth', 2]]);
    reg.get('crate')!.inv.add('metal', 3);
    const saved = reg.serialize();
    const fresh = new ContainerRegistry();
    fresh.register('crate', 'Crate', 4, [['cloth', 2]]);
    fresh.deserialize(saved);
    expect(fresh.get('crate')!.inv.count('metal')).toBe(3);
  });
});

describe('Crafting', () => {
  it('starts with the basic recipes and learns more from documents', () => {
    const c = new Crafting(createEventBus());
    expect(c.known.has('campfire')).toBe(true);
    expect(c.known.has('axe')).toBe(true);
    expect(c.known.has('wall')).toBe(false);
    c.trigger('note:ranger-log');
    expect(c.known.has('wall')).toBe(true);
    expect(c.known.has('floor')).toBe(true);
    expect(c.known.has('chest')).toBe(true);
  });

  it('consumes inputs and produces outputs', () => {
    const c = new Crafting(createEventBus());
    const inv = new Inventory(8);
    inv.add('wood', 5);
    inv.add('stone', 5);
    expect(c.craft(RECIPE_BY_ID.campfire, { inventory: inv, stations: new Set() })).toBe(true);
    expect(inv.count('campfire')).toBe(1);
    expect(inv.count('wood')).toBe(1);
    expect(inv.count('stone')).toBe(1);
    expect(c.craft(RECIPE_BY_ID.campfire, { inventory: inv, stations: new Set() })).toBe(false);
  });

  it('requires stations for cooking and advanced items', () => {
    const c = new Crafting(createEventBus());
    const inv = new Inventory(8);
    inv.add('raw_meat', 1);
    expect(c.check(RECIPE_BY_ID.cooked_meat, { inventory: inv, stations: new Set() }).ok).toBe(false);
    expect(c.check(RECIPE_BY_ID.cooked_meat, { inventory: inv, stations: new Set(['fire']) }).ok).toBe(true);
  });

  it('every recipe references real items and every unlock key is reachable', () => {
    const keys = new Set<string>(['start']);
    for (const id of Object.keys(NOTES)) keys.add(`note:${id}`);
    keys.add('loc:blackwater');
    for (const r of RECIPES) {
      expect(ITEMS[r.out]).toBeDefined();
      for (const id of Object.keys(r.cost)) expect(ITEMS[id]).toBeDefined();
      expect(keys.has(r.unlock)).toBe(true);
    }
  });
});

describe('Survival', () => {
  it('hunger and thirst fall over time, thirst faster', () => {
    const s = new Survival(createEventBus());
    const h0 = s.vitals.hunger;
    const t0 = s.vitals.thirst;
    for (let i = 0; i < 600; i++) s.update(1, calm);
    expect(h0 - s.vitals.hunger).toBeGreaterThan(10);
    expect(t0 - s.vitals.thirst).toBeGreaterThan(h0 - s.vitals.hunger);
  });

  it('sprinting drains stamina and blocks sprint when exhausted', () => {
    const s = new Survival(createEventBus());
    for (let i = 0; i < 60 * 6; i++) s.update(1 / 60, { ...calm, sprinting: true, moving: true });
    const mods = s.modifiers({ speedMul: 1, canSprint: true, canJump: true });
    expect(mods.canSprint).toBe(false);
  });

  it('freezing weather drains warmth and then health; a fire warms you', () => {
    const s = new Survival(createEventBus());
    for (let i = 0; i < 150; i++) s.update(1, { ...calm, ambientC: -15, precipitation: 1 });
    expect(s.vitals.warmth).toBeLessThan(12);
    expect(s.vitals.health).toBeLessThan(100);
    for (let i = 0; i < 120; i++) s.update(1, { ...calm, ambientC: -15, fireHeat: 1, shelter: 2 });
    expect(s.vitals.warmth).toBeGreaterThan(25); // still drying out, but recovering
  });

  it('a parka makes ordinary Frostlands cold survivable', () => {
    const s = new Survival(createEventBus());
    for (let i = 0; i < 900; i++) s.update(1, { ...calm, ambientC: -9, moving: true, clothing: 30 });
    expect(s.dead).toBe(false);
    expect(s.vitals.warmth).toBeGreaterThan(12);
  });

  it('starving to death is reported with a cause', () => {
    const ev = createEventBus();
    let cause = '';
    ev.on('player:died', (e) => (cause = e.cause));
    const s = new Survival(ev);
    s.vitals.hunger = 0;
    s.vitals.thirst = 0;
    for (let i = 0; i < 400 && !s.dead; i++) s.update(1, calm);
    expect(s.dead).toBe(true);
    expect(cause).toMatch(/starvation|dehydration/);
  });

  it('sleep restores energy', () => {
    const s = new Survival(createEventBus());
    s.vitals.energy = 10;
    s.sleep(8, 1);
    expect(s.vitals.energy).toBeGreaterThan(80);
  });
});

describe('World clock & weather', () => {
  it('days, seasons and daylight progress', () => {
    const c = new WorldClock(createEventBus());
    c.time = 1 + 12 / 24;
    expect(c.daylight).toBeCloseTo(1, 1);
    c.time = 1 + 0.5 / 24;
    expect(c.daylight).toBeLessThan(0.05);
    expect(c.season).toBe('Autumn');
    c.time = 7;
    expect(c.season).toBe('Winter');
    c.time = 1 + 22 / 24;
    expect(c.hoursUntilMorning()).toBeCloseTo(8.5, 5);
  });

  it('rain becomes snow in the Frostlands and the air is colder there', () => {
    const ev = createEventBus();
    const w = new Weather(ev);
    w.set('rain');
    w.setContext('frost', false);
    expect(w.state).toBe('snow');
    const c = new WorldClock(ev);
    c.time = 1 + 13 / 24;
    expect(ambientTemperature(-600, c, w, false)).toBeLessThan(ambientTemperature(100, c, new Weather(ev), false) - 15);
    expect(ambientTemperature(-600, c, w, true)).toBe(9);
  });
});

describe('Story', () => {
  it('main quest advances in order and survives out-of-order completion', () => {
    const ev = createEventBus();
    const s = new StoryState(ev);
    const q = new Quests(s, ev);
    q.update();
    expect(q.current?.id).toBe('wake');
    s.readNotes.add('j-note-1');
    s.locations.add('ranger-station');
    s.readNotes.add('j-note-2');
    q.update();
    expect(q.current?.id).toBe('lodge');
    for (const st of MAIN_QUEST) expect(typeof st.target).toBe('number');
  });

  it('every main-quest document exists', () => {
    for (const id of ['j-note-1', 'j-note-2', 'hunter-journal', 'j-note-3', 'radio-1', 'keeper-log', 'meridian-dossier', 'j-note-4', 'okafor-1', 'okafor-final', 'j-found', 'epilogue']) {
      expect(NOTES[id]).toBeDefined();
    }
  });
});
