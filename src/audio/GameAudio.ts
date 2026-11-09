import { smoothstep } from '../core/math';
import type { GameEventBus } from '../core/events';
import type { Settings } from '../core/Settings';
import { RIVERS } from '../world/WorldDef';
import { AudioEngine } from './AudioEngine';

/** Connects gameplay events and world state to the audio engine. */
export class GameAudio {
  readonly engine = new AudioEngine();

  constructor(events: GameEventBus, settings: Settings) {
    this.engine.applySettings(settings.get());
    settings.onChange((s) => this.engine.applySettings(s));
    events.on('player:footstep', (e) => this.engine.footstep(e.surface, e.intensity));
    events.on('player:jump', () => this.engine.jump());
    events.on('player:land', (e) => this.engine.land(e.impact, e.surface));
    events.on('player:splash', (e) => this.engine.splash(e.intensity));
    events.on('ui:sound', (e) => this.engine.ui(e.kind));
    events.on('note:open', () => this.engine.ui('page'));
  }

  update(dt: number, listenerX: number, time: number, playing: boolean): void {
    let water = 0;
    for (const r of RIVERS) {
      const d = Math.abs(listenerX - r.x) - r.width / 2;
      water = Math.max(water, (1 - smoothstep(0, 38, d)) * Math.min(1, r.width / 10));
    }
    this.engine.setAmbienceActive(playing);
    this.engine.update(dt, { wind: 0.55, water, birds: 0.8, time });
  }
}
