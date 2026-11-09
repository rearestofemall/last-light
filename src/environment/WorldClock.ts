import type { GameEventBus } from '../core/events';
import { smoothstep } from '../core/math';

/** Real seconds per in-game day. */
export const DAY_LENGTH = 18 * 60;
export const DAYS_PER_SEASON = 5;
export const SEASONS = ['Autumn', 'Winter', 'Spring', 'Summer'] as const;
export type Season = (typeof SEASONS)[number];

/** Continuous game time measured in days. Day 1 starts at midnight. */
export class WorldClock {
  /** Days since the start (fractional). */
  time = 1 + 7.5 / 24;
  /** Multiplier for skipping time (sleep). */
  private lastHour = 7.5;

  constructor(private events: GameEventBus) {}

  get day(): number {
    return Math.floor(this.time);
  }

  /** 0–24 */
  get hour(): number {
    return (this.time % 1) * 24;
  }

  get seasonIndex(): number {
    return Math.floor((this.time - 1) / DAYS_PER_SEASON) % 4;
  }

  get season(): Season {
    return SEASONS[this.seasonIndex];
  }

  /** 0–1 progress through the current season. */
  get seasonProgress(): number {
    return (((this.time - 1) / DAYS_PER_SEASON) % 1 + 1) % 1;
  }

  /** −1 (midnight) … 1 (noon). Zero at roughly 6:00 and 18:00. */
  get sunElevation(): number {
    return Math.sin(((this.hour - 6) / 24) * Math.PI * 2);
  }

  /** 0 at night, 1 in full daylight, smooth through dawn and dusk. */
  get daylight(): number {
    return smoothstep(-0.18, 0.22, this.sunElevation);
  }

  get isNight(): boolean {
    return this.daylight < 0.25;
  }

  update(dt: number): void {
    this.time += dt / DAY_LENGTH;
    this.checkEvents();
  }

  advanceHours(hours: number): void {
    this.time += hours / 24;
    this.checkEvents();
  }

  /** Hours until the next 6:30 (for sleeping through the night). */
  hoursUntilMorning(): number {
    const h = this.hour;
    return h < 6.5 ? 6.5 - h : 24 - h + 6.5;
  }

  private checkEvents(): void {
    const h = this.hour;
    const crossed = (mark: number) => (this.lastHour < mark && h >= mark) || (this.lastHour > h && (h >= mark || this.lastHour < mark));
    if (crossed(6)) this.events.emit('time:dawn', { day: this.day });
    if (crossed(19)) this.events.emit('time:dusk', { day: this.day });
    this.lastHour = h;
  }

  label(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
