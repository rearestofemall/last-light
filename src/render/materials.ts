import * as THREE from 'three';

/** Uniforms shared by every animated material (wind, water). */
export const sharedUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  /** Seasonal foliage tint (autumn orange, winter frost). */
  uFoliage: { value: new THREE.Color(1, 1, 1) },
  uFoliageAmt: { value: 0 },
  /** Point the camera looks at (the player's chest); foliage between it and the camera dithers away. */
  uFocus: { value: new THREE.Vector3(0, -9999, 0) },
};

/**
 * Patches a built-in material so vertices sway with the wind, proportional to height².
 * Instance position is used as phase so neighbouring plants move out of sync.
 */
export function addWindSway<T extends THREE.Material>(material: T, strength: number, key: string, foliage = true, occlude = false): T {
  material.onBeforeCompile = (shader) => {
    if (occlude) {
      shader.uniforms.uFocus = sharedUniforms.uFocus;
      shader.fragmentShader = 'uniform vec3 uFocus;\nvarying vec3 vFadeW;\n' + shader.fragmentShader.replace(
        'void main() {',
        `void main() {
        {
          // Dither out foliage that sits between the camera and the player.
          vec3 sd = uFocus - cameraPosition;
          float t = clamp(dot(vFadeW - cameraPosition, sd) / max(dot(sd, sd), 0.001), 0.0, 1.0);
          float dl = length(vFadeW - (cameraPosition + sd * t));
          float amt = (1.0 - smoothstep(1.1, 2.6, dl)) * (1.0 - smoothstep(0.82, 0.97, t));
          amt = max(amt, 1.0 - smoothstep(1.6, 3.4, length(vFadeW - cameraPosition)));
          float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (amt * 1.1 - 0.05 > dither) discard;
        }`,
      );
    }
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uWind = sharedUniforms.uWind;
    shader.uniforms.uFoliage = sharedUniforms.uFoliage;
    shader.uniforms.uFoliageAmt = sharedUniforms.uFoliageAmt;
    if (foliage) {
      // Seasonal tint for bright, green-dominant colours (deciduous leaves and grass).
      // Dark conifer needles, bark and berries keep their colour.
      // Every plant turns at its own pace and to its own colour: some stay green, some go
      // gold, some go red (vFolVar is a per-plant random from its phase).
      shader.fragmentShader = 'uniform vec3 uFoliage;\nuniform float uFoliageAmt;\nvarying float vFolVar;\n' + shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float luma = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        float leafy = smoothstep(0.01, 0.06, diffuseColor.g - max(diffuseColor.r, diffuseColor.b)) * smoothstep(0.07, 0.12, luma);
        vec3 fol = uFoliage;
        if (vFolVar > 0.68) fol *= vec3(1.18, 0.62, 0.55);
        else if (vFolVar > 0.36) fol *= vec3(1.05, 1.12, 0.62);
        float turn = uFoliageAmt * (0.15 + 0.85 * fract(vFolVar * 7.31));
        diffuseColor.rgb = mix(diffuseColor.rgb, fol * luma * 2.3, leafy * turn);`,
      );
    }
    shader.vertexShader =
      'uniform float uTime;\nuniform float uWind;\nattribute float aH;\nattribute float aPhase;\nvarying float vFolVar;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float ph = ip.x * 0.37 + ip.z * 0.23;
        #else
          float ph = aPhase;
        #endif
        vFolVar = fract(sin(ph * 12.9898 + 4.1) * 43758.5453);
        float hgt = aH;
        float gust = 0.6 + 0.4 * sin(uTime * 0.31 + ph * 0.054);
        float sway = (sin(uTime * 1.35 + ph) * 0.65 + sin(uTime * 3.1 + ph * 1.7) * 0.22) * uWind * gust * ${strength.toFixed(5)} * hgt * hgt;
        transformed.x += sway;
        transformed.z += sway * 0.35;`,
      );
    if (occlude) {
      shader.vertexShader = 'varying vec3 vFadeW;\n' + shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        {
          vec4 fw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            fw = instanceMatrix * fw;
          #endif
          vFadeW = (modelMatrix * fw).xyz;
        }`,
      );
    }
  };
  material.customProgramCacheKey = () => `wind-${key}-${occlude}`;
  return material;
}

/** Creates the flat-shaded vertex-coloured material used by all procedural vegetation and rocks. */
export function vertexColorMaterial(standard: boolean, opts: { flat?: boolean; roughness?: number } = {}): THREE.Material {
  const flat = opts.flat ?? true;
  if (!standard) return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: flat });
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: flat, roughness: opts.roughness ?? 0.92, metalness: 0 });
}
