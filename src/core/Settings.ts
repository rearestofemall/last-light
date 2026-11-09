export type QualityLevel = 'low' | 'medium' | 'high';

export interface GameSettings {
  quality: QualityLevel;
  shadows: boolean;
  /** Multiplier on device pixel ratio (0.5 – 1). */
  renderScale: number;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  muted: boolean;
  showFps: boolean;
  showHints: boolean;
}

export interface QualityProfile {
  shadowMapSize: number;
  maxPixelRatio: number;
  vegetationDensity: number;
  grassDensity: number;
  particles: number;
  chunkRadius: number;
  standardMaterials: boolean;
}

export const QUALITY_PROFILES: Record<QualityLevel, QualityProfile> = {
  low: { shadowMapSize: 1024, maxPixelRatio: 1, vegetationDensity: 0.55, grassDensity: 0.35, particles: 80, chunkRadius: 2, standardMaterials: false },
  medium: { shadowMapSize: 2048, maxPixelRatio: 1.5, vegetationDensity: 0.8, grassDensity: 0.7, particles: 180, chunkRadius: 3, standardMaterials: true },
  high: { shadowMapSize: 4096, maxPixelRatio: 2, vegetationDensity: 1, grassDensity: 1, particles: 320, chunkRadius: 3, standardMaterials: true },
};

export const DEFAULT_SETTINGS: GameSettings = {
  quality: 'medium',
  shadows: true,
  renderScale: 1,
  masterVolume: 0.8,
  musicVolume: 0.6,
  sfxVolume: 0.8,
  ambienceVolume: 0.7,
  muted: false,
  showFps: false,
  showHints: true,
};

const KEY = 'last-light:settings';

/** Player preferences, persisted per-device in localStorage (not part of a save game). */
export class Settings {
  private value: GameSettings;
  private listeners = new Set<(s: GameSettings, changed: (keyof GameSettings)[]) => void>();

  constructor() {
    this.value = { ...DEFAULT_SETTINGS, ...Settings.load() };
  }

  private static load(): Partial<GameSettings> {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      const out: Partial<GameSettings> = {};
      for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof GameSettings)[]) {
        if (typeof parsed[k] === typeof DEFAULT_SETTINGS[k]) (out as Record<string, unknown>)[k] = parsed[k];
      }
      if (out.quality && !(out.quality in QUALITY_PROFILES)) delete out.quality;
      return out;
    } catch {
      return {};
    }
  }

  get(): Readonly<GameSettings> {
    return this.value;
  }

  get profile(): QualityProfile {
    return QUALITY_PROFILES[this.value.quality];
  }

  set(patch: Partial<GameSettings>): void {
    const changed = (Object.keys(patch) as (keyof GameSettings)[]).filter((k) => patch[k] !== this.value[k]);
    if (!changed.length) return;
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.value));
    } catch {
      /* storage unavailable: settings remain session-only */
    }
    for (const l of this.listeners) l(this.value, changed);
  }

  onChange(fn: (s: GameSettings, changed: (keyof GameSettings)[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
