import * as THREE from 'three';
import { sharedUniforms } from '../render/materials';
import type { Terrain } from './Terrain';
import { TERRAIN_Z_MAX, TERRAIN_Z_MIN } from './Terrain';
import type { RiverDef } from './WorldDef';

/**
 * River surfaces: a strip that follows the river's depth profile, with vertex waves,
 * analytic normals and flowing streaks added in the fragment stage.
 */
export function createWaterMaterial(color = 0x2f5a5c): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.84,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.vertexShader =
      'uniform float uTime;\nvarying vec3 vWPos;\n' +
      shader.vertexShader
        .replace(
          '#include <beginnormal_vertex>',
          `vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
          float k1 = 0.9, k2 = 1.7;
          float dx = 0.05 * k1 * cos(wp0.x * k1 + uTime * 1.3) + 0.03 * k2 * cos(wp0.x * k2 * 0.7 + wp0.z * k2 + uTime * 2.1) * 0.7;
          float dz = 0.04 * cos(wp0.z * 1.2 + uTime * 1.8) * 1.2 + 0.03 * k2 * cos(wp0.x * k2 * 0.7 + wp0.z * k2 + uTime * 2.1);
          vec3 objectNormal = normalize(vec3(-dx, 1.0, -dz));`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec3 transformed = vec3(position);
          transformed.y += 0.05 * sin(wp0.x * 0.9 + uTime * 1.3) + 0.04 * sin(wp0.z * 1.2 + uTime * 1.8) + 0.03 * sin(wp0.x * 1.2 + wp0.z * 1.7 + uTime * 2.1);
          vWPos = wp0;`,
        );
    shader.fragmentShader =
      'uniform float uTime;\nvarying vec3 vWPos;\n' +
      shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float flow = sin(vWPos.z * 0.9 + uTime * 2.2 + sin(vWPos.x * 1.3 + vWPos.z * 0.2) * 2.5);
        float streak = smoothstep(0.82, 1.0, flow) * (0.5 + 0.5 * sin(vWPos.x * 3.1 + uTime));
        gl_FragColor.rgb += vec3(0.75, 0.85, 0.85) * streak * 0.12;
        // Fresnel: grazing views mirror the sky/horizon and turn opaque; looking down you see in.
        float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
        #ifdef USE_FOG
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor * 1.05, fres * 0.55);
        #endif
        gl_FragColor.a = mix(gl_FragColor.a * 0.92, 0.97, fres);`,
      );
  };
  m.customProgramCacheKey = () => 'river-water';
  m.userData.water = true;
  return m;
}

export function createRiverMesh(terrain: Terrain, r: RiverDef, material: THREE.Material): THREE.Mesh {
  const halfW = r.width / 2 + r.bank + 12;
  const xs: number[] = [];
  for (let x = -halfW; x <= halfW + 0.01; x += 2) xs.push(r.x + x);
  const zs: number[] = [];
  for (let z = TERRAIN_Z_MAX; z >= TERRAIN_Z_MIN; z -= 3) zs.push(z);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j < zs.length; j++) {
    const y = terrain.riverWaterYAt(r, zs[j]);
    for (let i = 0; i < xs.length; i++) pos.push(xs[i], y, zs[j]);
  }
  const W = xs.length;
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < W - 1; i++) {
      const a = j * W + i;
      idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.renderOrder = 5;
  return mesh;
}
