/**
 * Game clock. Time passes in real time (speed setting) and also when the
 * player performs bench actions (each action costs game minutes).
 */
import { CONFIG } from '../CONFIG';
import { G } from './state';

type Hook = () => void;
let minuteHook: Hook = () => {};
let dayHook: Hook = () => {};
export function setClockHooks(onMinute: Hook, onDayEnd: Hook) {
  minuteHook = onMinute;
  dayHook = onDayEnd;
}

let frac = 0;

/** Advance the game clock by n minutes, running the simulation for each minute. */
export function advanceMinutes(n: number) {
  const g = G();
  if (!g) return;
  frac += n;
  while (frac >= 1) {
    frac -= 1;
    g.minute += 1;
    minuteHook();
    if (g.minute >= CONFIG.time.closeHour * 60) {
      dayHook();
      frac = 0;
      return;
    }
  }
}

export const isOpen = () => {
  const g = G();
  return g.minute >= CONFIG.time.openHour * 60 && g.minute < CONFIG.time.closeHour * 60;
};

/** Absolute minute counter (day * 1440 + minute). */
export const absMinute = () => G().day * 1440 + G().minute;
