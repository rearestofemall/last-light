/**
 * Interactive 3D repair workstation (Three.js).
 * Builds the phone from its model's node layout, handles orbit / zoom /
 * flip, hover + click picking, and shows removed parts as ghosts in
 * reassembly mode.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { phoneById } from '../data/phones';
import { SCREW_COLORS } from '../data/tools';
import type { NodeDef } from '../data/types';
import { modelNodes } from '../sim/phones';
import type { PhoneInst } from '../sim/state';

const S = 0.1; // 1 unit = 10 mm

const COLOUR_MAP: Record<string, string> = {
  black: '#1b1c1f', white: '#ececec', blue: '#3a5f9e', graphite: '#4a4b50', gold: '#d8c29d', silver: '#d9dadd', 'sierra blue': '#9fb7cf',
  green: '#4f7d5a', lime: '#c6dd8a', violet: '#9b8ac4', 'rainy night': '#2c3440', sunshower: '#e8d27a', 'awesome graphite': '#3a3b3f', 'awesome lime': '#cfe39a', 'awesome violet': '#b6a6d8',
};
export function colourHex(name: string) {
  const k = name.toLowerCase();
  if (COLOUR_MAP[k]) return COLOUR_MAP[k];
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h}, 35%, 45%)`;
}

export interface PickInfo {
  node: NodeDef;
  ghost: boolean;
  x: number;
  y: number;
}

export class Workstation {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  phoneGroup = new THREE.Group();
  flipGroup = new THREE.Group();
  meshes = new Map<string, THREE.Object3D>();
  phone: PhoneInst | null = null;
  ghostMode = false;
  hovered: string | null = null;
  highlight: (n: NodeDef, ghost: boolean) => 'ok' | 'bad' | 'none' = () => 'none';
  onHover: (p: PickInfo | null) => void = () => {};
  onClick: (p: PickInfo) => void = () => {};
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private running = false;
  private flyers: { obj: THREE.Object3D; t: number }[] = [];
  private flipTarget = 0;
  private downAt = { x: 0, y: 0 };

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
    this.camera.position.set(0, -6, 30);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 70;
    this.controls.target.set(0, 0, 0);
    this.buildBench();
    this.scene.add(this.flipGroup);
    this.flipGroup.add(this.phoneGroup);
    this.bindEvents();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  private buildBench() {
    const s = this.scene;
    s.background = new THREE.Color('#1a1d22');
    s.fog = new THREE.Fog('#1a1d22', 60, 140);
    const hemi = new THREE.HemisphereLight('#dfe8ff', '#3a3226', 0.9);
    s.add(hemi);
    const key = new THREE.DirectionalLight('#ffffff', 1.6);
    key.position.set(10, -12, 30);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -25;
    key.shadow.camera.right = 25;
    key.shadow.camera.top = 25;
    key.shadow.camera.bottom = -25;
    s.add(key);
    const rim = new THREE.DirectionalLight('#9fc4ff', 0.5);
    rim.position.set(-20, 20, 10);
    s.add(rim);
    // table
    const table = new THREE.Mesh(new THREE.BoxGeometry(90, 60, 2), new THREE.MeshStandardMaterial({ color: '#6b5238', roughness: 0.8 }));
    table.position.z = -3.2;
    table.receiveShadow = true;
    s.add(table);
    // ESD mat with grid
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2f5d63';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i <= 512; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 512); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(512, i); ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 2);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(46, 32, 0.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    mat.position.z = -2.1;
    mat.receiveShadow = true;
    s.add(mat);
    // a few props: screwdriver, spudger
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 9, 16), new THREE.MeshStandardMaterial({ color: '#d43b2f' }));
    handle.rotation.z = Math.PI / 2.4;
    handle.position.set(17, -10, -1.4);
    handle.castShadow = true;
    s.add(handle);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 8), new THREE.MeshStandardMaterial({ color: '#cfd3d8', metalness: 0.8, roughness: 0.3 }));
    shaft.rotation.z = Math.PI / 2.4;
    shaft.position.set(13.2, -7.6, -1.4);
    s.add(shaft);
    const spud = new THREE.Mesh(new THREE.BoxGeometry(0.8, 11, 0.4), new THREE.MeshStandardMaterial({ color: '#222' }));
    spud.rotation.z = 0.3;
    spud.position.set(-17, -8, -1.7);
    s.add(spud);
  }

  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      const p = this.pick(e);
      const id = p ? p.node.id + (p.ghost ? ':g' : '') : null;
      if (id !== this.hovered) {
        this.hovered = id;
        this.refreshMaterials();
      }
      this.onHover(p);
    });
    el.addEventListener('pointerleave', () => {
      this.hovered = null;
      this.refreshMaterials();
      this.onHover(null);
    });
    el.addEventListener('pointerdown', (e) => (this.downAt = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 5) return; // was a drag
      const p = this.pick(e);
      if (p) this.onClick(p);
    });
  }

  private pick(e: PointerEvent): PickInfo | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.mouse.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const objs: THREE.Object3D[] = [];
    this.meshes.forEach((m) => {
      if (m.visible) objs.push(m);
    });
    const hits = this.raycaster.intersectObjects(objs, true);
    const resolve = (o: THREE.Object3D | null): THREE.Object3D | null => {
      while (o && !o.userData.nodeId) o = o.parent;
      return o;
    };
    const cands = hits.map((h) => resolve(h.object)).filter(Boolean) as THREE.Object3D[];
    let chosen: THREE.Object3D | undefined;
    if (this.ghostMode) chosen = cands.find((o) => o.userData.ghost);
    if (!chosen) chosen = cands.find((o) => !o.userData.ghost);
    if (!chosen) return null;
    const node = chosen.userData.node as NodeDef;
    return { node, ghost: !!chosen.userData.ghost, x: e.clientX - r.left, y: e.clientY - r.top };
  }

  resize() {
    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Build meshes for a phone. */
  load(phone: PhoneInst | null) {
    this.phone = phone;
    this.phoneGroup.clear();
    this.meshes.clear();
    this.flipGroup.rotation.y = 0;
    this.flipTarget = 0;
    if (!phone) return;
    const model = phoneById(phone.modelId);
    const [w, h, d] = model.dims;
    // frame (not pickable)
    const frameColor = model.build.includes('titanium') ? '#8d8a85' : model.build.includes('steel') ? '#b9bcc2' : model.build.includes('Plastic') ? '#2a2b2e' : '#9ea3aa';
    const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.7, roughness: 0.35 });
    const rail = 1.6;
    const mk = (ww: number, hh: number, x: number, y: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww * S, hh * S, d * 0.92 * S), frameMat);
      m.position.set(x * S, y * S, 0);
      m.castShadow = true;
      this.phoneGroup.add(m);
    };
    mk(w, rail, 0, h / 2 - rail / 2);
    mk(w, rail, 0, -h / 2 + rail / 2);
    mk(rail, h, w / 2 - rail / 2, 0);
    mk(rail, h, -w / 2 + rail / 2, 0);
    const plate = new THREE.Mesh(new THREE.BoxGeometry((w - 2) * S, (h - 2) * S, 0.4 * S), new THREE.MeshStandardMaterial({ color: '#5b6068', metalness: 0.5, roughness: 0.6 }));
    plate.position.z = (model.layout === 'flagship-front' ? -2.6 : 1.6) * S * (d / 8);
    plate.receiveShadow = true;
    this.phoneGroup.add(plate);
    if (model.layout === 'foldable') {
      // hinge gap marker
      const gap = new THREE.Mesh(new THREE.BoxGeometry(1.5 * S, h * S, d * S), new THREE.MeshStandardMaterial({ color: '#333' }));
      this.phoneGroup.add(gap);
    }
    for (const n of modelNodes(model)) {
      const obj = this.makeNodeMesh(n, phone);
      this.phoneGroup.add(obj);
      this.meshes.set(n.id, obj);
    }
    // start looking at the side you open first
    const front = model.layout === 'flagship-front';
    this.setView(front ? 'front' : 'back');
    this.refresh();
  }

  private makeNodeMesh(n: NodeDef, phone: PhoneInst): THREE.Object3D {
    const [x, y, z] = n.pos;
    const [sw, sh, sd] = n.size;
    let color = n.color ?? '#777';
    if (n.kind === 'cover' && n.slot === 'backCover') color = colourHex(phone.colour);
    if (n.slot === 'backCover') color = colourHex(phone.colour);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: n.slot === 'display' || n.slot === 'innerDisplay' || n.slot === 'backCover' ? 0.15 : 0.6,
      metalness: n.kind === 'bracket' || n.kind === 'screw' ? 0.8 : n.kind === 'connector' ? 0.4 : 0.1,
    });
    let mesh: THREE.Mesh;
    if (n.kind === 'screw') {
      color = SCREW_COLORS[n.screw!.type];
      mat.color.set(color);
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.85 * S, 0.85 * S, 0.6 * S, 12), mat);
      const edge = Math.abs(y) > 70 && Math.abs(z) < 1;
      if (!edge) mesh.rotation.x = Math.PI / 2;
      // slot mark
      const mark = new THREE.Mesh(new THREE.BoxGeometry(1.2 * S, 0.25 * S, 0.62 * S), new THREE.MeshStandardMaterial({ color: '#222' }));
      if (!edge) mark.rotation.x = Math.PI / 2;
      mark.position.set(0, 0, 0);
      mesh.add(mark);
    } else if (n.shape === 'cyl' || n.shape === 'round') {
      const r = (sw / 2) * S;
      const hh = (n.shape === 'round' ? sd : sd || 3) * S;
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hh, 20), mat);
      mesh.rotation.x = Math.PI / 2;
      if (n.slot && /Cam/.test(n.slot)) {
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, hh * 1.05, 20), new THREE.MeshStandardMaterial({ color: '#0a0f1e', metalness: 0.9, roughness: 0.05 }));
        mesh.add(lens);
      }
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.3, sw) * S, Math.max(0.3, sh) * S, Math.max(0.2, sd) * S), mat);
      if (n.slot === 'board') this.decorateBoard(mesh, sw, sh, sd);
      if (n.slot === 'battery' || n.slot === 'battery2') this.decorateBattery(mesh, sw, sh, sd);
      if (n.slot === 'display' || n.slot === 'innerDisplay') this.decorateDisplay(mesh, sw, sh, sd, z > 0);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // pivot group (covers rotate open like a book)
    const pivot = new THREE.Group();
    pivot.userData = { nodeId: n.id, node: n };
    if (n.kind === 'cover') {
      pivot.position.set((x - sw / 2) * S, y * S, z * S);
      mesh.position.set((sw / 2) * S, 0, 0);
    } else {
      pivot.position.set(x * S, y * S, z * S);
    }
    pivot.add(mesh);
    pivot.userData.baseMat = mat;
    pivot.userData.baseColor = mat.color.clone();
    // ghost
    const ghost = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: '#7fd1ff', transparent: true, opacity: 0.18, wireframe: n.kind !== 'screw' && sw > 20, depthWrite: false }));
    ghost.rotation.copy(mesh.rotation);
    ghost.position.copy(mesh.position);
    const ghostWrap = new THREE.Group();
    ghostWrap.position.copy(pivot.position);
    ghostWrap.add(ghost);
    ghostWrap.userData = { nodeId: n.id, node: n, ghost: true };
    ghostWrap.visible = false;
    this.phoneGroup.add(ghostWrap);
    this.meshes.set(n.id + ':g', ghostWrap);
    return pivot;
  }

  private decorateBoard(mesh: THREE.Mesh, w: number, h: number, d: number) {
    const chipMat = new THREE.MeshStandardMaterial({ color: '#202225', roughness: 0.4 });
    const shieldMat = new THREE.MeshStandardMaterial({ color: '#b8bcc4', metalness: 0.9, roughness: 0.35 });
    const add = (cw: number, ch: number, cx: number, cy: number, m = chipMat, dz = 0.6) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(cw * S, ch * S, dz * S), m);
      c.position.set(cx * S, cy * S, -(d / 2 + dz / 2) * S);
      mesh.add(c);
      const c2 = c.clone();
      c2.position.z = (d / 2 + dz / 2) * S;
      mesh.add(c2);
    };
    add(w * 0.5, h * 0.35, -w * 0.1, h * 0.15, shieldMat, 0.8);
    add(w * 0.25, h * 0.2, w * 0.28, -h * 0.25);
    add(w * 0.15, h * 0.12, -w * 0.3, -h * 0.3);
    for (let i = 0; i < 10; i++) add(1.2, 0.6, (Math.random() - 0.5) * w * 0.85, (Math.random() - 0.5) * h * 0.85, chipMat, 0.4);
  }

  private decorateBattery(mesh: THREE.Mesh, w: number, h: number, d: number) {
    const label = document.createElement('canvas');
    label.width = 256;
    label.height = 256;
    const ctx = label.getContext('2d')!;
    ctx.fillStyle = '#c7cbd1';
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#333';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Li-ion', 20, 60);
    ctx.font = '18px sans-serif';
    ctx.fillText('3.87V  ·  Do not puncture', 20, 100);
    ctx.fillStyle = '#e8c547';
    ctx.fillRect(20, 200, 216, 20);
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(w * S * 0.9, h * S * 0.9), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(label) }));
    lm.position.z = -(d / 2 + 0.05) * S;
    lm.rotation.y = Math.PI;
    mesh.add(lm);
  }

  private decorateDisplay(mesh: THREE.Mesh, w: number, h: number, d: number, front: boolean) {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w * S * 0.97, h * S * 0.97), new THREE.MeshStandardMaterial({ color: '#0b1220', roughness: 0.05, metalness: 0.2, emissive: '#0a1630', emissiveIntensity: 0.4 }));
    glass.position.z = (front ? 1 : -1) * (d / 2 + 0.02) * S;
    if (!front) glass.rotation.y = Math.PI;
    mesh.add(glass);
    mesh.userData.glass = glass;
  }

  setView(v: 'front' | 'back' | 'top') {
    const d = 36;
    this.flipTarget = v === 'back' ? Math.PI : 0;
    this.camera.position.set(0, v === 'top' ? -d : -4, v === 'top' ? 8 : d);
    this.controls.target.set(0, 0, 0);
  }

  flip() {
    this.flipTarget = this.flipTarget === 0 ? Math.PI : 0;
  }

  /** Sync visibility/positions with node states. */
  refresh() {
    const p = this.phone;
    if (!p) return;
    const model = phoneById(p.modelId);
    for (const n of modelNodes(model)) {
      const obj = this.meshes.get(n.id)!;
      const ghost = this.meshes.get(n.id + ':g')!;
      const s = p.nodes[n.id]?.s ?? 'in';
      const wasVisible = obj.visible;
      if (n.kind === 'connector') {
        obj.visible = true;
        obj.position.z = (n.pos[2] + (s === 'out' ? (n.pos[2] > 0 ? 0.8 : -0.8) : 0)) * S;
        obj.rotation.x = s === 'out' ? (n.pos[2] > 0 ? -0.5 : 0.5) : 0;
        ghost.visible = false;
      } else if (n.kind === 'cover' && s === 'open') {
        obj.visible = true;
        obj.rotation.y = n.pos[2] > 0 ? -1.9 : 1.9;
        ghost.visible = false;
      } else {
        obj.rotation.y = 0;
        obj.visible = s === 'in';
        ghost.visible = s === 'out' && this.ghostMode;
      }
      if (wasVisible && !obj.visible) this.fly(obj);
      // heat tint
      const mat = obj.userData.baseMat as THREE.MeshStandardMaterial;
      const heat = p.heat[n.id] ?? 0;
      mat.emissive.setRGB(heat / 160, heat / 600, 0);
    }
    this.refreshMaterials();
  }

  private fly(obj: THREE.Object3D) {
    const clone = obj.clone(true);
    clone.visible = true;
    clone.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) {
        const mm = m.clone();
        mm.transparent = true;
        (o as THREE.Mesh).material = mm;
      }
    });
    this.phoneGroup.add(clone);
    this.flyers.push({ obj: clone, t: 0 });
  }

  refreshMaterials() {
    if (!this.phone) return;
    this.meshes.forEach((obj, key) => {
      const node = obj.userData.node as NodeDef;
      const ghost = !!obj.userData.ghost;
      const isHover = this.hovered === key;
      if (ghost) {
        const m = (obj.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial;
        const h = this.highlight(node, true);
        m.color.set(isHover ? (h === 'ok' ? '#5dff9a' : '#ff6b6b') : h === 'ok' ? '#7fd1ff' : '#5a6b7a');
        m.opacity = isHover ? 0.55 : h === 'ok' ? 0.3 : 0.12;
        return;
      }
      const mat = obj.userData.baseMat as THREE.MeshStandardMaterial;
      const base = obj.userData.baseColor as THREE.Color;
      const h = this.highlight(node, false);
      if (isHover) mat.color.copy(base).lerp(new THREE.Color(h === 'ok' ? '#5dff9a' : '#ff6b6b'), 0.55);
      else if (h === 'ok') mat.color.copy(base).lerp(new THREE.Color('#ffe08a'), 0.25);
      else mat.color.copy(base);
    });
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      this.flipGroup.rotation.y += (this.flipTarget - this.flipGroup.rotation.y) * Math.min(1, dt * 8);
      for (const f of [...this.flyers]) {
        f.t += dt * 2.5;
        f.obj.position.z += dt * 2;
        f.obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          if (m) m.opacity = Math.max(0, 1 - f.t);
        });
        if (f.t >= 1) {
          this.phoneGroup.remove(f.obj);
          this.flyers = this.flyers.filter((x) => x !== f);
        }
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }
}
