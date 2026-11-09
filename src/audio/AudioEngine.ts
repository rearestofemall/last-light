import type { SfxName } from '../core/events';
import type { GameSettings } from '../core/Settings';
import type { Surface } from '../world/Terrain';

export interface AmbienceState {
  wind: number;
  water: number;
  rain: number;
  sea: number;
  fire: number;
  birds: number;
  crickets: number;
  cave: number;
  time: number;
  active: boolean;
}

/**
 * Fully synthesised audio: every sound is built from noise and oscillators at runtime.
 * Buses: master → { music, sfx, ambience, ui }, with a shared convolution reverb.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  buses!: { music: GainNode; sfx: GainNode; ambience: GainNode; ui: GainNode };
  reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private amb: Record<string, { gain: GainNode; filter?: BiquadFilterNode }> = {};
  private settings: GameSettings | null = null;
  private timers = { bird: 2, cricket: 1, crackle: 0.2, drip: 1, wave: 0 };
  onReady: (() => void) | null = null;

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
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.5;
    this.reverbSend.connect(this.reverb).connect(this.master);
    if (this.settings) this.applySettings(this.settings);
    this.buildAmbience();
    this.onReady?.();
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

  private makeImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  /** Send a node to the reverb as well as its dry destination. */
  wet(node: AudioNode, amount: number): void {
    const g = this.ctx!.createGain();
    g.gain.value = amount;
    node.connect(g).connect(this.reverbSend);
  }

  applySettings(s: GameSettings): void {
    this.settings = s;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.masterVolume, t, 0.05);
    this.buses.music.gain.setTargetAtTime(s.musicVolume * 0.7, t, 0.05);
    this.buses.sfx.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(s.ambienceVolume, t, 0.05);
    this.buses.ui.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
  }

  private loop(buffer: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start(0, Math.random() * buffer.duration);
    return src;
  }

  private layer(name: string, buffer: AudioBuffer, type: BiquadFilterType, freq: number, q = 0.7): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    this.loop(buffer).connect(f).connect(g).connect(this.buses.ambience);
    this.amb[name] = { gain: g, filter: f };
  }

  private buildAmbience(): void {
    this.layer('wind', this.brown, 'bandpass', 400);
    this.layer('leaves', this.white, 'highpass', 4500);
    this.layer('water', this.white, 'lowpass', 900);
    this.layer('rain', this.white, 'bandpass', 2600, 0.4);
    this.layer('rainLow', this.brown, 'lowpass', 500);
    this.layer('sea', this.brown, 'lowpass', 700);
    this.layer('fire', this.brown, 'bandpass', 900, 0.6);
    this.layer('cave', this.brown, 'lowpass', 160);
  }

  update(dt: number, s: AmbienceState): void {
    if (!this.ctx || !this.amb.wind) return;
    const t = this.ctx.currentTime;
    const on = s.active ? 1 : 0.35;
    const gust = 0.6 + 0.4 * Math.sin(s.time * 0.23) * Math.sin(s.time * 0.071 + 1);
    const set = (k: string, v: number, tc = 0.3) => this.amb[k].gain.gain.setTargetAtTime(v * on, t, tc);
    set('wind', 0.06 + 0.2 * s.wind * gust);
    this.amb.wind.filter!.frequency.setTargetAtTime(260 + 500 * gust * s.wind, t, 0.5);
    set('leaves', 0.02 * s.wind * gust * (1 - s.cave));
    set('water', 0.22 * s.water);
    set('rain', 0.09 * s.rain);
    set('rainLow', 0.12 * s.rain);
    const swell = 0.5 + 0.5 * Math.sin(s.time * 0.5);
    set('sea', 0.25 * s.sea * (0.55 + 0.45 * swell), 0.6);
    set('fire', 0.07 * s.fire);
    set('cave', 0.18 * s.cave);

    // Event-based ambience
    const tm = this.timers;
    tm.bird -= dt;
    if (tm.bird <= 0) {
      tm.bird = 1.5 + Math.random() * 5;
      if (Math.random() < s.birds) this.bird();
    }
    tm.cricket -= dt;
    if (tm.cricket <= 0) {
      tm.cricket = 0.25 + Math.random() * 0.6;
      if (Math.random() < s.crickets) this.cricket();
    }
    tm.crackle -= dt;
    if (tm.crackle <= 0) {
      tm.crackle = 0.05 + Math.random() * 0.25;
      if (Math.random() < s.fire) this.crackle(s.fire);
    }
    tm.drip -= dt;
    if (tm.drip <= 0) {
      tm.drip = 0.6 + Math.random() * 2.5;
      if (Math.random() < s.cave) this.drip();
    }
  }

  // ------------------------------------------------------------------ synthesis primitives
  private envelope(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  noise(dest: AudioNode, t: number, f: { type: BiquadFilterType; freq: number; q?: number; sweepTo?: number }, peak: number, attack: number, decay: number, pan = 0, brown = false): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.white;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filt = ctx.createBiquadFilter();
    filt.type = f.type;
    filt.frequency.setValueAtTime(f.freq, t);
    if (f.sweepTo) filt.frequency.exponentialRampToValueAtTime(f.sweepTo, t + attack + decay);
    filt.Q.value = f.q ?? 1;
    const g = ctx.createGain();
    this.envelope(g, t, peak, attack, decay);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(filt).connect(g).connect(p).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }

  tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, peak: number, attack: number, decay: number, pan = 0, reverb = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + attack + decay);
    const g = ctx.createGain();
    this.envelope(g, t, peak, attack, decay);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(dest);
    if (reverb > 0) this.wet(p, reverb);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  // ------------------------------------------------------------------ ambience events
  private bird(): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const base = 2300 + Math.random() * 2200;
    const notes = 2 + Math.floor(Math.random() * 5);
    const pan = Math.random() * 1.6 - 0.8;
    const far = 0.3 + Math.random() * 0.7;
    const style = Math.random();
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.08);
      const f = base * (1 + (style < 0.5 ? i * 0.06 : -i * 0.05));
      this.tone(this.buses.ambience, t, 'sine', f, f * (style < 0.5 ? 1.35 : 0.75), 0.03 * far, 0.01, 0.06, pan, 0.2);
    }
  }

  private cricket(): void {
    const t = this.ctx!.currentTime;
    const pan = Math.random() * 1.4 - 0.7;
    for (let i = 0; i < 3; i++) this.tone(this.buses.ambience, t + i * 0.045, 'sine', 4300 + Math.random() * 200, 4300, 0.008, 0.005, 0.03, pan);
  }

  private crackle(k: number): void {
    const t = this.ctx!.currentTime;
    this.noise(this.buses.ambience, t, { type: 'highpass', freq: 2500 + Math.random() * 3000 }, 0.05 * k * Math.random(), 0.001, 0.02 + Math.random() * 0.03, Math.random() * 0.4 - 0.2);
  }

  private drip(): void {
    const t = this.ctx!.currentTime;
    const f = 1400 + Math.random() * 900;
    this.tone(this.buses.ambience, t, 'sine', f, f * 0.55, 0.04, 0.002, 0.18, Math.random() * 1.2 - 0.6, 0.5);
  }

  // ------------------------------------------------------------------ gameplay sfx
  footstep(surface: Surface, intensity: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.buses.sfx;
    const k = intensity;
    const pan = (Math.random() - 0.5) * 0.15;
    switch (surface) {
      case 'wood':
        this.tone(d, t, 'sine', 170 + Math.random() * 30, 90, 0.22 * k, 0.003, 0.09, pan);
        this.noise(d, t, { type: 'bandpass', freq: 1100, q: 1.2 }, 0.12 * k, 0.002, 0.05, pan);
        break;
      case 'rock':
      case 'metal':
        this.noise(d, t, { type: 'bandpass', freq: 2600, q: 2 }, 0.14 * k, 0.001, 0.04, pan);
        this.tone(d, t, 'triangle', 320, 180, 0.05 * k, 0.002, 0.04, pan);
        break;
      case 'ice':
        this.noise(d, t, { type: 'bandpass', freq: 3800, q: 3 }, 0.1 * k, 0.001, 0.05, pan);
        this.tone(d, t, 'sine', 900, 600, 0.03 * k, 0.002, 0.06, pan);
        break;
      case 'water':
        this.noise(d, t, { type: 'bandpass', freq: 700, q: 1.2, sweepTo: 1800 }, 0.2 * k, 0.01, 0.18, pan);
        break;
      case 'snow':
        this.noise(d, t, { type: 'bandpass', freq: 1800, q: 0.6, sweepTo: 900 }, 0.12 * k, 0.02, 0.12, pan);
        break;
      case 'sand':
        this.noise(d, t, { type: 'highpass', freq: 2400 }, 0.07 * k, 0.01, 0.09, pan);
        break;
      case 'dirt':
        this.noise(d, t, { type: 'bandpass', freq: 900, q: 0.9 }, 0.16 * k, 0.004, 0.07, pan);
        this.tone(d, t, 'sine', 95, 60, 0.08 * k, 0.003, 0.05, pan);
        break;
      default:
        this.noise(d, t, { type: 'bandpass', freq: 1900, q: 0.8 }, 0.12 * k, 0.006, 0.08, pan);
        this.noise(d, t + 0.02, { type: 'highpass', freq: 5000 }, 0.03 * k, 0.005, 0.06, pan);
    }
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
    this.noise(this.buses.sfx, t, { type: 'lowpass', freq: 3000, sweepTo: 500 }, 0.35 * intensity, 0.005, 0.5);
    this.noise(this.buses.sfx, t + 0.05, { type: 'bandpass', freq: 1800, q: 2, sweepTo: 3000 }, 0.1 * intensity, 0.01, 0.3);
  }

  sfx(name: SfxName, volume = 1, pan = 0): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.buses.sfx;
    const v = volume;
    switch (name) {
      case 'chop':
        this.tone(d, t, 'sine', 140, 70, 0.35 * v, 0.002, 0.12, pan);
        this.noise(d, t, { type: 'bandpass', freq: 900, q: 1.4 }, 0.25 * v, 0.001, 0.08, pan);
        this.noise(d, t + 0.03, { type: 'highpass', freq: 3500 }, 0.05 * v, 0.002, 0.12, pan);
        break;
      case 'mine':
        this.tone(d, t, 'triangle', 1900, 1500, 0.12 * v, 0.001, 0.15, pan, 0.2);
        this.tone(d, t, 'triangle', 2850, 2500, 0.05 * v, 0.001, 0.1, pan);
        this.noise(d, t, { type: 'highpass', freq: 2000 }, 0.12 * v, 0.001, 0.06, pan);
        break;
      case 'gather':
        this.noise(d, t, { type: 'bandpass', freq: 3200, q: 0.7, sweepTo: 1800 }, 0.12 * v, 0.03, 0.22, pan);
        this.noise(d, t + 0.12, { type: 'bandpass', freq: 2400, q: 0.7 }, 0.08 * v, 0.02, 0.15, pan);
        break;
      case 'pickup':
        this.tone(d, t, 'sine', 660, 990, 0.05 * v, 0.005, 0.1);
        break;
      case 'craft':
        for (let i = 0; i < 3; i++) {
          this.tone(d, t + i * 0.13, 'triangle', 700 - i * 60, 500, 0.1, 0.001, 0.08);
          this.noise(d, t + i * 0.13, { type: 'bandpass', freq: 1500, q: 2 }, 0.08, 0.001, 0.05);
        }
        this.tone(this.buses.ui, t + 0.45, 'sine', 880, 880, 0.04, 0.01, 0.3, 0, 0.3);
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noise(d, t + i * 0.16, { type: 'bandpass', freq: 1400 + Math.random() * 600, q: 1.5 }, 0.12, 0.005, 0.06);
        break;
      case 'drink':
        for (let i = 0; i < 3; i++) this.tone(d, t + i * 0.22, 'sine', 260, 520, 0.08, 0.01, 0.1);
        break;
      case 'hurt':
        this.tone(d, t, 'sawtooth', 190, 110, 0.06, 0.01, 0.22);
        this.noise(d, t, { type: 'lowpass', freq: 600 }, 0.15, 0.003, 0.12);
        break;
      case 'swing':
        this.noise(d, t, { type: 'bandpass', freq: 700, q: 1.2, sweepTo: 2400 }, 0.12, 0.05, 0.15);
        break;
      case 'hit':
        this.tone(d, t, 'sine', 160, 60, 0.3, 0.002, 0.12);
        this.noise(d, t, { type: 'lowpass', freq: 1200 }, 0.2, 0.001, 0.08);
        break;
      case 'ignite':
        this.noise(d, t, { type: 'bandpass', freq: 600, q: 0.8, sweepTo: 2200 }, 0.2 * v, 0.08, 0.5, pan);
        for (let i = 0; i < 5; i++) this.noise(d, t + 0.1 + i * 0.07, { type: 'highpass', freq: 4000 }, 0.05, 0.001, 0.02, pan);
        break;
      case 'extinguish':
        this.noise(d, t, { type: 'highpass', freq: 3000, sweepTo: 6000 }, 0.12 * v, 0.02, 0.7, pan);
        break;
      case 'place':
        this.tone(d, t, 'sine', 120, 70, 0.3, 0.002, 0.15);
        this.noise(d, t, { type: 'bandpass', freq: 800 }, 0.2, 0.001, 0.08);
        break;
      case 'remove':
        this.noise(d, t, { type: 'bandpass', freq: 1200, sweepTo: 500 }, 0.2, 0.005, 0.25);
        break;
      case 'door': {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(140, t);
        o.frequency.linearRampToValueAtTime(220, t + 0.25);
        o.frequency.linearRampToValueAtTime(160, t + 0.5);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 900;
        f.Q.value = 6;
        const g = ctx.createGain();
        this.envelope(g, t, 0.05, 0.05, 0.5);
        o.connect(f).connect(g).connect(d);
        o.start(t);
        o.stop(t + 0.6);
        this.tone(d, t + 0.5, 'sine', 110, 70, 0.15, 0.002, 0.1);
        break;
      }
      case 'chest':
        this.noise(d, t, { type: 'bandpass', freq: 700, q: 1 }, 0.12, 0.01, 0.15);
        this.tone(d, t + 0.12, 'sine', 140, 90, 0.12, 0.002, 0.1);
        break;
      case 'denied':
        this.tone(this.buses.ui, t, 'triangle', 220, 220, 0.06, 0.005, 0.1);
        this.tone(this.buses.ui, t + 0.1, 'triangle', 180, 180, 0.06, 0.005, 0.14);
        break;
      case 'equip':
        this.noise(this.buses.ui, t, { type: 'bandpass', freq: 2500, q: 2 }, 0.05, 0.002, 0.05);
        break;
      case 'death':
        this.tone(this.buses.music, t, 'sine', 220, 55, 0.25, 0.5, 3.5, 0, 0.6);
        this.tone(this.buses.music, t, 'sine', 330, 82, 0.15, 0.5, 3.5, 0, 0.6);
        break;
      case 'howl': {
        const ctx = this.ctx;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 5;
        const lg = ctx.createGain();
        lg.gain.value = 8;
        lfo.connect(lg).connect(o.frequency);
        o.frequency.setValueAtTime(380, t);
        o.frequency.linearRampToValueAtTime(640, t + 0.7);
        o.frequency.linearRampToValueAtTime(600, t + 1.8);
        o.frequency.linearRampToValueAtTime(420, t + 2.6);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1100;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.5);
        g.gain.setValueAtTime(0.05, t + 1.8);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
        const p = ctx.createStereoPanner();
        p.pan.value = Math.random() * 1.6 - 0.8;
        o.connect(f).connect(g).connect(p).connect(this.buses.ambience);
        this.wet(p, 0.8);
        o.start(t);
        lfo.start(t);
        o.stop(t + 3);
        lfo.stop(t + 3);
        break;
      }
      case 'growl':
        this.tone(d, t, 'sawtooth', 75, 62, 0.06 * v, 0.08, 0.7, pan);
        this.noise(d, t, { type: 'lowpass', freq: 400 }, 0.12 * v, 0.08, 0.7, pan, true);
        break;
      case 'thunder':
        this.noise(this.buses.ambience, t, { type: 'lowpass', freq: 900, sweepTo: 120 }, 0.6, 0.02, 3.5, 0, true);
        this.noise(this.buses.ambience, t + 0.1, { type: 'lowpass', freq: 300 }, 0.4, 0.3, 2.5, 0, true);
        break;
      case 'unlock':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(this.buses.ui, t + i * 0.08, 'sine', f, f, 0.05, 0.01, 0.5, 0, 0.4));
        break;
      case 'radio':
        this.noise(d, t, { type: 'bandpass', freq: 2200, q: 0.5 }, 0.12, 0.05, 1.2);
        this.tone(d, t + 0.3, 'square', 820, 760, 0.015, 0.02, 0.6);
        break;
      case 'discover':
        [392, 494, 587].forEach((f, i) => this.tone(this.buses.ui, t + i * 0.12, 'sine', f, f, 0.04, 0.02, 1.4, 0, 0.6));
        break;
    }
  }

  ui(kind: 'hover' | 'click' | 'open' | 'close' | 'page'): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.buses.ui;
    switch (kind) {
      case 'hover':
        this.tone(d, t, 'sine', 1500, 1500, 0.02, 0.004, 0.04);
        break;
      case 'click':
        this.tone(d, t, 'triangle', 700, 420, 0.07, 0.004, 0.09);
        break;
      case 'open':
        this.tone(d, t, 'sine', 520, 520, 0.04, 0.01, 0.15);
        this.tone(d, t + 0.07, 'sine', 780, 780, 0.035, 0.01, 0.2);
        break;
      case 'close':
        this.tone(d, t, 'sine', 780, 780, 0.035, 0.01, 0.12);
        this.tone(d, t + 0.06, 'sine', 520, 520, 0.035, 0.01, 0.16);
        break;
      case 'page':
        this.noise(d, t, { type: 'bandpass', freq: 3000, q: 0.6, sweepTo: 1200 }, 0.06, 0.02, 0.18);
        break;
    }
  }
}
