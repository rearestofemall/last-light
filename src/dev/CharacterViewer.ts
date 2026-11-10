import * as THREE from 'three';
import type { MoveState } from '../player/PlayerController';
import { type CharacterDriver, PlayerModel, type SwingKind, type WorkKind } from '../player/PlayerModel';

/**
 * Character viewer (open the game with `?viewer`): the player model on a turntable with
 * every animation state and action one click away, and a slope to check foot IK.
 */
export function startCharacterViewer(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb0b8);
  scene.fog = new THREE.Fog(0x9fb0b8, 12, 30);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a4236, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -3;
  sun.shadow.camera.right = sun.shadow.camera.top = 3;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  let slope = 0;
  const groundY = (x: number, z: number) => {
    void z;
    return x * slope;
  };
  const groundGeo = new THREE.PlaneGeometry(40, 40, 40, 40).rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ color: 0x6c7a52, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);
  const reshapeGround = () => {
    const p = groundGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, groundY(p.getX(i), p.getZ(i)));
    p.needsUpdate = true;
    groundGeo.computeVertexNormals();
  };

  const model = new PlayerModel();
  scene.add(model.root);
  model.ground = (x, z) => groundY(x, z);
  const driver: CharacterDriver = {
    body: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, grounded: true },
    prevX: 0,
    prevY: 0,
    prevZ: 0,
    heading: 0,
    state: 'idle',
  };

  // A simple torch for the hand.
  const torch = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2e }));
  stick.position.z = 0.12;
  stick.rotation.x = Math.PI / 2 - 0.5;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
  flame.position.set(0, 0.2, 0.38);
  torch.add(stick, flame);
  const axe = new THREE.Group();
  const haft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a48 }));
  haft.position.z = 0.2;
  haft.rotation.x = Math.PI / 2 - 0.3;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.16), new THREE.MeshStandardMaterial({ color: 0x6d6f73 }));
  head.position.set(0, 0.17, 0.52);
  axe.add(haft, head);

  const state = { mode: 'idle' as string, spin: false, angle: 0.5, dist: 4.2, height: 1.05, speed: 0 };
  const setMode = (mode: string) => {
    state.mode = mode;
    const speeds: Record<string, number> = { idle: 0, walk: 4.1, run: 7.2, swim: 2.3, wade: 2.4, jump: 0, fall: 0, tread: 0 };
    state.speed = speeds[mode] ?? 0;
    const st: Record<string, MoveState> = { idle: 'idle', walk: 'walk', run: 'run', swim: 'swim', tread: 'swim', wade: 'wade', jump: 'jump', fall: 'fall' };
    driver.state = st[mode] ?? 'idle';
    driver.body.grounded = !['jump', 'fall', 'swim', 'tread'].includes(mode);
    driver.body.vy = mode === 'jump' ? 6 : mode === 'fall' ? -6 : 0;
  };

  // --- UI ---
  ui.innerHTML = '';
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:12px;top:12px;max-width:min(560px,calc(100vw - 24px));display:flex;flex-wrap:wrap;gap:6px;font:500 12px Inter,system-ui,sans-serif;z-index:10';
  ui.append(panel);
  const button = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:6px 10px;border-radius:6px;border:1px solid #0003;background:#f4efe6;color:#2b241b;cursor:pointer';
    b.onclick = fn;
    panel.append(b);
    return b;
  };
  const sep = () => {
    const s = document.createElement('div');
    s.style.cssText = 'flex-basis:100%;height:0';
    panel.append(s);
  };
  for (const m of ['idle', 'walk', 'run', 'jump', 'fall', 'swim', 'tread', 'wade']) button(m, () => setMode(m));
  sep();
  for (const w of ['chop', 'mine', 'gather'] as WorkKind[]) button(w, () => model.work(w));
  for (const s of ['fist', 'knife', 'axe'] as SwingKind[]) button(`swing ${s}`, () => model.swing(s));
  button('eat', () => model.eat());
  button('drink', () => model.drink());
  button('hurt', () => model.hurt(12));
  button('land', () => model.land(18));
  sep();
  button('torch', () => {
    model.holdingLight = !model.holdingLight;
    model.holdingTool = false;
    model.handAnchor.clear();
    if (model.holdingLight) model.handAnchor.add(torch);
  });
  button('axe', () => {
    model.holdingTool = !model.holdingTool;
    model.holdingLight = false;
    model.handAnchor.clear();
    if (model.holdingTool) model.handAnchor.add(axe);
  });
  button('cold', () => (model.cold = model.cold > 0 ? 0 : 1));
  button('tired', () => (model.tired = model.tired > 0 ? 0 : 1));
  button('die / revive', () => (model.dead = !model.dead));
  button('slope', () => {
    slope = slope ? 0 : 0.35;
    reshapeGround();
  });
  button('turntable', () => (state.spin = !state.spin));

  // Drag to orbit, wheel to zoom.
  let dragging = false;
  canvas.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    state.angle -= e.movementX * 0.01;
    state.height = Math.max(0.2, Math.min(3, state.height + e.movementY * 0.01));
  });
  canvas.addEventListener('wheel', (e) => (state.dist = Math.max(1.5, Math.min(10, state.dist + e.deltaY * 0.003))), { passive: true });

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const api = {
    model,
    setMode,
    setSlope: (s: number) => {
      slope = s;
      reshapeGround();
    },
    view: (angle: number, dist = 4.2, height = 1.05) => Object.assign(state, { angle, dist, height }),
    /** Advance the simulation by `seconds` in fixed steps (for screenshots). */
    step: (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 60) tick(1 / 60);
      render();
    },
    paused: false,
  };
  (window as unknown as { viewer: typeof api }).viewer = api;

  const tick = (dt: number) => {
    driver.body.vz = state.speed;
    driver.heading = 0;
    driver.body.y = groundY(0, 0);
    driver.prevY = driver.body.y;
    if (state.spin) state.angle += dt * 0.5;
    model.update(dt, 1, driver);
  };
  const render = () => {
    const fy = driver.body.y + state.height;
    camera.position.set(Math.sin(state.angle) * state.dist, fy + 0.25, Math.cos(state.angle) * state.dist);
    camera.lookAt(0, fy, 0);
    renderer.render(scene, camera);
  };
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
