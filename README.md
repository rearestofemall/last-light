# The Last Light

A third-person, open-world 3D survival and exploration game for the browser, built with Three.js, TypeScript
and Vite.

> Weeks ago every powered circuit in the world went dark in the same second.
> You wake in a cold camp in the Verdant Woods. J. has gone ahead for help.
> Fire is the only light left, and something waits beyond it.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm test           # unit tests
```

Add `?viewer` to the URL (e.g. http://localhost:5173/?viewer) to open the character viewer. It shows the
survivor on a turntable, with buttons for every animation, held items, cold/tired/death states and a slope for
foot IK. `?viewer=animals` opens a lineup of randomly varied wildlife with every behaviour (reroll per region).

### Windows build

The ready-to-play `TheLastLight.exe` is on the `Download` branch. To rebuild it (Node + Go 1.22+, from any OS):

```bash
./scripts/build-exe.sh   # → release/TheLastLight.exe
```

The launcher (`desktop/`) embeds the production build, serves it on a private localhost port and shows it in a
native Microsoft Edge WebView2 window; saves live in `%APPDATA%\TheLastLight`.

## Controls

Click the game to capture the mouse (Esc releases it). Without pointer lock, hold the right mouse button and drag
to look around.

| Action | Keys |
|---|---|
| Move / sprint | W A S D (camera-relative) / Shift |
| Look around · zoom | Mouse · mouse wheel |
| Jump / swim up | Space (hold for height) |
| Drop through a floor | Z + Space |
| Interact · gather · read · open | E |
| Secondary action (fill a container, put out a fire) | R |
| Use the held item: eat, drink, attack, lantern on/off | F or left click |
| Hotbar | 1–6 (Shift + wheel cycles) |
| Backpack · Crafting · Build · Map · Journal | Tab · C · B · M · J |
| In build mode: place · rotate · demolish | Click · R · X (or right click) |
| Pause | Esc |

## What's in the game

- **An open world** of about 2.5 × 0.8 km in one mountain-ringed valley, streamed in chunks as you walk. It has
  four regions: the **Verdant Woods**, the **Frostlands**, the **Forgotten City** and the **Drowned Coast**.
  An old road runs through them, but you can wander anywhere. Hills, forests, meadows, rivers, a frozen lake,
  city blocks and a beach reach out to the mountain walls. About 46 wild places sit off the road: hunters'
  camps, huts, deer stands, wrecked cars, caches and beached boats, each with loot. Story gates open as you
  progress: a rope crosses the gorge, the metro tunnel runs under the collapsed overpass, and a pickaxe digs
  through the rockslide at Halcyon Pass. Underground there are the Union Line metro, the sea caves and the
  Halcyon lab. Cabins, apartments and the lighthouse have walkable stairs, and their walls and roofs fade
  when you step inside.
- **Survival:** health, hunger, thirst, warmth, stamina and energy all have consequences. Starving, thirst and
  freezing drain health. Low stamina stops you sprinting and jumping, and low energy slows you down. You can get
  soaked, get sick from raw meat or river water, take fall damage, die, and wake again where you last slept.
- **Light is life:** campfires, torches, lanterns, oil lamps, fire barrels and the lighthouse beacon all burn
  fuel and light the 3D world. Rain puts out exposed fires. Wolves hunt in the dark, keep their distance from
  light, and circle at its edge.
- **Day/night, seasons and weather:** the sun and moon move across the sky, with stars, dawn and dusk. Weather
  includes rain, thunderstorms, fog, snow and blizzards, each region has its own climate, and autumn foliage
  gives way to winter.
- **Wildlife:** deer, rabbits, wolves and birds, each with its own behaviour states. You can hunt and butcher
  animals.
- **Gathering & crafting:** trees, rocks, berry bushes, grass, herbs, fallen branches and scrap all deplete and
  regrow. There are 27 recipes; some need a fire or a workbench, and most are learned from documents you find.
- **Building:** aim with the crosshair to place floors, walls, doors, windows, roofs and multi-storey builds
  on a 2 m grid. You can also place campfires, chests, bedrolls, beds, tables, lamps and workbenches, and
  rotate them with R. Pieces follow support rules, and a ghost preview shows whether a spot is valid. An
  enclosed, roofed room shelters you from rain and cold, and its roof and near walls hide while you're
  inside. Everything you build persists.
- **Story:** a 15-step main questline that reveals the cause of the blackout, plus optional photographs, radio
  transmissions and journals. The top-down map has hill shading and clears its fog of war as you explore. It
  marks landmarks and the wild places you've discovered. The journal keeps your objectives and documents.
- **Audio:** everything is synthesised at runtime. That includes adaptive music per region, time of day and
  danger, ambience, footsteps that change with the surface, and wildlife.
- **Saves:** IndexedDB autosaves every 90 seconds, and you can save manually. Saves are versioned (with
  migrations), checksummed and keep a backup slot.

## A few tips (spoiler-light)

- Read J.'s note first. The sketch on the back gets you started: gather branches, stones and fibre, then
  craft an axe and a campfire.
- Before dark, build or find a fire. Carry a torch at night; wolves won't come into the light.
- Boil river water at a fire before you drink it, and cook meat.
- The Frostlands will kill you without a hide parka. The recipe is with the lighthouse keeper.

## Performance

The game is designed to run on modest hardware without changing the art:

- **Adaptive resolution:** the internal resolution drops automatically to hold around 55 fps.
- **Fewer shadow updates on lower settings:** shadows refresh every 2nd (Medium) or 3rd (Low) frame. On Low,
  materials switch to Lambert shading and vegetation is thinner.
- **First launch on a weak device** (≤4 cores, ≤4 GB memory, or a phone/tablet) starts on Low.
- **Efficient rendering:**
  - A fixed pool of point lights means shaders never recompile.
  - Terrain and vegetation stream in 48 m chunks. Each chunk's vegetation is merged into one mesh per material
    and sways in a vertex shader, and small ground cover only exists near you.
  - Building props are baked into one mesh per material per 64 m cell. Anything past the fog isn't drawn.
  - Foliage between the camera and the player dithers away instead of blocking the view.

Settings → Graphics has quality presets, a shadow toggle, render scale and an adaptive-resolution toggle.

## Layout

```
src/core         game shell, state machine, loop, input, events, settings, noise/RNG
src/gameplay     Session (owns and orders all gameplay systems), player actions/equipment
src/render       renderer, third-person camera, sky, far mountains, atmosphere, lighting, weather FX, particles
src/world        world layout, terrain, chunk streaming, vegetation, resources, water, sites/
src/physics      3D kinematic bodies against terrain and box colliders (spatial hash)
src/player       movement controller and the character animator (layers, foot IK, look-at)
src/character    skinned procedural human: mesh kit, skeleton, keyframe clips, pose blending, IK
src/survival     vitals and their rules
src/inventory    items, inventory, containers
src/crafting     recipes and crafting
src/building     construction system and pieces
src/lighting     light sources, fuel, light pool
src/environment  world clock, weather, climate
src/wildlife     species, behaviours, spawning
src/story        documents, quests, discoveries, tutorial hints
src/audio        synthesised SFX, ambience and adaptive music
src/persistence  versioned, checksummed IndexedDB saves
src/ui           menus, HUD, backpack/crafting, build bar, map, journal, screens
```

See [`docs/PLAN.md`](docs/PLAN.md) for the architecture, risks and milestone notes.
