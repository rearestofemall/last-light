/**
 * Equipment. One tool owned per category; buying a higher tier replaces it.
 * Tier affects success/strip/crack chances, readings precision and speed.
 */
import type { ScrewType, ToolDef } from './types';

export const TOOLS: ToolDef[] = [
  // Screwdrivers
  { id: 'driver_1', name: 'Market screwdriver set', category: 'screwdriver', tier: 1, price: 0, durability: 120, maintenanceCost: 1_500, desc: 'Phillips + pentalobe bits. Soft steel strips screws.' },
  { id: 'driver_2', name: 'Precision driver kit (64 bits)', category: 'screwdriver', tier: 2, price: 12_000, durability: 300, maintenanceCost: 3_000, desc: 'Adds tri-point, standoff and torx bits.' },
  { id: 'driver_3', name: 'Pro S2-steel driver set', category: 'screwdriver', tier: 3, price: 35_000, durability: 800, maintenanceCost: 5_000, stage: 2, desc: 'Hardened bits, almost never strips.' },
  // Opening tools
  { id: 'open_1', name: 'Plastic picks + suction cup', category: 'opening', tier: 1, price: 0, durability: 80, maintenanceCost: 800, desc: 'Basic picks and spudgers.' },
  { id: 'open_2', name: 'Opening kit (metal + nylon)', category: 'opening', tier: 2, price: 6_000, durability: 250, maintenanceCost: 1_500, desc: 'Thin picks, less flex tearing.' },
  { id: 'open_3', name: 'Motorised opening tool', category: 'opening', tier: 3, price: 28_000, durability: 600, maintenanceCost: 4_000, stage: 2, desc: 'Even suction pull, minimal cracking.' },
  // Heat
  { id: 'heat_1', name: 'Microwave heat pad', category: 'heat', tier: 1, price: 0, durability: 100, maintenanceCost: 500, desc: 'Slow, uneven heat.' },
  { id: 'heat_2', name: 'Heat gun', category: 'heat', tier: 2, price: 9_000, durability: 300, maintenanceCost: 2_000, desc: 'Fast heating, easy to overdo.' },
  { id: 'heat_3', name: 'Hot plate / iOpener station', category: 'heat', tier: 3, price: 30_000, durability: 700, maintenanceCost: 4_000, stage: 2, desc: 'Precise even heating.' },
  // Diagnostics
  { id: 'ammeter_1', name: 'USB ammeter', category: 'ammeter', tier: 1, price: 2_500, durability: 500, maintenanceCost: 500, desc: 'Reads charging current. Shows a lot about the charging path.' },
  { id: 'ammeter_2', name: 'PD trigger ammeter (4 digit)', category: 'ammeter', tier: 2, price: 9_000, durability: 1000, maintenanceCost: 1_000, desc: 'Accurate readings + fast-charge negotiation.' },
  { id: 'diag_1', name: 'Laptop + diagnostic software', category: 'diagcomp', tier: 1, price: 18_000, durability: 1000, maintenanceCost: 2_000, desc: 'Battery health, cycle count, software errors, part serial check, IMEI.' },
  { id: 'diag_2', name: 'Pro diagnostic box', category: 'diagcomp', tier: 2, price: 60_000, durability: 2000, maintenanceCost: 5_000, stage: 2, desc: 'Faster scans + flashing all brands.' },
  { id: 'meter_1', name: 'Digital multimeter', category: 'multimeter', tier: 1, price: 4_000, durability: 600, maintenanceCost: 800, desc: 'Diode-mode readings on board test points.' },
  { id: 'meter_2', name: 'Fluke-style precision meter', category: 'multimeter', tier: 2, price: 22_000, durability: 1500, maintenanceCost: 2_000, research: 'diagnostics-pro', desc: 'Low-noise readings, matches reference database.' },
  { id: 'scope_1', name: 'USB microscope', category: 'microscope', tier: 1, price: 6_000, durability: 600, maintenanceCost: 800, desc: 'Blurry, but shows corrosion and fake markings sometimes.' },
  { id: 'scope_2', name: 'Stereo microscope 7-45x', category: 'microscope', tier: 2, price: 45_000, durability: 1500, maintenanceCost: 3_000, research: 'microsoldering', desc: 'Required for microsoldering.' },
  { id: 'scope_3', name: 'Trinocular microscope + camera', category: 'microscope', tier: 3, price: 120_000, durability: 3000, maintenanceCost: 6_000, research: 'reballing', desc: 'Crystal clear. Spots every fake.' },
  { id: 'thermal_1', name: 'Thermal camera', category: 'thermal', tier: 1, price: 55_000, durability: 1500, maintenanceCost: 3_000, research: 'diagnostics-pro', desc: 'Find shorted parts as they heat up on power injection.' },
  { id: 'scale_1', name: 'Precision scale (0.01g)', category: 'scale', tier: 1, price: 3_000, durability: 2000, maintenanceCost: 300, desc: 'Fake batteries and screens weigh wrong.' },
  // Board work
  { id: 'hotair_1', name: 'Cheap hot air station', category: 'hotair', tier: 1, price: 15_000, durability: 300, maintenanceCost: 2_500, research: 'microsoldering', desc: 'Temperature drifts ±40°C. Nozzles clog.' },
  { id: 'hotair_2', name: 'Pro hot air rework station', category: 'hotair', tier: 2, price: 70_000, durability: 1000, maintenanceCost: 5_000, research: 'microsoldering', stage: 3, desc: 'Stable ±4°C, precise airflow.' },
  { id: 'iron_1', name: 'Soldering station', category: 'iron', tier: 1, price: 8_000, durability: 300, maintenanceCost: 1_200, research: 'microsoldering', desc: 'Jumpers and connector pins.' },
  { id: 'iron_2', name: 'Micro soldering station (C210 tips)', category: 'iron', tier: 2, price: 45_000, durability: 1000, maintenanceCost: 3_000, research: 'microsoldering', stage: 3, desc: 'Tiny tips, perfect jumpers.' },
  { id: 'ultra_1', name: 'Ultrasonic cleaner', category: 'ultrasonic', tier: 1, price: 12_000, durability: 400, maintenanceCost: 1_500, research: 'water-damage', desc: 'Removes corrosion from water-damaged boards.' },
  { id: 'separator_1', name: 'Screen separator machine', category: 'separator', tier: 1, price: 25_000, durability: 300, maintenanceCost: 2_000, research: 'glass-only', desc: 'Separates cracked glass from a working OLED.' },
  { id: 'laminator_1', name: 'Vacuum OCA laminator + autoclave', category: 'laminator', tier: 1, price: 65_000, durability: 300, maintenanceCost: 4_000, research: 'glass-only', desc: 'Laminates new glass. Bubbles at low tier.' },
  { id: 'welder_1', name: 'Battery spot welder', category: 'welder', tier: 1, price: 30_000, durability: 400, maintenanceCost: 2_000, research: 'parts-pairing', desc: 'Move the original battery BMS chip onto a new cell.' },
  { id: 'programmer_1', name: 'Pairing programmer (JC-style)', category: 'programmer', tier: 1, price: 40_000, durability: 600, maintenanceCost: 3_000, research: 'parts-pairing', desc: 'Copy serial data so swapped parts stop showing warnings.' },
  { id: 'psu_1', name: 'DC power supply', category: 'psu', tier: 1, price: 7_000, durability: 1000, maintenanceCost: 800, desc: 'Boot boards without a battery and inject voltage to find shorts.' },
];

export const toolById = (id: string) => TOOLS.find((t) => t.id === id)!;

/** Bits available per screwdriver tier. */
export const SCREWDRIVER_BITS: Record<number, ScrewType[]> = {
  1: ['phillips', 'pentalobe'],
  2: ['phillips', 'pentalobe', 'tripoint', 'standoff', 'torx'],
  3: ['phillips', 'pentalobe', 'tripoint', 'standoff', 'torx'],
};

/** Tools a new career starts with. */
export const STARTING_TOOLS = ['driver_1', 'open_1', 'heat_1', 'ammeter_1'];

export const SCREW_COLORS: Record<ScrewType, string> = {
  phillips: '#a7acb4', pentalobe: '#c8ccd2', tripoint: '#d8c38a', standoff: '#7f8a96', torx: '#5c6066',
};
