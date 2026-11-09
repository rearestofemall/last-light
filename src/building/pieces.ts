import * as THREE from 'three';
import { plankTexture, shingleTexture, stoneTexture, worldUvBox } from '../render/textures';

export const CELL = 2;
export const LEVEL_H = 3;
export const Z_BACK = -3;
export const Z_FRONT = 1.5;
export const DEPTH = Z_FRONT - Z_BACK;

export type Slot = 'floor' | 'edge' | 'back' | 'roof' | 'furn';

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
  door: { id: 'door', name: 'Door', slot: 'edge', item: 'door' },
  backwall: { id: 'backwall', name: 'Back Wall', slot: 'back', item: 'backwall' },
  window: { id: 'window', name: 'Window Wall', slot: 'back', item: 'window' },
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

function add(g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, cast = true): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/**
 * Builds the visual for a piece in local space. Origin: x = left edge of the cell
 * (or the edge line for edge pieces), y = floor level of the piece's storey, z = 0 plane.
 */
export function buildPieceMesh(id: string, groundLevel: boolean): { group: THREE.Group; door?: THREE.Object3D; lid?: THREE.Object3D } {
  const m = pieceMaterials();
  const g = new THREE.Group();
  const zc = (Z_BACK + Z_FRONT) / 2;
  let door: THREE.Object3D | undefined;
  let lid: THREE.Object3D | undefined;
  switch (id) {
    case 'floor':
      add(g, worldUvBox(CELL, 0.3, DEPTH, 1.3), m.dark, CELL / 2, -0.15, zc);
      if (groundLevel) {
        for (const x of [0.25, CELL - 0.25]) for (const z of [Z_BACK + 0.3, Z_FRONT - 0.3]) add(g, worldUvBox(0.4, 1.2, 0.4), m.stone, x, -0.85, z);
      }
      break;
    case 'wall':
      add(g, worldUvBox(0.24, LEVEL_H, DEPTH), m.wood, 0, LEVEL_H / 2, zc);
      add(g, new THREE.CylinderGeometry(0.13, 0.15, LEVEL_H, 6), m.dark, 0, LEVEL_H / 2, Z_FRONT);
      break;
    case 'door': {
      const dh = 2.3;
      add(g, worldUvBox(0.24, LEVEL_H - dh, DEPTH), m.wood, 0, dh + (LEVEL_H - dh) / 2, zc);
      add(g, worldUvBox(0.24, dh, Z_FRONT - 1.0), m.wood, 0, dh / 2, (Z_FRONT + 1.0) / 2);
      add(g, worldUvBox(0.24, dh, -1.0 - Z_BACK), m.wood, 0, dh / 2, (-1.0 + Z_BACK) / 2);
      const pivot = new THREE.Group();
      pivot.position.set(0, 0, -1.0);
      g.add(pivot);
      add(pivot, worldUvBox(0.1, dh - 0.05, 2.0), m.dark, 0, (dh - 0.05) / 2, 1.0);
      add(pivot, new THREE.SphereGeometry(0.05, 6, 4), m.metal, 0.08, 1.1, 1.75);
      door = pivot;
      break;
    }
    case 'backwall':
      add(g, worldUvBox(CELL, LEVEL_H, 0.2), m.wood, CELL / 2, LEVEL_H / 2, Z_BACK);
      break;
    case 'window':
      add(g, worldUvBox(CELL, 0.9, 0.2), m.wood, CELL / 2, 0.45, Z_BACK);
      add(g, worldUvBox(CELL, LEVEL_H - 2.1, 0.2), m.wood, CELL / 2, 2.1 + (LEVEL_H - 2.1) / 2, Z_BACK);
      add(g, worldUvBox(0.35, 1.2, 0.2), m.wood, 0.175, 1.5, Z_BACK);
      add(g, worldUvBox(0.35, 1.2, 0.2), m.wood, CELL - 0.175, 1.5, Z_BACK);
      add(g, new THREE.PlaneGeometry(CELL - 0.7, 1.2), m.glass, CELL / 2, 1.5, Z_BACK + 0.02, false);
      add(g, new THREE.BoxGeometry(0.06, 1.2, 0.08), m.dark, CELL / 2, 1.5, Z_BACK + 0.06);
      break;
    case 'roof': {
      const slab = add(g, worldUvBox(CELL + 0.1, 0.22, DEPTH + 1.2, 1.6), m.roof, CELL / 2, LEVEL_H + 0.25, zc);
      slab.rotation.x = 0.12;
      add(g, worldUvBox(CELL, 0.18, 0.18), m.dark, CELL / 2, LEVEL_H - 0.05, Z_FRONT);
      break;
    }
    case 'campfire': {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const s = add(g, new THREE.DodecahedronGeometry(0.17, 0), m.stone, CELL / 2 + Math.cos(a) * 0.55, 0.08, -0.6 + Math.sin(a) * 0.45);
        s.rotation.set(i, i * 2, 0);
      }
      for (let i = 0; i < 4; i++) {
        const log = add(g, new THREE.CylinderGeometry(0.06, 0.08, 0.8, 6), m.dark, CELL / 2, 0.12, -0.6);
        log.rotation.set(Math.PI / 2 - 0.3, (i / 4) * Math.PI * 2, 0);
      }
      add(g, new THREE.CylinderGeometry(0.45, 0.5, 0.05, 10), m.char, CELL / 2, 0.02, -0.6, false);
      break;
    }
    case 'chest': {
      add(g, worldUvBox(1.1, 0.55, 0.65, 0.7), m.dark, CELL / 2, 0.28, -1.8);
      const lp = new THREE.Group();
      lp.position.set(CELL / 2, 0.55, -2.12);
      g.add(lp);
      add(lp, worldUvBox(1.14, 0.14, 0.68, 0.7), m.wood, 0, 0.07, 0.33);
      add(g, new THREE.BoxGeometry(1.16, 0.06, 0.04), m.metal, CELL / 2, 0.4, -1.46);
      lid = lp;
      break;
    }
    case 'bedroll':
      add(g, new THREE.BoxGeometry(1.8, 0.14, 0.75), m.cloth, CELL / 2, 0.07, -1.8);
      add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.75, 8).rotateX(Math.PI / 2), m.red, CELL / 2 - 0.8, 0.17, -1.8);
      break;
    case 'bed':
      add(g, worldUvBox(1.9, 0.4, 0.95), m.dark, CELL / 2, 0.25, -2.2);
      add(g, new THREE.BoxGeometry(1.8, 0.16, 0.86), m.cloth, CELL / 2, 0.52, -2.2);
      add(g, new THREE.BoxGeometry(1.1, 0.1, 0.9), m.red, CELL / 2 + 0.3, 0.62, -2.2);
      add(g, worldUvBox(0.1, 0.9, 0.95), m.dark, CELL / 2 - 0.95, 0.45, -2.2);
      break;
    case 'table':
      add(g, worldUvBox(1.6, 0.08, 0.9), m.dark, CELL / 2, 0.88, -0.4);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new THREE.BoxGeometry(0.08, 0.84, 0.08), m.dark, CELL / 2 + sx * 0.7, 0.42, -0.4 + sz * 0.35);
      break;
    case 'workbench':
      add(g, worldUvBox(1.8, 0.12, 0.9), m.wood, CELL / 2, 0.9, -1.9);
      for (const sx of [-1, 1]) add(g, worldUvBox(0.12, 0.84, 0.8), m.dark, CELL / 2 + sx * 0.8, 0.42, -1.9);
      add(g, worldUvBox(1.6, 0.06, 0.7), m.dark, CELL / 2, 0.3, -1.9);
      add(g, new THREE.BoxGeometry(0.25, 0.18, 0.16), m.metal, CELL / 2 + 0.6, 1.05, -1.6);
      add(g, new THREE.BoxGeometry(0.5, 0.04, 0.06), m.metal, CELL / 2 - 0.3, 0.98, -1.7);
      add(g, worldUvBox(1.8, 1.2, 0.08), m.dark, CELL / 2, 1.55, -2.35);
      break;
    case 'lamp':
      add(g, new THREE.CylinderGeometry(0.05, 0.06, 2.1, 6), m.dark, CELL / 2, 1.05, -1.2);
      add(g, new THREE.BoxGeometry(0.6, 0.06, 0.06), m.dark, CELL / 2 + 0.25, 2.05, -1.2);
      add(g, new THREE.CylinderGeometry(0.11, 0.13, 0.28, 8), m.metal, CELL / 2 + 0.5, 1.82, -1.2);
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
