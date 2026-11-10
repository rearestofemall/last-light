import * as THREE from 'three';
import { Rng } from '../../core/rng';
import { sharedUniforms } from '../../render/materials';

/*
 * A ridge tent: sagging canvas panels between a ridge pole and pegged eaves, a closed back,
 * a door with one flap tied back and one hanging loose, guy lines to wooden stakes, and a
 * groundsheet with a rolled sleeping bag inside. The canvas billows and the loose flap sways
 * in the wind (a vertex-shader layer driven by the shared wind uniforms).
 */

export interface TentOptions {
  /** Canvas colour. */
  color: number;
  width?: number;
  length?: number;
  height?: number;
  seed?: number;
}

const canvasMats = new Map<number, THREE.MeshStandardMaterial>();

/** Canvas material that ripples where the `aFlex` attribute is high (panel middles, flaps). */
function canvasMaterial(color: number): THREE.MeshStandardMaterial {
  let m = canvasMats.get(color);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = sharedUniforms.uTime;
    s.uniforms.uWind = sharedUniforms.uWind;
    s.vertexShader = 'uniform float uTime;\nuniform float uWind;\nattribute float aFlex;\n' + s.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float billow = sin(uTime * 2.3 + position.z * 2.7 + position.x * 1.3) * 0.6 + sin(uTime * 5.1 + position.y * 4.0) * 0.25;
      transformed += objectNormal * billow * aFlex * 0.022 * (0.5 + uWind);`,
    );
  };
  m.customProgramCacheKey = () => 'tent-canvas';
  canvasMats.set(color, m);
  return m;
}

const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A thin cylinder between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, sides = 4): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), sides);
  g.translate(0, d.length() / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate(a.x, a.y, a.z);
}

/** Builds a tent with its door facing +z, centred on the origin of the returned group. */
export function buildTent(o: TentOptions): THREE.Group {
  const rng = new Rng(o.seed ?? 7);
  const W = o.width ?? 2.6;
  const L = o.length ?? 2.6;
  const H = o.height ?? 1.6;
  const g = new THREE.Group();
  g.userData.dynamic = true; // animated canvas: keep out of static baking
  const canvas = canvasMaterial(o.color);
  const hem = new THREE.MeshStandardMaterial({ color: shade(o.color, 0.72), roughness: 1, side: THREE.DoubleSide });
  const patchMat = new THREE.MeshStandardMaterial({ color: shade(o.color, 1.18), roughness: 1, side: THREE.DoubleSide });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4f36, roughness: 0.9 });
  const rope = new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d16, roughness: 1, side: THREE.DoubleSide });
  const sag = 0.09 + rng.range(0, 0.05);

  // ---- Side panels: grid from the ridge (v = 0) to the eave (v = 1), sagging between supports.
  const panel = (side: 1 | -1) => {
    const nu = 10;
    const nv = 5;
    const pos: number[] = [];
    const flex: number[] = [];
    const idx: number[] = [];
    for (let iu = 0; iu <= nu; iu++) {
      for (let iv = 0; iv <= nv; iv++) {
        const u = iu / nu;
        const v = iv / nv;
        const su = Math.sin(Math.PI * u);
        const sv = Math.sin(Math.PI * v);
        const x = side * v * (W / 2 + 0.06);
        const y = H * (1 - v) - sag * sv * (0.55 + 0.45 * su) + (v > 0.95 ? 0.02 : 0);
        const z = (u - 0.5) * L;
        // Push the sag inward (toward the tent's centre line) as well as down.
        pos.push(x - side * sag * 0.5 * sv * su, y, z);
        flex.push(sv * su);
      }
    }
    for (let iu = 0; iu < nu; iu++) {
      for (let iv = 0; iv < nv; iv++) {
        const a = iu * (nv + 1) + iv;
        const b = a + nv + 1;
        if (side > 0) idx.push(a, a + 1, b, b, a + 1, b + 1);
        else idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aFlex', new THREE.Float32BufferAttribute(flex, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    add(g, geo, canvas);
    // Hem along the eave and a reinforced seam down the middle.
    add(g, new THREE.BoxGeometry(0.03, 0.06, L).translate(side * (W / 2 + 0.06), 0.03, 0), hem);
    // A patch or two on this side.
    for (let p = 0; p < rng.int(0, 2); p++) {
      const u = rng.range(0.2, 0.8);
      const v = rng.range(0.3, 0.7);
      const pw = rng.range(0.18, 0.32);
      const ph = rng.range(0.14, 0.24);
      const patch = new THREE.PlaneGeometry(pw, ph);
      const slope = Math.atan2(H, W / 2);
      patch.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      patch.rotateZ(side > 0 ? -(Math.PI / 2 - slope) : Math.PI / 2 - slope);
      const sv = Math.sin(Math.PI * v);
      const m = add(g, patch, patchMat, false);
      m.position.set(side * (v * (W / 2) - sag * 0.5 * sv) + side * 0.015, H * (1 - v) - sag * sv + 0.012, (u - 0.5) * L);
    }
  };
  panel(1);
  panel(-1);

  // ---- Gable ends: a closed back, and a front with two door flaps.
  const tri = (x0: number, x1: number, apexX: number, apexY: number, z: number, mat: THREE.Material, flexy = false) => {
    const pos = [x0, 0, z, x1, 0, z, apexX, apexY, z];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aFlex', new THREE.Float32BufferAttribute(flexy ? [1, 0.2, 0] : [0, 0, 0], 1));
    geo.computeVertexNormals();
    return add(g, geo, mat);
  };
  tri(-W / 2, W / 2, 0, H, -L / 2, canvas);
  // Dark inside visible through the doorway.
  tri(-W / 2 + 0.05, W / 2 - 0.05, 0, H - 0.05, -L / 2 + 0.02, dark, false).castShadow = false;
  // Fixed side parts of the front gable around the door.
  tri(-W / 2, -0.5, 0, H, L / 2, canvas);
  tri(0.5, W / 2, 0, H, L / 2, canvas);
  // Left flap tied back against the wall; right flap hanging loose (sways in the wind).
  const tied = new THREE.Group();
  tied.position.set(-0.5, 0, L / 2 + 0.01);
  g.add(tied);
  const tiedGeo = new THREE.BufferGeometry();
  tiedGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.45, 0, 0, 0.5, H * 0.55, 0], 3));
  tiedGeo.setAttribute('aFlex', new THREE.Float32BufferAttribute([0, 0.3, 0.1], 1));
  tiedGeo.computeVertexNormals();
  add(tied, tiedGeo, canvas).rotation.y = -2.4;
  add(g, new THREE.TorusGeometry(0.05, 0.012, 4, 8).rotateY(Math.PI / 2).translate(-0.75, 0.75, L / 2 + 0.25), rope, false);
  const loose = new THREE.BufferGeometry();
  loose.setAttribute('position', new THREE.Float32BufferAttribute([0.5, 0, L / 2 + 0.02, 0.05, 0.02, L / 2 + 0.06, 0, H, L / 2 + 0.01], 3));
  loose.setAttribute('aFlex', new THREE.Float32BufferAttribute([0.4, 1, 0], 1));
  loose.computeVertexNormals();
  add(g, loose, canvas);

  // ---- Poles, ridge, guy lines and stakes.
  add(g, rod(new THREE.Vector3(0, 0, L / 2 + 0.03), new THREE.Vector3(0, H + 0.08, L / 2 + 0.03), 0.028, 6), wood);
  add(g, rod(new THREE.Vector3(0, 0, -L / 2 - 0.03), new THREE.Vector3(0, H + 0.08, -L / 2 - 0.03), 0.028, 6), wood);
  add(g, rod(new THREE.Vector3(0, H + 0.01, -L / 2 - 0.12), new THREE.Vector3(0, H + 0.01, L / 2 + 0.12), 0.025, 6), wood);
  const stake = (x: number, z: number) => {
    const s = add(g, new THREE.BoxGeometry(0.035, 0.22, 0.035).translate(0, 0.06, 0), wood);
    s.position.set(x, 0, z);
    s.rotation.set(z > 0 ? 0.35 : z < 0 ? -0.35 : 0, 0, x > 0 ? -0.35 : x < 0 ? 0.35 : 0);
    return new THREE.Vector3(x, 0.13, z);
  };
  for (const zs of [1, -1]) {
    const top = new THREE.Vector3(0, H + 0.06, zs * (L / 2 + 0.1));
    add(g, rod(top, stake(0, zs * (L / 2 + 1.25)), 0.007, 3), rope, false);
    for (const xs of [1, -1]) {
      const eave = new THREE.Vector3(xs * (W / 2 + 0.06), 0.05, zs * (L / 2 - 0.05));
      add(g, rod(eave, stake(xs * (W / 2 + 0.35), zs * (L / 2 + 0.1)), 0.006, 3), rope, false);
    }
  }
  for (const xs of [1, -1]) stake(xs * (W / 2 + 0.3), 0);

  // ---- Inside: groundsheet and a rolled sleeping bag.
  add(g, new THREE.PlaneGeometry(W - 0.4, L - 0.2).rotateX(-Math.PI / 2).translate(0, 0.015, 0), new THREE.MeshStandardMaterial({ color: 0x3d4a3a, roughness: 1 }), false);
  add(g, new THREE.CylinderGeometry(0.16, 0.16, 0.9, 10).rotateZ(Math.PI / 2).translate(-0.35, 0.16, -0.6), new THREE.MeshStandardMaterial({ color: rng.pick([0x7a3a2a, 0x2f4a6a, 0x5a6a3a]), roughness: 0.95 }));
  return g;
}
