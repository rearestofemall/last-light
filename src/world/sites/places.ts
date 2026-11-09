import * as THREE from 'three';
import { Rng } from '../../core/rng';
import { worldUvBox } from '../../render/textures';
import { RIVERS } from '../WorldDef';
import { buildCabin, CABIN_FLOOR, furniture } from './cabin';
import { boulder, fixedLight, FULL_Z, inspectable, lootCrate, mesh, oneway, readable, type SiteContext, signTexture, solid } from './kit';

/** Where the player wakes: a cold camp with J.'s note. */
export function campsite(ctx: SiteContext, x: number): void {
  const g = ctx.terrain.heightAt(x);
  const grp = new THREE.Group();
  grp.position.set(x, g, 0);
  ctx.group.add(grp);
  const { mats } = ctx;

  // A-frame tent behind the plane
  const tent = new THREE.Group();
  tent.position.set(-4.0, 0, -3.4);
  tent.rotation.y = 0.12;
  grp.add(tent);
  const tentShape = new THREE.Shape();
  tentShape.moveTo(-1.3, 0);
  tentShape.lineTo(1.3, 0);
  tentShape.lineTo(0, 1.6);
  tentShape.closePath();
  // Triangular end faces the camera so the silhouette reads as a tent.
  const tentGeo = new THREE.ExtrudeGeometry(tentShape, { depth: 2.6, bevelEnabled: false });
  tentGeo.translate(0, 0, -2.6);
  mesh(tentGeo, mats.cloth, 0, 0, 1.3, tent);
  // Dark opening and a pegged-back flap
  const door = new THREE.Shape();
  door.moveTo(-0.55, 0);
  door.lineTo(0.55, 0);
  door.lineTo(0, 1.15);
  door.closePath();
  mesh(new THREE.ShapeGeometry(door), new THREE.MeshStandardMaterial({ color: 0x1b1d16, roughness: 1 }), 0, 0.01, 1.31, tent, false);
  const flapShape = new THREE.Shape();
  flapShape.moveTo(0, 0);
  flapShape.lineTo(0.75, 0);
  flapShape.lineTo(0, 1.15);
  flapShape.closePath();
  const flap = mesh(new THREE.ShapeGeometry(flapShape), mats.cloth, 0.55, 0.01, 1.32, tent);
  flap.rotation.y = -0.5;
  for (const sx of [-1, 1]) {
    const guy = mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.3, 3), mats.bone, sx * 1.6, 0.5, 1.4, tent, false);
    guy.rotation.z = sx * 0.95;
  }
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.75, 5), mats.woodDark, 0, 0.87, 1.36, tent);
  // Note pinned to the front pole
  mesh(new THREE.PlaneGeometry(0.26, 0.34), mats.paper, -0.18, 1.0, 1.4, tent, false);
  readable(ctx, 'j-note-1', x - 4.0, g + 1.1, 'Note on the tent', 'Read', 1.6);

  // Cold fire ring
  const fire = new THREE.Group();
  fire.position.set(2.2, 0, -0.9);
  grp.add(fire);
  const rng = new Rng(7);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const st = mesh(new THREE.DodecahedronGeometry(rng.range(0.16, 0.24), 0), mats.rock, Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.5, fire);
    st.rotation.set(rng.float() * 3, rng.float() * 3, 0);
  }
  mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.06, 12), mats.ash, 0, 0.03, 0, fire, false);
  for (let i = 0; i < 4; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.8, 6), mats.charcoal, 0, 0.12, 0, fire);
    log.rotation.set(Math.PI / 2 - 0.25, (i / 4) * Math.PI * 2, 0);
  }
  inspectable(ctx, 'cold-fire', x + 2.2, g + 0.5, 'Cold campfire');

  // Log seat, pot and spilled pack
  const seat = mesh(new THREE.CylinderGeometry(0.28, 0.3, 2.2, 8).rotateZ(Math.PI / 2), mats.woodDark, 4.8, 0.28, -2.4, grp);
  seat.rotation.y = 0.3;
  mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.25, 10), mats.metal, 3.0, 0.13, -1.7, grp);
  mesh(new THREE.BoxGeometry(0.45, 0.55, 0.3), new THREE.MeshStandardMaterial({ color: 0x5a6b7a, roughness: 0.95 }), -1.8, 0.27, -2.2, grp).rotation.z = 0.5;
  lootCrate(ctx, 'camp-pack', x - 1.8, g, -2.2, 'Your backpack’s spare pocket', [['berries', 4], ['water_clean', 1], ['bottle', 1], ['bandage', 1], ['torch', 1]], 8, false);
}

/** Trailhead sign board. */
export function trailhead(ctx: SiteContext, x: number): void {
  const g = ctx.terrain.heightAt(x);
  const grp = new THREE.Group();
  grp.position.set(x, g, -1.6);
  ctx.group.add(grp);
  for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 6), ctx.mats.woodDark, sx * 1.1, 1.3, 0, grp);
  const tex = signTexture([
    { text: 'PINEBROOK', size: 64 },
    { text: 'TRAILHEAD', size: 44 },
    { text: '→ Ranger Station   ← Halcyon Pass (closed)', size: 22, color: '#d9c9a4' },
  ]);
  const board = mesh(new THREE.BoxGeometry(2.6, 1.3, 0.1), ctx.mats.woodDark, 0, 1.9, 0.12, grp);
  board.material = [
    ctx.mats.woodDark,
    ctx.mats.woodDark,
    ctx.mats.woodDark,
    ctx.mats.woodDark,
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
    ctx.mats.woodDark,
  ];
  mesh(new THREE.BoxGeometry(3.0, 0.1, 0.4), ctx.mats.roof, 0, 2.62, 0.1, grp);
  readable(ctx, 'trail-sign', x, g + 1.5, 'Trail sign');
}

/** A fallen trunk spanning the Blackwater river. */
export function logBridge(ctx: SiteContext): void {
  const r = RIVERS.find((rv) => rv.id === 'blackwater')!;
  const bank = ctx.terrain.base(r.x);
  const x0 = r.x - r.width / 2 - r.bank - 0.5;
  const x1 = r.x + r.width / 2 + r.bank + 0.5;
  const len = x1 - x0;
  const radius = 0.45;
  const cy = bank + 0.05;
  const geo = new THREE.CylinderGeometry(radius, radius * 1.2, len, 10, 6).rotateZ(Math.PI / 2);
  mesh(geo, ctx.mats.woodDark, (x0 + x1) / 2, cy, 0, ctx.group);
  // Root plate and broken branches for character
  mesh(new THREE.CylinderGeometry(1.4, 1.2, 0.5, 9).rotateZ(Math.PI / 2), ctx.mats.woodDark, x1 + 0.2, cy + 0.3, -0.3, ctx.group);
  for (const bx of [0.3, 0.55, 0.8]) {
    const br = mesh(new THREE.CylinderGeometry(0.05, 0.1, 1.4, 5), ctx.mats.woodDark, x0 + len * bx, cy + 0.5, -0.5, ctx.group);
    br.rotation.set(-0.6, 0, bx * 2);
  }
  solid(ctx, x0, x1, cy - radius, cy + radius, 'wood', 'log-bridge', -radius, radius);
}

/** Boulder ledges that let the player climb Eastridge's western cliff. */
export function ridgeLedges(ctx: SiteContext): void {
  const t = ctx.terrain;
  const foot = t.heightAt(190);
  const top = t.heightAt(204);
  const rise = top - foot;
  const steps: [number, number, number][] = [
    [190.8, 194.4, 0.26],
    [194.4, 197.6, 0.52],
    [197.6, 201.6, 0.76],
  ];
  steps.forEach(([x0, x1, f], i) => {
    const h = foot + rise * f;
    const base = Math.min(t.heightAt(x0), t.heightAt(x1)) - 0.6;
    const depth = 4.2 + i * 0.6;
    const zc = -0.4 - i * 0.3;
    const geo = boulder(x1 - x0 + 0.2, h - base, depth, 3 + i);
    mesh(geo, ctx.mats.rock, (x0 + x1) / 2, base, zc, ctx.group);
    solid(ctx, x0, x1, base, h, 'rock', undefined, zc - depth / 2, zc + depth / 2);
  });
  // Scree at the foot of the cliff, in front of the plane, to break up the slope face.
  const rng = new Rng(51);
  for (let i = 0; i < 7; i++) {
    const z = 2.2 + i * 1.6 + rng.range(-0.4, 0.4);
    const x = 200.4 + rng.range(-0.8, 1.2);
    const s = rng.range(0.7, 1.6);
    const geo = new THREE.DodecahedronGeometry(s, 0);
    const m = mesh(geo, ctx.mats.rock, x, t.heightAt3(x - 1.5, z) + s * 0.4, z, ctx.group);
    m.rotation.set(rng.float() * 3, rng.float() * 3, 0);
    m.scale.y = 0.7;
  }
}

export function rangerStation(ctx: SiteContext, x: number): void {
  const cab = buildCabin(ctx, { x, width: 12, height: 4.1, zBack: -4.5, zFront: 2, loft: { x0: -6, x1: -2.6, height: 2.05 } });
  const p = cab.group;
  furniture.rug(ctx, p, 1.2, -1.2);
  const deskTop = furniture.table(ctx, p, 0.6, -3.3, 2.0);
  furniture.chair(ctx, p, 0.6, -2.3, Math.PI);
  furniture.bed(ctx, p, 4.4, -3.6);
  furniture.stove(ctx, p, -1.6, -3.9, 4.1);
  furniture.shelf(ctx, p, 3.6, 2.3, -4.2);
  furniture.crate(ctx, p, -1.9, -0.2, 0.85);
  furniture.crate(ctx, p, -4.6, -3.6, 0.7, CABIN_FLOOR + 2.05);
  // Radio on the desk
  mesh(new THREE.BoxGeometry(0.6, 0.32, 0.3), ctx.mats.metal, 1.2, deskTop + 0.16, -3.4, p);
  mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.7, 4), ctx.mats.metal, 1.4, deskTop + 0.65, -3.4, p);
  furniture.paper(ctx, p, 0.2, deskTop, -3.2);
  // Sleeping bag in the loft
  mesh(new THREE.BoxGeometry(1.8, 0.18, 0.8), ctx.mats.fabric, -4.6, CABIN_FLOOR + 2.15, -1.6, p);
  furniture.paper(ctx, p, -3.6, CABIN_FLOOR + 2.24, -1.4, -0.4);

  // The crate by the ladder sits on the gameplay plane: a step up to the loft.
  oneway(ctx, x - 1.9 - 0.42, x - 1.9 + 0.42, cab.floorY + 0.85, 'wood', undefined, -0.62, 0.22);
  readable(ctx, 'ranger-log', x + 0.2, cab.floorY + 1.0, "Ranger's log");
  inspectable(ctx, 'radio', x + 1.3, cab.floorY + 1.0, 'Field radio', 0.8);
  readable(ctx, 'j-note-2', x - 3.6, cab.floorY + 2.4, 'Note in the loft');
  readable(ctx, 'ranger-manual', x + 3.6, cab.floorY + 1.0, 'Field manual on the shelf', 'Read', 1);
  lootCrate(ctx, 'ranger-crate', x + 5.2, cab.floorY, -0.3, 'Supply crate', [['canned_food', 2], ['cloth', 3], ['fuel', 1], ['bottle', 1], ['fiber', 4]]);
  lootCrate(ctx, 'ranger-loft-crate', x - 5.2, cab.floorY + 2.05, -0.4, 'Loft crate', [['hide', 2], ['bandage', 1], ['wood', 6]], 8);
  fixedLight(ctx, 'ranger-lamp', 'lamp', x - 0.6, cab.floorY + 2.6, -2.5, 300, false);

  // Sign over the door
  const tex = signTexture([{ text: 'RANGER STATION 4', size: 52 }], 512, 110);
  mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), 0, CABIN_FLOOR + 4.1 + 0.6, -4.3, p);
}

export function huntersLodge(ctx: SiteContext, x: number): void {
  const cab = buildCabin(ctx, { x, width: 9, height: 3.6, zBack: -4, zFront: 2 });
  const p = cab.group;
  furniture.rug(ctx, p, 0, -1);
  const top = furniture.table(ctx, p, -1.4, -2.9, 1.6);
  furniture.chair(ctx, p, -1.4, -2.0, Math.PI);
  furniture.bed(ctx, p, 2.6, -3.2);
  furniture.stove(ctx, p, -3.6, -3.4, 3.6);
  furniture.shelf(ctx, p, 1.8, 2.1, -3.75, 1.4);
  furniture.paper(ctx, p, -1.2, top, -2.8, 0.5);
  furniture.crate(ctx, p, 3.4, -0.6, 0.7);
  // Antlers above the bed
  const ant = new THREE.Group();
  ant.position.set(2.6, CABIN_FLOOR + 2.7, -3.85);
  p.add(ant);
  mesh(new THREE.BoxGeometry(0.5, 0.35, 0.06), ctx.mats.woodDark, 0, 0, 0, ant);
  for (const sx of [-1, 1]) {
    const a = mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.8, 5), ctx.mats.bone, sx * 0.3, 0.3, 0.1, ant);
    a.rotation.z = -sx * 0.6;
    const t2 = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.35, 5), ctx.mats.bone, sx * 0.35, 0.45, 0.1, ant);
    t2.rotation.z = sx * 0.4;
  }
  // Empty gun rack
  mesh(new THREE.BoxGeometry(1.2, 0.08, 0.12), ctx.mats.woodDark, -3.0, CABIN_FLOOR + 2.2, -3.85, p);
  mesh(new THREE.BoxGeometry(1.2, 0.08, 0.12), ctx.mats.woodDark, -3.0, CABIN_FLOOR + 1.6, -3.85, p);
  readable(ctx, 'hunter-journal', x - 1.2, cab.floorY + 1.0, "Hunter's journal");
  readable(ctx, 'photo-1', x + 2.6, cab.floorY + 1.0, 'Photograph above the bed', 'Look at', 1);
  lootCrate(ctx, 'lodge-crate', x + 3.4, cab.floorY, -0.6, 'Hunter’s chest', [['hide', 3], ['raw_meat', 2], ['fuel', 2], ['fiber', 6], ['knife', 1]], 8, false);
  fixedLight(ctx, 'lodge-lamp', 'lamp', x + 0.6, cab.floorY + 2.5, -2.5, 600, true);
}

/** Rockslide sealing the western trail (Halcyon Pass, opens in a later milestone). */
export function westBlockade(ctx: SiteContext, x: number): void {
  const g = ctx.terrain.heightAt(x);
  const rng = new Rng(99);
  const pile = new THREE.Group();
  pile.userData.dynamic = true;
  ctx.group.add(pile);
  for (let i = 0; i < 26; i++) {
    const s = rng.range(1.2, 3.4);
    const geo = new THREE.DodecahedronGeometry(s, 0);
    const bx = x + rng.range(-5, 5);
    const bz = rng.range(-22, 10);
    const by = g + rng.range(-0.5, 3 + (5 - Math.abs(bx - x)) * 0.8) - Math.max(0, bz) * 0.08;
    const m = mesh(geo, ctx.mats.rock, bx, by, bz, Math.abs(bz) < 6 ? pile : ctx.group);
    m.rotation.set(rng.float() * 3, rng.float() * 3, rng.float() * 3);
    m.scale.y = rng.range(0.6, 1);
  }
  // Fills the notch in the border ridge: the only way into the Frostlands.
  const wall = solid(ctx, x - 6, x + 3.5, g - 6, g + 16, 'rock', 'blockade:west', -20, 20);
  let progress = 0;
  const it = {
    id: 'rockslide',
    x: x + 5.2,
    y: g + 1,
    radius: 2.2,
    verb: '',
    label: '',
    prompt: () => (ctx.host.hasTool('pickaxe') ? `Dig through the rockslide (${progress}/6)` : 'Examine the rockslide'),
    onInteract: () => {
      if (!ctx.host.hasTool('pickaxe')) {
        ctx.events.emit('toast', { text: 'A fresh rockslide buries the trail to Halcyon Pass. With a pickaxe, you could dig through.', kind: 'info', duration: 5 });
        return;
      }
      if (!ctx.host.beginWork()) return;
      ctx.host.wearTool('pickaxe');
      ctx.events.emit('sfx', { name: 'mine', x });
      progress++;
      if (progress >= 6) ctx.story.flags['pass-cleared'] = true;
    },
  };
  ctx.interactions.add(it);
  ctx.gates.push({
    flag: 'pass-cleared',
    apply: () => {
      ctx.collision.remove(wall);
      ctx.group.remove(pile);
      ctx.interactions.remove(it);
      ctx.events.emit('toast', { text: 'The way to Halcyon Pass is open. Cold air pours down from the north.', kind: 'good', duration: 6 });
    },
  });
}

/** The washed-out highway bridge to the city (opens in a later milestone). */
export function eastBlockade(ctx: SiteContext, x0: number, x1: number): void {
  const t = ctx.terrain;
  // Asphalt road surface following the terrain along the plane
  const pos: number[] = [];
  const idx: number[] = [];
  let n = 0;
  for (let x = x0; x <= x1 + 6; x += 1) {
    const y = t.heightAt(x) + 0.04;
    pos.push(x, y, -2.6, x, y, 2.6);
    if (n > 0) idx.push(n * 2 - 2, n * 2 - 1, n * 2, n * 2 - 1, n * 2 + 1, n * 2);
    n++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  mesh(geo, ctx.mats.asphalt, 0, 0, 0, ctx.group, false);
  // Lane markings
  for (let x = x0 + 1; x < x1 + 4; x += 3) mesh(new THREE.BoxGeometry(1.4, 0.02, 0.12), new THREE.MeshStandardMaterial({ color: 0xd8c27a, roughness: 0.8 }), x, t.heightAt(x) + 0.06, 0.9, ctx.group, false);

  // Abandoned car
  const cx = x0 + 9;
  const cy = t.heightAt(cx);
  const car = new THREE.Group();
  car.position.set(cx, cy, -3.4);
  car.rotation.y = 0.12;
  ctx.group.add(car);
  const paint = new THREE.MeshStandardMaterial({ color: 0x51606b, roughness: 0.6, metalness: 0.4 });
  mesh(new THREE.BoxGeometry(4.2, 0.75, 1.8), paint, 0, 0.75, 0, car);
  mesh(new THREE.BoxGeometry(2.3, 0.65, 1.6), paint, -0.2, 1.42, 0, car);
  mesh(new THREE.BoxGeometry(2.2, 0.55, 1.62), new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.15, metalness: 0.5 }), -0.2, 1.45, 0, car);
  for (const wx of [-1.35, 1.35]) for (const wz of [-0.85, 0.85]) mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12).rotateX(Math.PI / 2), ctx.mats.charcoal, wx, 0.36, wz, car);
  const door = mesh(new THREE.BoxGeometry(1.0, 0.7, 0.06), paint, 0.3, 1.0, 1.25, car);
  door.rotation.y = -0.7;
  inspectable(ctx, 'car', cx, cy + 1, 'Abandoned car', 2.4);

  // Road closed barrier, sign, and the broken bridge deck
  const bx = x1 - 2;
  const by = t.heightAt(bx);
  for (const z of [-1.6, 0, 1.6]) {
    const b = mesh(worldUvBox(0.8, 1.0, 1.4, 1), ctx.mats.concrete, bx, by + 0.5, z, ctx.group);
    b.rotation.y = z * 0.08;
  }
  const tex = signTexture([{ text: 'BRIDGE OUT', size: 70, color: '#1d1d1d' }, { text: 'HWY 9 CLOSED', size: 40, color: '#1d1d1d' }], 512, 256, '#e0a43a');
  const sg = new THREE.Group();
  sg.position.set(bx - 2.5, by, -2.2);
  ctx.group.add(sg);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), ctx.mats.metal, 0, 1.1, 0, sg);
  mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), 0, 2.0, 0.06, sg);
  const deckY = t.heightAt(x1 + 2);
  const deck = mesh(worldUvBox(7, 0.7, 7, 2), ctx.mats.concrete, x1 + 5, deckY - 0.6, 0, ctx.group);
  deck.rotation.z = -0.35;
  for (let i = 0; i < 6; i++) mesh(new THREE.DodecahedronGeometry(0.4 + (i % 3) * 0.2, 0), ctx.mats.concrete, x1 + 2 + i * 0.9, deckY - 1.4 - i * 0.2, -1 + (i % 2) * 1.5, ctx.group);
  // The gorge cuts the whole map; a guard rail of rock keeps you out of it.
  solid(ctx, x1, x1 + 14, by - 30, by + 14, 'rock', 'gorge', FULL_Z[0], FULL_Z[1]);
  readable(ctx, 'bridge-sign', bx - 2.5, by + 1.4, 'Notice', 'Read', 1);
  const far = x1 + 17;
  const farY = t.heightAt(far);
  const rope = new THREE.Group();
  rope.userData.dynamic = true;
  rope.visible = false;
  ctx.group.add(rope);
  const rl = Math.hypot(far - bx, farY - by);
  const ropeMesh = mesh(new THREE.CylinderGeometry(0.03, 0.03, rl, 5), ctx.mats.bone, (bx + far) / 2, (by + farY) / 2 - 1.2, 0.4, rope, false);
  ropeMesh.rotation.z = Math.PI / 2 + Math.atan2(farY - by, far - bx);
  ctx.interactions.add({
    id: 'gorge-west',
    x: bx + 0.8,
    y: by + 1,
    radius: 1.8,
    verb: '',
    label: '',
    priority: 0.3,
    prompt: () => (ctx.story.flags['gorge-crossed'] ? 'Climb across the gorge' : ctx.inventory.count('rope') > 0 ? 'Anchor a rope and climb into the gorge' : 'Examine the collapsed bridge'),
    onInteract: () => {
      if (ctx.story.flags['gorge-crossed']) return ctx.host.travel(far, farY, 'You climb across the gorge');
      if (ctx.inventory.count('rope') === 0) {
        ctx.events.emit('toast', { text: 'The bridge has fallen into the gorge. With a rope, you could climb down and across.', kind: 'info', duration: 5 });
        return;
      }
      ctx.inventory.remove('rope', 1);
      ctx.story.flags['gorge-crossed'] = true;
      ctx.host.travel(far, farY, 'You lower yourself down the rope and climb the far side');
    },
  });
  ctx.interactions.add({ id: 'gorge-east', x: far - 0.5, y: farY + 1, radius: 1.8, verb: '', label: '', priority: 0.3, prompt: () => 'Climb back across the gorge', enabled: () => Boolean(ctx.story.flags['gorge-crossed']), onInteract: () => ctx.host.travel(bx - 0.5, by, 'You climb back across the gorge') });
  ctx.gates.push({ flag: 'gorge-crossed', apply: () => (rope.visible = true) });
}

/** Ledges up a western cliff face, as on Eastridge (reused for Whiteback Ridge). */
export function cliffLedges(ctx: SiteContext, foot: number): void {
  const t = ctx.terrain;
  const g0 = t.heightAt(foot - 9.5);
  const top = t.heightAt(foot + 4.5);
  const rise = top - g0;
  const steps: [number, number, number][] = [
    [foot - 8.7, foot - 5.1, 0.26],
    [foot - 5.1, foot - 1.9, 0.52],
    [foot - 1.9, foot + 2.1, 0.76],
  ];
  steps.forEach(([x0, x1, f], i) => {
    const h = g0 + rise * f;
    const base = Math.min(t.heightAt(x0), t.heightAt(x1)) - 0.6;
    const depth = 4.2 + i * 0.6;
    const zc = -0.4 - i * 0.3;
    mesh(boulder(x1 - x0 + 0.2, h - base, depth, 7 + i), ctx.mats.rock, (x0 + x1) / 2, base, zc, ctx.group);
    solid(ctx, x0, x1, base, h, 'rock', undefined, zc - depth / 2, zc + depth / 2);
  });
}
