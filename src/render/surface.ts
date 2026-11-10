import * as THREE from 'three';
import { TILING } from './textures';

/*
 * Surface detail without extra textures or UV work:
 *  - triplanar(): tiling textures (planks, stone, brick…) are sampled in world space from the
 *    three axis projections, so every mesh (merged, rotated, any UVs) gets the same texel
 *    density, and the texture's own brightness drives a derivative bump for relief.
 *  - groundDetail(): procedural grain on the terrain (soil speckle, clumps), fading with distance.
 *  - stoneDetail(): grain and pitting on rocks and boulders.
 * Each patch keeps any existing onBeforeCompile hook.
 */

const NOISE = /* glsl */ `
float sd_hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sd_noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sd_hash(i), sd_hash(i + vec3(1,0,0)), f.x), mix(sd_hash(i + vec3(0,1,0)), sd_hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sd_hash(i + vec3(0,0,1)), sd_hash(i + vec3(1,0,1)), f.x), mix(sd_hash(i + vec3(0,1,1)), sd_hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// Perturb the normal from a height's screen-space derivatives (Mikkelsen's bump mapping).
vec3 sd_bump(vec3 surfPos, vec3 n, float h, float scale) {
  vec3 sx = dFdx(surfPos); vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h)) * scale;
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * n - grad);
}
`;

const VERT_PARS = 'varying vec3 vSdPos;\nvarying vec3 vSdNormal;\n';
const VERT_BODY = /* glsl */ `
{
  vec4 sdp = vec4(transformed, 1.0);
  vec3 sdn = objectNormal;
  #ifdef USE_INSTANCING
    sdp = instanceMatrix * sdp;
    sdn = mat3(instanceMatrix) * sdn;
  #endif
  vSdPos = (modelMatrix * sdp).xyz;
  vSdNormal = normalize(mat3(modelMatrix) * sdn);
}
`;

type Shader = THREE.WebGLProgramParametersWithUniforms;

function chain(m: THREE.Material, key: string, patch: (s: Shader) => void): void {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (s, r) => {
    prev.call(m, s, r);
    patch(s);
  };
  m.customProgramCacheKey = () => `${prevKey()}|${key}`;
  m.needsUpdate = true;
}

function withWorldVaryings(s: Shader): void {
  if (s.vertexShader.includes('vSdPos')) return;
  s.vertexShader = VERT_PARS + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
  s.fragmentShader = VERT_PARS + NOISE + s.fragmentShader;
}

const patched = new WeakSet<THREE.Material>();

/** World-space triplanar sampling of a tiling map, with bump relief from its brightness. */
export function triplanar(m: THREE.MeshStandardMaterial | THREE.MeshLambertMaterial, metresPerRepeat = 1.2, bump = 0.9): void {
  if (patched.has(m) || !m.map) return;
  patched.add(m);
  const scale = (1 / metresPerRepeat).toFixed(4);
  chain(m, `tri${scale}-${bump}`, (s) => {
    withWorldVaryings(s);
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec3 triW = pow(abs(normalize(vSdNormal)), vec3(4.0));
        triW /= (triW.x + triW.y + triW.z);
        vec3 triP = vSdPos * ${scale};
        vec4 triTex = texture2D(map, vec2(triP.z, triP.y)) * triW.x + texture2D(map, triP.xz) * triW.y + texture2D(map, vec2(triP.x, triP.y)) * triW.z;
        diffuseColor *= triTex;
        float triH = dot(triTex.rgb, vec3(0.3, 0.59, 0.11));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        normal = sd_bump(-vViewPosition, normal, triH, ${(bump * 0.012).toFixed(4)});`,
      );
  });
}

/** Grainy soil and grass detail on the terrain; fades out with distance to avoid shimmer. */
export function groundDetail(m: THREE.Material): void {
  if (patched.has(m)) return;
  patched.add(m);
  chain(m, 'ground', (s) => {
    withWorldVaryings(s);
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float gdFade = 1.0 - smoothstep(25.0, 90.0, length(vViewPosition));
        float gdN = sd_noise(vSdPos * 1.7) * 0.5 + sd_noise(vSdPos * 5.3) * 0.3 + sd_noise(vSdPos * 0.45) * 0.2;
        float gdSpeck = step(0.86, sd_noise(vSdPos * 23.0));
        float gdH = gdN + gdSpeck * 0.3;
        // Large soft patches: drier, yellower ground and darker, lusher clumps (all distances).
        float gdPatch = sd_noise(vSdPos * 0.18);
        float gdClump = sd_noise(vSdPos * 0.9 + 7.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.04, 0.72), smoothstep(0.55, 0.85, gdPatch) * 0.45);
        diffuseColor.rgb *= 1.0 - smoothstep(0.6, 0.85, gdClump) * 0.16;
        diffuseColor.rgb *= mix(1.0, 0.74 + gdN * 0.52 - gdSpeck * 0.1, gdFade);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        normal = sd_bump(-vViewPosition, normal, gdH * gdFade, 0.006);`,
      );
  });
}

/** Grain, pitting and darker crevices on rock. */
export function stoneDetail(m: THREE.Material): void {
  if (patched.has(m)) return;
  patched.add(m);
  chain(m, 'stone', (s) => {
    withWorldVaryings(s);
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float sdFade = 1.0 - smoothstep(20.0, 70.0, length(vViewPosition));
        float sdN = sd_noise(vSdPos * 3.1) * 0.55 + sd_noise(vSdPos * 11.0) * 0.3 + sd_noise(vSdPos * 0.8) * 0.15;
        float sdPit = smoothstep(0.78, 0.92, sd_noise(vSdPos * 7.0 + 3.0));
        float sdH = sdN - sdPit * 0.5;
        diffuseColor.rgb *= mix(1.0, 0.8 + sdN * 0.4 - sdPit * 0.18, sdFade);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        normal = sd_bump(-vViewPosition, normal, sdH * sdFade, 0.008);`,
      );
  });
}

/**
 * Upgrade every material under `root` that uses a tiling texture to world-space triplanar
 * mapping. Decals (signs, paper, facades) keep their UVs.
 */
export function applySurfaces(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const m = mat as THREE.MeshStandardMaterial;
      if ((m.isMeshStandardMaterial || (m as unknown as THREE.MeshLambertMaterial).isMeshLambertMaterial) && m.map && TILING.has(m.map)) triplanar(m);
      else if (m.isMeshStandardMaterial && m.userData.stone) stoneDetail(m);
    }
  });
}
