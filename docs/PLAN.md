# THE LAST LIGHT — Architecture & Development Plan

## 1. Starting point

The repository was empty: only `LICENSE` (MIT) and a one-line `README.md`, with no framework, source code or
dependencies. Everything below is new.

## 2. Technical decisions

| Concern | Decision | Why |
|---|---|---|
| Rendering | Three.js r170, `WebGLRenderer`, ACES tone mapping, sRGB output | Mature, small, no engine lock-in |
| Language / build | TypeScript (strict) + Vite 6 | Fast HMR, tree-shaken production build |
| Tests | Vitest for pure logic (terrain, collision, saves, inventory, crafting) | Gameplay rules are tested without a GPU |
| Physics | **Custom 2D kinematic physics** in the XY gameplay plane | Movement is constrained to one plane, so a 3D physics engine would add weight without adding anything |
| Persistence | IndexedDB (hand-written thin wrapper), versioned schema with migrations and a backup slot | No dependency; corruption recovery |
| Preferences | `localStorage` (quality, volume) | Per-device, not part of a save |
| Audio | Web Audio API, **fully synthesised** (noise + oscillators + filters) | No copyrighted or binary assets; tiny download |
| Art | Procedural low-poly geometry, vertex colours, small generated canvas textures | Original assets, consistent stylised look, quick to load |

### The 2.5D model

* The world is a long strip along **X**. **Y** is up. The **gameplay plane is z = 0**.
* The player, wildlife paths, interactables and buildings live on (or straddle) z = 0. Collision is solved in 2D (XY).
* The terrain is a real 3D heightfield `H(x, z)`. Along the gameplay plane it equals the walkable profile `h(x)`; behind
  the plane (z < 0) it rises into rolling hills, and in front of it (z > 0) it holds low foreground cover. Rivers run
  along Z, so they cut valleys through the whole depth of the scene.
* An **orthographic camera** looks at the plane from +Z, pitched down ~12°, so the depth of the world is visible.
* An orthographic camera has no natural parallax, so distant mountain and tree-line layers are **separate procedural
  meshes** that move at a fraction of the camera speed. Atmospheric fog plus distance tinting give aerial perspective.

### World layout (west → east, continuous)

```
 x: -900 ........ -250 ............ 450 ............ 1100 ............ 1700
    | FROSTLANDS  | VERDANT WOODS   | FORGOTTEN CITY  | DROWNED COAST  |
                  ^ spawn at x = 0
```

Regions blend into each other over transition zones (a mountain pass, a ruined highway, a sea-cliff road) instead of
loading through a menu. The world is **authored data + seeded noise**: landmarks (cabins, rivers, ridges, sites) are
placed by hand in `WorldDef`, and noise fills in the detail, so the world is the same every playthrough. Underground
passages (city, research facility) are sub-levels below the surface strip that you enter through hatches. They use
the same plane and collision code.

## 3. Module architecture

```
src/
  main.ts                 bootstrap
  core/                   Game state machine, fixed-timestep loop, input, typed EventBus, settings, RNG, noise, math
  render/                 Renderer (quality presets), CameraRig, Sky, Lighting, Parallax, Particles, shared materials
  world/                  WorldDef (regions, sites), Terrain (height and surface queries), ChunkManager (streaming),
                          chunk mesh builders, vegetation and prop generators, Water, Sites (cabins etc.)
  physics/                CollisionWorld (AABBs + terrain), kinematic body solver
  player/                 PlayerController (movement rules), PlayerModel (procedural rig + animation)
  interaction/            Interactable registry, nearest-target selection, prompts
  survival/   (M2)        Attributes, rates, status effects
  inventory/  (M2)        Item database, slot inventory, containers, transfer
  crafting/   (M2)        Recipe database, unlock rules, craft transaction
  environment/(M3)        WorldClock, Weather state machine, temperature model, seasons
  lighting/   (M3)        Light sources (campfire, lantern, fixed), fuel, darkness and visibility queries
  wildlife/   (M3)        Species definitions, behaviour state machines, spawner
  building/   (M4)        Build grid, pieces, placement validation, structure persistence
  story/      (M5)        Discoveries, journal, story flags, radio transmissions
  audio/                  AudioEngine (buses, ambience, synthesised SFX, adaptive music in M6)
  persistence/            SaveManager (IndexedDB), schema, validation, migrations
  ui/                     DOM UI: menus, HUD, panels; one class per screen, shared CSS design tokens
```

**Communication rules**

* Systems are classes with `update(dt)`. `Game` owns them and calls them in a fixed order.
* Cross-system notifications go through a **typed EventBus**, for example `player:land` → audio and survival, or
  `region:enter` → UI and story. Systems do not reach into each other's internals.
* Queries go through narrow interfaces. Terrain exposes `heightAt`, `surfaceAt`, `waterAt`; collision exposes
  `CollisionWorld`; lighting (M3) exposes `lightLevelAt(x, y)`, which wildlife, survival and visibility all use.
* Everything persistent implements `serialize()/deserialize()` into the versioned save schema. The UI never owns
  game state.

**Game loop.** The simulation runs at a fixed 60 Hz with up to 5 catch-up steps per frame. Rendering runs at display
rate and interpolates the player's visual position. The world keeps rendering behind the main menu (attract mode)
and the pause screen.

## 4. Technical risks & mitigations

| Risk | Mitigation |
|---|---|
| Fill rate and draw calls on weak GPUs (vegetation, shadows) | Chunk streaming; `InstancedMesh` per vegetation type per chunk; the shadow frustum only covers the area around the player, snapped to texels; quality presets (Low has no shadows, 0.75 render scale and half the vegetation) |
| Hitches when generating chunks | At most one chunk is built per frame; geometry is reused across instances; unloaded chunks dispose their GPU resources |
| Orthographic + depth sorting artefacts with foliage and transparency | Opaque low-poly foliage (no alpha cards). Transparency is limited to water, particles and cut-away walls |
| Foreground objects hiding the player | No tall objects in the foreground band (z > 2.5). Building front walls and roofs fade out when the player is inside |
| 2.5D collision edge cases (steps, slopes, one-way platforms, water) | One kinematic solver with step-up, ground snapping, slope limit, coyote time and jump buffering, covered by unit tests |
| Darkness making the game unreadable (M3) | Night keeps a moonlit floor and a rim light on the player; light radius is computed in gameplay terms and also drives the renderer |
| Save corruption or version drift | Schema version + migrations; validation on load; a backup slot written before every overwrite; clear UI if a save can't be read |
| Web Audio autoplay policy | The audio context starts on the first user gesture (the menu click) |
| IndexedDB unavailable (private mode) | Falls back to an in-memory store and warns the player that progress won't persist |
| Scope creep / disconnected features | Strict milestone order; each milestone has to be playable and pass typecheck, tests and build before the next one starts |

## 5. Milestones — status

All six milestones are implemented. Each one was typechecked, tested, built and played in a browser (headless
Chromium with scripted input).

| Milestone | Status | Notes |
|---|---|---|
| M1 Playable foundation | ✅ | Terrain, camera, physics, character, Verdant Woods, menus, saves, audio |
| M2 Survival | ✅ | Six vitals with consequences; items, inventory (drag-and-drop, containers), 27 recipes with progressive unlocks, resource nodes with tools and regrowth |
| M3 World systems | ✅ | Clock with seasons, blended atmosphere with stars and moon, weather state machine, climate model, fuelled lights with a fixed light pool, wildlife state machines (wolves fear light) |
| M4 Construction | ✅ | Grid build mode with support rules and preview, 13 pieces, doors, chests, beds, lamps, workbench, shelter, demolition refunds, persistence |
| M5 Exploration | ✅ | Frostlands, City and Coast with authored sites; gates; three underground levels; map; journal; 15-step main quest; optional photographs and radio; ending |
| M6 Polish | ✅ | Adaptive generative music, ~25 synthesised SFX, ambience, action animations, adaptive resolution, throttled shadows, weak-device defaults, save v2 migration |

**Verification performed**
- 48 unit tests: terrain, collision, movement, saves and migration, inventory, crafting, survival, clock, weather and quests.
- A bot walked every region end to end. A planner bot climbed every multi-storey structure (apartments, broadcast house,
  lighthouse, station, loft, shipwreck); the metro carriage was climbed with a scripted input sequence.
- A scripted playthrough of the entire main questline, from the tent note to throwing the breaker and the ending, using
  real keypresses.
- Save → full page reload → Continue restores position, inventory, structures, fire fuel, quests and settings.
  Corrupted saves recover from the backup or are reported clearly.

**Known limitations**
- Frame rate was only measured with software rendering (SwiftShader), not on real GPUs. Draw calls stay around 65–140
  per frame and triangles around 20–100k.
- Discarded items are destroyed (there are no item drops in the world). There is one save slot.
- Wildlife is not saved; animals respawn around the player.
- Keyboard and mouse only (no gamepad or touch controls).

## 6. Acceptance criteria tracking

| # | Criterion | Milestone |
|---|---|---|
| 1 | Start a new game and enter the wilderness | M1 ✅ |
| 2 | Move, jump, interact | M1 ✅ |
| 3 | Terrain collision | M1 ✅ |
| 4 | Collect resources | M2 ✅ |
| 5 | Inventory quantities update | M2 ✅ |
| 6 | Crafting consumes and produces | M2 ✅ |
| 7 | Survival attributes change over time | M2 ✅ |
| 8 | Day/night | M3 ✅ |
| 9 | Light sources illuminate | M3 ✅ |
| 10 | Weather affects gameplay | M3 ✅ |
| 11 | Buildings place and persist | M4 ✅ |
| 12 | Regions explorable | M5 ✅ |
| 13 | Story discoveries recorded | M5 ✅ |
| 14 | Save/load restores world | ✅ |
| 15 | Production build passes | ✅ |
