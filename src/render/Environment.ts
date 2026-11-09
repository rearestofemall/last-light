import * as THREE from 'three';
import { damp } from '../core/math';
import type { Settings } from '../core/Settings';
import { type Atmosphere, ATMOSPHERE_MORNING, computeAtmosphere, createAtmosphere } from './Atmosphere';
import type { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { Parallax } from './Parallax';
import { Particles } from './Particles';
import { Sky } from './Sky';
import { sharedUniforms } from './materials';
import { WeatherFx } from './WeatherFx';

export interface EnvironmentInput {
  hour: number;
  sunElevation: number;
  cloud: number;
  rain: number;
  snow: number;
  fog: number;
  wind: number;
  flash: number;
  coldness: number;
  /** True while the camera is in an underground level. */
  interior: boolean;
  /** Seasonal foliage tint colour and strength. */
  foliage: THREE.Color;
  foliageAmount: number;
}

const INTERIOR_FOG = new THREE.Color(0x07080a);

/** Sky, light, fog, distant layers, weather and ambient particles: the "air" of the world. */
export class Environment {
  readonly sky = new Sky();
  readonly lighting = new Lighting();
  readonly parallax: Parallax;
  readonly particles: Particles;
  readonly weatherFx: WeatherFx;
  readonly fog: THREE.Fog;
  readonly atmosphere: Atmosphere = createAtmosphere();
  private interiorK = 0;
  /** Seconds since start; drives every animated shader. */
  time = 0;

  constructor(
    scene: THREE.Scene,
    private rig: CameraRig,
    private settings: Settings,
    private renderer: THREE.WebGLRenderer,
    seed: number,
    worldMin: number,
    worldMax: number,
  ) {
    this.fog = new THREE.Fog(0xffffff, 100, 400);
    scene.fog = this.fog;
    scene.add(this.lighting.group);
    scene.add(rig.camera);
    rig.camera.add(this.sky.mesh);
    this.parallax = new Parallax(seed, worldMin, worldMax);
    rig.camera.add(this.parallax.group);
    this.particles = new Particles(320);
    scene.add(this.particles.points);
    this.weatherFx = new WeatherFx();
    scene.add(this.weatherFx.group);
    this.applySettings();
    this.apply(ATMOSPHERE_MORNING);
  }

  applySettings(): void {
    const p = this.settings.profile;
    this.lighting.sun.castShadow = this.settings.get().shadows;
    this.lighting.setShadowMapSize(p.shadowMapSize);
    this.particles.setCount(p.particles);
  }

  private apply(a: Atmosphere): void {
    this.sky.apply(a);
    this.lighting.apply(a);
    this.fog.color.copy(a.fog);
    this.fog.near = a.fogNear;
    this.fog.far = a.fogFar;
    this.parallax.setTint(a.layerTint);
    this.renderer.toneMappingExposure = a.exposure;
  }

  update(dt: number, aspect: number, pixelRatio: number, input: EnvironmentInput): void {
    this.time += dt;
    sharedUniforms.uTime.value = this.time;
    sharedUniforms.uWind.value = 0.4 + input.wind * 1.6;
    sharedUniforms.uFoliage.value.copy(input.foliage);
    sharedUniforms.uFoliageAmt.value = input.foliageAmount;
    const a = computeAtmosphere(input, this.atmosphere);
    this.interiorK = damp(this.interiorK, input.interior ? 1 : 0, 4, dt);
    if (this.interiorK > 0.001) {
      // Underground: no sky light, near-black fog, only carried and placed lights matter.
      const k = this.interiorK;
      a.fog.lerp(INTERIOR_FOG, k);
      a.fogNear = a.fogNear * (1 - k) + 25 * k;
      a.fogFar = a.fogFar * (1 - k) + 70 * k;
      a.sunIntensity *= 1 - k;
      a.hemiIntensity = a.hemiIntensity * (1 - k) + 0.16 * k;
      a.hemiSky.lerp(new THREE.Color(0x46506a), k);
      a.darkness = Math.max(a.darkness, k * 0.85);
      a.exposure = a.exposure * (1 - k) + 1.35 * k;
    }
    this.apply(a);
    this.sky.mesh.visible = this.interiorK < 0.98;
    this.parallax.group.visible = this.interiorK < 0.98;
    const f = this.rig.focus;
    this.sky.update(this.time, f.x, aspect);
    this.lighting.update(f);
    this.parallax.update(f.x, f.y);
    this.particles.update(f, pixelRatio, this.rig.viewHeight);
    this.particles.points.visible = !input.interior && input.rain < 0.3 && input.snow < 0.3;
    this.particles.setNight(a.darkness);
    this.weatherFx.update(f, input.rain, input.snow, input.wind, this.settings.profile.particles / 320, pixelRatio, this.rig.viewHeight, input.interior);
  }
}
