import { lerp } from '../core/math';
import { REGIONS, regionWeight } from '../world/WorldDef';
import type { WorldClock } from './WorldClock';
import type { Weather } from './Weather';

const SEASON_OFFSET = [-2, -11, 2, 7]; // autumn, winter, spring, summer

/** Ambient air temperature in °C at a position, from region, time, season and weather. */
export function ambientTemperature(x: number, clock: WorldClock, weather: Weather, underground: boolean): number {
  if (underground) return 9;
  let base = 0;
  let w = 0;
  for (const r of REGIONS) {
    const k = regionWeight(r.id, x, 50);
    base += r.baseTemp * k;
    w += k;
  }
  base /= Math.max(w, 1e-6);
  const s = clock.seasonIndex;
  const season = lerp(SEASON_OFFSET[s], SEASON_OFFSET[(s + 1) % 4], Math.max(0, clock.seasonProgress - 0.7) / 0.3);
  const diurnal = clock.sunElevation * 5 - (clock.daylight < 0.2 ? 2 : 0);
  const wx = -weather.rain * 3 - weather.snow * 5 - weather.wind * 4 - weather.fog * 1.5;
  return base + season + diurnal + wx;
}
