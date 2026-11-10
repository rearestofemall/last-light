import * as THREE from 'three';
import { damp } from '../core/math';
import type { Settings } from '../core/Settings';
import { type Atmosphere, ATMOSPHERE_MORNING, computeAtmosphere, createAtmosphere } from './Atmosphere';
import type { CameraRig } from './CameraRig';
import { FarMountains } from './FarMountains';
import { Lighting } from './Lighting';
import { AmbientLife } from './AmbientLife';
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
  readonly mountains: FarMountains;
  readonly particles: Particles;
  readonly life = new AmbientLife();
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
    this.mountains = new FarMountains(seed);
    scene.add(this.mountains.group);
    void worldMin;
    void worldMax;
    this.particles = new Particles(320);
    scene.add(this.particles.points);
    scene.add(this.life.group);
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
    // Presets are authored for the 2.5D view; map them onto the streamed 3D range.
    this.fog.near = Math.max(1, a.fogNear * 0.7 + 30);
    this.fog.far = Math.min(175, a.fogFar * 0.7 + 20);
    this.mountains.setTint(a.layerTint);
    this.renderer.toneMappingExposure = a.exposure;
  }

  private tmp = new THREE.Vector3();

  /** Screen position of a direction in the sky (uv), or off-screen if behind the camera. */
  private projectDir(dir: THREE.Vector3, out: THREE.Vector2): void {
    const cam = this.rig.camera;
    const p = this.tmp.copy(dir).multiplyScalar(400).add(cam.position).project(cam);
    if (p.z > 1 || p.z < -1) out.set(-5, -5);
    else out.set((p.x + 1) / 2, (p.y + 1) / 2);
  }

  private placeSkyBodies(a: { sunDir: THREE.Vector3; sunScreen: THREE.Vector2; moonScreen: THREE.Vector2 }): void {
    const sun = this.tmp.copy(a.sunDir);
    this.projectDir(sun.clone(), a.sunScreen);
    this.projectDir(sun.clone().set(-sun.x, Math.max(0.35, sun.y), -sun.z), a.moonScreen);
  }

  /** Where the horizon falls on screen for the current camera pitch. */
  private horizonUv(): number {
    const cam = this.rig.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const p = this.tmp.copy(fwd).multiplyScalar(800).add(cam.position);
    p.y = cam.position.y - 25;
    p.project(cam);
    return Math.min(0.95, Math.max(0.02, (p.y + 1) / 2));
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
      a.fogNear = a.fogNear * (1 - k) + 2 * k;
      a.fogFar = a.fogFar * (1 - k) + 40 * k;
      a.sunIntensity *= 1 - k;
      a.hemiIntensity = a.hemiIntensity * (1 - k) + 0.32 * k;
      a.hemiSky.lerp(new THREE.Color(0x46506a), k);
      a.darkness = Math.max(a.darkness, k * 0.85);
      a.exposure = a.exposure * (1 - k) + 1.35 * k;
    }
    this.placeSkyBodies(a);
    this.apply(a);
    this.sky.mesh.visible = this.interiorK < 0.98;
    this.mountains.group.visible = this.interiorK < 0.98;
    const f = this.rig.focus;
    this.sky.update(this.time, this.rig.yaw * 0.6 + f.x * 0.002, aspect);
    this.sky.setHorizon(this.horizonUv());
    this.lighting.update(f);
    this.mountains.update(this.rig.camera.position, f.y - 1.6);
    this.particles.update(f, pixelRatio, this.rig.viewHeight);
    this.particles.points.visible = !input.interior && input.rain < 0.3 && input.snow < 0.3;
    this.particles.setNight(a.darkness);
    // Falling leaves in autumn woods; butterflies on warm, calm, dry days.
    const outdoors = !input.interior;
    const calm = (1 - Math.min(1, input.rain * 3)) * (1 - Math.min(1, input.snow * 3));
    const leaves = outdoors ? Math.min(1, input.foliageAmount * 1.5) * (1 - input.coldness) * (0.5 + input.wind * 0.5) : 0;
    const day = Math.max(0, Math.min(1, input.sunElevation * 4));
    const flies = outdoors ? day * calm * (1 - input.coldness) * (1 - input.wind * 0.6) * (this.settings.profile.particles > 100 ? 1 : 0.5) : 0;
    this.life.update(dt, f, leaves, flies, 0.35 + (1 - a.darkness) * 0.75);
    this.weatherFx.update(f, input.rain, input.snow, input.wind, this.settings.profile.particles / 320, pixelRatio, this.rig.viewHeight, input.interior);
  }
}
