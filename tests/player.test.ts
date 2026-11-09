import { describe, expect, it } from 'vitest';
import { createEventBus } from '../src/core/events';
import type { Input, Action } from '../src/core/Input';
import { CollisionWorld } from '../src/physics/CollisionWorld';
import { PlayerController } from '../src/player/PlayerController';
import { Terrain } from '../src/world/Terrain';
import { PLAYABLE, RIVERS, WORLD_SEED } from '../src/world/WorldDef';

class FakeInput {
  held = new Set<Action>();
  pressed = new Set<Action>();
  isHeld(a: Action) {
    return this.held.has(a);
  }
  asInput(): Input {
    return {
      held: (a: Action) => this.held.has(a),
      consume: (a: Action) => this.pressed.delete(a),
    } as unknown as Input;
  }
}

const terrain = new Terrain(WORLD_SEED);
function setup(x: number) {
  const world = new CollisionWorld(terrain, { min: PLAYABLE.min, max: PLAYABLE.max });
  const events = createEventBus();
  const p = new PlayerController(world, events, x, 0);
  p.placeAt(x);
  return { p, events, world };
}
const run = (p: PlayerController, input: Input, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) p.update(1 / 60, input);
};

describe('PlayerController', () => {
  it('walks, sprints faster, and emits footsteps', () => {
    const { p, events } = setup(0);
    const fi = new FakeInput();
    let steps = 0;
    events.on('player:footstep', () => steps++);
    fi.held.add('right');
    run(p, fi.asInput(), 1);
    const walkX = p.body.x;
    expect(walkX).toBeGreaterThan(3);
    expect(steps).toBeGreaterThan(0);

    const s = setup(0);
    fi.held.add('sprint');
    run(s.p, fi.asInput(), 1);
    expect(s.p.body.x).toBeGreaterThan(walkX + 1.5);
  });

  it('jumps about 1.8 m', () => {
    const { p } = setup(0);
    const fi = new FakeInput();
    run(p, fi.asInput(), 0.5);
    const y0 = p.body.y;
    fi.pressed.add('jump');
    fi.held.add('jump');
    let peak = y0;
    for (let i = 0; i < 60; i++) {
      p.update(1 / 60, fi.asInput());
      peak = Math.max(peak, p.body.y);
    }
    expect(peak - y0).toBeGreaterThan(1.6);
    expect(peak - y0).toBeLessThan(2.1);
  });

  it('a tapped jump is lower than a held jump', () => {
    const { p } = setup(0);
    const fi = new FakeInput();
    run(p, fi.asInput(), 0.5);
    const y0 = p.body.y;
    fi.pressed.add('jump');
    let peak = y0;
    for (let i = 0; i < 60; i++) {
      p.update(1 / 60, fi.asInput());
      peak = Math.max(peak, p.body.y);
    }
    expect(peak - y0).toBeLessThan(1.2);
  });

  it('swims in the deep river and can climb out the far bank', () => {
    const r = RIVERS.find((rv) => rv.id === 'blackwater')!;
    const { p } = setup(r.x - 3);
    const fi = new FakeInput();
    run(p, fi.asInput(), 1.5);
    expect(p.state).toBe('swim');
    fi.held.add('right');
    for (let i = 0; i < 60 * 12; i++) {
      if (i % 30 === 0) fi.pressed.add('jump');
      p.update(1 / 60, fi.asInput());
    }
    expect(p.body.x).toBeGreaterThan(r.x + r.width / 2 + r.bank);
    expect(p.state).not.toBe('swim');
  });

  it('can walk the whole Verdant Woods with jumps where needed', () => {
    const { p } = setup(-200);
    const fi = new FakeInput();
    fi.held.add('right');
    let stuckFor = 0;
    let lastX = p.body.x;
    for (let i = 0; i < 60 * 240 && p.body.x < 400; i++) {
      // Jump whenever progress stalls (cliffs, ledges, river banks).
      if (Math.abs(p.body.x - lastX) < 0.01) stuckFor++;
      else stuckFor = 0;
      if (stuckFor > 3 || p.state === 'swim') fi.pressed.add('jump');
      fi.held.add('jump');
      lastX = p.body.x;
      p.update(1 / 60, fi.asInput());
    }
    expect(p.body.x).toBeGreaterThanOrEqual(400);
  });

  it('cannot walk up the Eastridge cliff without jumping', () => {
    const { p } = setup(185);
    const fi = new FakeInput();
    fi.held.add('right');
    run(p, fi.asInput(), 6);
    expect(p.body.x).toBeLessThan(202);
    expect(p.body.x).toBeGreaterThan(198);
  });
});
