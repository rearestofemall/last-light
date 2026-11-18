/**
 * Shared data types. Everything in /data is plain data described by these
 * interfaces, so new phones, parts, faults and tools can be added without
 * touching game logic.
 */

export type Tier = 'budget' | 'mid' | 'flagship' | 'foldable' | 'legacy';
export type BrandTier = 'premium' | 'mid' | 'budget';
export type ScrewType = 'phillips' | 'pentalobe' | 'tripoint' | 'standoff' | 'torx';
export type PartGrade = 'genuine' | 'refurbished' | 'aftermarket' | 'counterfeit';
export type ConditionGrade = 'New' | 'A+' | 'A' | 'B' | 'C' | 'Dead';

/** Component slots: every replaceable thing in a phone. */
export type Slot =
  | 'display' | 'innerDisplay' | 'backCover' | 'battery' | 'battery2'
  | 'chargePort' | 'subBoard' | 'chargeFlex' | 'bridgeFlex'
  | 'mainCam' | 'wideCam' | 'teleCam' | 'frontCam' | 'faceId' | 'fingerprint'
  | 'earpiece' | 'loudspeaker' | 'mic' | 'board' | 'powerFlex' | 'volumeFlex'
  | 'simTray' | 'antenna' | 'vibrator' | 'frame' | 'hinge' | 'midframe';

export type TestId =
  | 'power' | 'display' | 'touch' | 'frontCam' | 'rearCam' | 'earpiece' | 'loudspeaker'
  | 'mic' | 'charging' | 'network' | 'wifi' | 'sensors' | 'biometric' | 'vibration' | 'buttons';

export interface BrandDef {
  id: string;
  name: string;
  tier: BrandTier;
  /** Fraction of value kept per year relative to the average (1 = average). */
  retention: number;
  /** 0..1 chance a given part is in stock at suppliers. */
  partsAvailability: number;
  /** Multiplier on all part prices. */
  partsPriceLevel: number;
  /** 1 (glued, proprietary) .. 10 (screwed, modular). */
  repairability: number;
  /** Slots whose parts are serialized/paired to the logic board. */
  pairing: Slot[];
  color: string;
}

/** One interactive element of a phone's internal layout. */
export interface NodeDef {
  id: string;
  kind: 'cover' | 'screw' | 'bracket' | 'connector' | 'part' | 'shield';
  label: string;
  /** Component slot held by this node (parts and covers). */
  slot?: Slot;
  screw?: { type: ScrewType; length: number };
  /** Nodes physically on top: they must be removed / opened / disconnected first. */
  requires?: string[];
  /** Covers: connectors that tether the cover; must be disconnected before full removal. */
  tetheredBy?: string[];
  /** Connector: the part node it plugs. */
  connects?: string;
  /** The battery connector (shorts happen while it is connected). */
  isBattery?: boolean;
  glued?: boolean;
  clips?: boolean;
  /** Battery style adhesive pull tabs. */
  pullTabs?: boolean;
  /** Screw holes: fault applied when a too-long screw is driven in. */
  longScrewFault?: string;
  /** Only include node if the model has this feature. */
  only?: string;
  shape: 'box' | 'cyl' | 'flex' | 'round';
  pos: [number, number, number]; // mm, phone centre at origin, +z = screen side
  size: [number, number, number]; // mm (cyl: [diameter, -, height])
  color?: string;
}

export interface ChipDef {
  id: string;
  /** Chip type, matched by fault targets and chip part numbers. */
  type: string;
  name: string;
  pos: [number, number]; // board-view coordinates 0..100
  size: [number, number];
}

export interface TestPointDef {
  id: string;
  name: string;
  pos: [number, number];
  /** Reference diode-mode reading (V). */
  ref: number;
  /** Chips on this line; their faults change the reading. */
  chips: string[];
}

export interface LayoutDef {
  id: string;
  name: string;
  opening: 'front' | 'back' | 'screwback';
  boardType: 'single' | 'sandwich';
  dims: [number, number, number];
  nodes: NodeDef[];
  chips: ChipDef[];
  testPoints: TestPointDef[];
}

export interface PhoneModelDef {
  id: string;
  brand: string;
  name: string;
  year: number;
  tier: Tier;
  launchPrice: number; // Rs
  chipset: string;
  variants: { ram: number; storage: number; priceAdd: number }[];
  display: { size: number; type: string; res: string; hz: number; cover?: string };
  cameras: string;
  battery: number; // mAh
  charging: number; // W
  build: string;
  colours: string[];
  ip: string;
  layout: string;
  /** Layout modifiers: unique internals per model. */
  mirror?: boolean;
  batteryShift?: number;
  dims: [number, number, number];
  features: string[];
  /** Shared part numbers (cross-compatibility), slot -> partNo. */
  sharedParts?: Partial<Record<Slot, string>>;
  /** Detailed reference model. */
  detailed?: boolean;
}

export interface FaultDef {
  id: string;
  name: string;
  /** Where the fault lives. */
  target: { slot?: Slot; chip?: string; software?: boolean; board?: boolean };
  /** Customer phrasings. Shared between faults on purpose: one symptom, many causes. */
  symptoms: string[];
  tests: TestId[];
  /** USB ammeter reading override (A). */
  ammeter?: number;
  /** Diagnostic computer message. */
  diag?: string;
  /** Shows as a hot spot on the thermal camera. */
  thermal?: boolean;
  /** Diode mode effect on lines that touch the target chip. */
  diode?: 'short' | 'open' | 'low';
  /** What the microscope reveals. */
  microscope?: string;
  /** What a quick visual inspection reveals (not hidden). */
  visual?: string;
  fix: 'replace' | 'chipReplace' | 'chipRemove' | 'software' | 'clean' | 'jumper';
  /** 0..1, chance this fault is not reported by the customer. */
  hiddenChance: number;
  /** Relative frequency. */
  weight: number;
  /** Value loss fraction. */
  valueLoss: number;
  minTier?: Tier[];
  requiresFeature?: string;
}

export interface ToolDef {
  id: string;
  name: string;
  category: string;
  tier: number; // 1 cheap .. 3 professional
  price: number;
  durability: number; // uses before maintenance needed
  maintenanceCost: number;
  research?: string;
  stage?: number;
  desc: string;
}

export interface ResearchDef {
  id: string;
  name: string;
  cost: number;
  hours: number;
  requires: string[];
  stage: number;
  desc: string;
}

export interface ServiceDef {
  id: string;
  name: string;
  basePrice: number;
  minutes: number;
  slots?: Slot[];
  research?: string;
  /** Faults this service is meant to address. */
  fixes: string[];
}

export interface SupplierDef {
  id: string;
  name: string;
  grades: PartGrade[];
  priceMult: number;
  deliveryDays: number;
  reliability: number; // 0..1 chance of on-time delivery
  /** Chance that a "genuine" part is actually counterfeit. */
  fakeRisk: number;
  minStage: number;
  desc: string;
}

export interface FurnitureDef {
  id: string;
  name: string;
  w: number;
  h: number;
  price: number;
  kind: 'bench' | 'shelf' | 'reception' | 'decor' | 'utility' | 'seating';
  color: string;
  effect?: { rep?: number; storage?: number; patience?: number; power?: boolean; benchTier?: number };
  stage?: number;
}

export interface LocationDef {
  id: string;
  name: string;
  w: number;
  h: number;
  rentPerDay: number;
  buyPrice: number;
  traffic: number; // customer arrival multiplier
  stage: number;
  desc: string;
}

export interface EventDef {
  id: string;
  name: string;
  weight: number;
  minStage: number;
  desc: string;
}

export interface CompetitorDef {
  id: string;
  name: string;
  priceIndex: number; // 1 = market average
  rep: number;
  branches: number;
  aggression: number;
}
