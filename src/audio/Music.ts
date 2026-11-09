import type { RegionId } from '../world/WorldDef';
import type { AudioEngine } from './AudioEngine';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Mood {
  /** Chords as MIDI note lists. */
  chords: number[][];
  /** Scale for melody notes (MIDI). */
  scale: number[];
  /** Pad filter cutoff. */
  bright: number;
  melody: number;
  bell: boolean;
}

/** Each region has its own harmony; night lowers and thins everything. */
const MOODS: Record<RegionId, Mood> = {
  woods: { chords: [[50, 57, 60, 64, 65], [55, 59, 62, 64], [46, 53, 57, 62], [48, 55, 60, 62, 65]], scale: [62, 64, 65, 67, 69, 72, 74, 76], bright: 1100, melody: 0.55, bell: false },
  city: { chords: [[45, 52, 59, 60], [41, 48, 52, 57], [48, 55, 59, 64], [40, 47, 52, 55]], scale: [57, 59, 60, 64, 67, 69, 72], bright: 750, melody: 0.35, bell: false },
  coast: { chords: [[41, 48, 52, 57, 59], [43, 50, 53, 59], [40, 47, 50, 55], [45, 52, 55, 60]], scale: [65, 67, 69, 71, 72, 76, 77, 79], bright: 1400, melody: 0.5, bell: false },
  frost: { chords: [[40, 47, 52, 55, 59], [36, 43, 48, 52, 55], [45, 52, 57, 60], [47, 54, 57, 62]], scale: [64, 66, 67, 71, 74, 76, 79], bright: 900, melody: 0.45, bell: true },
};

export interface MusicState {
  region: RegionId;
  night: number;
  underground: boolean;
  /** 0–1 nearby threat (stalking wolves). */
  danger: number;
  playing: boolean;
}

/**
 * Generative, adaptive score. Every bar a chord is voiced as a slow pad; a sparse
 * melody wanders the region's scale. Underground the music drops to a drone;
 * danger adds a low pulse. Everything is synthesised; nothing is copyrighted.
 */
export class Music {
  private nextBar = 0;
  private bar = 0;
  private pulseTimer = 0;
  private silenceBars = 0;

  constructor(private a: AudioEngine) {}

  update(dt: number, s: MusicState): void {
    const ctx = this.a.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this.nextBar < now) this.nextBar = now + 0.5;
    const barLen = s.underground ? 10 : 8 + s.night * 3;
    if (now + 0.3 >= this.nextBar) {
      this.scheduleBar(this.nextBar, barLen, s);
      this.nextBar += barLen;
      this.bar++;
    }
    if (s.danger > 0.2 && s.playing) {
      this.pulseTimer -= dt;
      if (this.pulseTimer <= 0) {
        this.pulseTimer = 0.9 - s.danger * 0.35;
        this.a.tone(this.a.buses.music, now, 'sine', midi(33), midi(33) * 0.98, 0.12 * s.danger, 0.02, 0.5);
        this.a.tone(this.a.buses.music, now, 'triangle', midi(45), midi(45), 0.02 * s.danger, 0.01, 0.2);
      }
    }
  }

  private scheduleBar(t: number, len: number, s: MusicState): void {
    const a = this.a;
    const ctx = a.ctx!;
    const out = a.buses.music;
    if (s.underground) {
      for (const n of [38, 45]) this.pad(t, len, midi(n), 0.05, 220);
      if (Math.random() < 0.5) a.tone(out, t + Math.random() * len * 0.6, 'sine', midi(74 + Math.floor(Math.random() * 3) * 2), midi(74), 0.012, 0.8, 4, Math.random() - 0.5, 0.9);
      return;
    }
    // Occasional rests keep the score from becoming wallpaper.
    if (this.silenceBars > 0) {
      this.silenceBars--;
      return;
    }
    if (this.bar > 0 && this.bar % 12 === 0) this.silenceBars = 2;
    const mood = MOODS[s.region];
    const chord = mood.chords[this.bar % mood.chords.length];
    const night = s.night;
    const cutoff = mood.bright * (1 - night * 0.5);
    chord.forEach((n, i) => this.pad(t + i * 0.12, len, midi(n - (night > 0.6 && i === 0 ? 12 : 0)), (i === 0 ? 0.05 : 0.032) * (1 - night * 0.3), cutoff));
    const notes = Math.round((2 + Math.random() * 4) * mood.melody * (1 - night * 0.6));
    let last = mood.scale[Math.floor(Math.random() * mood.scale.length)];
    for (let i = 0; i < notes; i++) {
      const nt = t + 0.6 + Math.random() * (len - 1.5);
      const idx = mood.scale.indexOf(last) + (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
      last = mood.scale[Math.max(0, Math.min(mood.scale.length - 1, idx))];
      const f = midi(last + (night > 0.5 ? -12 : 0));
      if (mood.bell) {
        a.tone(out, nt, 'sine', f, f, 0.03, 0.005, 2.2, Math.random() - 0.5, 0.7);
        a.tone(out, nt, 'sine', f * 2.76, f * 2.76, 0.008, 0.005, 1.2, 0, 0.7);
      } else {
        a.tone(out, nt, 'triangle', f, f, 0.035, 0.01, 1.6, Math.random() * 0.8 - 0.4, 0.6);
      }
    }
    void ctx;
  }

  /** A soft, slowly swelling pad voice: two detuned saws through a low-pass filter. */
  private pad(t: number, len: number, f: number, peak: number, cutoff: number): void {
    const ctx = this.a.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + len * 0.35);
    g.gain.linearRampToValueAtTime(peak * 0.8, t + len * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 2);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = cutoff;
    filt.Q.value = 0.4;
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(filt);
      o.start(t);
      o.stop(t + len + 2.2);
    }
    filt.connect(g).connect(this.a.buses.music);
    this.a.wet(g, 0.7);
  }
}
