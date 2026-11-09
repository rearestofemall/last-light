import { smoothstep } from '../core/math';
import type { GameEventBus } from '../core/events';
import type { Settings } from '../core/Settings';
import { type RegionId, RIVERS, regionWeight } from '../world/WorldDef';
import { AudioEngine } from './AudioEngine';
import { Music } from './Music';

export interface AudioFrame {
  x: number;
  time: number;
  playing: boolean;
  wind: number;
  rain: number;
  night: number;
  region: RegionId;
  underground: boolean;
  fireNear: number;
  danger: number;
}

/** Connects gameplay events and world state to the audio engine and the music. */
export class GameAudio {
  readonly engine = new AudioEngine();
  private music = new Music(this.engine);
  private listenerX = 0;

  constructor(events: GameEventBus, settings: Settings) {
    this.engine.applySettings(settings.get());
    settings.onChange((s) => this.engine.applySettings(s));
    events.on('player:footstep', (e) => this.engine.footstep(e.surface, e.intensity));
    events.on('player:jump', () => this.engine.sfx('swing', 0.4));
    events.on('player:land', (e) => this.engine.land(e.impact, e.surface));
    events.on('player:splash', (e) => this.engine.splash(e.intensity));
    events.on('player:damaged', () => this.engine.sfx('hurt'));
    events.on('ui:sound', (e) => this.engine.ui(e.kind));
    events.on('note:open', () => this.engine.ui('page'));
    events.on('item:gained', () => this.engine.sfx('pickup'));
    events.on('sfx', (e) => {
      // Simple distance attenuation and panning around the listener.
      let vol = e.volume ?? 1;
      let pan = 0;
      if (e.x !== undefined) {
        const d = e.x - this.listenerX;
        vol *= 1 - smoothstep(10, 45, Math.abs(d));
        pan = Math.max(-0.8, Math.min(0.8, d / 20));
      }
      if (vol > 0.02) this.engine.sfx(e.name, vol, pan);
    });
  }

  update(dt: number, f: AudioFrame): void {
    this.listenerX = f.x;
    let water = 0;
    for (const r of RIVERS) {
      if (r.frozen) continue;
      const d = Math.abs(f.x - r.x) - r.width / 2;
      water = Math.max(water, (1 - smoothstep(0, 38, d)) * Math.min(1, r.width / 10));
    }
    const ug = f.underground ? 1 : 0;
    const day = 1 - f.night;
    const birdy = f.region === 'woods' ? 0.85 : f.region === 'coast' ? 0.5 : f.region === 'city' ? 0.35 : 0.1;
    this.engine.update(dt, {
      wind: f.wind * (1 - ug * 0.8) + (f.region === 'frost' ? 0.25 : 0),
      water: water * (1 - ug),
      rain: f.rain,
      sea: regionWeight('coast', f.x, 80) * (1 - ug),
      fire: Math.min(1, f.fireNear * 1.5),
      birds: birdy * day * (1 - f.rain) * (1 - ug),
      crickets: f.night > 0.6 && (f.region === 'woods' || f.region === 'coast') ? 0.6 * (1 - f.rain) * (1 - ug) : 0,
      cave: ug,
      time: f.time,
      active: f.playing,
    });
    this.music.update(dt, { region: f.region, night: f.night, underground: f.underground, danger: f.danger, playing: f.playing });
  }
}
