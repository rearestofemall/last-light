# Phone Bazaar: Repair Tycoon

A phone repair simulator and business tycoon in the browser. Open phones screw by screw on a 3D workbench, hunt faults with real instruments, microsolder logic boards, and grow a mall booth into an international electronics brand. Every brand and phone in the game is a parody.

## Run it

```bash
npm install
```

```bash
npm run dev
```

The dev server opens on http://localhost:5180. For a production build:

```bash
npm run build
```

## How to play (short version)

1. **Front desk**: customers describe symptoms. Pick services, quote a price (labour + parts), haggle, or take the phone in for paid diagnosis first.
2. **Workbench**: load the job. Tools are on keys 1-7 (screwdriver, spudger, tweezers, heat, opener, IPA, brush). `B` cycles the screwdriver bit, `F` flips the phone and `G` toggles reassembly ghosts. Drag to orbit and scroll to zoom.
   - Heat glued covers before you open them, or they crack.
   - **Disconnect the battery first.** Working with it connected can short the board.
   - Removed screws go onto the magnetic mat in order. A long screw in a short hole damages the board.
3. **Diagnose**: USB ammeter, diagnostic computer (battery health, serial/pairing check, IMEI), test suite, diode-mode multimeter against per-model reference values, thermal camera and microscope. One symptom usually has several possible causes.
4. **Repair**: swap parts from inventory (only exact or shared part numbers fit), clean ports, flash firmware, or remove the board and microsolder it.
5. Put everything back, run the tests, then **Finish & return**. Quality, price, speed and honesty drive reviews, reputation and warranty claims.

`Space` pauses. The game autosaves at the end of every day, and there are three manual save slots.

## Game modes

| Mode | What it is |
|---|---|
| Career | Booth → local shop → service centre → repair company → international brand |
| Tycoon | Start with a shop and staff; technicians pick up jobs and auto-order parts |
| Free play | Unlimited money, all research and top-tier tools |
| Challenge | Eight timed diagnostic puzzles with a score |
| Expert | Less cash, impatient customers, pricier parts, harsher mistakes |

## Project layout

```
src/
  CONFIG.ts      every balance number
  data/          plain data: brands, phones, layouts (screw maps & disassembly graphs),
                 faults, parts, tools, research, services, business, challenges
  sim/           game state, clock, phones factory, customers, employees, economy,
                 market, world (events, competitors, progression), jobs, new game
  repair/        assembly rules, diagnostics, 3D workstation (Three.js), microsoldering view
  ui/            screens, HUD, dialogs, styles
  save/          localStorage save slots
```

## Adding content

- **A phone**: add one `phone(...)` entry in `src/data/phones.ts`. Pick a `layout`, give real `dims`, and list `features` (`wide`, `tele`, `faceId`, `fingerprint`). `mirror` and `batteryShift` vary its internals. Shared part numbers go in `sharedParts`.
- **A new internal layout**: add a `LayoutDef` in `src/data/layouts.ts`. `requires` lists the nodes that physically sit on top, `tetheredBy` lists the cables holding a cover, and `longScrewFault` marks holes where a long screw damages the board.
- **A fault**: add it to `src/data/faults.ts` with its target (slot, chip, board or software), customer symptoms, failing tests and instrument signatures (`ammeter`, `diode`, `thermal`, `diag`, `microscope`, `visual`). Then add its id to a service's `fixes` in `src/data/research.ts`.
- **Balance**: change numbers in `src/CONFIG.ts`.
