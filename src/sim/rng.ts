/** Small random helpers used everywhere in the simulation. */
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const chance = (p: number) => Math.random() < p;
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const round = (v: number, to = 1) => Math.round(v / to) * to;

export function weighted<T>(items: readonly T[], weight: (t: T) => number): T {
  const total = items.reduce((s, i) => s + Math.max(0, weight(i)), 0);
  let r = Math.random() * total;
  for (const i of items) {
    r -= Math.max(0, weight(i));
    if (r <= 0) return i;
  }
  return items[items.length - 1];
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let uidCounter = 0;
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}${(uidCounter++).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Deterministic hash → 0..1 (used for per-model reference values). */
export function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export const digits = (n: number) => Array.from({ length: n }, () => randi(0, 9)).join('');
