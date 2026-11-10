import * as THREE from 'three';
import type { RegionId } from '../world/WorldDef';
import { Bird } from '../wildlife/Bird';
import type { Quadruped } from '../wildlife/Quadruped';
import { makeDeer, makeRabbit, makeWolf } from '../wildlife/species';

/**
 * Animal viewer (`?viewer=animals`): a lineup of randomly varied wildlife with every
 * behaviour one click away. "Reroll" builds new individuals to show the variety.
 */
export function startAnimalViewer(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb0b8);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a4236, 1.2));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(4, 8, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
  scene.add(sun);
  let slope = 0;
  const groundGeo = new THREE.PlaneGeometry(40, 40, 40, 40).rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x6c7a52, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
  const gy = (x: number, z: number) => z * slope * 0 + x * slope;
  const reshape = () => {
    const p = groundGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, gy(p.getX(i), p.getZ(i)));
    p.needsUpdate = true;
    groundGeo.computeVertexNormals();
  };

  type Entry = { kind: string; model: Quadruped | Bird; x: number };
  let entries: Entry[] = [];
  let region: RegionId = 'woods';
  const state = { mode: 'idle', speed: 0, angle: 0.9, dist: 9, height: 0.6, dark: false, lookY: 0.45 };
  const build = () => {
    for (const e of entries) {
      scene.remove(e.model.root);
      e.model.dispose();
    }
    entries = [];
    const kinds: [string, () => Quadruped | Bird][] = [
      ['wolf', () => makeWolf(region)],
      ['wolf', () => makeWolf(region)],
      ['deer', () => makeDeer(region)],
      ['deer', () => makeDeer(region)],
      ['rabbit', () => makeRabbit(region)],
      ['bird', () => new Bird(region)],
      ['bird', () => new Bird(region)],
    ];
    const xs = [-3.2, -2.1, -0.8, 0.6, 1.7, 2.3, 2.8];
    kinds.forEach(([kind, make], i) => {
      const model = make();
      model.yaw = Math.PI / 2;
      scene.add(model.root);
      entries.push({ kind, model, x: xs[i] });
    });
  };
  build();

  ui.innerHTML = '';
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:12px;top:12px;max-width:min(620px,calc(100vw - 24px));display:flex;flex-wrap:wrap;gap:6px;font:500 12px Inter,system-ui,sans-serif;z-index:10';
  ui.append(panel);
  const button = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:6px 10px;border-radius:6px;border:1px solid #0003;background:#f4efe6;color:#2b241b;cursor:pointer';
    b.onclick = fn;
    panel.append(b);
  };
  const speeds: Record<string, number> = { idle: 0, graze: 0, sleep: 0, wander: 1.8, stalk: 3.4, circle: 2.6, flee: 7.5, attack: 6 };
  const setMode = (m: string) => {
    state.mode = m;
    state.speed = speeds[m] ?? 0;
  };
  for (const m of Object.keys(speeds)) button(m, () => setMode(m));
  button('bite', () => entries.forEach((e) => (e.model as Quadruped).bite?.()));
  button('howl', () => entries.forEach((e) => (e.model as Quadruped).howl?.()));
  button('hurt', () => entries.forEach((e) => (e.model as Quadruped).hurt?.()));
  button('die', () => entries.forEach((e) => e.model.die()));
  button('night eyes', () => (state.dark = !state.dark));
  button('slope', () => {
    slope = slope ? 0 : 0.25;
    reshape();
  });
  for (const r of ['woods', 'frost', 'city', 'coast'] as RegionId[]) {
    button(`reroll ${r}`, () => {
      region = r;
      build();
    });
  }

  let dragging = false;
  canvas.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    state.angle -= e.movementX * 0.01;
    state.height = Math.max(0.1, Math.min(4, state.height + e.movementY * 0.01));
  });
  canvas.addEventListener('wheel', (e) => (state.dist = Math.max(1, Math.min(20, state.dist + e.deltaY * 0.005))), { passive: true });
  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const tick = (dt: number) => {
    for (const e of entries) {
      const m = e.model;
      m.root.position.set(e.x, gy(e.x, 0), 0);
      if (m instanceof Bird) {
        const flying = state.speed > 4;
        if (flying) m.root.position.y += 1.2;
        m.update(dt, flying, false);
      } else {
        m.update({ dt, speed: e.kind === 'rabbit' ? Math.min(state.speed, 6) : state.speed, state: state.mode, turn: 0, ground: (x) => gy(x, 0), look: state.mode === 'idle' ? 0.6 : null, dark: state.dark });
      }
    }
  };
  const render = () => {
    camera.position.set(Math.sin(state.angle) * state.dist, state.height + 0.6, Math.cos(state.angle) * state.dist);
    camera.lookAt(0, state.lookY, 0);
    renderer.render(scene, camera);
  };
  const api = {
    setMode,
    entries: () => entries,
    region: (r: RegionId) => {
      region = r;
      build();
    },
    view: (angle: number, dist = 9, height = 0.6, lookY = 0.45) => Object.assign(state, { angle, dist, height, lookY }),
    dark: (d: boolean) => (state.dark = d),
    setSlope: (s: number) => {
      slope = s;
      reshape();
    },
    step: (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 60) tick(1 / 60);
      render();
    },
    paused: false,
  };
  (window as unknown as { viewer: typeof api }).viewer = api;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!api.paused) tick(dt);
    render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
