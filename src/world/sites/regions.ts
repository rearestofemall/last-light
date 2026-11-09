import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../core/rng';
import { makeLight } from '../../lighting/LightSystem';
import { PlayerModel } from '../../player/PlayerModel';
import { worldUvBox } from '../../render/textures';
import { CITY_BLOCKS, RIVERS } from '../WorldDef';
import { buildCabin, CABIN_FLOOR, furniture } from './cabin';
import { fixedLight, FULL_Z, inspectable, lootCrate, mesh, oneway, passage, readable, type SiteContext, signTexture, solid } from './kit';
import { cliffLedges } from './places';
import { tunnel, UG_Y } from './underground';

// ======================================================================== city

let windowTex: THREE.CanvasTexture | null = null;
function facadeTexture(): THREE.CanvasTexture {
  if (windowTex) return windowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#9a958c';
  g.fillRect(0, 0, 128, 128);
  const rng = new Rng(5);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const broken = rng.chance(0.15);
      g.fillStyle = broken ? '#0c0d0f' : `rgb(${30 + rng.int(0, 20)},${38 + rng.int(0, 20)},${46 + rng.int(0, 25)})`;
      g.fillRect(x * 32 + 7, y * 32 + 6, 18, 20);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x * 32 + 7, y * 32 + 6, 18, 3);
      if (rng.chance(0.2)) {
        g.fillStyle = 'rgba(70,95,50,0.7)'; // ivy
        g.fillRect(x * 32 + rng.int(0, 20), y * 32 + rng.int(10, 26), rng.int(6, 14), rng.int(4, 10));
      }
    }
  }
  windowTex = new THREE.CanvasTexture(c);
  windowTex.wrapS = windowTex.wrapT = THREE.RepeatWrapping;
  windowTex.colorSpace = THREE.SRGBColorSpace;
  return windowTex;
}

/** Background facades behind the street: merged into one mesh per block for performance. */
function cityFacades(ctx: SiteContext): void {
  const rng = new Rng(808);
  const tints = [0xd2c6b4, 0xb8a593, 0xa7a9a6, 0xc49c84, 0x8f9aa0];
  const mats = tints.map((c) => new THREE.MeshStandardMaterial({ map: facadeTexture(), color: c, roughness: 0.9 }));
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4846, roughness: 1 });
  for (const [a, b] of CITY_BLOCKS) {
    const perMat: THREE.BufferGeometry[][] = mats.map(() => []);
    const roofs: THREE.BufferGeometry[] = [];
    for (const zRow of [-12, -24, -38]) {
      let x = a + rng.range(-2, 4);
      while (x < b) {
        const w = rng.range(9, 20);
        const hgt = rng.range(8, 16) + (zRow < -20 ? rng.range(6, 22) : 0);
        const d = rng.range(7, 10);
        const ground = Math.min(ctx.terrain.heightAt3(x + w / 2, zRow), ctx.terrain.heightAt(x + w / 2)) - 1;
        const geo = worldUvBox(w, hgt, d, 4);
        geo.translate(x + w / 2, ground + hgt / 2, zRow);
        perMat[rng.int(0, mats.length - 1)].push(geo);
        const rf = new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4);
        rf.translate(x + w / 2, ground + hgt + 0.25, zRow);
        roofs.push(rf);
        x += w + rng.range(0.5, 4);
      }
    }
    perMat.forEach((list, i) => {
      if (!list.length) return;
      const m = new THREE.Mesh(mergeGeometries(list), mats[i]);
      m.receiveShadow = true;
      m.castShadow = true;
      ctx.group.add(m);
    });
    const rm = new THREE.Mesh(mergeGeometries(roofs), roofMat);
    ctx.group.add(rm);
  }
}

function streetProps(ctx: SiteContext): void {
  const rng = new Rng(77);
  const t = ctx.terrain;
  const poles: THREE.BufferGeometry[] = [];
  const heads: { x: number; y: number }[] = [];
  for (const [a, b] of CITY_BLOCKS) {
    for (let x = a + 6; x < b; x += 24) {
      const y = t.heightAt(x);
      const p = new THREE.CylinderGeometry(0.07, 0.1, 5.5, 6);
      p.translate(x, y + 2.75, -4.2);
      const arm = new THREE.BoxGeometry(1.2, 0.08, 0.08);
      arm.translate(x + 0.55, y + 5.4, -4.2);
      poles.push(p, arm);
      heads.push({ x: x + 1.1, y: y + 5.25 });
    }
  }
  const pm = new THREE.Mesh(mergeGeometries(poles), ctx.mats.metal);
  pm.castShadow = true;
  ctx.group.add(pm);
  // Street lamps are dead — until the ending brings power back.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x3a3c3e, emissive: 0xffd9a0, emissiveIntensity: 0 });
  for (const hd of heads) mesh(new THREE.BoxGeometry(0.45, 0.14, 0.25), lampMat, hd.x, hd.y, -4.2, ctx.group, false);
  ctx.gates.push({
    flag: 'ending',
    apply: () => {
      lampMat.emissiveIntensity = 2.2;
      heads.forEach((hd, i) => {
        if (i % 2) return;
        const l = makeLight(`street-${i}`, 'lamp', hd.x, hd.y - 0.4, -3.5);
        l.fuel = Infinity;
        l.maxFuel = Infinity;
        l.color = 0xffe2b0;
        l.on = true;
        ctx.lights.add(l);
      });
    },
  });
  // Abandoned cars
  const colors = [0x6b2f2a, 0x31495a, 0x8a8a7a, 0x3e4a3a];
  for (let i = 0; i < 9; i++) {
    const x = 470 + rng.float() * 600;
    if (x > 780 && x < 880) continue;
    const y = t.heightAt(x);
    const z = rng.chance(0.5) ? -3.6 : 4.2;
    const car = new THREE.Group();
    car.position.set(x, y, z);
    car.rotation.y = rng.range(-0.2, 0.2);
    ctx.group.add(car);
    const paint = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.6, metalness: 0.4 });
    mesh(new THREE.BoxGeometry(4.1, 0.75, 1.8), paint, 0, 0.75, 0, car);
    mesh(new THREE.BoxGeometry(2.2, 0.62, 1.62), ctx.mats.glass, -0.2, 1.42, 0, car);
    for (const wx of [-1.3, 1.3]) for (const wz of [-0.85, 0.85]) mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 10).rotateX(Math.PI / 2), ctx.mats.charcoal, wx, 0.35, wz, car);
  }
}

export function city(ctx: SiteContext): void {
  const t = ctx.terrain;
  cityFacades(ctx);
  streetProps(ctx);

  // Gas station
  {
    const x = 480;
    const g = t.heightAt(x);
    for (const px of [-4, 4]) mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.5, 8), ctx.mats.white, x + px, g + 2.25, -2.5, ctx.group);
    mesh(worldUvBox(11, 0.4, 5, 2), ctx.mats.red, x, g + 4.6, -2.5, ctx.group);
    for (const px of [-2, 2]) mesh(new THREE.BoxGeometry(0.7, 1.5, 0.5), ctx.mats.white, x + px, g + 0.75, -2.5, ctx.group);
    inspectable(ctx, 'gas-pump', x - 2, g + 1, 'Fuel pump', 1.4);
    lootCrate(ctx, 'gas-crate', x + 4.5, g, -0.8, 'Kiosk shelves', [['canned_food', 2], ['fuel', 2], ['cloth', 2]]);
    readable(ctx, 'city-poster', x + 8, g + 1.5, 'Notice on a lamp post', 'Read', 1.2);
  }

  // Alder Street Apartments — three storeys, J.'s note on the second floor.
  {
    const cab = buildCabin(ctx, { x: 540, width: 14, height: 3.6, zBack: -4.5, zFront: 2, floors: 3, style: 'brick', roof: 'flat' });
    const p = cab.group;
    const f1 = 3.6;
    const f2 = 7.2;
    furniture.bed(ctx, p, 4, -3.4, CABIN_FLOOR + f1);
    const top = furniture.table(ctx, p, 1.5, -3.3, 1.6, CABIN_FLOOR + f1);
    furniture.paper(ctx, p, 1.6, top, -3.2);
    furniture.shelf(ctx, p, -3, CABIN_FLOOR + 1.8, -4.2);
    furniture.counter(ctx, p, -4, -3.6, 2.4);
    furniture.rug(ctx, p, 0, -1.4, CABIN_FLOOR + f1);
    furniture.chair(ctx, p, 2, -2.2, Math.PI, CABIN_FLOOR + f2);
    readable(ctx, 'j-note-3', 541.6, cab.storeys[1] + 1, 'Note on the table');
    readable(ctx, 'photo-2', 538, cab.storeys[2] + 1, 'Photo strip', 'Look at', 1.2);
    lootCrate(ctx, 'apt-crate-1', 535, cab.storeys[0], -0.5, 'Kitchen cupboard', [['canned_food', 3], ['water_clean', 2], ['cloth', 2]]);
    lootCrate(ctx, 'apt-crate-2', 545, cab.storeys[2], -0.5, 'Wardrobe', [['cloth', 4], ['bandage', 2], ['fuel', 1]]);
  }

  // Kessler Hardware — workbench, pickaxe plans.
  {
    const cab = buildCabin(ctx, { x: 611, width: 12, height: 4, zBack: -4.5, zFront: 2, style: 'concrete', roof: 'flat' });
    const p = cab.group;
    furniture.counter(ctx, p, -3, -3.5, 3);
    furniture.shelf(ctx, p, 2, 2.2, -4.2, 3);
    furniture.shelf(ctx, p, 2, 1.4, -4.2, 3);
    const wb = new THREE.Group();
    wb.position.set(4, CABIN_FLOOR, -3);
    p.add(wb);
    mesh(worldUvBox(1.8, 0.12, 0.9), ctx.mats.wood, 0, 0.9, 0, wb);
    for (const sx of [-1, 1]) mesh(worldUvBox(0.12, 0.84, 0.8), ctx.mats.woodDark, sx * 0.8, 0.42, 0, wb);
    readable(ctx, 'hardware-ledger', 608, cab.floorY + 1, 'Ledger on the counter');
    ctx.interactions.add({ id: 'hardware-bench', x: 615, y: cab.floorY + 0.9, radius: 1.4, verb: 'Use', label: 'workbench', onInteract: () => ctx.host.openCrafting() });
    ctx.stations.push({ x: 615, y: cab.floorY, kind: 'workbench' });
    lootCrate(ctx, 'hardware-crate', 606, cab.floorY, -0.5, 'Stock room crate', [['metal', 8], ['rope', 1], ['fuel', 2], ['fiber', 6]]);
  }

  // KVLT Broadcast House — crystal radio, antenna mast.
  {
    const cab = buildCabin(ctx, { x: 691, width: 12, height: 3.6, zBack: -4.5, zFront: 2, floors: 2, style: 'concrete', roof: 'flat' });
    const p = cab.group;
    const top = furniture.table(ctx, p, 2, -3.3, 2.2, CABIN_FLOOR + 3.6);
    mesh(new THREE.BoxGeometry(0.5, 0.3, 0.35), ctx.mats.woodDark, 2.2, top + 0.15, -3.3, p);
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), ctx.mats.metal, 1.6, top + 0.12, -3.2, p);
    furniture.paper(ctx, p, -2, CABIN_FLOOR + 0.85 + 0.06, -3.3);
    furniture.table(ctx, p, -2, -3.3, 1.8);
    // Mast on the roof
    const mx = 695;
    const mg = cab.floorY + 7.6;
    mesh(new THREE.CylinderGeometry(0.06, 0.15, 14, 6), ctx.mats.metal, mx, mg + 7, -3, ctx.group);
    for (let i = 1; i < 7; i++) mesh(new THREE.BoxGeometry(1.4 - i * 0.15, 0.05, 0.05), ctx.mats.metal, mx, mg + i * 2, -3, ctx.group);
    ctx.interactions.add({
      id: 'radio-1',
      x: 693,
      y: cab.storeys[1] + 1,
      radius: 1.5,
      verb: 'Listen to',
      label: 'the crystal radio',
      onInteract: () => {
        ctx.events.emit('sfx', { name: 'radio' });
        ctx.story.openNote('radio-1');
      },
    });
    readable(ctx, 'broadcast-log', 689, cab.floorY + 1, 'Engineer’s notebook');
    lootCrate(ctx, 'kvlt-crate', 686, cab.storeys[1], -0.4, 'Studio locker', [['canned_food', 2], ['water_clean', 1], ['fuel', 1], ['hide', 1]]);
  }

  // Union Line metro: street stairs, tunnel, collapsed overpass on the surface.
  {
    const ex = 760;
    const g = t.heightAt(ex);
    for (const sx of [-1.4, 1.4]) mesh(new THREE.BoxGeometry(0.08, 1.1, 2.4), ctx.mats.metal, ex + sx, g + 0.55, -2.6, ctx.group);
    mesh(new THREE.BoxGeometry(3, 0.1, 2.6), new THREE.MeshStandardMaterial({ color: 0x1a1d1f }), ex, g + 0.02, -2.6, ctx.group, false);
    const tex = signTexture([{ text: 'UNION LINE', size: 54, color: '#f2f2f2' }, { text: 'Coast Road via tunnel', size: 26, color: '#dfe6ea' }], 512, 160, '#2f5d7c');
    mesh(new THREE.PlaneGeometry(2.4, 0.75), new THREE.MeshStandardMaterial({ map: tex }), ex, g + 2.6, -3.9, ctx.group);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), ctx.mats.metal, ex - 1.1, g + 1.25, -3.95, ctx.group);
    readable(ctx, 'metro-sign', ex - 3, g + 1.4, 'Service notice', 'Read', 1);
    tunnel(ctx, 752, 893, 'metro');
    passage(ctx, 'metro-w', { x: ex, y: g, label: 'Descend into the metro' }, { x: 755, y: UG_Y, label: 'Climb the stairs to the street' });
    const exitX = 893 + 2.5;
    const eg = t.heightAt(exitX);
    for (const sx of [-1.4, 1.4]) mesh(new THREE.BoxGeometry(0.08, 1.1, 2.4), ctx.mats.metal, exitX + sx, eg + 0.55, -2.6, ctx.group);
    passage(ctx, 'metro-e', { x: 890, y: UG_Y, label: 'Climb up to Coast Road' }, { x: exitX, y: eg, label: 'Descend into the metro' });
    // Derailed carriage blocking the platform: climb over on crates.
    const car = new THREE.Group();
    car.position.set(812, UG_Y, -1);
    car.rotation.z = 0.05;
    ctx.group.add(car);
    const carMat = new THREE.MeshStandardMaterial({ color: 0x8d9aa3, metalness: 0.4, roughness: 0.5 });
    mesh(new THREE.BoxGeometry(14, 2.6, 2.8), carMat, 0, 1.3, 0, car);
    for (let i = -5; i <= 5; i += 2) mesh(new THREE.BoxGeometry(1.2, 0.8, 0.05), ctx.mats.glass, i, 1.7, 1.41, car, false);
    mesh(new THREE.BoxGeometry(14, 0.3, 2.85), new THREE.MeshStandardMaterial({ color: 0xc0392b }), 0, 0.7, 0, car);
    solid(ctx, 805, 819, UG_Y, UG_Y + 2.6, 'metal', undefined, -2.4, 0.4);
    // Crates stacked against both ends of the carriage: a two-step climb.
    for (const [cx, h] of [
      [802.8, 0.9],
      [804.2, 1.75],
      [821.2, 0.9],
      [819.8, 1.75],
    ] as const) {
      mesh(worldUvBox(1.2, h, 1.2, 0.8), ctx.mats.woodDark, cx, UG_Y + h / 2, -1.2, ctx.group);
      oneway(ctx, cx - 0.6, cx + 0.6, UG_Y + h, 'wood', undefined, -1.8, -0.6);
    }
    fixedLight(ctx, 'metro-barrel', 'barrel', 840, UG_Y + 1, -2.2, 400, false);
    lootCrate(ctx, 'metro-crate', 860, UG_Y, -2, 'Abandoned luggage', [['canned_food', 1], ['cloth', 3], ['fuel', 1], ['bandage', 1]]);

    // The collapsed overpass on the surface.
    const ox = 828;
    const og = t.heightAt(ox);
    const rng = new Rng(4);
    for (let i = 0; i < 9; i++) {
      const slab = mesh(worldUvBox(rng.range(8, 14), 1.2, rng.range(6, 9), 3), ctx.mats.concrete, 792 + i * 8.5, og + rng.range(1, 6), rng.range(-6, 2), ctx.group);
      slab.rotation.set(rng.range(-0.3, 0.3), rng.range(-0.3, 0.3), rng.range(-0.6, 0.6));
    }
    for (let i = 0; i < 6; i++) mesh(worldUvBox(1.6, 9, 1.6, 2), ctx.mats.concrete, 795 + i * 13, og + 4.5, -8, ctx.group);
    solid(ctx, 788, 870, og - 6, og + 20, 'rock', 'overpass', -14, 10);
    inspectable(ctx, 'overpass', 786, og + 1, 'Collapsed overpass', 2);
  }

  // St. Brigid Clinic
  {
    const cab = buildCabin(ctx, { x: 931, width: 12, height: 3.8, zBack: -4.5, zFront: 2, style: 'concrete', roof: 'flat' });
    const p = cab.group;
    furniture.bed(ctx, p, -3.5, -3.4);
    furniture.bed(ctx, p, 0, -3.4);
    furniture.counter(ctx, p, 3.6, -3.6, 2.4);
    mesh(new THREE.BoxGeometry(0.9, 0.9, 0.06), ctx.mats.red, 1.5, CABIN_FLOOR + 2.6, -4.3, p);
    mesh(new THREE.BoxGeometry(0.3, 0.9, 0.07), ctx.mats.white, 1.5, CABIN_FLOOR + 2.6, -4.28, p);
    mesh(new THREE.BoxGeometry(0.9, 0.3, 0.07), ctx.mats.white, 1.5, CABIN_FLOOR + 2.6, -4.27, p);
    readable(ctx, 'clinic-notes', 934.6, cab.floorY + 1, 'Nurse’s notes');
    lootCrate(ctx, 'clinic-crate', 927, cab.floorY, -0.5, 'Medicine cabinet', [['bandage', 3], ['herbs', 4], ['water_clean', 2], ['remedy', 1]]);
    fixedLight(ctx, 'clinic-barrel', 'barrel', 940, cab.floorY + 1.0, 3.5, 600, true);
  }

  // Park fire barrels — someone kept watch here.
  fixedLight(ctx, 'park-barrel', 'barrel', 1012, t.heightAt(1012) + 1, -2, 300, false);
  fixedLight(ctx, 'city-barrel-1', 'barrel', 600, t.heightAt(600) + 1, 3.8, 200, false);
}

// ======================================================================== coast

export function coast(ctx: SiteContext): void {
  const t = ctx.terrain;

  // Saltmarsh Village
  {
    const cab = buildCabin(ctx, { x: 1190, width: 10, height: 3.4, zBack: -4, zFront: 2, style: 'cottage' });
    const p = cab.group;
    const top = furniture.table(ctx, p, 0, -3, 1.8);
    mesh(new THREE.BoxGeometry(0.45, 0.25, 0.3), ctx.mats.woodDark, 0.4, top + 0.12, -3, p);
    furniture.paper(ctx, p, -0.4, top, -2.9);
    furniture.bed(ctx, p, 3, -3.1);
    furniture.stove(ctx, p, -3.6, -3.3, 3.4);
    ctx.interactions.add({
      id: 'radio-2',
      x: 1190.4,
      y: cab.floorY + 1,
      radius: 1.1,
      verb: 'Read',
      label: 'radio transcriptions',
      onInteract: () => {
        ctx.events.emit('sfx', { name: 'radio' });
        ctx.story.openNote('radio-2');
      },
    });
    readable(ctx, 'fisher-letter', 1188.6, cab.floorY + 1, 'Unsent letter', 'Read', 0.9);
    lootCrate(ctx, 'fisher-crate', 1194, cab.floorY, -0.5, 'Fisher’s chest', [['canned_food', 2], ['rope', 1], ['cloth', 2], ['hide', 1]]);
    fixedLight(ctx, 'cottage-lamp', 'lamp', 1188, cab.floorY + 2.4, -2.5, 900, true);
  }
  {
    const cab = buildCabin(ctx, { x: 1250, width: 8, height: 3.2, zBack: -4, zFront: 2, style: 'hut' });
    const p = cab.group;
    furniture.crate(ctx, p, -2.4, -3.2, 0.9);
    furniture.crate(ctx, p, -1.4, -3.4, 0.7);
    lootCrate(ctx, 'netshed-crate', 1252, cab.floorY, -0.5, 'Net locker', [['fiber', 8], ['fuel', 1], ['metal', 3]]);
    fixedLight(ctx, 'village-barrel', 'barrel', 1228, t.heightAt(1228) + 1, 2.5, 400, true);
  }

  // Drowned Cove pier
  {
    const r = RIVERS.find((rv) => rv.id === 'cove')!;
    const bank = t.base(r.x);
    const x0 = r.x - r.width / 2 - r.bank - 1;
    const x1 = r.x + r.width / 2 + r.bank + 1;
    const top = bank + 0.35;
    mesh(worldUvBox(x1 - x0, 0.25, 2.6, 1.3), ctx.mats.woodDark, (x0 + x1) / 2, top - 0.12, -0.2, ctx.group);
    for (let x = x0 + 1; x < x1; x += 3.2) for (const z of [-1.3, 0.9]) mesh(new THREE.CylinderGeometry(0.14, 0.16, 5, 6), ctx.mats.woodDark, x, top - 2.5, z, ctx.group);
    solid(ctx, x0, x1, top - 0.3, top, 'wood', undefined, -1.5, 1.1);
    // Small boat moored behind the pier
    const boat = new THREE.Group();
    boat.position.set(r.x + 3, t.riverWaterY(r) + 0.1, -4.2);
    ctx.group.add(boat);
    mesh(new THREE.BoxGeometry(4, 0.6, 1.5), ctx.mats.woodDark, 0, 0.2, 0, boat);
  }

  // Wreck of the Meridian
  {
    const x = 1430;
    const g = t.heightAt(x);
    const hull = new THREE.Group();
    hull.position.set(x, g - 0.6, 0);
    hull.rotation.z = -0.06;
    ctx.group.add(hull);
    const steel = new THREE.MeshStandardMaterial({ color: 0x3b4a52, roughness: 0.6, metalness: 0.4 });
    const rust = ctx.mats.rust;
    const front = steel.clone();
    front.transparent = true;
    // Back hull plate, keel, bow, stern
    mesh(new THREE.BoxGeometry(22, 5.4, 0.3), steel, 0, 2.7, -3.6, hull);
    mesh(new THREE.BoxGeometry(22, 0.6, 5), rust, 0, 0.3, -1.2, hull);
    const bowShape = new THREE.Shape();
    bowShape.moveTo(0, 0);
    bowShape.lineTo(3.5, 5.4);
    bowShape.lineTo(0, 5.4);
    bowShape.closePath();
    const bow = new THREE.ExtrudeGeometry(bowShape, { depth: 5, bevelEnabled: false });
    bow.translate(11, 0, -3.6);
    mesh(bow, steel, 0, 0, 0, hull);
    // Front plate (fades) with a torn hole at the plane.
    const fp = mesh(new THREE.BoxGeometry(22, 5.4, 0.2), front, 0, 2.7, 1.4, hull);
    // Deck
    mesh(worldUvBox(21, 0.2, 5, 1.4), ctx.mats.woodDark, 0, 5.3, -1.1, hull);
    mesh(new THREE.CylinderGeometry(0.14, 0.18, 8, 6), ctx.mats.woodDark, -2, 9.3, -1.5, hull);
    const sail = mesh(new THREE.PlaneGeometry(3, 4.5), ctx.mats.cloth, -0.4, 9.5, -1.5, hull);
    sail.rotation.y = 0.3;
    // Hold contents
    mesh(worldUvBox(1.2, 0.5, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }), 5, 0.85, -2.5, hull);
    lootCrate(ctx, 'meridian-crate', x - 4, g, -2, 'Ship’s stores', [['canned_food', 3], ['fuel', 2], ['metal', 4], ['cloth', 2]]);
    readable(ctx, 'meridian-dossier', x + 5, g + 0.9, 'Sealed briefcase', 'Open', 1.3);
    // Collision: bow wall, deck as a one-way platform reached by crates.
    solid(ctx, x + 10.5, x + 14, g - 2, g + 6, 'metal', undefined, -3.6, 1.4);
    oneway(ctx, x - 10.5, x + 10.5, g + 4.7, 'wood', undefined, -3.6, 1.4);
    solid(ctx, x - 11, x + 11, g - 1, g + 4.6, 'metal', undefined, -3.75, -3.45);
    solid(ctx, x - 11, x + 11, g - 1, g + 4.6, 'metal', undefined, 1.3, 1.5);
    // Stacked cargo inside the hold makes a way up to the deck.
    for (const [cx, h] of [
      [x - 8.8, 1.2],
      [x - 7.4, 2.4],
      [x - 6.0, 3.6],
    ] as const) {
      mesh(worldUvBox(1.3, h, 1.3, 0.8), ctx.mats.woodDark, cx, g + h / 2, -1.6, ctx.group);
      oneway(ctx, cx - 0.65, cx + 0.65, g + h, 'wood', undefined, -2.25, -0.95);
    }
    ctx.fadeables.push({ x0: x - 11, x1: x + 11, y0: g - 1, y1: g + 4.5, z0: -3.6, z1: 1.4, materials: [front], meshes: [fp], opacity: 1 });
    ctx.interiors.push({ x0: x - 10.5, x1: x + 10.5, y0: g - 1, y1: g + 4.6, z0: -3.6, z1: 1.4 });
  }

  // Sea caves (hidden discovery)
  {
    const x = 1522;
    const g = t.heightAt(x);
    for (let i = 0; i < 7; i++) {
      const r = mesh(new THREE.DodecahedronGeometry(1.6 + (i % 3) * 0.6, 0), ctx.mats.rock, x - 3 + i * 1.1, g + 0.8 + Math.sin(i) * 1.5 + (i > 1 && i < 5 ? 2 : 0), -3.5, ctx.group);
      r.rotation.set(i, i * 2, 0);
    }
    mesh(new THREE.CircleGeometry(1.4, 10), new THREE.MeshBasicMaterial({ color: 0x050505 }), x, g + 1.2, -2.2, ctx.group, false);
    tunnel(ctx, 1500, 1548, 'cave');
    passage(ctx, 'seacave', { x, y: g, label: 'Crawl into the sea cave' }, { x: 1503, y: UG_Y, label: 'Climb out of the cave' });
    readable(ctx, 'photo-3', 1530, UG_Y + 1, 'Tin on a dry ledge', 'Open', 1.3);
    readable(ctx, 'cave-cache', 1538, UG_Y + 1, 'Carved tallies', 'Read', 1.3);
    lootCrate(ctx, 'cave-crate', 1542, UG_Y, -1.5, 'Smuggler’s cache', [['fuel', 3], ['canned_food', 3], ['cloth', 3], ['hide', 2], ['lantern', 1]]);
  }

  // Greywater Lighthouse — five storeys, beacon on top.
  {
    const x = 1632;
    const cab = buildCabin(ctx, { x, width: 8, height: 3.6, zBack: -4, zFront: 2, floors: 5, style: 'cottage', roof: 'flat', noDoor: 'right', bands: ctx.mats.red });
    const p = cab.group;
    // Red bands
    for (let i = 1; i < 5; i += 2) mesh(worldUvBox(8.3, 0.6, 0.3), ctx.mats.red, 0, CABIN_FLOOR + i * 3.6 + 2.8, -4.2, p);
    const top = furniture.table(ctx, p, -1.5, -3, 1.6);
    furniture.paper(ctx, p, -1.3, top, -2.9);
    furniture.bed(ctx, p, 2, -3.1, CABIN_FLOOR + 3.6);
    readable(ctx, 'keeper-log', x - 1.3, cab.floorY + 1, 'Keeper’s log');
    readable(ctx, 'j-note-4', x + 1, cab.storeys[4] + 1, 'Note in the lantern room');
    lootCrate(ctx, 'keeper-crate', x + 2.5, cab.floorY, -0.4, 'Keeper’s stores', [['hide', 3], ['cloth', 4], ['fuel', 3], ['canned_food', 2]]);
    // The keeper's workbench: where coats were stitched for survivors.
    const wb = new THREE.Group();
    wb.position.set(2.2, CABIN_FLOOR, -3.1);
    p.add(wb);
    mesh(worldUvBox(1.8, 0.12, 0.9), ctx.mats.wood, 0, 0.9, 0, wb);
    for (const sx of [-1, 1]) mesh(worldUvBox(0.12, 0.84, 0.8), ctx.mats.woodDark, sx * 0.8, 0.42, 0, wb);
    ctx.stations.push({ x: x + 2.2, y: cab.floorY, kind: 'workbench' });
    ctx.interactions.add({ id: 'keeper-bench', x: x + 2.2, y: cab.floorY + 0.9, radius: 1.2, verb: 'Use', label: 'workbench', onInteract: () => ctx.host.openCrafting() });
    // Lantern room on the roof
    const ly = cab.floorY + 18.4;
    mesh(new THREE.CylinderGeometry(2, 2.2, 0.3, 12), ctx.mats.red, x, ly, -1, ctx.group);
    mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x9fb4c0, transparent: true, opacity: 0.35, roughness: 0.1 }), x, ly + 1.35, -1, ctx.group, false);
    mesh(new THREE.ConeGeometry(1.9, 1.3, 12), ctx.mats.red, x, ly + 3.2, -1, ctx.group);
    const beacon = makeLight('beacon', 'beacon', x, ly + 1.3, -1);
    beacon.on = Boolean(ctx.story.flags['beacon-lit']);
    ctx.lights.add(beacon);
    ctx.interactions.add({
      id: 'beacon',
      x: x - 1.5,
      y: cab.storeys[4] + 1,
      radius: 1.6,
      verb: '',
      label: '',
      prompt: () => (beacon.on ? 'The great lamp is burning' : ctx.inventory.count('fuel') > 0 ? 'Light the great lamp (1 lamp oil)' : 'The great lamp needs lamp oil'),
      onInteract: () => {
        if (beacon.on) return;
        if (ctx.inventory.remove('fuel', 1) !== 1) return;
        beacon.on = true;
        ctx.story.flags['beacon-lit'] = true;
        ctx.events.emit('sfx', { name: 'ignite', x });
        ctx.events.emit('toast', { text: 'The lighthouse burns again. Somewhere out there, someone will see it.', kind: 'good', duration: 6 });
      },
    });
    ctx.gates.push({ flag: 'beacon-lit', apply: () => (beacon.on = true) });
  }

  // The end of the land.
  {
    const x = 1666;
    const g = t.heightAt(x);
    for (let i = 0; i < 5; i++) mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5), ctx.mats.woodDark, x + i * 1.2, g + 0.55, 0.6, ctx.group);
    mesh(new THREE.BoxGeometry(5, 0.06, 0.06), ctx.mats.woodDark, x + 2.4, g + 1, 0.6, ctx.group);
    inspectable(ctx, 'cliff', x + 2, g + 1, 'Cliff edge', 3);
  }
}

// ======================================================================== frost

export function frost(ctx: SiteContext): void {
  const t = ctx.terrain;

  // Western boundary fence
  {
    const x = -868;
    const g = t.heightAt(x);
    for (let z = -12; z <= 10; z += 2.5) mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), ctx.mats.metal, x, g + 1.6, z, ctx.group);
    const fence = mesh(new THREE.PlaneGeometry(22, 2.8), new THREE.MeshStandardMaterial({ color: 0x8a9298, wireframe: true }), x, g + 1.5, -1, ctx.group, false);
    fence.rotation.y = Math.PI / 2;
    solid(ctx, x - 6, x + 0.3, g - 5, g + 12, 'metal', undefined, FULL_Z[0], FULL_Z[1]);
    inspectable(ctx, 'fence', x + 2, g + 1, 'Perimeter fence', 2.2);
  }

  // Halcyon Station
  {
    const x = -800;
    const cab = buildCabin(ctx, { x, width: 16, height: 3.8, zBack: -4.5, zFront: 2, floors: 2, style: 'station', roof: 'flat' });
    const p = cab.group;
    const top = furniture.table(ctx, p, 3, -3.4, 2.2, CABIN_FLOOR + 3.8);
    furniture.paper(ctx, p, 3.2, top, -3.3);
    furniture.counter(ctx, p, -4, -3.6, 4);
    furniture.shelf(ctx, p, 4.5, 2.2, -4.2, 3);
    readable(ctx, 'okafor-1', x + 3.2, cab.storeys[1] + 1, 'Dr. Okafor’s desk');
    lootCrate(ctx, 'station-crate', x + 6, cab.floorY, -0.5, 'Equipment locker', [['hide', 2], ['cloth', 3], ['canned_food', 2], ['fuel', 2], ['bandage', 2]]);
    fixedLight(ctx, 'station-barrel', 'barrel', x - 5, cab.floorY + 1, -2.4, 900, true);
    ctx.stations.push({ x: x - 4, y: cab.floorY, kind: 'workbench' });
    ctx.interactions.add({ id: 'station-bench', x: x - 4, y: cab.floorY + 0.9, radius: 1.4, verb: 'Use', label: 'workbench', onInteract: () => ctx.host.openCrafting() });
    // Hatch to the lab
    mesh(new THREE.BoxGeometry(1.4, 0.15, 1.4), ctx.mats.metal, x - 12, cab.floorY - 0.3, -1.8, ctx.group);
    passage(ctx, 'lab', { x: x - 12, y: t.heightAt(x - 12), label: 'Open the hatch and climb down into the Array' }, { x: -846, y: UG_Y, label: 'Climb the ladder to the surface' });
  }

  // The Array: a forest of humming masts behind the station.
  {
    const rng = new Rng(140);
    const masts: THREE.BufferGeometry[] = [];
    const tips: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 70; i++) {
      const mx = -860 + rng.float() * 130;
      const mz = -16 - rng.float() * 80;
      if (Math.abs(mx + 800) < 12 && mz > -24) continue;
      const g = t.heightAt3(mx, mz);
      const h = rng.range(9, 15);
      const m = new THREE.CylinderGeometry(0.12, 0.2, h, 5);
      m.translate(mx, g + h / 2, mz);
      const bar = new THREE.BoxGeometry(2.4, 0.08, 0.08);
      bar.translate(mx, g + h * 0.8, mz);
      masts.push(m, bar);
      const tip = new THREE.SphereGeometry(0.22, 6, 4);
      tip.translate(mx, g + h, mz);
      tips.push(tip);
    }
    const mm = new THREE.Mesh(mergeGeometries(masts), ctx.mats.white);
    mm.castShadow = true;
    ctx.group.add(mm);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0x9fffd0, emissive: 0x59ffb0, emissiveIntensity: 1.4 });
    ctx.group.add(new THREE.Mesh(mergeGeometries(tips), tipMat));
    ctx.gates.push({ flag: 'ending', apply: () => (tipMat.emissiveIntensity = 0) });
    inspectable(ctx, 'array-masts', -770, t.heightAt(-770) + 1, 'Array masts', 3);
  }

  // The lab beneath the station, with J. and the field breaker.
  {
    tunnel(ctx, -852, -774, 'lab');
    const fx = -812;
    const fire = makeLight('lab-fire', 'campfire', fx, UG_Y + 0.05, -1.6);
    fire.fuel = Infinity;
    fire.maxFuel = Infinity;
    fire.on = true;
    ctx.lights.add(fire);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      mesh(new THREE.DodecahedronGeometry(0.16, 0), ctx.mats.rock, fx + Math.cos(a) * 0.5, UG_Y + 0.08, -1.6 + Math.sin(a) * 0.4, ctx.group);
    }
    const j = new PlayerModel({ jacket: 0x6a3f37, scarf: 0xd9b45a, hair: 0x6b4a2a });
    j.root.position.set(fx - 1.4, UG_Y, -2.2);
    j.root.rotation.y = 0.9;
    j.sit();
    j.root.userData.dynamic = true;
    ctx.group.add(j.root);
    ctx.npcs.push({ update: (dt) => j.idle(dt) });
    ctx.interactions.add({
      id: 'talk-j',
      x: fx - 1.4,
      y: UG_Y + 1,
      radius: 1.8,
      verb: 'Talk to',
      label: 'J.',
      onInteract: () => {
        ctx.story.openNote(ctx.story.flags['found-j'] ? 'j-found-2' : 'j-found');
        ctx.story.flags['found-j'] = true;
      },
    });
    readable(ctx, 'okafor-final', -790, UG_Y + 1, 'Dr. Okafor’s last entry');
    // Field breaker console
    const cx = -836;
    mesh(worldUvBox(3.2, 1.6, 1, 1), ctx.mats.metal, cx, UG_Y + 0.8, -3.2, ctx.group);
    const lever = mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), ctx.mats.red, cx, UG_Y + 2, -2.7, ctx.group);
    lever.userData.dynamic = true;
    lever.rotation.z = -0.4;
    const glow = new THREE.MeshStandardMaterial({ color: 0x0f2a20, emissive: 0x3cff9a, emissiveIntensity: 1.3 });
    mesh(new THREE.BoxGeometry(2.6, 0.5, 0.05), glow, cx, UG_Y + 1.3, -2.68, ctx.group, false);
    ctx.interactions.add({
      id: 'breaker',
      x: cx,
      y: UG_Y + 1,
      radius: 1.8,
      verb: '',
      label: '',
      prompt: () => (ctx.story.flags['ending'] ? 'The breaker is thrown. The Array is silent.' : ctx.story.flags['found-j'] ? 'Throw the field breaker' : 'A console, humming. Green numbers crawl across it.'),
      onInteract: () => {
        if (ctx.story.flags['ending']) return;
        if (!ctx.story.flags['found-j']) {
          ctx.events.emit('toast', { text: 'Someone is sitting by the fire nearby. Talk to them first.', kind: 'info', duration: 4 });
          return;
        }
        lever.rotation.z = 0.5;
        glow.emissiveIntensity = 0;
        ctx.host.startEnding();
      },
    });
    ctx.gates.push({
      flag: 'ending',
      apply: () => {
        lever.rotation.z = 0.5;
        glow.emissiveIntensity = 0;
      },
    });
  }

  // Lake Tamsin is frozen solid: the terrain itself is the ice sheet (see Terrain.heightAt3).

  // Weather Hut 3
  {
    const x = -520;
    const cab = buildCabin(ctx, { x, width: 8, height: 3.2, zBack: -4, zFront: 2, style: 'hut' });
    const p = cab.group;
    const top = furniture.table(ctx, p, -1.6, -2.9, 1.4);
    furniture.paper(ctx, p, -1.4, top, -2.8);
    furniture.bed(ctx, p, 1.8, -3.1);
    readable(ctx, 'hut-log', x - 1.4, cab.floorY + 1, 'Observer’s log');
    fixedLight(ctx, 'hut-barrel', 'barrel', x + 2.6, cab.floorY + 1, -0.9, 1200, true);
    lootCrate(ctx, 'hut-crate', x - 3, cab.floorY, -0.5, 'Observer’s locker', [['hide', 2], ['fuel', 1], ['canned_food', 1], ['wood', 8]]);
  }

  cliffLedges(ctx, -478);
}
