import * as THREE from 'three';
import type { GameEventBus } from '../../core/events';
import type { CollisionWorld, Collider } from '../../physics/CollisionWorld';
import type { InteractionSystem } from '../../interaction/InteractionSystem';
import type { ContainerRegistry, Inventory } from '../../inventory/Inventory';
import type { ToolKind } from '../../inventory/items';
import { fireInteractable } from '../../building/BuildSystem';
import { type LightKind, type LightSource, type LightSystem, makeLight } from '../../lighting/LightSystem';
import { paperTexture, plankTexture, shingleTexture, stoneTexture, worldUvBox } from '../../render/textures';
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
  glass: THREE.MeshStandardMaterial;
  rug: THREE.MeshStandardMaterial;
  brick: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  tile: THREE.MeshStandardMaterial;
  books: THREE.MeshStandardMaterial[];
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
    glass: std({ color: 0x1d2a30, roughness: 0.2, metalness: 0.3 }),
    rug: std({ color: 0x6e3a2a, roughness: 1 }),
    brick: std({ map: stoneTexture(), color: 0xb46f55 }),
    white: std({ color: 0xe9e6de, roughness: 0.7 }),
    red: std({ color: 0xa8382c, roughness: 0.7 }),
    tile: std({ map: stoneTexture(), color: 0xd6d3c8, roughness: 0.6 }),
    books: [0x6b4b2e, 0x3f5a6b, 0x7a6a3a, 0x5a3a3a].map((c) => std({ color: c })),
  };
}

/** A group of surfaces that fade out while the player is inside a region (cut-away walls/roofs). */
export interface Fadeable {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  materials: THREE.Material[];
  /** Meshes using those materials; they stop casting shadows while faded. */
  meshes: THREE.Mesh[];
  opacity: number;
}

/** Interior volumes: count as full shelter (no rain, no wind). */
export interface Interior {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** Something in the world that changes once a story flag is set (rockslide cleared, etc.). */
export interface Gate {
  flag: string;
  apply(): void;
  applied?: boolean;
}

export interface SiteHost {
  /** Fade out, move the player, fade in. */
  travel(x: number, y: number, label?: string): void;
  hasTool(kind: ToolKind): boolean;
  wearTool(kind: ToolKind): void;
  beginWork(): boolean;
  startEnding(): void;
  openCrafting(): void;
}

/** A fixed crafting station placed by a site (e.g. the hardware store's workbench). */
export interface SiteStation {
  x: number;
  y: number;
  kind: 'workbench';
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
  interiors: Interior[];
  gates: Gate[];
  containers: ContainerRegistry;
  lights: LightSystem;
  inventory: Inventory;
  host: SiteHost;
  stations: SiteStation[];
  /** Animated non-player characters. */
  npcs: { update(dt: number): void }[];
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Full-map depth, for barriers that must not be walked around. */
export const FULL_Z: [number, number] = [-460, 460];

export function solid(ctx: SiteContext, x0: number, x1: number, y0: number, y1: number, surface: Surface, tag: string | undefined, z0: number, z1: number): Collider {
  return ctx.collision.add({ minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1, kind: 'solid', surface, tag });
}

export function oneway(ctx: SiteContext, x0: number, x1: number, top: number, surface: Surface, tag: string | undefined, z0: number, z1: number): Collider {
  return ctx.collision.add({ minX: x0, maxX: x1, minY: top - 0.3, maxY: top, minZ: z0, maxZ: z1, kind: 'oneway', surface, tag });
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

/** A searchable container with fixed starting loot (contents persist in saves). */
export function lootCrate(ctx: SiteContext, id: string, x: number, y: number, z: number, title: string, loot: [string, number][], size = 8, visual = true): void {
  ctx.containers.register(id, title, size, loot);
  if (visual) {
    const m = mesh(worldUvBox(0.8, 0.7, 0.7, 0.8), ctx.mats.woodDark, x, y + 0.35, z, ctx.group);
    m.rotation.y = 0.15;
    mesh(new THREE.BoxGeometry(0.84, 0.06, 0.74), ctx.mats.metal, x, y + 0.5, z, ctx.group).rotation.y = 0.15;
  }
  ctx.interactions.add({
    id,
    x,
    y: y + 0.6,
    z,
    radius: 1.8,
    verb: 'Search',
    label: title.toLowerCase(),
    prompt: () => {
      const inv = ctx.containers.get(id)?.inv;
      const empty = inv ? inv.slots.every((s) => !s) : true;
      return `Search ${title.toLowerCase()}${empty ? ' (empty)' : ''}`;
    },
    onInteract: () => {
      ctx.events.emit('sfx', { name: 'chest', x });
      ctx.events.emit('container:open', { id, title });
    },
  });
}

/** A fixed, refuelable light: fire barrels, oil lamps. Lit at start if fuel is given. */
export function fixedLight(ctx: SiteContext, id: string, kind: LightKind, x: number, y: number, z: number, fuel: number, lit = true): LightSource {
  const light = makeLight(id, kind, x, y, z);
  light.fuel = fuel;
  light.on = lit && fuel > 0;
  light.sheltered = true;
  if (kind === 'barrel') {
    mesh(new THREE.CylinderGeometry(0.4, 0.38, 0.95, 12, 1, true), ctx.mats.rust, x, y - 0.5, z, ctx.group).material = ctx.mats.rust;
    mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 12), ctx.mats.charcoal, x, y - 0.1, z, ctx.group, false);
    light.sheltered = false;
  }
  ctx.lights.add(light);
  const it = fireInteractable(id, light, x, y + 0.2, ctx.inventory, ctx.lights, ctx.events);
  it.z = z;
  it.radius = 2;
  ctx.interactions.add(it);
  return light;
}

/** A pair of linked entrances (stairs, hatches, ladders) that move the player between levels. */
export function passage(ctx: SiteContext, id: string, a: { x: number; y: number; label: string }, b: { x: number; y: number; label: string }): void {
  const link = (from: typeof a, to: typeof b, k: string) =>
    ctx.interactions.add({
      id: `${id}-${k}`,
      x: from.x,
      y: from.y + 0.9,
      radius: 1.4,
      verb: '',
      label: '',
      priority: 0.2,
      prompt: () => from.label,
      onInteract: () => ctx.host.travel(to.x, to.y),
    });
  link(a, b, 'a');
  link(b, a, 'b');
}
