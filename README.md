# The Last Light

A 2.5D survival and exploration game for the browser, built with Three.js, TypeScript and Vite.

> Fourteen months ago every powered circuit in the world went dark in the same second.
> You wake in a cold camp in the Verdant Woods. J. has gone ahead for help.
> Fire is the only light left, and something waits beyond it.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm test           # unit tests (terrain, physics, player, saves)
```

## Controls

| Action | Keys |
|---|---|
| Move | A / D or ← / → |
| Sprint | Shift |
| Jump / swim up | Space (hold for a higher jump) |
| Drop through a platform | S + Space |
| Interact / read | E |
| Zoom | Mouse wheel |
| Pause | Esc |

## Status

**Milestone 1, the playable foundation, is complete.** You can explore the whole Verdant Woods: the abandoned
campsite, Pinebrook Trailhead, the Blackwater River (swim it or cross on the fallen log), the Ranger Station and its
loft, the Eastridge cliff ledges, Hollow Creek, the Hunter's Lodge and Old Highway 9. Five documents start the main
story. Progress is saved to IndexedDB (autosave every 90 s, manual save from the pause menu).

See [`docs/PLAN.md`](docs/PLAN.md) for the architecture, technical risks and the milestone roadmap (survival,
world systems, construction, the other three regions, polish).

## Layout

```
src/core         game loop, state machine, input, events, settings, noise/RNG
src/render       renderer, camera rig, sky, lighting, parallax, particles, materials
src/world        world layout, terrain, chunk streaming, vegetation, water, authored sites
src/physics      2D kinematic collision in the gameplay plane
src/player       movement controller and procedural animated character
src/interaction  interactables and prompts
src/story        documents, discoveries, tutorial hints
src/audio        synthesised ambience and sound effects (Web Audio)
src/persistence  versioned, checksummed IndexedDB saves with backup recovery
src/ui           menus, HUD, settings, note reader
```

All art and audio are generated procedurally at runtime. The game has no binary assets.
