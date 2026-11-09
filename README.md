# The Last Light

A 2.5D survival and exploration game for the browser, built with Three.js, TypeScript and Vite.

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

## Controls

| Action | Keys |
|---|---|
| Move / sprint | A D (or ← →) / Shift |
| Jump / swim up | Space (hold for height) |
| Drop through a floor | S + Space |
| Interact · gather · read · open | E |
| Secondary action (fill a container, put out a fire) | R |
| Use the held item: eat, drink, attack, lantern on/off | F or left click |
| Hotbar | 1–6 (Shift + wheel cycles) |
| Backpack · Crafting · Build · Map · Journal | Tab · C · B · M · J |
| Demolish (in build mode) | X or right click |
| Zoom · Pause | Mouse wheel · Esc |

## What's in the game

- **Four connected regions** on one continuous strip of land: the **Verdant Woods**, the **Frostlands**, the
  **Forgotten City** and the **Drowned Coast**. Gates open as the story progresses: a rope to cross the gorge,
  the metro tunnel under the collapsed overpass, and a pickaxe to dig through the rockslide at Halcyon Pass.
  There are also underground levels: the Union Line metro, the sea caves and the Halcyon lab.
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
- **Building:** floors, walls, doors, back walls, windows, roofs, campfires, chests, bedrolls, beds, tables,
  lamps and workbenches snap to a grid with support rules and a valid/invalid preview. Structures shelter you
  from rain and cold, and everything you build persists.
- **Story:** a 15-step main questline that reveals the cause of the blackout, plus optional photographs, radio
  transmissions and journals. The map tracks explored land and landmarks; the journal keeps your objectives
  and documents.
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
- **Efficient rendering:** a fixed pool of point lights means shaders never recompile. Vegetation is instanced
  and streamed in chunks, static geometry is frozen, and resource nodes are culled in spatial buckets.

Settings → Graphics has quality presets, a shadow toggle, render scale and an adaptive-resolution toggle.

## Layout

```
src/core         game shell, state machine, loop, input, events, settings, noise/RNG
src/gameplay     Session (owns and orders all gameplay systems), player actions/equipment
src/render       renderer, camera, sky, atmosphere, lighting, parallax, weather FX, particles
src/world        world layout, terrain, chunk streaming, vegetation, resources, water, sites/
src/physics      2D kinematic collision in the gameplay plane
src/player       movement controller and procedural animated character
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
