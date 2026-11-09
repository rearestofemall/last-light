import * as THREE from 'three';
import type { Settings } from '../core/Settings';
import { type Atmosphere, ATMOSPHERE_MORNING } from './Atmosphere';
import type { CameraRig } from './CameraRig';
import { Lighting } from './Lighting';
import { Parallax } from './Parallax';
import { Particles } from './Particles';
import { Sky } from './Sky';
import { sharedUniforms } from './materials';

/** Sky, light, fog, distant layers and ambient particles: the "air" of the world. */
export class Environment {
  readonly sky = new Sky();
  readonly lighting = new Lighting();
  readonly parallax: Parallax;
  readonly particles: Particles;
  readonly fog: THREE.Fog;
  private atmosphere: Atmosphere = ATMOSPHERE_MORNING;
  time = 0;

  constructor(
    scene: THREE.Scene,
    private rig: CameraRig,
    private settings: Settings,
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
    this.applySettings();
    this.setAtmosphere(this.atmosphere);
  }

  applySettings(): void {
    const p = this.settings.profile;
    this.lighting.sun.castShadow = this.settings.get().shadows;
    this.lighting.setShadowMapSize(p.shadowMapSize);
    this.particles.setCount(p.particles);
  }

  setAtmosphere(a: Atmosphere): void {
    this.atmosphere = a;
    this.sky.apply(a);
    this.lighting.apply(a);
    this.fog.color.copy(a.fog);
    this.fog.near = a.fogNear;
    this.fog.far = a.fogFar;
    this.parallax.setTint(a.layerTint);
  }

  update(dt: number, aspect: number, pixelRatio: number): void {
    this.time += dt;
    sharedUniforms.uTime.value = this.time;
    const f = this.rig.focus;
    this.sky.update(this.time, f.x, aspect);
    this.lighting.update(f);
    this.parallax.update(f.x, f.y);
    this.particles.update(f, pixelRatio, this.rig.viewHeight);
  }
}
