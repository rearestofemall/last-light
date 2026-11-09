import * as THREE from 'three';
import { BuildSystem } from '../building/BuildSystem';
import { PIECES } from '../building/pieces';
import type { GameEventBus } from '../core/events';
import type { Input } from '../core/Input';
import { clamp } from '../core/math';
import type { Settings } from '../core/Settings';
import { Crafting } from '../crafting/Crafting';
import type { Station } from '../crafting/recipes';
import { ambientTemperature } from '../environment/Climate';
import { WEATHER_LABEL, Weather } from '../environment/Weather';
import { WorldClock } from '../environment/WorldClock';
import { InteractionSystem } from '../interaction/InteractionSystem';
import { ContainerRegistry, Inventory, type ItemStack } from '../inventory/Inventory';
import { LightSystem } from '../lighting/LightSystem';
import type { SaveData } from '../persistence/schema';
import { SAVE_VERSION } from '../persistence/schema';
import { PlayerController } from '../player/PlayerController';
import { PlayerModel } from '../player/PlayerModel';
import type { CameraRig } from '../render/CameraRig';
import type { EnvironmentInput } from '../render/Environment';
import { NOTES } from '../story/notes';
import { Quests } from '../story/Quests';
import { StoryState } from '../story/StoryState';
import { Tutorial } from '../story/Tutorial';
import { Survival } from '../survival/Survival';
import type { BackpackHost } from '../ui/Backpack';
import type { HudFrame } from '../ui/HUD';
import type { UIManager } from '../ui/UIManager';
import { Wildlife } from '../wildlife/Wildlife';
import { World } from '../world/World';
import { locationAt, PLAYABLE, regionAt, regionWeight, RIVERS, SPAWN_X, WORLD_SEED } from '../world/WorldDef';
import { PlayerActions } from './PlayerActions';

const FOLIAGE = [
  { c: new THREE.Color(1.0, 0.52, 0.18), a: 0.6 }, // autumn
  { c: new THREE.Color(0.62, 0.58, 0.48), a: 0.55 }, // winter
  { c: new THREE.Color(0.55, 0.95, 0.35), a: 0.18 }, // spring
  { c: new THREE.Color(1, 1, 1), a: 0 }, // summer
];

/**
 * One playthrough: owns every gameplay system and runs them in a fixed order each tick.
 * Game (the shell) owns menus, the loop and persistence.
 */
const SIGHT: [number, number][] = [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [21, 21], [-21, 21], [21, -21], [-21, -21]];

export class Session implements BackpackHost {
  readonly inventory = new Inventory(24);
  readonly containers = new ContainerRegistry();
  readonly crafting: Crafting;
  readonly survival: Survival;
  readonly clock: WorldClock;
  readonly weather: Weather;
  readonly lights: LightSystem;
  readonly story: StoryState;
  readonly quests: Quests;
  readonly tutorial: Tutorial;
  readonly interactions: InteractionSystem;
  readonly world: World;
  readonly player: PlayerController;
  readonly model: PlayerModel;
  readonly actions: PlayerActions;
  readonly wildlife: Wildlife;
  readonly build: BuildSystem;
  ui!: UIManager;
  respawn = { x: SPAWN_X, y: 0, z: 0 };
  private poiTimer = 1;
  playTime = 0;
  /** True during fades/cutscenes: simulation pauses. */
  busy = false;
  private locationId: string | null = null;
  private regionId: string | null = null;
  private resourceTimer = 0;
  private envInput: EnvironmentInput = {
    hour: 9,
    sunElevation: 0.7,
    cloud: 0.3,
    rain: 0,
    snow: 0,
    fog: 0,
    wind: 0.4,
    flash: 0,
    coldness: 0,
    interior: false,
    foliage: new THREE.Color(1, 1, 1),
    foliageAmount: 0,
  };
  private mouseWorld = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private hotbarDirty = true;
  /** Cached per-tick context, reused for the HUD. */
  tempC = 14;
  shelter = 0;
  gloom = 0;

  constructor(
    scene: THREE.Scene,
    settings: Settings,
    private events: GameEventBus,
    private input: Input,
    private rig: CameraRig,
  ) {
    this.interactions = new InteractionSystem(events);
    this.story = new StoryState(events);
    this.crafting = new Crafting(events);
    this.story.onUnlock = (k) => this.crafting.trigger(k);
    this.quests = new Quests(this.story, events);
    this.survival = new Survival(events);
    this.clock = new WorldClock(events);
    this.weather = new Weather(events);
    this.lights = new LightSystem(events, settings.profile.lightPool);
    scene.add(this.lights.group);
    this.tutorial = new Tutorial(events, this.story);

    this.model = new PlayerModel();
    scene.add(this.model.root);

    // The world needs hosts that reference systems created after it; bind lazily.
    this.world = new World(scene, {
      settings,
      events,
      interactions: this.interactions,
      story: this.story,
      containers: this.containers,
      lights: this.lights,
      inventory: this.inventory,
      harvest: {
        inventory: this.inventory,
        events,
        tool: (k) => this.actions.tool(k),
        wearTool: (s) => this.actions.wearTool(s),
        day: () => this.clock.time,
        beginWork: () => this.actions.beginWork(),
      },
      host: {
        travel: (x, y, label) => void this.travel(x, y, label),
        hasTool: (k) => this.actions.tool(k) !== null,
        wearTool: (k) => {
          const t = this.actions.tool(k);
          if (t) this.actions.wearTool(t);
        },
        beginWork: () => this.actions.beginWork(),
        startEnding: () => void this.playEnding(),
        openCrafting: () => this.ui.backpack.open('craft'),
      },
    });
    this.player = new PlayerController(this.world.collision, events, SPAWN_X, 0, 1.5);
    this.rig.ground = (x, z) => (this.isUnderground() ? -1e9 : this.world.terrain.heightAt3(x, z));
    this.wildlife = new Wildlife(this.world.collision, {
      events,
      interactions: this.interactions,
      playerX: () => this.player.body.x,
      playerY: () => this.player.body.y,
      playerZ: () => this.player.body.z,
      lightAt: (x, y, z) => this.lights.lightAt(x, y, z),
      darkness: () => (this.isUnderground() ? 1 : 1 - this.clock.daylight),
      damagePlayer: (a, c) => this.survival.damage(a, c),
      giveLoot: (id, q) => {
        const left = this.inventory.add(id, q);
        if (q - left > 0) events.emit('item:gained', { id, qty: q - left });
        return q - left;
      },
      hasKnife: () => this.actions.tool('knife') !== null,
      isUnderground: (x, z, y) => this.world.collision.isUnderground(x, z, y),
    });
    scene.add(this.wildlife.group);
    this.actions = new PlayerActions(this.inventory, this.player, this.model, this.survival, this.lights, this.wildlife, events);
    this.build = new BuildSystem(this.world.terrain, this.world.collision, this.interactions, this.lights, this.containers, events, {
      inventory: this.inventory,
      playerBody: () => this.player.body,
      sleep: (q, at) => void this.sleep(q, at),
      openContainer: (id, title) => this.openContainer(id, title),
      openCrafting: () => this.ui.backpack.open('craft'),
      day: () => this.clock.time,
    });
    scene.add(this.build.group);
    this.addRiverInteractions();

    // Cross-system reactions
    events.on('player:jump', () => this.survival.onJump());
    events.on('player:land', (e) => {
      if (e.impact > 21) this.survival.damage((e.impact - 21) * 3.2, 'a bad fall');
    });
    events.on('container:open', (e) => this.openContainer(e.id, e.title));
    events.on('quest:updated', (e) => events.emit('toast', { text: `New objective: ${e.text}`, kind: 'good', duration: 6 }));
    this.inventory.onChange(() => (this.hotbarDirty = true));
  }

  attachUI(ui: UIManager): void {
    this.ui = ui;
    ui.buildBar.onSelect = (id) => {
      this.build.selected = id;
      this.build.removeMode = false;
    };
  }

  // ------------------------------------------------------------ BackpackHost
  stations(): Set<Station> {
    const s = new Set<Station>();
    const b = this.player.body;
    if (this.lights.nearestLit(b.x, b.y + 0.5, b.z, ['campfire', 'barrel'], 3.5)) s.add('fire');
    if (this.build.workbenchNear(b.x, b.y, b.z)) s.add('workbench');
    for (const st of this.world.stations) if (Math.abs(st.x - b.x) < 3.5 && Math.abs(st.y - b.y) < 2 && Math.abs(b.z) < 5) s.add('workbench');
    return s;
  }

  use(slot: number): void {
    this.actions.consume(slot);
  }

  equip(slot: number): void {
    this.actions.equip(slot);
  }

  clothing(): ItemStack | null {
    return this.actions.clothing;
  }

  unequip(): void {
    this.actions.unequip();
  }

  // ------------------------------------------------------------ world helpers
  private addRiverInteractions(): void {
    for (const r of RIVERS) {
      if (r.frozen) continue;
      const half = r.width / 2 + r.bank * 0.6;
      this.interactions.add({
        id: `river-${r.id}`,
        x: r.x,
        y: 0,
        radius: half,
        verb: '',
        label: '',
        priority: -0.5,
        inRange: (px, py) => Math.abs(px - r.x) < half && py < this.world.terrain.base(r.x) + 0.3 && py > this.world.terrain.riverBedY(r) - 1,
        prompt: () => (r.salt ? 'Taste the water (salt)' : 'Drink from the river'),
        altPrompt: () => (!r.salt && this.inventory.count('bottle') > 0 ? 'Fill a container' : null),
        onInteract: () => {
          if (r.salt) {
            this.survival.apply({ thirst: -8 });
            this.events.emit('toast', { text: 'Seawater. It only makes the thirst worse.', kind: 'warn', duration: 3 });
            return;
          }
          this.survival.apply({ thirst: 20 });
          this.events.emit('sfx', { name: 'drink' });
          if (Math.random() < 0.18) {
            this.survival.sickness = 60;
            this.events.emit('toast', { text: 'The water tastes of mud. Your stomach churns.', kind: 'warn', duration: 4 });
          }
        },
        onAlt: () => {
          if (this.inventory.remove('bottle', 1) === 1) {
            this.inventory.add('water_dirty', 1);
            this.events.emit('item:gained', { id: 'water_dirty', qty: 1 });
            this.events.emit('sfx', { name: 'drink' });
          }
        },
      });
    }
  }

  openContainer(id: string, title: string): void {
    const c = this.containers.get(id);
    if (!c) return;
    this.ui.backpack.open('items', { id, title: title || c.title, inv: c.inv });
  }

  isUnderground(): boolean {
    return this.world.collision.isUnderground(this.player.body.x, this.player.body.z, this.player.body.y);
  }

  async travel(x: number, y: number, label = '', z = 0): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    await this.ui.fader.run(label, () => {
      this.player.placeAt(x, y, z);
      this.rig.snapTo(x, this.player.body.y, z);
      this.world.preload(x, z);
    }, label ? 900 : 250);
    this.busy = false;
    this.input.flush();
  }

  async sleep(quality: number, at: { x: number; y: number; z?: number }): Promise<void> {
    if (this.busy) return;
    const s = this.survival;
    const hour = this.clock.hour;
    const night = hour >= 19 || hour < 6;
    if (!night && s.vitals.energy > 55) {
      this.events.emit('toast', { text: 'You aren’t tired enough to sleep yet.', kind: 'info', duration: 3 });
      return;
    }
    const b = this.player.body;
    if (this.lights.lightAt(b.x, b.y + 1, b.z) < 0.3 && this.clock.isNight && !this.world.insideInterior(b.x, b.y, b.z) && this.build.shelterAt(b.x, b.y, b.z) < 2) {
      this.events.emit('toast', { text: 'Sleeping in the open dark is asking for wolves. Light a fire first.', kind: 'warn', duration: 4 });
      return;
    }
    this.busy = true;
    const hours = night ? this.clock.hoursUntilMorning() : 3;
    this.respawn = { x: at.x, y: at.y, z: at.z ?? 0 };
    const day0 = this.clock.day;
    await this.ui.fader.run(night ? `Day ${day0 + (hour >= 19 ? 1 : 0)}` : 'You rest for a few hours', () => {
      this.clock.advanceHours(hours);
      const sheltered = this.shelter > 0 ? 1.15 : 1;
      s.sleep(hours, quality * sheltered);
      for (const l of this.lights.sources) if (l.on && Number.isFinite(l.fuel)) l.fuel = Math.max(0, l.fuel - hours * 120);
      this.wildlife.clear();
      this.resources();
    }, 1400);
    this.busy = false;
    this.events.emit('toast', { text: 'Rested. You’ll return here if you fall.', kind: 'good', duration: 3.5 });
  }

  private resources(): void {
    this.world.resources.update(this.clock.time);
  }

  async handleDeath(): Promise<void> {
    this.busy = true;
    this.events.emit('sfx', { name: 'death' });
    await this.ui.death.open(this.survival.deathCause);
    await this.ui.fader.run('', () => {
      const s = this.survival;
      s.dead = false;
      s.vitals.health = 55;
      s.vitals.hunger = Math.max(s.vitals.hunger, 35);
      s.vitals.thirst = Math.max(s.vitals.thirst, 35);
      s.vitals.warmth = 55;
      s.vitals.stamina = 100;
      s.vitals.energy = Math.max(s.vitals.energy, 40);
      s.wetness = 0;
      s.sickness = 0;
      this.clock.advanceHours(5);
      this.wildlife.clear();
      this.player.placeAt(this.respawn.x, this.respawn.y, this.respawn.z);
      this.rig.snapTo(this.player.body.x, this.player.body.y, this.player.body.z);
      this.world.preload(this.player.body.x, this.player.body.z);
    }, 600);
    this.busy = false;
    this.input.flush();
  }

  async playEnding(): Promise<void> {
    if (this.story.flags['ending']) return;
    this.busy = true;
    this.events.emit('sfx', { name: 'discover' });
    await this.ui.fader.run('', async () => {
      this.story.flags['ending'] = true;
      this.quests.update(false);
      this.world.applyGates();
      const stats = `Days survived: ${this.clock.day} · Places found: ${this.story.locations.size} · Documents read: ${this.story.readNotes.size}/${Object.keys(NOTES).length}`;
      this.ui.fader.el.classList.remove('is-visible');
      await this.ui.ending.open(NOTES['epilogue'].body, stats);
      // Wake at dawn outside the station.
      this.clock.time = Math.floor(this.clock.time) + 1 + 6.5 / 24;
      this.weather.set('clear');
      const x = -786;
      this.player.placeAt(x);
      this.respawn = { x, y: this.player.body.y, z: 0 };
      this.rig.snapTo(x, this.player.body.y);
      this.world.preload(x, 0);
    }, 400, true);
    this.busy = false;
    this.input.flush();
  }

  // ------------------------------------------------------------ lifecycle
  newGame(): void {
    this.story.reset();
    this.quests.reset();
    this.crafting.reset();
    this.survival.reset();
    this.inventory.clear();
    this.build.clear();
    this.actions.reset();
    this.wildlife.clear();
    this.clock.time = 1 + 8 / 24;
    this.weather.deserialize({ state: 'clear', timer: 400 });
    this.respawn = { x: SPAWN_X, y: 0, z: 0 };
    this.playTime = 0;
    // Fresh containers and node states: the registry keeps site crates, so reset them.
    this.resetContainers();
    this.world.resources.deserialize({});
    this.restoreLights({});
    this.player.placeAt(SPAWN_X, undefined, 1.5);
    this.player.heading = Math.PI / 2;
    this.rig.yaw = -Math.PI / 2 + 0.35;
    this.rig.pitch = 0.34;
    this.respawn.y = this.player.body.y;
    this.locationId = null;
    this.regionId = null;
    this.quests.update(false);
  }

  /** Site crates keep their initial loot definition; rebuild them from scratch on new game. */
  private resetContainers(): void {
    const initial = this.initialContainers ??= this.containers.serialize();
    this.containers.deserialize(initial);
  }
  private initialContainers: ReturnType<ContainerRegistry['serialize']> | null = null;
  private initialLights: Record<string, { fuel: number; on: boolean }> | null = null;

  /** Capture pristine state of site containers/lights right after the world is built. */
  captureInitialState(): void {
    this.initialContainers = this.containers.serialize();
    this.initialLights = this.serializeLights();
  }

  private serializeLights(): Record<string, { fuel: number; on: boolean }> {
    const out: Record<string, { fuel: number; on: boolean }> = {};
    for (const l of this.lights.sources) {
      if (l.id === 'held' || l.id.startsWith('build-') || l.id.startsWith('street-') || !Number.isFinite(l.fuel)) continue;
      out[l.id] = { fuel: Math.round(l.fuel), on: l.on };
    }
    return out;
  }

  private restoreLights(data: Record<string, { fuel: number; on: boolean }>): void {
    const base = this.initialLights ?? {};
    for (const l of this.lights.sources) {
      const d = data[l.id] ?? base[l.id];
      if (!d) continue;
      l.fuel = d.fuel;
      l.on = d.on && d.fuel > 0;
    }
  }

  snapshot(): SaveData {
    const b = this.player.body;
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      playTime: this.playTime,
      player: { x: b.x, y: b.y, z: b.z, heading: this.player.heading },
      respawn: { ...this.respawn },
      world: { seed: WORLD_SEED, time: this.clock.time, weather: this.weather.serialize() },
      survival: this.survival.serialize(),
      inventory: this.inventory.serialize(),
      equipment: this.actions.serialize(),
      crafting: this.crafting.serialize(),
      containers: this.containers.serialize(),
      structures: this.build.serialize(),
      resources: this.world.resources.serialize(),
      lights: this.serializeLights(),
      story: this.story.serialize(),
      meta: { location: locationAt(b.x)?.name ?? '', region: regionAt(b.x).name, day: this.clock.day },
    };
  }

  restore(d: SaveData): void {
    this.newGame();
    this.story.deserialize(d.story);
    this.crafting.deserialize(d.crafting);
    // Recipes from documents read before this version existed.
    for (const id of this.story.readNotes) this.crafting.learnSilently(`note:${id}`);
    for (const id of this.story.locations) this.crafting.learnSilently(`loc:${id}`);
    this.survival.deserialize(d.survival);
    this.inventory.deserialize(d.inventory);
    this.actions.deserialize(d.equipment);
    this.clock.time = d.world.time;
    this.weather.deserialize(d.world.weather);
    this.build.deserialize(d.structures);
    this.containers.deserialize(d.containers);
    this.world.resources.deserialize(d.resources);
    this.restoreLights(d.lights);
    this.playTime = d.playTime;
    this.respawn = { ...d.respawn };
    this.player.placeAt(d.player.x, d.player.y, d.player.z);
    this.player.heading = d.player.heading;
    this.rig.yaw = d.player.heading + Math.PI;
    this.rig.pitch = 0.34;
    this.world.applyGates();
    this.quests.update(false);
    this.hotbarDirty = true;
  }

  /** Called when entering play (new game or continue). */
  begin(): void {
    this.locationId = null;
    this.regionId = null;
    this.tutorial.reset(this.player.body.x);
    this.trackLocation(true);
    this.hotbarDirty = true;
    this.quests.update(false);
  }

  // ------------------------------------------------------------ per tick
  /** Menu keys that work during play. Returns true if a menu opened or closed. */
  handleMenus(): boolean {
    const ui = this.ui;
    const inp = this.input;
    if (inp.consumeRaw('inventory')) {
      if (ui.backpack.visible) ui.backpack.close();
      else if (!ui.modalOpen) ui.backpack.open('items');
      return true;
    }
    if (inp.consumeRaw('craft')) {
      if (ui.backpack.visible) ui.backpack.close();
      else if (!ui.modalOpen) ui.backpack.open('craft');
      return true;
    }
    if (inp.consumeRaw('map')) {
      if (ui.map.visible) ui.map.close();
      else if (!ui.modalOpen) {
        const q = this.quests.current;
        ui.map.open(this.story, { x: this.player.body.x, z: this.player.body.z, heading: this.player.heading }, q ? { text: q.text, x: q.target } : null);
      }
      return true;
    }
    if (inp.consumeRaw('journal')) {
      if (ui.journal.visible) ui.journal.close();
      else if (!ui.modalOpen) ui.journal.open(this.story, this.quests, `Day ${this.clock.day} · ${this.clock.season} · ${Math.floor(this.playTime / 60)} minutes on the road`);
      return true;
    }
    if (inp.consumeRaw('build')) {
      if (!ui.modalOpen) this.toggleBuild(!this.build.active);
      return true;
    }
    return false;
  }

  toggleBuild(on: boolean): void {
    if (on && this.isUnderground()) {
      this.events.emit('toast', { text: 'There’s no room to build down here.', kind: 'info', duration: 2.5 });
      return;
    }
    this.build.setActive(on);
    this.ui.buildBar.visible = on;
    this.ui.hud.setBuildMode(on);
    if (on && !this.build.available().length) this.events.emit('toast', { text: 'Craft building pieces first (C) — floors, walls, a campfire.', kind: 'hint', duration: 5 });
  }

  update(dt: number): void {
    if (this.busy) return;
    const b = this.player.body;
    const inp = this.input;
    const underground = this.isUnderground();

    // Build mode input
    if (this.build.active) {
      const avail = this.build.available();
      for (let i = 0; i < 6; i++) if (inp.consume(`slot${i + 1}` as 'slot1') && avail[i]) {
        this.build.selected = avail[i];
        this.build.removeMode = false;
      }
      if (inp.consume('remove') || inp.consume('rclick')) this.build.removeMode = !this.build.removeMode;
      if (inp.consume('alt')) this.build.rotate();
      const w = this.mouseToWorld();
      this.build.updateCursor(w);
      if (inp.consume('click')) {
        if (this.build.removeMode) this.build.demolish();
        else this.build.confirm();
      }
      this.ui.buildBar.render(avail.map((id) => ({ id, count: this.inventory.count(PIECES[id].item) })), this.build.selected, this.build.removeMode, this.build.candidate?.reason ?? '');
    }

    // Player movement and actions
    this.survival.modifiers(this.player.modifiers);
    this.player.update(dt, inp);
    this.shelter = underground || this.world.insideInterior(b.x, b.y, b.z) ? 2 : this.build.shelterAt(b.x, b.y, b.z);
    const precip = this.shelter > 0 ? 0 : this.weather.precipitation;
    if (!this.build.active) this.actions.update(dt, inp, precip, this.shelter > 0);
    else this.actions.update(dt, inp, precip, this.shelter > 0);
    this.model.holdingLight = this.actions.lightRadius > 0;
    this.interactions.update(b.x, b.y, b.z, inp, !this.build.active);

    // World simulation
    this.clock.update(dt);
    this.weather.setContext(regionAt(b.x).id, this.clock.season === 'Winter');
    this.weather.update(dt);
    this.lights.update(dt, b.x, b.y, b.z, this.weather.precipitation * (this.weather.rain > this.weather.snow ? 1 : 0.4), this.weather.wind);
    this.wildlife.update(dt);
    this.resourceTimer -= dt;
    if (this.resourceTimer <= 0) {
      this.resourceTimer = 2;
      this.resources();
      this.build.update();
    }

    // Survival
    this.tempC = ambientTemperature(b.x, this.clock, this.weather, underground);
    this.survival.update(dt, {
      sprinting: this.player.sprinting,
      moving: Math.abs(b.vx) > 0.5,
      swimming: this.player.state === 'swim',
      ambientC: this.tempC,
      fireHeat: this.lights.heatAt(b.x, b.y + 0.8, b.z),
      shelter: this.shelter,
      clothing: this.actions.warmthBonus,
      precipitation: precip,
      inWater: this.player.submersion > 0.6,
    });

    // Story
    // Reveal what the player can see: their cell and a ring around it.
    for (const [ox, oz] of SIGHT) this.story.explore(b.x + ox, b.z + oz);
    this.trackLocation();
    this.poiTimer -= dt;
    if (this.poiTimer <= 0) {
      this.poiTimer = 1;
      const poi = this.world.poiNear(b.x, b.z, 16);
      if (poi && this.story.discover(poi.id)) {
        this.events.emit('sfx', { name: 'discover' });
        this.ui.hud.showBanner(regionAt(poi.x).name, poi.name);
      }
    }
    this.quests.update();
    this.tutorial.update(dt, this.player, this.clock, this.inventory);
    this.playTime += dt;

    if (this.survival.dead) void this.handleDeath();
    if (b.y < -300) {
      // Safety net: fell out of the world.
      this.player.placeAt(this.respawn.x, this.respawn.y, this.respawn.z);
    }
  }

  /** Where the crosshair points: structures first, then terrain (ray-marched), within reach. */
  private mouseToWorld(): THREE.Vector3 | null {
    const cam = this.rig.camera;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), cam);
    const ray = this.raycaster.ray;
    const b = this.player.body;
    this.raycaster.far = 40;
    const hits = this.raycaster.intersectObject(this.build.group, true).filter((h) => !(h.object as THREE.Mesh).userData.ghost);
    let best: THREE.Vector3 | null = null;
    for (const h of hits) {
      if (h.point.distanceTo(new THREE.Vector3(b.x, b.y + 1, b.z)) < 12) {
        best = h.point.clone().add(h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld).multiplyScalar(0.3) : new THREE.Vector3());
        break;
      }
    }
    if (best) return this.mouseWorld.copy(best);
    const t = this.world.terrain;
    const p = new THREE.Vector3();
    for (let d = 0.5; d < 40; d += 0.25) {
      ray.at(d, p);
      if (p.y <= t.heightAt3(p.x, p.z)) {
        if (Math.hypot(p.x - b.x, p.z - b.z) > 12) return null;
        return this.mouseWorld.copy(p);
      }
    }
    return null;
  }

  private trackLocation(force = false): void {
    const x = this.player.body.x;
    const region = regionAt(x);
    // Named places line the road; out in the wilds you're simply in the region.
    const loc = Math.abs(this.player.body.z) < 45 || this.isUnderground() ? locationAt(x) : null;
    const regionChanged = region.id !== this.regionId;
    if (!force && !regionChanged && (loc?.id ?? null) === this.locationId) return;
    if (loc && loc.id !== this.locationId) {
      const first = this.story.discover(loc.id);
      this.events.emit('location:discovered', { id: loc.id, name: loc.name, region: region.name, first });
      if (first) this.events.emit('sfx', { name: 'discover' });
      if (first || force) this.ui.hud.showBanner(region.name, loc.name);
    } else if (regionChanged && !force) {
      this.ui.hud.showBanner(region.tagline, region.name);
    } else if (force) {
      this.ui.hud.showBanner(region.tagline, region.name);
    }
    this.locationId = loc?.id ?? null;
    this.regionId = region.id;
    this.ui.hud.setLocation(region.name, loc?.name ?? '');
  }

  // ------------------------------------------------------------ per frame
  /** Inputs for the renderer's environment (sky, light, weather FX). */
  environment(focusX: number, focusY: number, focusZ: number): EnvironmentInput {
    const e = this.envInput;
    const underground = this.world.collision.isUnderground(focusX, focusZ, focusY - 1.6);
    e.hour = this.clock.hour;
    e.sunElevation = this.clock.sunElevation;
    e.cloud = this.weather.cloud;
    e.rain = this.weather.rain;
    e.snow = this.weather.snow;
    e.fog = this.weather.fog;
    e.wind = this.weather.wind;
    e.flash = this.weather.flash;
    e.coldness = regionWeight('frost', focusX, 60) * 0.6;
    e.interior = underground;
    const f = FOLIAGE[this.clock.seasonIndex];
    const next = FOLIAGE[(this.clock.seasonIndex + 1) % 4];
    const k = clamp((this.clock.seasonProgress - 0.75) / 0.25, 0, 1);
    e.foliage.copy(f.c).lerp(next.c, k);
    e.foliageAmount = f.a + (next.a - f.a) * k;
    return e;
  }

  hudFrame(darkness: number): HudFrame {
    const b = this.player.body;
    const light = this.lights.lightAt(b.x, b.y + 1, b.z);
    this.gloom = darkness * (1 - Math.min(1, light * 0.9)) * 0.85;
    const q = this.quests.current;
    return {
      vitals: this.survival.vitals,
      warmthTarget: this.survival.warmthTarget,
      wet: this.survival.wetness,
      sick: this.survival.sickness > 0,
      gloom: this.gloom,
      clock: this.clock.label(),
      day: this.clock.day,
      season: this.clock.season,
      weather: this.isUnderground() ? 'Underground' : WEATHER_LABEL[this.weather.state],
      tempC: this.tempC,
      objective: q ? q.text : null,
    };
  }

  frame(dt: number, alpha: number, paused: boolean): void {
    this.model.update(paused ? 0 : dt, alpha, this.player);
    if (this.hotbarDirty || this.lastSelected !== this.actions.selected) {
      this.hotbarDirty = false;
      this.lastSelected = this.actions.selected;
      this.ui.hud.renderHotbar(this.inventory, this.actions.selected);
    }
    // Torches burn down continuously: refresh their bar now and then.
    this.hotbarTimer -= dt;
    if (this.hotbarTimer <= 0) {
      this.hotbarTimer = 1;
      this.hotbarDirty = true;
    }
  }
  private lastSelected = -1;
  private hotbarTimer = 0;

  get worldBounds(): { min: number; max: number } {
    return PLAYABLE;
  }
}
