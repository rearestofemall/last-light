import type { GameEventBus } from '../core/events';
import { damp } from '../core/math';
import type { RegionId } from '../world/WorldDef';

export type WeatherState = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'blizzard';

export const WEATHER_LABEL: Record<WeatherState, string> = {
  clear: 'Clear',
  cloudy: 'Overcast',
  rain: 'Rain',
  storm: 'Thunderstorm',
  fog: 'Fog',
  snow: 'Snowfall',
  blizzard: 'Blizzard',
};

interface Target {
  cloud: number;
  rain: number;
  snow: number;
  fog: number;
  wind: number;
}

const TARGETS: Record<WeatherState, Target> = {
  clear: { cloud: 0.3, rain: 0, snow: 0, fog: 0, wind: 0.35 },
  cloudy: { cloud: 0.75, rain: 0, snow: 0, fog: 0.15, wind: 0.5 },
  rain: { cloud: 0.9, rain: 0.65, snow: 0, fog: 0.3, wind: 0.6 },
  storm: { cloud: 1, rain: 1, snow: 0, fog: 0.4, wind: 1 },
  fog: { cloud: 0.6, rain: 0, snow: 0, fog: 1, wind: 0.15 },
  snow: { cloud: 0.85, rain: 0, snow: 0.6, fog: 0.35, wind: 0.45 },
  blizzard: { cloud: 1, rain: 0, snow: 1, fog: 0.85, wind: 1 },
};

/** Transition weights per region; winter turns rain into snow everywhere but the coast. */
const CHAIN: Record<RegionId, [WeatherState, number][]> = {
  woods: [['clear', 0.4], ['cloudy', 0.25], ['rain', 0.17], ['storm', 0.06], ['fog', 0.12]],
  city: [['clear', 0.35], ['cloudy', 0.3], ['rain', 0.2], ['storm', 0.07], ['fog', 0.08]],
  coast: [['clear', 0.3], ['cloudy', 0.2], ['rain', 0.18], ['storm', 0.12], ['fog', 0.2]],
  frost: [['clear', 0.25], ['cloudy', 0.2], ['snow', 0.33], ['blizzard', 0.14], ['fog', 0.08]],
};

/**
 * A slow Markov weather machine. State changes every few in-game hours; the actual
 * intensities ease towards the target so transitions are gradual.
 */
export class Weather {
  state: WeatherState = 'clear';
  /** Current smoothed intensities, all 0–1. */
  cloud = 0.3;
  rain = 0;
  snow = 0;
  fog = 0;
  wind = 0.35;
  /** Brief 0–1 flash during lightning strikes. */
  flash = 0;
  private timer = 400;
  private lightningTimer = 8;
  private region: RegionId = 'woods';
  private winter = false;

  constructor(private events: GameEventBus) {}

  setContext(region: RegionId, winter: boolean): void {
    if (region !== this.region || winter !== this.winter) {
      this.region = region;
      this.winter = winter;
      // Entering the Frostlands should not stay rainy (and vice versa).
      const fix = this.adapt(this.state);
      if (fix !== this.state) this.set(fix);
    }
  }

  private adapt(s: WeatherState): WeatherState {
    const cold = this.region === 'frost' || (this.winter && this.region !== 'coast');
    if (cold && s === 'rain') return 'snow';
    if (cold && s === 'storm') return 'blizzard';
    if (!cold && s === 'snow') return 'rain';
    if (!cold && s === 'blizzard') return 'storm';
    return s;
  }

  set(s: WeatherState): void {
    this.state = this.adapt(s);
    this.events.emit('weather:changed', { state: this.state });
  }

  private next(): WeatherState {
    let r = Math.random();
    for (const [s, w] of CHAIN[this.region]) {
      r -= w;
      if (r <= 0) return s;
    }
    return 'clear';
  }

  update(dt: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 240 + Math.random() * 420;
      this.set(this.next());
    }
    const t = TARGETS[this.state];
    this.cloud = damp(this.cloud, t.cloud, 0.08, dt);
    this.rain = damp(this.rain, t.rain, 0.12, dt);
    this.snow = damp(this.snow, t.snow, 0.12, dt);
    this.fog = damp(this.fog, t.fog, 0.08, dt);
    this.wind = damp(this.wind, t.wind, 0.15, dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.state === 'storm' && this.rain > 0.6) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.lightningTimer = 6 + Math.random() * 14;
        this.flash = 1;
        setTimeout(() => this.events.emit('sfx', { name: 'thunder' }), 400 + Math.random() * 1600);
      }
    }
  }

  /** Total precipitation (rain or snow). */
  get precipitation(): number {
    return Math.max(this.rain, this.snow);
  }

  serialize(): { state: WeatherState; timer: number } {
    return { state: this.state, timer: this.timer };
  }

  deserialize(d: { state?: string; timer?: number }): void {
    if (d.state && d.state in TARGETS) this.state = d.state as WeatherState;
    this.timer = typeof d.timer === 'number' ? d.timer : 300;
    const t = TARGETS[this.state];
    this.cloud = t.cloud;
    this.rain = t.rain;
    this.snow = t.snow;
    this.fog = t.fog;
    this.wind = t.wind;
  }
}
