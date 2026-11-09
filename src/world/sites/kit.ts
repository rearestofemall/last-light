import * as THREE from 'three';
import type { GameEventBus } from '../../core/events';
import type { CollisionWorld, Collider } from '../../physics/CollisionWorld';
import type { InteractionSystem } from '../../interaction/InteractionSystem';
import { paperTexture, plankTexture, shingleTexture, stoneTexture } from '../../render/textures';
import type { StoryState } from '../../story/StoryState';
import { INSPECT } from '../../story/notes';
import type { Surface, Terrain } from '../Terrain';

export interface SiteMaterials {
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  rust: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  ash: THREE.MeshStandardMaterial;
  charcoal: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  bone: THREE.MeshStandardMaterial;
}

export function createSiteMaterials(): SiteMaterials {
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  return {
    wood: std({ map: plankTexture(), color: 0xd8c3a8 }),
    woodDark: std({ map: plankTexture(), color: 0x8a7562 }),
    stone: std({ map: stoneTexture(), color: 0xc8c2b8 }),
    roof: std({ map: shingleTexture() }),
    cloth: std({ color: 0x66744a, side: THREE.DoubleSide, roughness: 1 }),
    fabric: std({ color: 0x8a3b2b, roughness: 1 }),
    metal: std({ color: 0x5d6166, metalness: 0.55, roughness: 0.55 }),
    rust: std({ color: 0x7b4b33, metalness: 0.3, roughness: 0.85 }),
    paper: std({ map: paperTexture(), emissive: 0x3a3426, emissiveIntensity: 0.6, roughness: 1 }),
    ash: std({ color: 0x3a3532, roughness: 1 }),
    charcoal: std({ color: 0x1c1a19, roughness: 1 }),
    asphalt: std({ color: 0x3b3b3d, roughness: 0.95 }),
    concrete: std({ color: 0x9a978f, roughness: 0.95 }),
    rock: std({ color: 0x7a766d, roughness: 0.95, flatShading: true }),
    bone: std({ color: 0xd8cfb8, roughness: 0.8 }),
  };
}

/** A group of surfaces that fade out while the player is inside a region (cut-away walls/roofs). */
export interface Fadeable {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  materials: THREE.Material[];
  /** Meshes using those materials; they stop casting shadows while faded. */
  meshes: THREE.Mesh[];
  opacity: number;
}

export interface SiteContext {
  terrain: Terrain;
  collision: CollisionWorld;
  interactions: InteractionSystem;
  story: StoryState;
  events: GameEventBus;
  group: THREE.Group;
  mats: SiteMaterials;
  fadeables: Fadeable[];
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function solid(ctx: SiteContext, x0: number, x1: number, y0: number, y1: number, surface: Surface, tag?: string): Collider {
  return ctx.collision.add({ minX: x0, maxX: x1, minY: y0, maxY: y1, kind: 'solid', surface, tag });
}

export function oneway(ctx: SiteContext, x0: number, x1: number, top: number, surface: Surface, tag?: string): Collider {
  return ctx.collision.add({ minX: x0, maxX: x1, minY: top - 0.3, maxY: top, kind: 'oneway', surface, tag });
}

/** Something that shows a short line of text when examined. */
export function inspectable(ctx: SiteContext, id: string, x: number, y: number, label: string, radius = 1.4): void {
  ctx.interactions.add({
    id,
    x,
    y,
    radius,
    verb: 'Examine',
    label,
    onInteract: () => {
      ctx.events.emit('toast', { text: INSPECT[id] ?? label, kind: 'info', duration: 6 });
      ctx.story.flags[`inspected:${id}`] = true;
    },
  });
}

/** A note or sign that opens in the reader. */
export function readable(ctx: SiteContext, noteId: string, x: number, y: number, label: string, verb = 'Read', radius = 1.3): void {
  ctx.interactions.add({ id: noteId, x, y, radius, verb, label, onInteract: () => ctx.story.openNote(noteId) });
}

/** Clone materials so a set of meshes can fade independently. */
export function fadeMaterial<T extends THREE.Material>(m: T): T {
  const c = m.clone() as T;
  c.transparent = true;
  return c;
}

/** Irregular boulder geometry with a flat top at height `h` (so it matches its collider). */
export function boulder(w: number, h: number, d: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 4, 3, 3).toNonIndexed();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const hash = (a: number, b: number, c: number) => {
    const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + seed) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = [Math.round(x * 100), Math.round(y * 100), Math.round(z * 100)];
    const top = y > h / 2 - 0.01;
    const jx = (hash(k[0], k[1], k[2]) - 0.5) * 0.35;
    const jy = top ? (hash(k[2], k[0], k[1]) - 0.5) * 0.06 : (hash(k[2], k[0], k[1]) - 0.5) * 0.3;
    const jz = (hash(k[1], k[2], k[0]) - 0.5) * 0.35;
    // Round the silhouette: pull corners inward.
    const sx = 1 - 0.12 * Math.abs(y / (h / 2)) * Math.abs(z / (d / 2));
    pos.setXYZ(i, x * sx + jx, y + jy, z * sx + jz);
  }
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return g;
}

/** Canvas texture with painted lettering, for signs. */
export function signTexture(lines: { text: string; size: number; color?: string }[], w = 512, h = 256, bg = '#5b4630'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, (h / 6) * i, w, 2);
  }
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 8;
  g.strokeRect(4, 4, w - 8, h - 8);
  const total = lines.reduce((a, l) => a + l.size * 1.25, 0);
  let y = (h - total) / 2;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (const l of lines) {
    g.font = `600 ${l.size}px Georgia, 'Times New Roman', serif`;
    g.fillStyle = l.color ?? '#e9dcc0';
    g.fillText(l.text, w / 2, y);
    y += l.size * 1.25;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
