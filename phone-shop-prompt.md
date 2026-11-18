# Phone Repair Tycoon: Build Prompt

Build an **advanced phone repair simulator + business tycoon game**. Think **Car Mechanic Simulator + PC Building Simulator + a business tycoon**, focused entirely on smartphone repair. The game should prioritize deep, interactive repair mechanics, realistic devices, a working economy, meaningful progression and full business management.

---

## Tech stack & project structure

This is too big for one file, so build it as a proper project:
- **Vite + TypeScript** (or vanilla JS modules if simpler)
- **Three.js** for the 3D repair workstation
- Plain HTML/CSS (or a light UI layer) for menus, panels and the shop/business screens
- Save/load with **localStorage** (multiple save slots)

Folder layout (suggested):
```
/src
  /data        → brands, phone models, components, parts, tools, screws, faults (JSON/TS data only)
  /sim         → economy, customers, employees, events, competitors, research
  /repair      → 3D workstation, disassembly, diagnostics, microsoldering
  /ui          → panels, menus, HUD, dialogs
  /save        → save/load
  CONFIG.ts    → every balance number in one place
```
All game data must live in **data files**, so I can add phones, parts and faults without touching game logic.

---

## 1. Phone database & realistic devices

### Brands
Use **parody brand names** (for example "Pear", "Samsang", "Xiaomo", "Oppa", "Vivoh", "Realmi", "Nokla", "Googol Pixl", plus a few budget brands). Each brand has:
- Reputation tier (premium / mid / budget)
- Resale value retention
- Parts availability and price level
- **Repairability score** (glued vs screwed, proprietary screws, serialized parts)
- **Parts pairing:** premium brands "pair" parts like Face ID, battery and screen to the motherboard. Swapped parts show warnings or lose features unless you have the right tool or research.

### Phone categories
Budget, mid-range, flagship, **foldable** and older-generation phones. At least **30+ models** at launch.

### Every phone model has a full spec sheet
- Brand, model, generation/year, launch price, market value over time
- Chipset (fictional names like "Snapdraco 8 Gen 2", "A16 Neural")
- RAM/storage variants (separate SKUs)
- Display: size, type (LCD / OLED / AMOLED / LTPO / foldable inner + cover screen), resolution, refresh rate
- Cameras, battery mAh, charging wattage, build materials, colours, water resistance
- **Unique internal layout:** where the battery, board, cameras, flex cables and connectors sit. Each model's 3D internals are different (single board vs stacked/sandwich board, battery position, number of flex cables).
- **Opening method:** front screen first, back glass first, or screws on the bottom
- **Screw map:** exact screw positions, types (Phillips, pentalobe, tri-point, standoff) and lengths for each model

### Every phone instance is unique
- Serial number / IMEI, colour, storage variant
- Condition grade (New / A+ / A / B / C / Dead)
- Battery health %, cycle count
- Screen condition, cosmetic damage
- **Internal fault list** (some hidden)
- **Previous repair history:** which parts were replaced and whether they're genuine or aftermarket
- iCloud/FRP lock status, PTA / non-PTA status
- Market value calculated live from model + condition + parts quality + demand

---

## 2. Components

Every phone is built from individual components, each with **condition (0–100%), part number, compatibility list and quality grade**:

Display panel (LCD/OLED/foldable), front glass/digitizer, battery, charging port / sub-board, charging flex, back glass/housing, main camera, ultrawide/tele cameras, front camera, Face ID / dot projector, fingerprint sensor, earpiece, loudspeaker, microphones, motherboard (with individual chips: CPU, power IC, charging IC, audio IC, NAND, baseband, Wi-Fi chip, capacitors, filters), power/volume flex, SIM tray, antennas, vibration motor, frame/chassis, hinge (foldables), adhesives and gaskets.

### Part grades
- **Genuine (OEM):** expensive, perfect, no pairing warnings
- **Refurbished / pulled original:** medium price, some wear
- **Aftermarket:** cheaper, lower quality (dimmer screen, worse touch, lower battery capacity)
- **Counterfeit:** sold as "genuine" by shady suppliers, fails early. The player must **detect fakes** by inspection (weight, markings, microscope, diagnostic test).

### Compatibility
Parts only fit their exact models. A "Pear 13" screen doesn't fit a "Pear 13 Pro". Some parts are cross-compatible (shared between models), which is a useful thing for the player to learn.

---

## 3. Repair system (the core: make this deep)

### Interactive 3D repair workstation
- The phone sits on a 3D workbench. I can **rotate, zoom and flip** it.
- **Realistic disassembly and reassembly:** heat the adhesive → use a suction cup / pick to open → remove screws → disconnect the battery first → unclip connectors → remove brackets/shields → remove parts.
- **Screws:** each screw has a size and type. Removed screws go into a **magnetic screw mat**. Putting a long screw in a short hole **damages the board** (a long-screw-damage mechanic).
- **Order matters:** forgetting to disconnect the battery before working can short something. Skipping a bracket blocks a part.
- Reassembly must reverse the steps correctly. Missing screws or unconnected flex cables cause faults in post-repair testing.

### Repairs supported
Screen replacement, glass-only replacement (separator + laminator), OLED/LCD replacement, battery, charging port, camera modules, speakers, microphones, flex cables, connectors, Face ID, fingerprint sensor, network/antenna, water damage cleaning (ultrasonic cleaner + inspection for corrosion), software repair (flashing, boot loops, OS troubleshooting), foldable hinge and inner screen repair.

### Microsoldering (motherboard repair)
- A separate **microscope view** of the board.
- Hot air station: set temperature and airflow. Too hot burns nearby components, too low doesn't melt the solder.
- Soldering iron for small jumps and connector pins.
- Replace chips (charging IC, audio IC), capacitors, connectors. Reball chips (advanced research).
- **Thermal management:** heat spreads to neighbouring parts. Shield them with Kapton tape.
- Outcomes depend on player skill or technician skill + tool quality.

### Repair quality & risk
- Every repair gets a **quality score** based on part grade, tool quality, technician skill and mistakes made.
- Risk of collateral damage: tearing a flex cable while opening, cracking the new screen, lifting a pad while soldering.
- **Post-repair testing:** run a test suite (touch, display, cameras, speakers, mics, charging, network, sensors, Face ID) before returning the phone.

---

## 4. Advanced diagnostics

- **Customer-reported symptoms** (for example "phone dies at 30%", "no sound in calls", "won't charge").
- **One symptom → multiple possible causes.** "Won't charge" could be the port, the charging flex, the charging IC, the battery or software. The player must figure it out.
- **Multiple faults** in one phone, and **hidden faults** the customer didn't mention.
- Tools:
  - **Diagnostic computer:** battery health, cycle count, software errors, part serialization check
  - **USB ammeter:** charging current readings (0.00A = dead port/IC, 0.5A = slow charge...)
  - **Multimeter:** diode mode readings on board test points, compared against a reference value database for each model
  - **Thermal camera:** shows shorted components heating up
  - **Microscope:** corrosion, burnt components, fake part markings
  - Display test, touch test, camera test, speaker/mic test apps
- A **diagnostic report** is generated for the customer, and **repair verification** confirms the fix.

---

## 5. Repair equipment & tools
Screwdriver sets, precision tools (spudgers, picks, tweezers), heat pad / heat gun, hot air rework station, soldering station, digital multimeter, stereo microscope, screen separator machine, vacuum laminating machine (OCA), ultrasonic cleaner, thermal camera, USB ammeter, diagnostic computer, battery spot welder, programmers (for pairing chips), professional workstation.

- Tools have **quality tiers** (cheap → professional), **durability** (they wear out), **maintenance** (replace tips, clean nozzles) and **breakdowns**.
- Tools unlock through the **research tree** and progression stages.

---

## 6. Customer system
- Randomly generated customers with a name, phone, symptoms, budget, deadline, patience and expected quality.
- Personalities: impatient, picky, cheap, regular, emergency (pays extra for same-day), business customer (bulk repairs), scammer (fake warranty claims, swapped phones).
- Customer loyalty and **repeat customers** (regulars remember good or bad service).
- **Warranty claims:** if a repair fails within the warranty period, they come back. Cheap parts = more claims.
- **Reviews** affect reputation and future customer flow.
- Bargaining dialog for repair quotes.

---

## 7. Marketplace & refurbishing
- Buy damaged/used phones from walk-in sellers, auctions, wholesale lots and businesses.
- Inspect before buying, then negotiate.
- Repair → refurbish → **grade** → resell. Profit is calculated per device.
- Trade phones with other businesses.
- Live **phone market prices** and demand charts per model.
- Warranty returns on phones I sold.
- Detect counterfeit parts in phones I buy.
- Stolen phone risk (locked phones, police checks).

---

## 8. Recycling & component recovery
- Strip dead phones for working parts (donor phones).
- Test and grade recovered components.
- Resell recovered parts or use them in repairs.
- Manage e-waste (disposal costs, or sell to recyclers).

---

## 9. Business management
- Start with a **small repair booth**, then rent or **buy** shop locations.
- Spare parts inventory with supplier management, **supplier negotiation** and contracts.
- Set repair pricing per service and model.
- Expenses: rent, electricity bills, salaries, equipment, inventory, insurance.
- **Insurance system:** insure the shop against theft and damage, and handle customer insurance claim repairs.
- Customer complaints and reputation management.
- Multiple branches, **repair brand development**, and a **franchise system** late game.

---

## 10. Employee AI system
- Hire technicians with skill level, specializations (screens, batteries, microsoldering, software, diagnostics), salary, speed, honesty and morale.
- Assign tasks. AI technicians physically walk to benches and perform repairs (progress bars + success/failure based on skill).
- Training programs, skill progression, performance reviews.
- Productivity tracking. Dishonest employees may swap genuine parts for fakes (an event to catch).

---

## 11. Economy & finance
- Realistic economy with **fluctuating spare part prices**, supplier pricing, global smartphone market trends and different demand by region.
- Revenue streams: repairs, refurbished sales, component resale, online orders, business contracts.
- Full **profit & loss tracking** with charts (daily/weekly/monthly), plus a breakdown of where money comes from and goes.
- Business investments and loans.

---

## 12. Random events & world simulation
Supplier delays, equipment breakdowns, part price spikes, demand changes, new phone launches, competitor price wars, unexpected repair complications (a hidden corroded board), warranty disputes, business opportunities (a bulk contract from a company), market crashes, load-shedding, police raids for stolen phones, a viral review.

---

## 13. Competitor system
- Rival repair shops with their own pricing, reputation and expansion.
- They compete for customers, open branches near mine, and start price wars.
- A market share display.

---

## 14. Research & progression

### Research tree
Unlock advanced repair techniques (glass-only repair, microsoldering, reballing, parts pairing/programming, data recovery), professional equipment, new phone categories (flagships → foldables), new services (online repairs, business accounts) and employee training programs.

### Progression stages
1. **Small Repair Booth:** basic tools, cheap phones, few customers, basic repairs
2. **Local Repair Shop:** better tools, more customers, first employee, more advanced repairs
3. **Professional Service Centre:** motherboard repairs, premium customers, pro equipment, specialized technicians
4. **Repair Company:** multiple branches, larger workforce, supplier contracts, advanced management
5. **International Electronics Brand:** international expansion, **own phone manufacturing**, refurbishment operations, distribution network, franchising

---

## 15. Shop customization
- Customize the workshop layout (a grid placement system).
- Buy furniture, upgrade workbenches, install equipment, expand the space.
- Design the reception area, organize inventory shelves, and change the shop's appearance (walls, floors, signage).

---

## 16. Online business
- Online repair booking and remote requests (mail-in repairs).
- Business customer accounts (companies with fleets of phones).
- Repair tracking status for customers.
- Online reviews.

---

## 17. Game modes
- **Career:** booth → international company (the main mode)
- **Free Play:** unlimited money, everything unlocked
- **Challenge:** hard, time-limited repairs and complex diagnostic puzzles with scores
- **Tycoon:** business-focused, repairs are mostly done by employees
- **Expert:** realistic complications, expensive mistakes, limited resources, strict compatibility

---

## Development priority (build in this order)
1. 3D repair workstation (camera controls, phone on the bench)
2. Phone disassembly and assembly (screws, connectors, parts, order of steps)
3. Diagnostic system (symptoms → tools → fault identification)
4. Parts inventory
5. Customer generation
6. Money and business economy
7. Equipment progression
8. Employees and shop expansion
9. Used phone marketplace
10. Advanced business simulation (competitors, franchising, manufacturing)

**After each phase, stop and make sure it's playable and fun before moving on.** Start with **3 detailed phone models** (one budget, one mid-range, one flagship) with full internals, then add more models through the data files once the systems work.

## Code rules
- All data (phones, parts, screws, faults, tools, prices) lives in data files, separate from logic.
- All balance numbers live in `CONFIG.ts`.
- Write clean, modular code with comments so features can be added later.
