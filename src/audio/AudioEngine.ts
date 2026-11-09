import type { GameSettings } from '../core/Settings';
import type { Surface } from '../world/Terrain';

/**
 * Fully synthesised audio: every sound is built from noise and oscillators at runtime.
 * Buses: master → { music, sfx, ambience, ui }.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: { music: GainNode; sfx: GainNode; ambience: GainNode; ui: GainNode };
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private leavesGain!: GainNode;
  private waterGain!: GainNode;
  private settings: GameSettings | null = null;
  private birdTimer = 2;
  private windLevel = 0.5;
  private ambienceOn = false;

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    const bus = () => {
      const g = ctx.createGain();
      g.connect(this.master);
      return g;
    };
    this.buses = { music: bus(), sfx: bus(), ambience: bus(), ui: bus() };
    this.white = this.makeNoise(2, 'white');
    this.brown = this.makeNoise(4, 'brown');
    if (this.settings) this.applySettings(this.settings);
    this.buildAmbience();
  }

  private makeNoise(seconds: number, kind: 'white' | 'brown'): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return buf;
  }

  applySettings(s: GameSettings): void {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.masterVolume, t, 0.05);
    this.buses.music.gain.setTargetAtTime(s.musicVolume, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(s.ambienceVolume, t, 0.05);
    this.buses.ui.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
  }

  private loop(buffer: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * buffer.duration);
    return src;
  }

  private buildAmbience(): void {
    const ctx = this.ctx!;
    // Wind: brown noise through a slowly wandering band-pass.
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.loop(this.brown).connect(this.windFilter).connect(this.windGain).connect(this.buses.ambience);
    // Leaves: high, airy rustle that swells with the wind.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4500;
    this.leavesGain = ctx.createGain();
    this.leavesGain.gain.value = 0;
    this.loop(this.white).connect(hp).connect(this.leavesGain).connect(this.buses.ambience);
    // River: low rumble plus burble.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1600;
    bp.Q.value = 1.5;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    const src = this.loop(this.white);
    src.connect(lp).connect(this.waterGain);
    src.connect(bp).connect(this.waterGain);
    this.waterGain.connect(this.buses.ambience);
  }

  setAmbienceActive(on: boolean): void {
    this.ambienceOn = on;
  }

  /** Called every frame with environmental intensities in [0, 1]. */
  update(dt: number, env: { wind: number; water: number; birds: number; time: number }): void {
    if (!this.ctx || !this.windGain) return;
    const t = this.ctx.currentTime;
    const on = this.ambienceOn ? 1 : 0.35;
    this.windLevel = env.wind;
    const gust = 0.6 + 0.4 * Math.sin(env.time * 0.23) * Math.sin(env.time * 0.071 + 1);
    this.windGain.gain.setTargetAtTime(0.16 * env.wind * gust * on, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(280 + 380 * gust * env.wind, t, 0.5);
    this.leavesGain.gain.setTargetAtTime(0.018 * env.wind * gust * on, t, 0.3);
    this.waterGain.gain.setTargetAtTime(0.22 * env.water * on, t, 0.25);
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.5 + Math.random() * 5;
      if (Math.random() < env.birds) this.bird();
    }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseBurst(dest: AudioNode, t: number, filter: { type: BiquadFilterType; freq: number; q?: number; sweepTo?: number }, peak: number, attack: number, decay: number, pan = 0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.setValueAtTime(filter.freq, t);
    if (filter.sweepTo) f.frequency.exponentialRampToValueAtTime(filter.sweepTo, t + attack + decay);
    f.Q.value = filter.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, peak, attack, decay);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }

  private tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number, pan = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    const g = ctx.createGain();
    this.env(g, t, peak, attack, decay);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  footstep(surface: Surface, intensity: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.buses.sfx;
    const k = intensity;
    const pan = (Math.random() - 0.5) * 0.15;
    switch (surface) {
      case 'wood':
        this.tone(d, t, 'sine', 170 + Math.random() * 30, 90, 0.22 * k, 0.003, 0.09, pan);
        this.noiseBurst(d, t, { type: 'bandpass', freq: 1100, q: 1.2 }, 0.12 * k, 0.002, 0.05, pan);
        break;
      case 'rock':
      case 'metal':
        this.noiseBurst(d, t, { type: 'bandpass', freq: 2600, q: 2 }, 0.14 * k, 0.001, 0.04, pan);
        this.tone(d, t, 'triangle', 320, 180, 0.05 * k, 0.002, 0.04, pan);
        break;
      case 'water':
        this.noiseBurst(d, t, { type: 'bandpass', freq: 700, q: 1.2, sweepTo: 1800 }, 0.2 * k, 0.01, 0.18, pan);
        break;
      case 'sand':
      case 'snow':
        this.noiseBurst(d, t, { type: 'highpass', freq: 2400 }, 0.07 * k, 0.01, 0.09, pan);
        break;
      case 'dirt':
        this.noiseBurst(d, t, { type: 'bandpass', freq: 900, q: 0.9 }, 0.16 * k, 0.004, 0.07, pan);
        this.tone(d, t, 'sine', 95, 60, 0.08 * k, 0.003, 0.05, pan);
        break;
      default:
        this.noiseBurst(d, t, { type: 'bandpass', freq: 1900, q: 0.8 }, 0.12 * k, 0.006, 0.08, pan);
        this.noiseBurst(d, t + 0.02, { type: 'highpass', freq: 5000 }, 0.03 * k, 0.005, 0.06, pan);
    }
  }

  jump(): void {
    if (!this.ctx) return;
    this.noiseBurst(this.buses.sfx, this.ctx.currentTime, { type: 'bandpass', freq: 1200, q: 0.8 }, 0.06, 0.005, 0.08);
  }

  land(impact: number, surface: Surface): void {
    if (!this.ctx) return;
    const k = Math.min(1, impact / 18);
    this.footstep(surface, 0.6 + k);
    this.tone(this.buses.sfx, this.ctx.currentTime, 'sine', 110, 45, 0.2 * k, 0.004, 0.15);
  }

  splash(intensity: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(this.buses.sfx, t, { type: 'lowpass', freq: 3000, sweepTo: 500 }, 0.35 * intensity, 0.005, 0.5);
    this.noiseBurst(this.buses.sfx, t + 0.05, { type: 'bandpass', freq: 1800, q: 2, sweepTo: 3000 }, 0.1 * intensity, 0.01, 0.3);
  }

  private bird(): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const base = 2300 + Math.random() * 2200;
    const notes = 2 + Math.floor(Math.random() * 5);
    const pan = Math.random() * 1.6 - 0.8;
    const far = 0.3 + Math.random() * 0.7;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000 + 5000 * far;
    lp.connect(this.buses.ambience);
    const style = Math.random();
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.08);
      const f = base * (1 + (style < 0.5 ? i * 0.06 : -i * 0.05));
      this.tone(lp, t, 'sine', f, f * (style < 0.5 ? 1.35 : 0.75), 0.035 * far * (1 - this.windLevel * 0.3), 0.01, 0.06, pan);
    }
  }

  ui(kind: 'hover' | 'click' | 'open' | 'close' | 'page'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.buses.ui;
    switch (kind) {
      case 'hover':
        this.tone(d, t, 'sine', 1500, 1500, 0.025, 0.004, 0.04);
        break;
      case 'click':
        this.tone(d, t, 'triangle', 700, 420, 0.08, 0.004, 0.09);
        break;
      case 'open':
        this.tone(d, t, 'sine', 520, 520, 0.05, 0.01, 0.15);
        this.tone(d, t + 0.07, 'sine', 780, 780, 0.04, 0.01, 0.2);
        break;
      case 'close':
        this.tone(d, t, 'sine', 780, 780, 0.04, 0.01, 0.12);
        this.tone(d, t + 0.06, 'sine', 520, 520, 0.04, 0.01, 0.16);
        break;
      case 'page':
        this.noiseBurst(d, t, { type: 'bandpass', freq: 3000, q: 0.6, sweepTo: 1200 }, 0.06, 0.02, 0.18);
        break;
    }
  }
}
