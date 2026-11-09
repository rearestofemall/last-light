/**
 * Authored world layout. Noise adds detail, but every landmark is placed by hand so the
 * world is coherent and identical on every playthrough.
 *
 *  x: -880 ......... -250 ............ 450 ............ 1100 ............ 1680
 *     | FROSTLANDS    | VERDANT WOODS   | FORGOTTEN CITY  | DROWNED COAST  |
 */
export type RegionId = 'frost' | 'woods' | 'city' | 'coast';

export interface RegionDef {
  id: RegionId;
  name: string;
  tagline: string;
  x0: number;
  x1: number;
  /** Terrain amplitude multiplier for the noise profile. */
  relief: number;
  /** Base air temperature (°C) at midday in autumn. */
  baseTemp: number;
  /** Large-vegetation density multiplier. */
  forest: number;
  palette: {
    grass: number;
    grassDry: number;
    dirt: number;
    rock: number;
    far: number;
  };
}

export interface RiverDef {
  id: string;
  x: number;
  /** Width of the channel at the gameplay plane. */
  width: number;
  /** Bed depth below the bank. */
  depth: number;
  /** Water depth above the bed. */
  waterDepth: number;
  bank: number;
  /** Frozen lakes have walkable ice instead of water. */
  frozen?: boolean;
  salt?: boolean;
}

export interface RidgeDef {
  /** Foot of the western cliff. */
  x0: number;
  /** Width of the steep cliff face. */
  cliff: number;
  /** End of the plateau. */
  x1: number;
  /** Length of the gentle eastern descent. */
  fade: number;
  height: number;
}

export interface FlattenDef {
  x: number;
  radius: number;
  fade: number;
  offset?: number;
}

export interface LocationDef {
  id: string;
  name: string;
  region: RegionId;
  x0: number;
  x1: number;
  /** Shown as a landmark on the map. */
  landmark?: boolean;
}

export const WORLD_SEED = 1914;

export const REGIONS: RegionDef[] = [
  {
    id: 'frost',
    name: 'The Frostlands',
    tagline: 'Where the cold keeps its secrets',
    x0: -880,
    x1: -250,
    relief: 1.7,
    baseTemp: -6,
    forest: 0.55,
    palette: { grass: 0xe4e9ef, grassDry: 0xcdd6df, dirt: 0x9ea6ae, rock: 0x6c737c, far: 0x9fb2c6 },
  },
  {
    id: 'woods',
    name: 'The Verdant Woods',
    tagline: 'Nature is taking back what was hers',
    x0: -250,
    x1: 450,
    relief: 1,
    baseTemp: 14,
    forest: 1,
    palette: { grass: 0x4f7a34, grassDry: 0x7c8a3c, dirt: 0x6b5236, rock: 0x6d6a63, far: 0x6f8f8c },
  },
  {
    id: 'city',
    name: 'The Forgotten City',
    tagline: 'A million windows, not one light',
    x0: 450,
    x1: 1100,
    relief: 0.3,
    baseTemp: 13,
    forest: 0.22,
    palette: { grass: 0x5d6d3a, grassDry: 0x7d7a4c, dirt: 0x4a4946, rock: 0x5e5d5a, far: 0x7d8790 },
  },
  {
    id: 'coast',
    name: 'The Drowned Coast',
    tagline: 'The tide remembers everything',
    x0: 1100,
    x1: 1680,
    relief: 0.55,
    baseTemp: 12,
    forest: 0.3,
    palette: { grass: 0x76854d, grassDry: 0xb0a577, dirt: 0xb3a57f, rock: 0x6c6862, far: 0x8aa3ad },
  },
];

export const RIVERS: RiverDef[] = [
  { id: 'frozen-lake', x: -640, width: 26, depth: 2.6, waterDepth: 1.9, bank: 4, frozen: true },
  { id: 'blackwater', x: 75, width: 15, depth: 3.2, waterDepth: 2.3, bank: 3.5 },
  { id: 'hollow-creek', x: 306, width: 7, depth: 1.3, waterDepth: 0.75, bank: 2.5 },
  { id: 'cove', x: 1320, width: 20, depth: 3.6, waterDepth: 2.8, bank: 4, salt: true },
];

export const RIDGES: RidgeDef[] = [
  { x0: -478, cliff: 3.2, x1: -440, fade: 36, height: 6 },
  { x0: 199.5, cliff: 3.2, x1: 238, fade: 40, height: 6 },
];

/** Zones where the terrain is levelled (rivers banks, building plots). Applied in order. */
export const FLATTEN: FlattenDef[] = [
  { x: -800, radius: 26, fade: 12 },
  { x: -640, radius: 24, fade: 12 },
  { x: -520, radius: 8, fade: 9 },
  { x: 0, radius: 9, fade: 10 },
  { x: 75, radius: 20, fade: 12 },
  { x: 132, radius: 8.5, fade: 10 },
  { x: 306, radius: 9, fade: 8 },
  { x: 362, radius: 7.5, fade: 9 },
  { x: 480, radius: 10, fade: 8 },
  { x: 575, radius: 70, fade: 20 },
  { x: 760, radius: 40, fade: 20 },
  { x: 930, radius: 12, fade: 10 },
  { x: 1190, radius: 9, fade: 8 },
  { x: 1250, radius: 8, fade: 8 },
  { x: 1320, radius: 22, fade: 10 },
  { x: 1430, radius: 14, fade: 10 },
  { x: 1630, radius: 12, fade: 10, offset: 3 },
];

export const LOCATIONS: LocationDef[] = [
  { id: 'halcyon-station', name: 'Halcyon Station', region: 'frost', x0: -840, x1: -770, landmark: true },
  { id: 'frozen-lake', name: 'Lake Tamsin', region: 'frost', x0: -665, x1: -615, landmark: true },
  { id: 'weather-hut', name: 'Weather Hut', region: 'frost', x0: -535, x1: -505, landmark: true },
  { id: 'whiteback', name: 'Whiteback Ridge', region: 'frost', x0: -485, x1: -400 },
  { id: 'halcyon-pass', name: 'Halcyon Pass', region: 'woods', x0: -300, x1: -205, landmark: true },
  { id: 'campsite', name: 'Abandoned Campsite', region: 'woods', x0: -14, x1: 14, landmark: true },
  { id: 'trailhead', name: 'Pinebrook Trailhead', region: 'woods', x0: 18, x1: 34 },
  { id: 'blackwater', name: 'Blackwater River', region: 'woods', x0: 60, x1: 92, landmark: true },
  { id: 'ranger-station', name: 'Ranger Station', region: 'woods', x0: 118, x1: 146, landmark: true },
  { id: 'eastridge', name: 'Eastridge', region: 'woods', x0: 188, x1: 270 },
  { id: 'hollow-creek', name: 'Hollow Creek', region: 'woods', x0: 296, x1: 318 },
  { id: 'hunters-lodge', name: "Hunter's Lodge", region: 'woods', x0: 348, x1: 378, landmark: true },
  { id: 'old-highway', name: 'Old Highway 9', region: 'woods', x0: 405, x1: 449, landmark: true },
  { id: 'gas-station', name: 'Last Stop Gas', region: 'city', x0: 466, x1: 494 },
  { id: 'apartments', name: 'Alder Street Apartments', region: 'city', x0: 525, x1: 556, landmark: true },
  { id: 'hardware', name: 'Kessler Hardware', region: 'city', x0: 600, x1: 622, landmark: true },
  { id: 'broadcast', name: 'KVLT Broadcast House', region: 'city', x0: 680, x1: 702, landmark: true },
  { id: 'metro', name: 'Union Line Metro', region: 'city', x0: 752, x1: 885, landmark: true },
  { id: 'clinic', name: 'St. Brigid Clinic', region: 'city', x0: 920, x1: 942, landmark: true },
  { id: 'park', name: 'Memorial Park', region: 'city', x0: 985, x1: 1045 },
  { id: 'dunes', name: 'Greywater Dunes', region: 'coast', x0: 1110, x1: 1170 },
  { id: 'village', name: 'Saltmarsh Village', region: 'coast', x0: 1178, x1: 1262, landmark: true },
  { id: 'cove', name: 'Drowned Cove', region: 'coast', x0: 1298, x1: 1342 },
  { id: 'meridian', name: 'Wreck of the Meridian', region: 'coast', x0: 1412, x1: 1450, landmark: true },
  { id: 'sea-caves', name: 'Sea Caves', region: 'coast', x0: 1510, x1: 1535 },
  { id: 'lighthouse', name: 'Greywater Lighthouse', region: 'coast', x0: 1615, x1: 1648, landmark: true },
];

/** Hard world limits. Gates (rockslide, gorge, overpass) further restrict travel until opened. */
export const PLAYABLE = { min: -876, max: 1676 };
export const SPAWN_X = -3;
/** Sea level on the Drowned Coast. */
export const SEA_Y = -5.5;

export function regionAt(x: number): RegionDef {
  for (const r of REGIONS) if (x >= r.x0 && x < r.x1) return r;
  return x < REGIONS[0].x0 ? REGIONS[0] : REGIONS[REGIONS.length - 1];
}

/** Smooth 0–1 weight of a region at x (for blending palettes and climate). */
export function regionWeight(id: RegionId, x: number, blend = 40): number {
  const r = REGIONS.find((rr) => rr.id === id)!;
  const d = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
  const inside = x >= r.x0 && x <= r.x1;
  if (inside) {
    const edge = Math.min(x - r.x0, r.x1 - x);
    return Math.min(1, 0.5 + edge / (2 * blend));
  }
  return Math.max(0, 0.5 - d / (2 * blend));
}

export function locationAt(x: number): LocationDef | null {
  for (const l of LOCATIONS) if (x >= l.x0 && x <= l.x1) return l;
  return null;
}

/** Areas kept clear of large vegetation and resource nodes so authored sites stay readable. */
export interface Clearing {
  x: number;
  radius: number;
  /** Trees are only removed in front of this depth (z > zBack). */
  zBack: number;
}

export const CLEARINGS: Clearing[] = [
  { x: -800, radius: 34, zBack: -40 },
  { x: -520, radius: 8, zBack: -12 },
  { x: -232, radius: 10, zBack: -40 },
  { x: 0, radius: 10, zBack: -12 },
  { x: 26, radius: 3, zBack: -6 },
  { x: 132, radius: 10, zBack: -14 },
  { x: 196, radius: 7, zBack: -6 },
  { x: 362, radius: 8.5, zBack: -12 },
  { x: 432, radius: 22, zBack: -40 },
  { x: 480, radius: 12, zBack: -14 },
  { x: 540, radius: 12, zBack: -14 },
  { x: 611, radius: 9, zBack: -14 },
  { x: 691, radius: 9, zBack: -14 },
  { x: 760, radius: 9, zBack: -14 },
  { x: 825, radius: 40, zBack: -30 },
  { x: 931, radius: 9, zBack: -14 },
  { x: 1190, radius: 7, zBack: -12 },
  { x: 1250, radius: 7, zBack: -12 },
  { x: 1430, radius: 16, zBack: -16 },
  { x: 1522, radius: 6, zBack: -10 },
  { x: 1632, radius: 14, zBack: -20 },
];

/** City blocks: x ranges with building facades behind the plane (no trees there). */
export const CITY_BLOCKS: [number, number][] = [
  [458, 515],
  [520, 720],
  [728, 905],
  [912, 980],
  [1050, 1095],
];

export function inCityBlock(x: number): boolean {
  return CITY_BLOCKS.some(([a, b]) => x >= a && x <= b);
}
