import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const CELL = 64;

/**
 * Merges static site meshes that share a material into one mesh per 64 m cell. Hundreds of
 * planks, posts and props become a few dozen draw calls, while cells still frustum-cull.
 * Meshes under an object flagged `userData.dynamic`, transparent (fading) materials, and
 * invisible subtrees are left alone.
 */
export function bakeStatic(root: THREE.Object3D): { before: number; after: number; replaced: Map<THREE.Mesh, THREE.Mesh> } {
  root.updateMatrixWorld(true);
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean; meshes: THREE.Mesh[] }>();
  let before = 0;
  const visit = (o: THREE.Object3D, skip: boolean) => {
    const dyn = skip || !!o.userData.dynamic || !o.visible;
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !(mesh as unknown as THREE.InstancedMesh).isInstancedMesh && !dyn) {
      const mat = mesh.material as THREE.Material;
      if (!Array.isArray(mesh.material)) {
        before++;
        const p = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
        const key = `${mat.uuid}:${Math.floor(p.x / CELL)}:${Math.floor(p.z / CELL)}:${Math.floor(p.y / 40)}:${mesh.castShadow}`;
        let g = groups.get(key);
        if (!g) groups.set(key, (g = { mat, geos: [], cast: mesh.castShadow, receive: mesh.receiveShadow, meshes: [] }));
        let geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geo.applyMatrix4(mesh.matrixWorld);
        for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        if (!geo.attributes.normal) geo.computeVertexNormals();
        geo = geo as THREE.BufferGeometry;
        g.geos.push(geo);
        g.meshes.push(mesh);
      }
    }
    for (const c of [...o.children]) visit(c, dyn);
  };
  visit(root, false);
  let after = 0;
  const replaced = new Map<THREE.Mesh, THREE.Mesh>();
  for (const g of groups.values()) {
    if (g.meshes.length < 2) {
      after += g.meshes.length;
      for (const geo of g.geos) geo.dispose();
      continue;
    }
    const merged = mergeGeometries(g.geos, false);
    for (const geo of g.geos) geo.dispose();
    if (!merged) {
      after += g.meshes.length;
      continue;
    }
    for (const m of g.meshes) m.parent?.remove(m);
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, g.mat);
    mesh.castShadow = g.cast;
    mesh.receiveShadow = g.receive;
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
    for (const m of g.meshes) replaced.set(m, mesh);
    after++;
  }
  return { before, after, replaced };
}
