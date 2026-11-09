import * as THREE from 'three';
import type { GameEventBus } from '../core/events';
import { clamp } from '../core/math';
import { sharedUniforms } from '../render/materials';

export type LightKind = 'campfire' | 'torch' | 'lantern' | 'lamp' | 'barrel' | 'beacon';

export interface LightSource {
  id: string;
  kind: LightKind;
  x: number;
  y: number;
  z: number;
  /** Gameplay radius in metres (wolves keep out, warmth for fires). */
  radius: number;
  intensity: number;
  color: number;
  on: boolean;
  /** Seconds of fuel left. Infinity for permanent lights. */
  fuel: number;
  maxFuel: number;
  /** True when a roof protects the flame from rain. */
  sheltered: boolean;
  /** Open flames are affected by rain; lanterns are not. */
  exposedFlame: boolean;
  /** Fires give warmth. */
  heat: number;
  visual?: FireVisual;
  /** Underground lights should not be culled by distance to surface camera. */
  persistent?: boolean;
}

const flameVert = /* glsl */ `
uniform float uTime;
uniform float uSeed;
varying float vH;
void main() {
  vec3 p = position;
  float h = clamp(p.y / 1.0, 0.0, 1.0);
  vH = h;
  float w = sin(uTime * 9.0 + uSeed + p.y * 6.0) * 0.08 + sin(uTime * 13.0 + uSeed * 2.0) * 0.05;
  p.x += w * h;
  p.z += cos(uTime * 7.0 + uSeed) * 0.05 * h;
  p.y *= 0.9 + 0.15 * sin(uTime * 11.0 + uSeed);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const flameFrag = /* glsl */ `
uniform float uStrength;
varying float vH;
void main() {
  vec3 inner = vec3(1.0, 0.92, 0.6);
  vec3 outer = vec3(1.0, 0.42, 0.08);
  vec3 col = mix(inner, outer, smoothstep(0.0, 0.8, vH));
  float a = (1.0 - smoothstep(0.35, 1.0, vH)) * uStrength;
  gl_FragColor = vec4(col * 1.6, a);
}`;

let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Flickering flame cones plus a soft glow sprite. Cheap: no lights required to look lit. */
export class FireVisual {
  readonly group = new THREE.Group();
  private flames: THREE.Mesh[] = [];
  private mats: THREE.ShaderMaterial[] = [];
  readonly glow: THREE.Sprite;

  constructor(size: number, color: number, flame = true) {
    if (flame) {
      for (let i = 0; i < 3; i++) {
        const geo = new THREE.ConeGeometry(0.22 * size * (1 - i * 0.2), 1, 6, 4, true);
        geo.translate(0, 0.5, 0);
        const mat = new THREE.ShaderMaterial({
          vertexShader: flameVert,
          fragmentShader: flameFrag,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: { uTime: sharedUniforms.uTime, uSeed: { value: Math.random() * 100 }, uStrength: { value: 1 } },
        });
        const m = new THREE.Mesh(geo, mat);
        m.scale.set(1, size * (0.9 - i * 0.18), 1);
        m.position.set((i - 1) * 0.1 * size, 0, (i % 2) * 0.08);
        m.renderOrder = 30;
        this.flames.push(m);
        this.mats.push(mat);
        this.group.add(m);
      }
    }
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 }));
    this.glow.scale.setScalar(size * 3.2);
    this.glow.position.y = size * 0.35;
    this.glow.renderOrder = 31;
    this.group.add(this.glow);
  }

  set(on: boolean, strength: number, flicker: number): void {
    this.group.visible = on;
    for (const m of this.mats) m.uniforms.uStrength.value = strength;
    for (const f of this.flames) f.visible = on;
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.35 + 0.3 * strength * flicker;
  }
}

/**
 * Owns every light source. A fixed pool of PointLights is assigned each frame to the
 * sources nearest the camera, so the number of lights (and thus shader programs) never
 * changes; distant sources still glow via their sprites.
 */
export class LightSystem {
  readonly sources = new Set<LightSource>();
  private pool: THREE.PointLight[] = [];
  readonly group = new THREE.Group();
  private time = 0;
  private sorted: LightSource[] = [];

  constructor(
    private events: GameEventBus,
    poolSize: number,
  ) {
    this.group.name = 'lights';
    this.setPoolSize(poolSize);
  }

  setPoolSize(n: number): void {
    if (n === this.pool.length) return;
    for (const l of this.pool) this.group.remove(l);
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffa050, 0, 10, 1.6);
      l.castShadow = false;
      this.pool.push(l);
      this.group.add(l);
    }
  }

  add(s: LightSource): LightSource {
    this.sources.add(s);
    if (s.visual) this.group.add(s.visual.group);
    return s;
  }

  remove(s: LightSource): void {
    this.sources.delete(s);
    if (s.visual) this.group.remove(s.visual.group);
  }

  ignite(s: LightSource): boolean {
    if (s.on) return true;
    if (s.fuel <= 0) return false;
    s.on = true;
    this.events.emit('sfx', { name: 'ignite', x: s.x });
    return true;
  }

  extinguish(s: LightSource, quiet = false): void {
    if (!s.on) return;
    s.on = false;
    if (!quiet) this.events.emit('sfx', { name: 'extinguish', x: s.x });
  }

  /** Light level from placed and carried sources at a point (0 = none, ≥1 = well lit). */
  lightAt(x: number, y: number): number {
    let sum = 0;
    for (const s of this.sources) {
      if (!s.on) continue;
      const d = Math.hypot(s.x - x, (s.y - y) * 0.8);
      if (d >= s.radius) continue;
      const k = 1 - d / s.radius;
      sum += k * k * 1.6;
    }
    return sum;
  }

  /** Heat from nearby fires (0–1). */
  heatAt(x: number, y: number): number {
    let h = 0;
    for (const s of this.sources) {
      if (!s.on || s.heat <= 0) continue;
      const d = Math.hypot(s.x - x, (s.y - y) * 0.7);
      const r = s.radius * 0.55;
      if (d < r) h = Math.max(h, s.heat * (1 - d / r));
    }
    return clamp(h, 0, 1);
  }

  /** Nearest lit source of a given kind within range (for crafting stations). */
  nearestLit(x: number, y: number, kinds: LightKind[], range: number): LightSource | null {
    let best: LightSource | null = null;
    let bd = range;
    for (const s of this.sources) {
      if (!s.on || !kinds.includes(s.kind)) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  /**
   * @param rain precipitation reaching exposed flames (0–1)
   */
  update(dt: number, focusX: number, focusY: number, rain: number, wind: number): void {
    this.time += dt;
    for (const s of this.sources) {
      if (!s.on) {
        s.visual?.set(false, 0, 0);
        continue;
      }
      let burn = 1;
      const wetFlame = s.exposedFlame && !s.sheltered && rain > 0.05;
      if (wetFlame) burn += rain * (s.kind === 'campfire' ? 5 : 2.5) + wind * 0.5;
      if (Number.isFinite(s.fuel)) {
        s.fuel -= dt * burn;
        if (s.fuel <= 0) {
          s.fuel = 0;
          this.extinguish(s);
          if (s.kind === 'campfire') {
            this.events.emit('toast', { text: wetFlame ? 'The rain has put out a fire.' : 'A fire has burned down to embers.', kind: 'warn', duration: 4 });
          }
          continue;
        }
      }
      const fuelK = Number.isFinite(s.fuel) ? clamp(s.fuel / Math.min(s.maxFuel, 120), 0.35, 1) : 1;
      const flicker = s.exposedFlame ? 0.85 + 0.1 * Math.sin(this.time * 17 + s.x) + 0.06 * Math.sin(this.time * 31 + s.y) : 1;
      s.visual?.set(true, fuelK, flicker);
      if (s.visual) s.visual.group.position.set(s.x, s.y, s.z);
    }
    // Assign the light pool to the nearest lit sources.
    this.sorted.length = 0;
    for (const s of this.sources) if (s.on) this.sorted.push(s);
    this.sorted.sort((a, b) => Math.abs(a.x - focusX) + Math.abs(a.y - focusY) * 0.5 - (Math.abs(b.x - focusX) + Math.abs(b.y - focusY) * 0.5));
    for (let i = 0; i < this.pool.length; i++) {
      const l = this.pool[i];
      const s = this.sorted[i];
      if (!s || Math.abs(s.x - focusX) > 60) {
        l.intensity = 0;
        continue;
      }
      const fuelK = Number.isFinite(s.fuel) ? clamp(s.fuel / Math.min(s.maxFuel, 120), 0.4, 1) : 1;
      const flicker = s.exposedFlame ? 0.85 + 0.1 * Math.sin(this.time * 17 + s.x) + 0.05 * Math.sin(this.time * 29 + s.y) : 1;
      l.color.setHex(s.color);
      l.intensity = s.intensity * 14 * fuelK * flicker;
      l.distance = s.radius * 1.7;
      l.position.set(s.x, s.y + 0.6, s.z + 0.8);
    }
  }

  clear(): void {
    for (const s of [...this.sources]) this.remove(s);
  }
}

export const LIGHT_PRESETS: Record<LightKind, { radius: number; intensity: number; color: number; heat: number; maxFuel: number; exposedFlame: boolean }> = {
  campfire: { radius: 11, intensity: 2.6, color: 0xff9a45, heat: 1, maxFuel: 900, exposedFlame: true },
  torch: { radius: 9, intensity: 2.0, color: 0xffa04a, heat: 0.15, maxFuel: 300, exposedFlame: true },
  lantern: { radius: 12, intensity: 2.3, color: 0xffc070, heat: 0, maxFuel: 600, exposedFlame: false },
  lamp: { radius: 10, intensity: 2.0, color: 0xffc27a, heat: 0, maxFuel: 1800, exposedFlame: false },
  barrel: { radius: 10, intensity: 2.4, color: 0xff8f3a, heat: 0.8, maxFuel: 1200, exposedFlame: true },
  beacon: { radius: 40, intensity: 6, color: 0xfff0c0, heat: 0, maxFuel: Infinity, exposedFlame: false },
};

export function makeLight(id: string, kind: LightKind, x: number, y: number, z: number, opts: Partial<LightSource> = {}): LightSource {
  const p = LIGHT_PRESETS[kind];
  const visual =
    kind === 'campfire' || kind === 'barrel' || kind === 'torch'
      ? new FireVisual(kind === 'torch' ? 0.45 : kind === 'barrel' ? 0.9 : 1.1, p.color, true)
      : new FireVisual(kind === 'beacon' ? 4 : 0.35, p.color, false);
  return {
    id,
    kind,
    x,
    y,
    z,
    radius: p.radius,
    intensity: p.intensity,
    color: p.color,
    on: false,
    fuel: p.maxFuel === Infinity ? Infinity : 0,
    maxFuel: p.maxFuel,
    sheltered: false,
    exposedFlame: p.exposedFlame,
    heat: p.heat,
    visual,
    ...opts,
  };
}
