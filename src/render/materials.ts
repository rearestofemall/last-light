import * as THREE from 'three';

/** Uniforms shared by every animated material (wind, water). */
export const sharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
};

/**
 * Patches a built-in material so vertices sway with the wind, proportional to height².
 * Instance position is used as phase so neighbouring plants move out of sync.
 */
export function addWindSway<T extends THREE.Material>(material: T, strength: number, key: string): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uWind = sharedUniforms.uWind;
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
        #endif
        float hgt = max(position.y, 0.0);
        float ph = ip.x * 0.37 + ip.z * 0.23;
        float gust = 0.6 + 0.4 * sin(uTime * 0.31 + ip.x * 0.02);
        float sway = (sin(uTime * 1.35 + ph) * 0.65 + sin(uTime * 3.1 + ph * 1.7) * 0.22) * uWind * gust * ${strength.toFixed(5)} * hgt * hgt;
        transformed.x += sway;
        transformed.z += sway * 0.35;`,
      );
  };
  material.customProgramCacheKey = () => `wind-${key}`;
  return material;
}

/** Creates the flat-shaded vertex-coloured material used by all procedural vegetation and rocks. */
export function vertexColorMaterial(standard: boolean, opts: { flat?: boolean; roughness?: number } = {}): THREE.Material {
  const flat = opts.flat ?? true;
  if (!standard) return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat });
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: flat, roughness: opts.roughness ?? 0.92, metalness: 0 });
}
