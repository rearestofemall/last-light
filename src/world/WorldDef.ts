/**
 * Authored world layout. Noise adds detail, but every landmark is placed by hand so the
 * world is coherent and identical on every playthrough.
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
}

export const WORLD_SEED = 1914;

export const REGIONS: RegionDef[] = [
  {
    id: 'frost',
    name: 'The Frostlands',
    tagline: 'Where the cold keeps its secrets',
    x0: -900,
    x1: -250,
    relief: 1.8,
    palette: { grass: 0xdfe6ee, grassDry: 0xc9d3dc, dirt: 0x8a8f96, rock: 0x6f7780, far: 0x9fb2c6 },
  },
  {
    id: 'woods',
    name: 'The Verdant Woods',
    tagline: 'Nature is taking back what was hers',
    x0: -250,
    x1: 450,
    relief: 1,
    palette: { grass: 0x4f7a34, grassDry: 0x7c8a3c, dirt: 0x6b5236, rock: 0x6d6a63, far: 0x6f8f8c },
  },
  {
    id: 'city',
    name: 'The Forgotten City',
    tagline: 'A million windows, not one light',
    x0: 450,
    x1: 1100,
    relief: 0.35,
    palette: { grass: 0x5e6b3e, grassDry: 0x7a7550, dirt: 0x55524c, rock: 0x5a5a5a, far: 0x7d8790 },
  },
  {
    id: 'coast',
    name: 'The Drowned Coast',
    tagline: 'The tide remembers everything',
    x0: 1100,
    x1: 1700,
    relief: 0.6,
    palette: { grass: 0x7d8a52, grassDry: 0xb5a878, dirt: 0xa89a76, rock: 0x6c6862, far: 0x8aa3ad },
  },
];

export const RIVERS: RiverDef[] = [
  { id: 'blackwater', x: 75, width: 15, depth: 3.2, waterDepth: 2.3, bank: 3.5 },
  { id: 'hollow-creek', x: 306, width: 7, depth: 1.3, waterDepth: 0.75, bank: 2.5 },
];

export const RIDGES: RidgeDef[] = [{ x0: 199.5, cliff: 3.2, x1: 238, fade: 40, height: 6 }];

/** Zones where the terrain is levelled (rivers banks, building plots). Applied in order. */
export const FLATTEN: FlattenDef[] = [
  { x: 0, radius: 9, fade: 10 },
  { x: 75, radius: 20, fade: 12 },
  { x: 132, radius: 8.5, fade: 10 },
  { x: 306, radius: 9, fade: 8 },
  { x: 362, radius: 7.5, fade: 9 },
];

export const LOCATIONS: LocationDef[] = [
  { id: 'halcyon-pass', name: 'Halcyon Pass', region: 'woods', x0: -245, x1: -205 },
  { id: 'campsite', name: 'Abandoned Campsite', region: 'woods', x0: -14, x1: 14 },
  { id: 'trailhead', name: 'Pinebrook Trailhead', region: 'woods', x0: 18, x1: 34 },
  { id: 'blackwater', name: 'Blackwater River', region: 'woods', x0: 60, x1: 92 },
  { id: 'ranger-station', name: 'Ranger Station', region: 'woods', x0: 118, x1: 146 },
  { id: 'eastridge', name: 'Eastridge', region: 'woods', x0: 188, x1: 270 },
  { id: 'hollow-creek', name: 'Hollow Creek', region: 'woods', x0: 296, x1: 318 },
  { id: 'hunters-lodge', name: "Hunter's Lodge", region: 'woods', x0: 348, x1: 378 },
  { id: 'old-highway', name: 'Old Highway 9', region: 'woods', x0: 408, x1: 440 },
];

/** Milestone 1: the Verdant Woods are playable; the passes to other regions are blocked. */
export const PLAYABLE = { min: -238, max: 436 };
export const SPAWN_X = -3;

export function regionAt(x: number): RegionDef {
  for (const r of REGIONS) if (x >= r.x0 && x < r.x1) return r;
  return x < REGIONS[0].x0 ? REGIONS[0] : REGIONS[REGIONS.length - 1];
}

export function locationAt(x: number): LocationDef | null {
  for (const l of LOCATIONS) if (x >= l.x0 && x <= l.x1) return l;
  return null;
}

/** Areas kept clear of large vegetation so authored sites stay readable. */
export interface Clearing {
  x: number;
  radius: number;
  /** Trees are only removed in front of this depth (z > zBack). */
  zBack: number;
}

export const CLEARINGS: Clearing[] = [
  { x: 0, radius: 10, zBack: -12 },
  { x: 26, radius: 3, zBack: -6 },
  { x: 132, radius: 10, zBack: -14 },
  { x: 196, radius: 7, zBack: -6 },
  { x: 362, radius: 8.5, zBack: -12 },
  { x: -232, radius: 10, zBack: -40 },
  { x: 434, radius: 9, zBack: -40 },
];
