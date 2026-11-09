import * as THREE from 'three';
import { plankTexture, shingleTexture, stoneTexture, worldUvBox } from '../render/textures';

export const CELL = 2;
export const LEVEL_H = 3;

export type Slot = 'floor' | 'edge' | 'roof' | 'furn';

export interface PieceDef {
  id: string;
  name: string;
  slot: Slot;
  /** Inventory item consumed when placing. */
  item: string;
}

export const PIECES: Record<string, PieceDef> = {
  floor: { id: 'floor', name: 'Wooden Floor', slot: 'floor', item: 'floor' },
  wall: { id: 'wall', name: 'Wooden Wall', slot: 'edge', item: 'wall' },
  backwall: { id: 'backwall', name: 'Plank Wall', slot: 'edge', item: 'backwall' },
  window: { id: 'window', name: 'Window Wall', slot: 'edge', item: 'window' },
  door: { id: 'door', name: 'Door', slot: 'edge', item: 'door' },
  roof: { id: 'roof', name: 'Roof', slot: 'roof', item: 'roof' },
  campfire: { id: 'campfire', name: 'Campfire', slot: 'furn', item: 'campfire' },
  chest: { id: 'chest', name: 'Storage Chest', slot: 'furn', item: 'chest' },
  bedroll: { id: 'bedroll', name: 'Bedroll', slot: 'furn', item: 'bedroll' },
  bed: { id: 'bed', name: 'Bed', slot: 'furn', item: 'bed' },
  table: { id: 'table', name: 'Table', slot: 'furn', item: 'table' },
  workbench: { id: 'workbench', name: 'Workbench', slot: 'furn', item: 'workbench' },
  lamp: { id: 'lamp', name: 'Oil Lamp', slot: 'furn', item: 'lamp' },
};

let mats: Record<string, THREE.MeshStandardMaterial> | null = null;
export function pieceMaterials(): Record<string, THREE.MeshStandardMaterial> {
  if (mats) return mats;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, ...o });
  mats = {
    wood: std({ map: plankTexture(), color: 0xe0cbb0 }),
    light: std({ map: plankTexture(), color: 0xf0e2c8 }),
    dark: std({ map: plankTexture(), color: 0x8d7863 }),
    roof: std({ map: shingleTexture(), color: 0xd0c4b8 }),
    stone: std({ map: stoneTexture() }),
    cloth: std({ color: 0x6d7b4e }),
    red: std({ color: 0x8a3b2b }),
    metal: std({ color: 0x5d6166, metalness: 0.5, roughness: 0.5 }),
    glass: std({ color: 0x1d2a30, roughness: 0.2, metalness: 0.3 }),
    char: std({ color: 0x1c1a19 }),
  };
  return mats;
}

function add(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/**
 * Builds the visual for a piece in local space.
 *  - Cell pieces: origin at the cell's (minX, floorY, minZ) corner; content in [0, 2] × [0, 2].
 *  - Edge pieces: a wall along +z from the origin, 2 m long, centred on x = 0
 *    (rotated by the caller for walls along x).
 */
export function buildPieceMesh(id: string, groundLevel: boolean): { group: THREE.Group; door?: THREE.Object3D; lid?: THREE.Object3D } {
  const m = pieceMaterials();
  const g = new THREE.Group();
  const C = CELL;
  const h = C / 2;
  let door: THREE.Object3D | undefined;
  let lid: THREE.Object3D | undefined;
  switch (id) {
    case 'floor':
      add(g, worldUvBox(C, 0.3, C, 1.3), m.dark, h, -0.15, h);
      if (groundLevel) for (const x of [0.2, C - 0.2]) for (const z of [0.2, C - 0.2]) add(g, worldUvBox(0.35, 1.4, 0.35), m.stone, x, -0.85, z);
      break;
    case 'wall':
    case 'backwall':
      add(g, worldUvBox(0.22, LEVEL_H, C, 1.2), id === 'wall' ? m.wood : m.light, 0, LEVEL_H / 2, h);
      add(g, new THREE.CylinderGeometry(0.12, 0.14, LEVEL_H, 6), m.dark, 0, LEVEL_H / 2, 0);
      break;
    case 'window':
      add(g, worldUvBox(0.22, 0.9, C), m.wood, 0, 0.45, h);
      add(g, worldUvBox(0.22, LEVEL_H - 2.1, C), m.wood, 0, 2.1 + (LEVEL_H - 2.1) / 2, h);
      add(g, worldUvBox(0.22, 1.2, 0.35), m.wood, 0, 1.5, 0.175);
      add(g, worldUvBox(0.22, 1.2, 0.35), m.wood, 0, 1.5, C - 0.175);
      add(g, new THREE.BoxGeometry(0.04, 1.2, C - 0.7), m.glass, 0, 1.5, h, false);
      add(g, new THREE.CylinderGeometry(0.12, 0.14, LEVEL_H, 6), m.dark, 0, LEVEL_H / 2, 0);
      break;
    case 'door': {
      const dh = 2.3;
      add(g, worldUvBox(0.22, LEVEL_H - dh, C), m.wood, 0, dh + (LEVEL_H - dh) / 2, h);
      add(g, worldUvBox(0.22, dh, 0.25), m.dark, 0, dh / 2, 0.125);
      add(g, worldUvBox(0.22, dh, 0.25), m.dark, 0, dh / 2, C - 0.125);
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, 0.25);
      g.add(pivot);
      add(pivot, worldUvBox(0.08, dh - 0.05, C - 0.5), m.dark, 0, (dh - 0.05) / 2, (C - 0.5) / 2);
      add(pivot, new THREE.SphereGeometry(0.05, 6, 4), m.metal, 0.08, 1.1, C - 0.75);
      door = pivot;
      break;
    }
    case 'roof': {
      const slab = add(g, worldUvBox(C + 0.15, 0.2, C + 0.15, 1.6), m.roof, h, LEVEL_H + 0.1, h);
      slab.castShadow = true;
      add(g, worldUvBox(C, 0.16, 0.16), m.dark, h, LEVEL_H - 0.08, 0.08);
      break;
    }
    case 'campfire': {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const s = add(g, new THREE.DodecahedronGeometry(0.17, 0), m.stone, h + Math.cos(a) * 0.55, 0.08, h + Math.sin(a) * 0.5);
        s.rotation.set(i, i * 2, 0);
      }
      for (let i = 0; i < 4; i++) {
        const log = add(g, new THREE.CylinderGeometry(0.06, 0.08, 0.8, 6), m.dark, h, 0.12, h);
        log.rotation.set(Math.PI / 2 - 0.3, (i / 4) * Math.PI * 2, 0);
      }
      add(g, new THREE.CylinderGeometry(0.45, 0.5, 0.05, 10), m.char, h, 0.02, h, false);
      break;
    }
    case 'chest': {
      add(g, worldUvBox(1.1, 0.55, 0.65, 0.7), m.dark, h, 0.28, h);
      const lp = new THREE.Group();
      lp.position.set(h, 0.55, h - 0.33);
      g.add(lp);
      add(lp, worldUvBox(1.14, 0.14, 0.68, 0.7), m.wood, 0, 0.07, 0.33);
      lid = lp;
      break;
    }
    case 'bedroll':
      add(g, new THREE.BoxGeometry(0.8, 0.14, 1.8), m.cloth, h, 0.07, h);
      add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.8, 8).rotateZ(Math.PI / 2), m.red, h, 0.17, h - 0.8);
      break;
    case 'bed':
      add(g, worldUvBox(0.95, 0.4, 1.9), m.dark, h, 0.25, h);
      add(g, new THREE.BoxGeometry(0.86, 0.16, 1.8), m.cloth, h, 0.52, h);
      add(g, new THREE.BoxGeometry(0.9, 0.1, 1.1), m.red, h, 0.62, h + 0.3);
      add(g, worldUvBox(0.95, 0.9, 0.1), m.dark, h, 0.45, h - 0.95);
      break;
    case 'table':
      add(g, worldUvBox(1.6, 0.08, 0.9), m.dark, h, 0.88, h);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new THREE.BoxGeometry(0.08, 0.84, 0.08), m.dark, h + sx * 0.7, 0.42, h + sz * 0.35);
      break;
    case 'workbench':
      add(g, worldUvBox(1.8, 0.12, 0.9), m.wood, h, 0.9, h);
      for (const sx of [-1, 1]) add(g, worldUvBox(0.12, 0.84, 0.8), m.dark, h + sx * 0.8, 0.42, h);
      add(g, worldUvBox(1.6, 0.06, 0.7), m.dark, h, 0.3, h);
      add(g, new THREE.BoxGeometry(0.25, 0.18, 0.16), m.metal, h + 0.6, 1.05, h + 0.2);
      add(g, worldUvBox(1.8, 1.2, 0.08), m.dark, h, 1.55, h - 0.45);
      break;
    case 'lamp':
      add(g, new THREE.CylinderGeometry(0.05, 0.06, 2.1, 6), m.dark, h, 1.05, h);
      add(g, new THREE.BoxGeometry(0.6, 0.06, 0.06), m.dark, h + 0.25, 2.05, h);
      add(g, new THREE.CylinderGeometry(0.11, 0.13, 0.28, 8), m.metal, h + 0.5, 1.82, h);
      break;
  }
  return { group: g, door, lid };
}

const ghostOk = new THREE.MeshBasicMaterial({ color: 0x7fd27a, transparent: true, opacity: 0.38, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xe0644c, transparent: true, opacity: 0.38, depthWrite: false });
const ghostRemove = new THREE.MeshBasicMaterial({ color: 0xe0a24c, transparent: true, opacity: 0.32, depthWrite: false });

export function ghostMaterial(state: 'ok' | 'bad' | 'remove'): THREE.Material {
  return state === 'ok' ? ghostOk : state === 'bad' ? ghostBad : ghostRemove;
}
