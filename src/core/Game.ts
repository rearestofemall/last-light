import * as THREE from 'three';
import { GameAudio } from '../audio/GameAudio';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { SaveManager } from '../persistence/SaveManager';
import { type SaveData, SAVE_VERSION } from '../persistence/schema';
import { PlayerController } from '../player/PlayerController';
import { PlayerModel } from '../player/PlayerModel';
import { CameraRig } from '../render/CameraRig';
import { Environment } from '../render/Environment';
import { Renderer } from '../render/Renderer';
import { StoryState } from '../story/StoryState';
import { Tutorial } from '../story/Tutorial';
import type { GameApi, Projector, SaveSummary } from '../ui/types';
import { UIManager } from '../ui/UIManager';
import { World } from '../world/World';
import { locationAt, PLAYABLE, regionAt, SPAWN_X, WORLD_SEED } from '../world/WorldDef';
import { createEventBus, type GameEventBus } from './events';
import { Input } from './Input';
import { Loop } from './Loop';
import { clamp } from './math';
import { Settings } from './Settings';

export type GameState = 'loading' | 'menu' | 'playing' | 'paused';

const AUTOSAVE_INTERVAL = 90;
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/**
 * Top-level orchestrator: owns every system, the state machine (menu / playing / paused)
 * and the order in which systems update. Systems talk to each other through the EventBus.
 */
export class Game implements GameApi {
  readonly settings = new Settings();
  readonly events: GameEventBus = createEventBus();
  readonly input = new Input();
  readonly renderer: Renderer;
  readonly rig = new CameraRig();
  readonly interactions: InteractionSystem;
  readonly story: StoryState;
  readonly saves = new SaveManager((x) => clamp(x, PLAYABLE.min + 1, PLAYABLE.max - 1));
  readonly audio: GameAudio;
  readonly ui: UIManager;
  private world!: World;
  private env!: Environment;
  private player!: PlayerController;
  private model!: PlayerModel;
  private tutorial: Tutorial;
  private loop: Loop;
  state: GameState = 'loading';
  private playTime = 0;
  private autosaveTimer = AUTOSAVE_INTERVAL;
  private locationId: string | null = null;
  private regionId: string | null = null;
  private menuTime = 0;
  private saving = false;
  private projVec = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.renderer = new Renderer(canvas, this.settings);
    this.renderer.addResizeListener(() => this.rig.setAspect(this.renderer.aspect));
    this.rig.setAspect(this.renderer.aspect);
    this.rig.bounds = { min: PLAYABLE.min, max: PLAYABLE.max };
    this.interactions = new InteractionSystem(this.events);
    this.story = new StoryState(this.events);
    this.tutorial = new Tutorial(this.events, this.story);
    this.audio = new GameAudio(this.events, this.settings);
    this.ui = new UIManager(uiRoot, this.events, this);
    this.loop = new Loop({ update: (dt) => this.update(dt), render: (a, dt) => this.render(a, dt) });

    // Any user gesture unlocks audio (browser autoplay policy).
    const unlock = () => this.audio.engine.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.settings.onChange((s, changed) => {
      this.renderer.applySettings();
      this.env?.applySettings();
      if (changed.includes('quality')) this.world?.applySettings();
      this.tutorial.enabled = s.showHints;
    });
    this.tutorial.enabled = this.settings.get().showHints;

    this.ui.reader.onClose = () => this.input.flush();
    this.events.on('player:land', (e) => {
      this.model?.land(e.impact);
      if (e.impact > 17) this.rig.addShake((e.impact - 17) / 12);
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
    const L = this.ui.loading;
    L.progress(0.1, 'Opening your journal…');
    await this.saves.init();
    await nextFrame();

    L.progress(0.3, 'Growing the forest…');
    await nextFrame();
    const scene = this.renderer.scene;
    this.env = new Environment(scene, this.rig, this.settings, WORLD_SEED, PLAYABLE.min, PLAYABLE.max);
    this.world = new World(scene, this.settings, this.events, this.interactions, this.story);
    this.player = new PlayerController(this.world.collision, this.events, SPAWN_X, 0);
    this.player.placeAt(SPAWN_X);
    this.model = new PlayerModel();
    scene.add(this.model.root);

    L.progress(0.6, 'Kindling…');
    await nextFrame();
    this.rig.snapTo(SPAWN_X + 10, this.player.body.y + 1);
    this.world.preload(this.rig.focus.x);

    L.progress(0.85, 'Warming up…');
    await nextFrame();
    this.renderer.renderer.compile(scene, this.rig.camera);

    L.progress(1, '');
    await this.enterMenu();
    L.hide();
    this.loop.start();
  }

  // ---------------------------------------------------------------- GameApi
  get persistentSaves(): boolean {
    return this.saves.persistent;
  }

  getSaveSummary(): Promise<{ summary: SaveSummary | null; problem: string | null }> {
    return this.saves.summary();
  }

  async newGame(): Promise<void> {
    this.story.reset();
    this.playTime = 0;
    this.player.placeAt(SPAWN_X);
    this.player.facing = 1;
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
    this.applySave(r.data);
    this.startPlaying();
    if (r.recoveredFromBackup) this.events.emit('toast', { text: 'Your last save was damaged — restored from the backup.', kind: 'warn', duration: 6 });
  }

  async saveGame(silent = false): Promise<boolean> {
    if (this.state === 'menu' || this.state === 'loading' || this.saving) return false;
    this.saving = true;
    if (!silent) this.events.emit('save:status', { state: 'saving' });
    try {
      await this.saves.save(this.snapshot());
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
    this.ui.hud.setVisible(false);
    this.ui.hud.reset();
    this.player.placeAt(SPAWN_X);
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
    this.locationId = null;
    this.regionId = null;
    this.rig.snapTo(this.player.body.x, this.player.body.y);
    this.world.preload(this.rig.focus.x);
    this.tutorial.reset(this.player.body.x);
    this.trackLocation(true);
  }

  private snapshot(): SaveData {
    const b = this.player.body;
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      playTime: this.playTime,
      player: { x: b.x, y: b.y, facing: this.player.facing },
      world: { seed: WORLD_SEED, time: this.env.time },
      story: this.story.serialize(),
      meta: { location: locationAt(b.x)?.name ?? '', region: regionAt(b.x).name },
    };
  }

  private applySave(d: SaveData): void {
    this.story.deserialize(d.story);
    this.playTime = d.playTime;
    const ground = this.world.collision.groundAt(d.player.x, this.player.body.halfWidth);
    this.player.placeAt(d.player.x, Math.max(d.player.y, ground) + 0.02);
    this.player.facing = d.player.facing;
  }

  private trackLocation(force = false): void {
    const x = this.player.body.x;
    const region = regionAt(x);
    const loc = locationAt(x);
    const regionChanged = region.id !== this.regionId;
    if (!force && !regionChanged && (loc?.id ?? null) === this.locationId) return;
    if (loc && loc.id !== this.locationId) {
      const first = this.story.discover(loc.id);
      this.events.emit('location:discovered', { id: loc.id, name: loc.name, region: region.name, first });
      if (first || force) this.ui.hud.showBanner(region.name, loc.name);
    } else if (regionChanged || force) {
      this.ui.hud.showBanner(region.tagline, region.name);
    }
    this.locationId = loc?.id ?? this.locationId;
    if (!loc) this.locationId = null;
    this.regionId = region.id;
    this.ui.hud.setLocation(region.name, loc?.name ?? '');
  }

  // ---------------------------------------------------------------- Loop
  private update(dt: number): void {
    if (this.input.consumeRaw('pause')) {
      if (!this.ui.back()) {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      }
    }
    if (this.ui.reader.visible && this.input.consumeRaw('interact')) this.ui.reader.close();

    const active = this.state === 'playing' && !this.ui.modalOpen;
    this.input.gameplayEnabled = active;
    if (!active) return;

    this.player.update(dt, this.input);
    const b = this.player.body;
    this.interactions.update(b.x, b.y, this.input, true);
    this.trackLocation();
    this.tutorial.update(dt, this.player);
    this.playTime += dt;
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
    const playing = this.state === 'playing' || this.state === 'paused';
    const simAlpha = this.state === 'playing' && !this.ui.modalOpen ? alpha : 1;
    this.model.update(this.state === 'paused' ? 0 : dt, simAlpha, this.player);
    if (this.state === 'menu') {
      this.menuTime += dt;
      const x = 22 + 24 * Math.sin(this.menuTime * 0.045 - 0.4);
      this.rig.pan(dt, x, this.world.terrain.heightAt(x) + 3.2);
      this.input.wheelDelta = 0;
    } else if (this.state === 'playing') {
      if (this.input.wheelDelta !== 0) {
        this.rig.zoom(this.input.wheelDelta);
        this.input.wheelDelta = 0;
      }
      const p = this.model.root.position;
      this.rig.follow(dt, p.x, p.y, this.player.body.vx);
    }
    const p = this.model.root.position;
    this.world.update(dt, this.rig.focus.x, p.x, p.y);
    this.env.update(dt, this.renderer.aspect, this.renderer.pixelRatio);
    this.audio.update(dt, this.rig.focus.x, this.env.time, playing && this.state === 'playing');
    this.ui.update(dt, this.project, this.settings.get().showFps ? this.loop.fps : null);
    this.renderer.render(this.rig.camera);
  }
}
