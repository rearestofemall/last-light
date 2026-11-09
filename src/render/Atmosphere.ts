import * as THREE from 'three';

/**
 * Everything that defines the look of the sky and light at a moment in time.
 * M1 uses a fixed preset; in M3 the WorldClock and Weather systems blend between presets.
 */
export interface Atmosphere {
  zenith: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  sunColor: THREE.Color;
  sunIntensity: number;
  /** Direction *towards* the sun. */
  sunDir: THREE.Vector3;
  /** Sun position on screen (uv). */
  sunScreen: THREE.Vector2;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  cloudColor: THREE.Color;
  cloudCover: number;
  fogNear: number;
  fogFar: number;
  /** Tint multiplier for parallax layers (darkens at night). */
  layerTint: THREE.Color;
}

const c = (hex: number) => new THREE.Color(hex);

export const ATMOSPHERE_MORNING: Atmosphere = {
  zenith: c(0x5683b3),
  horizon: c(0xe8dcc2),
  fog: c(0xc3c9b8),
  sunColor: c(0xffe1b0),
  sunIntensity: 2.7,
  sunDir: new THREE.Vector3(0.5, 0.72, 0.48).normalize(),
  sunScreen: new THREE.Vector2(0.8, 0.8),
  hemiSky: c(0xbad0e2),
  hemiGround: c(0x4c4230),
  hemiIntensity: 1.0,
  cloudColor: c(0xf4efe6),
  cloudCover: 0.42,
  fogNear: 150,
  fogFar: 360,
  layerTint: c(0xffffff),
};
