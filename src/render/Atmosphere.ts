import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/math';

/**
 * Everything that defines the look of the sky and light at a moment in time.
 * Presets for night, dawn and day are blended by the sun's elevation, then weather is applied.
 */
export interface Atmosphere {
  zenith: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  sunColor: THREE.Color;
  sunIntensity: number;
  /** Direction *towards* the sun (or moon at night). */
  sunDir: THREE.Vector3;
  /** Sun position on screen (uv). */
  sunScreen: THREE.Vector2;
  moonScreen: THREE.Vector2;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  cloudColor: THREE.Color;
  cloudCover: number;
  /** Fog start/end measured from the gameplay plane (negative = in front of it). */
  fogNear: number;
  fogFar: number;
  /** Tint multiplier for parallax layers (darkens at night). */
  layerTint: THREE.Color;
  stars: number;
  /** 0 = day, 1 = deep night: drives visibility gameplay and the vignette. */
  darkness: number;
  exposure: number;
}

const c = (hex: number) => new THREE.Color(hex);

interface Preset {
  zenith: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiI: number;
  cloud: THREE.Color;
  layer: THREE.Color;
  fogNear: number;
  fogFar: number;
}

const DAY: Preset = {
  zenith: c(0x5683b3),
  horizon: c(0xe8dcc2),
  fog: c(0xc3c9b8),
  sun: c(0xffe1b0),
  sunI: 2.7,
  hemiSky: c(0xbad0e2),
  hemiGround: c(0x4c4230),
  hemiI: 1.0,
  cloud: c(0xf4efe6),
  layer: c(0xffffff),
  fogNear: 15,
  fogFar: 220,
};
const DAWN: Preset = {
  zenith: c(0x3e5584),
  horizon: c(0xf2a46a),
  fog: c(0xa89283),
  sun: c(0xffa463),
  sunI: 1.7,
  hemiSky: c(0x9aa4c4),
  hemiGround: c(0x3d3026),
  hemiI: 0.72,
  cloud: c(0xf6b98e),
  layer: c(0xd9b7a4),
  fogNear: -10,
  fogFar: 180,
};
const NIGHT: Preset = {
  zenith: c(0x060a17),
  horizon: c(0x18223a),
  fog: c(0x0f1626),
  sun: c(0x93a9d8),
  sunI: 0.42,
  hemiSky: c(0x2c3d63),
  hemiGround: c(0x0d0d12),
  hemiI: 0.38,
  cloud: c(0x252c3d),
  layer: c(0x1c2335),
  fogNear: -45,
  fogFar: 110,
};

const tmpA = new THREE.Color();

export function createAtmosphere(): Atmosphere {
  return {
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    fog: new THREE.Color(),
    sunColor: new THREE.Color(),
    sunIntensity: 1,
    sunDir: new THREE.Vector3(0.5, 0.7, 0.5).normalize(),
    sunScreen: new THREE.Vector2(0.8, 0.8),
    moonScreen: new THREE.Vector2(0.2, 0.8),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 1,
    cloudColor: new THREE.Color(),
    cloudCover: 0.4,
    fogNear: 15,
    fogFar: 220,
    layerTint: new THREE.Color(1, 1, 1),
    stars: 0,
    darkness: 0,
    exposure: 1.05,
  };
}

export interface AtmosphereInput {
  hour: number;
  sunElevation: number;
  cloud: number;
  rain: number;
  snow: number;
  fog: number;
  flash: number;
  /** Extra tint for region (frost is bluer, coast greyer). */
  coldness: number;
}

/** Blend presets for a given time and weather into `out`. */
export function computeAtmosphere(i: AtmosphereInput, out: Atmosphere): Atmosphere {
  const e = i.sunElevation;
  const dayK = smoothstep(0.05, 0.45, e);
  const nightK = smoothstep(0.02, -0.25, e);
  const mix = (field: keyof Preset, target: THREE.Color) => {
    const a = DAWN[field] as THREE.Color;
    target.copy(a).lerp(DAY[field] as THREE.Color, dayK).lerp(NIGHT[field] as THREE.Color, nightK);
  };
  const num = (field: 'sunI' | 'hemiI' | 'fogNear' | 'fogFar') => lerp(lerp(DAWN[field], DAY[field], dayK), NIGHT[field], nightK);
  mix('zenith', out.zenith);
  mix('horizon', out.horizon);
  mix('fog', out.fog);
  mix('sun', out.sunColor);
  mix('hemiSky', out.hemiSky);
  mix('hemiGround', out.hemiGround);
  mix('cloud', out.cloudColor);
  mix('layer', out.layerTint);
  out.sunIntensity = num('sunI');
  out.hemiIntensity = num('hemiI');
  out.fogNear = num('fogNear');
  out.fogFar = num('fogFar');

  // Sun moves left → right across the sky through the day; the moon follows at night.
  const dayFrac = clamp((i.hour - 5) / 15, 0, 1);
  out.sunScreen.set(0.06 + dayFrac * 0.88, 0.42 + Math.max(-0.2, e) * 0.5);
  const nightFrac = (((i.hour - 18 + 24) % 24) / 12);
  out.moonScreen.set(0.1 + clamp(nightFrac, 0, 1) * 0.8, 0.42 + Math.max(0, Math.sin(nightFrac * Math.PI)) * 0.4);
  // East (+x, the coast) at dawn, west (the Frostlands) at dusk; the moon follows at night.
  const arc = e > -0.05 ? dayFrac : clamp(nightFrac, 0, 1);
  out.sunDir.set(Math.cos(arc * Math.PI) * 0.9, Math.max(0.25, Math.abs(e) + 0.12), 0.45).normalize();
  out.stars = nightK * (1 - i.cloud * 0.85);

  // Weather: overcast desaturates and dims, fog pulls the far plane in.
  const overcast = smoothstep(0.4, 1, i.cloud);
  const grey = tmpA.copy(out.horizon).lerp(out.zenith, 0.5);
  const lum = grey.r * 0.3 + grey.g * 0.55 + grey.b * 0.15;
  grey.setRGB(lum, lum * 1.02, lum * 1.06);
  out.zenith.lerp(grey, overcast * 0.75);
  out.horizon.lerp(grey, overcast * 0.6);
  out.fog.lerp(grey, overcast * 0.5);
  out.sunIntensity *= 1 - overcast * 0.6;
  out.hemiIntensity *= 1 - overcast * 0.15;
  out.cloudCover = 0.25 + i.cloud * 0.7;
  out.cloudColor.lerp(grey, overcast * 0.5);
  const fogK = Math.max(i.fog, i.snow * 0.8);
  // Thick fog: the plane itself sits inside the haze, the background disappears.
  out.fogNear = lerp(out.fogNear, -40, fogK);
  out.fogFar = lerp(out.fogFar, 45, fogK);
  if (i.coldness > 0) {
    out.fog.lerp(tmpA.setRGB(out.fog.r * 0.95, out.fog.g * 1.0, out.fog.b * 1.12), i.coldness);
  }
  // Lightning
  if (i.flash > 0) {
    out.hemiIntensity += i.flash * 2.5;
    out.zenith.lerp(tmpA.setRGB(0.8, 0.85, 1), i.flash * 0.6);
    out.horizon.lerp(tmpA.setRGB(0.8, 0.85, 1), i.flash * 0.6);
  }
  out.darkness = clamp(nightK * 0.9 + overcast * 0.12 * (1 - nightK) + fogK * 0.1, 0, 1);
  out.exposure = 1.05 + nightK * 0.35;
  return out;
}

/** Backwards-compatible default (used before the clock starts). */
export const ATMOSPHERE_MORNING: Atmosphere = computeAtmosphere(
  { hour: 9, sunElevation: Math.sin(((9 - 6) / 24) * Math.PI * 2), cloud: 0.3, rain: 0, snow: 0, fog: 0, flash: 0, coldness: 0 },
  createAtmosphere(),
);
