import * as THREE from 'three';
import { GameAudio } from '../audio/GameAudio';
import type { GameMode } from '../gameplay/GameMode';
import { Session } from '../gameplay/Session';
import { SaveManager } from '../persistence/SaveManager';
import { CameraRig } from '../render/CameraRig';
import { Environment } from '../render/Environment';
import { sharedUniforms } from '../render/materials';
import { Renderer } from '../render/Renderer';
import type { GameApi, Projector, SaveSummary } from '../ui/types';
import { LoadingScreen } from '../ui/LoadingScreen';
import { UIManager } from '../ui/UIManager';
import { PLAYABLE, regionAt, SPAWN_X, WORLD_SEED } from '../world/WorldDef';
import { createEventBus, type GameEventBus } from './events';
import { Input } from './Input';
import { Loop } from './Loop';
import { clamp } from './math';
import { Settings } from './Settings';

export type GameState = 'loading' | 'menu' | 'playing' | 'paused';

const AUTOSAVE_INTERVAL = 90;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * The application shell: boot, state machine (menu / playing / paused), persistence,
 * camera and rendering. All gameplay lives in Session.
 */
export class Game implements GameApi {
  readonly settings = new Settings();
  readonly events: GameEventBus = createEventBus();
  readonly input = new Input();
  readonly renderer: Renderer;
  readonly rig = new CameraRig();
  readonly saves = new SaveManager((x) => clamp(x, PLAYABLE.min + 1, PLAYABLE.max - 1));
  readonly audio: GameAudio;
  ui!: UIManager;
  readonly loading: LoadingScreen;
  session!: Session;
  private env!: Environment;
  private loop: Loop;
  state: GameState = 'loading';
  private autosaveTimer = AUTOSAVE_INTERVAL;
  private menuTime = 0;
  private saving = false;
  private projVec = new THREE.Vector3();
  private frameCount = 0;
  private hudTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    private uiRoot: HTMLElement,
  ) {
    this.loading = new LoadingScreen(uiRoot);
    this.renderer = new Renderer(canvas, this.settings);
    this.input.attachCanvas(canvas);
    this.renderer.addResizeListener(() => this.rig.setAspect(this.renderer.aspect));
    this.rig.setAspect(this.renderer.aspect);
    this.rig.bounds = { min: PLAYABLE.min, max: PLAYABLE.max };
    this.audio = new GameAudio(this.events, this.settings);
    this.loop = new Loop({ update: (dt) => this.update(dt), render: (a, dt) => this.render(a, dt) });

    const unlock = () => this.audio.engine.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.settings.onChange((s, changed) => {
      this.renderer.applySettings();
      this.env?.applySettings();
      if (changed.includes('quality') && this.session) {
        this.session.world.applySettings();
        this.session.lights.setPoolSize(this.settings.profile.lightPool);
      }
      if (this.session) this.session.tutorial.enabled = s.showHints;
    });
    window.addEventListener('blur', () => this.state === 'playing' && this.pause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') {
        this.pause();
        void this.saveGame(true);
      }
    });
  }

  async init(): Promise<void> {
    const progress = (f: number, t: string) => this.loading.progress(f, t);
    const scene = this.renderer.scene;
    progress(0.08, 'Opening your journal…');
    await nextFrame();
    this.env = new Environment(scene, this.rig, this.settings, this.renderer.renderer, WORLD_SEED, PLAYABLE.min, PLAYABLE.max);
    await this.saves.init();
    progress(0.25, 'Growing the forest, raising the city…');
    await nextFrame();
    await nextFrame();
    this.session = new Session(scene, this.settings, this.events, this.input, this.rig);
    this.ui = new UIManager(this.uiRoot, this.events, this, this.session, () => this.session.world.terrain, this.loading, () => this.session.world.pois);
    this.session.attachUI(this.ui);
    this.session.captureInitialState();
    this.session.tutorial.enabled = this.settings.get().showHints;
    this.ui.reader.onClose = () => this.input.dropGameplayLatches();
    this.ui.backpack.onClose = () => this.input.dropGameplayLatches();
    this.ui.map.onClose = () => this.input.dropGameplayLatches();
    this.ui.journal.onClose = () => this.input.dropGameplayLatches();
    this.events.on('player:land', (e) => {
      if (e.impact > 17) this.rig.addShake((e.impact - 17) / 12);
    });
    this.events.on('player:damaged', (e) => this.rig.addShake(Math.min(0.6, e.amount / 25)));

    progress(0.55, 'Kindling…');
    await nextFrame();
    this.session.newGame();
    this.rig.snapTo(SPAWN_X + 10, this.session.player.body.y + 1, 0);
    this.session.world.preload(this.rig.focus.x, this.rig.focus.z);

    progress(0.85, 'Warming up…');
    await nextFrame();
    this.renderer.renderer.compile(scene, this.rig.camera);

    progress(1, '');
    await this.enterMenu();
    this.ui.loading.hide();
    this.loop.start();
  }

  // ---------------------------------------------------------------- GameApi
  get persistentSaves(): boolean {
    return this.saves.persistent;
  }

  getSaveSummary(): Promise<{ summary: SaveSummary | null; problem: string | null }> {
    return this.saves.summary();
  }

  async newGame(mode?: GameMode): Promise<void> {
    this.session.newGame(mode);
    this.startPlaying();
    await this.saveGame(true);
  }

  async continueGame(): Promise<void> {
    const r = await this.saves.load();
    if (!r.ok) {
      const msg =
        r.reason === 'newer'
          ? 'This save was made by a newer version of the game and cannot be opened.'
          : r.reason === 'none'
            ? 'No saved game was found.'
            : 'The saved game is damaged and could not be restored.';
      const fresh = await this.ui.confirm.ask("Couldn't load your game", msg, 'Start New Game', 'Back');
      if (fresh) await this.newGame();
      else await this.ui.menu.refresh();
      return;
    }
    this.session.restore(r.data);
    this.startPlaying();
    if (r.recoveredFromBackup) this.events.emit('toast', { text: 'Your last save was damaged — restored from the backup.', kind: 'warn', duration: 6 });
  }

  async saveGame(silent = false): Promise<boolean> {
    if (this.state === 'menu' || this.state === 'loading' || this.saving || this.session.busy) return false;
    this.saving = true;
    if (!silent) this.events.emit('save:status', { state: 'saving' });
    try {
      await this.saves.save(this.session.snapshot());
      this.autosaveTimer = AUTOSAVE_INTERVAL;
      this.events.emit('save:status', { state: 'saved' });
      return true;
    } catch (e) {
      console.error('[save] failed', e);
      this.events.emit('save:status', { state: 'error', message: 'Save failed' });
      return false;
    } finally {
      this.saving = false;
    }
  }

  async quitToMenu(): Promise<void> {
    await this.saveGame(true);
    this.ui.pause.set(false);
    await this.enterMenu();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.pause.set(false);
    this.input.flush();
  }

  // ---------------------------------------------------------------- State
  private pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.pause.set(true);
    this.events.emit('ui:sound', { kind: 'open' });
  }

  private async enterMenu(): Promise<void> {
    this.state = 'menu';
    this.session.toggleBuild(false);
    this.ui.hud.setVisible(false);
    this.ui.hud.reset();
    this.session.newGame();
    this.session.clock.time = 1 + 17.2 / 24; // golden hour behind the menu
    this.menuTime = 0;
    await this.ui.menu.open();
  }

  private startPlaying(): void {
    this.ui.menu.close();
    this.ui.pause.set(false);
    this.ui.hud.reset();
    this.ui.hud.setVisible(true);
    this.state = 'playing';
    this.input.reset();
    this.autosaveTimer = AUTOSAVE_INTERVAL;
    const b = this.session.player.body;
    this.rig.snapTo(b.x, b.y, b.z);
    this.session.world.preload(b.x, b.z);
    this.session.begin();
    this.input.requestLock();
  }

  // ---------------------------------------------------------------- Loop
  private update(dt: number): void {
    const s = this.session;
    if (this.input.consumeRaw('pause')) {
      if (s.build.active && !this.ui.modalOpen) s.toggleBuild(false);
      else if (!this.ui.back()) {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
    }
    if (this.ui.reader.visible && this.input.consumeRaw('interact')) this.ui.reader.close();
    if (this.state === 'playing') s.handleMenus();

    const active = this.state === 'playing' && !this.ui.modalOpen && !s.busy;
    this.input.gameplayEnabled = active;
    if (!active) {
      this.input.dropGameplayLatches();
      return;
    }
    s.update(dt);
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) {
      this.autosaveTimer = AUTOSAVE_INTERVAL;
      void this.saveGame();
    }
  }

  private project: Projector = (x, y, z) => {
    const v = this.projVec.set(x, y, z).project(this.rig.camera);
    return { x: ((v.x + 1) / 2) * this.renderer.width, y: ((1 - v.y) / 2) * this.renderer.height, visible: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 };
  };

  private render(alpha: number, dt: number): void {
    const s = this.session;
    const simRunning = this.state === 'playing' && !this.ui.modalOpen && !s.busy;
    s.frame(dt, simRunning ? alpha : 1, this.state === 'paused');
    // Mouse look is captured while playing; menus free the cursor.
    this.input.wantLock = this.state === 'playing' && !this.ui.modalOpen && !s.busy;
    if (!this.input.wantLock && this.input.locked) this.input.releaseLock();
    this.ui.hud.setCrosshair(this.state === 'playing' && !this.ui.modalOpen);
    if (this.state === 'menu') {
      this.menuTime += dt;
      s.clock.update(dt * 0.2);
      const x = 18 + 20 * Math.sin(this.menuTime * 0.04 - 0.4);
      this.rig.pan(dt, x, s.world.terrain.heightAt(x) + 3.5, 0);
      this.input.wheelDelta = 0;
      this.input.lookDX = this.input.lookDY = 0;
    } else if (this.state === 'playing') {
      if (this.input.wheelDelta !== 0 && !this.input.held('sprint')) {
        this.rig.zoom(this.input.wheelDelta);
        this.input.wheelDelta = 0;
      }
      if (simRunning) this.rig.look(this.input.lookDX, this.input.lookDY);
      this.input.lookDX = this.input.lookDY = 0;
      s.player.cameraYaw = this.rig.yaw;
      const p = s.model.root.position;
      this.rig.ceiling = s.world.ceilingAt(p.x, p.y, p.z);
      this.rig.follow(dt, p.x, p.y, p.z);
      sharedUniforms.uFocus.value.set(p.x, p.y + 1.1, p.z);
    } else sharedUniforms.uFocus.value.set(0, -9999, 0);
    const p = s.model.root.position;
    s.world.update(dt, this.rig.focus.x, this.rig.focus.z, p.x, p.y, p.z);
    if (this.state === 'menu') s.lights.update(dt, this.rig.focus.x, this.rig.focus.y, this.rig.focus.z, 0, 0.3);
    const envIn = s.environment(this.rig.focus.x, this.rig.focus.y, this.rig.focus.z);
    this.env.update(dt, this.renderer.aspect, this.renderer.pixelRatio, envIn);
    // HUD DOM updates at 10 Hz: plenty for gauges, cheap on slow CPUs.
    this.hudTimer -= dt;
    if (this.state !== 'menu' && this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      this.ui.hud.frame(s.hudFrame(this.env.atmosphere.darkness));
    }
    this.audio.update(dt, {
      x: this.rig.focus.x,
      time: this.env.time,
      playing: this.state === 'playing',
      wind: s.weather.wind,
      rain: envIn.interior ? 0 : s.weather.rain,
      night: 1 - s.clock.daylight,
      region: regionAt(this.rig.focus.x).id,
      underground: envIn.interior,
      fireNear: s.lights.heatAt(p.x, p.y + 0.8, p.z),
      danger: s.wildlife.threat,
    });
    this.ui.update(dt, this.project, this.settings.get().showFps ? this.loop.fps : null);

    // Potato mode: shadows update every N frames; resolution adapts to hold the frame rate.
    this.frameCount++;
    const prof = this.settings.profile;
    const sm = this.renderer.renderer.shadowMap;
    sm.autoUpdate = false;
    if (this.frameCount % prof.shadowInterval === 0) sm.needsUpdate = true;
    this.renderer.adapt(dt);
    this.renderer.render(this.rig.camera);
  }
}
