/**
 * Game state: one plain JSON-serialisable object (saved to localStorage).
 * All runtime systems read and write `G()`.
 */
import { CONFIG } from '../CONFIG';
import type { PartGrade, ScrewType, Slot, TestId } from '../data/types';

export type GameMode = 'career' | 'freeplay' | 'challenge' | 'tycoon' | 'expert';

export interface ChipInst {
  faults: string[];
  removed: boolean;
  burned: boolean;
  /** Replacement chip that is placed but not yet reflowed. */
  unsoldered?: boolean;
}

export interface ComponentInst {
  id: string;
  slot: Slot;
  partNo: string;
  modelId: string;
  grade: PartGrade;
  /** Hidden truth: a fake sold as genuine shows grade 'genuine' but counterfeit=true. */
  counterfeit: boolean;
  condition: number; // 0..100
  pairedTo: string | null; // phone serial it is paired to
  faults: string[];
  chips?: Record<string, ChipInst>;
  corrosion?: number; // board only 0..1
  /** Board: number of jumper wires fitted. */
  jumpers?: number;
  /** Display: has had glass-only refurb. */
  refurbished?: boolean;
  /** Player has inspected this part and knows if it's fake. */
  inspected?: 'unknown' | 'ok' | 'fake';
  cost?: number;
  source?: string;
  cycles?: number; // battery
}

export interface NodeState {
  s: 'in' | 'open' | 'out';
  /** Installed screw length (may be wrong!). */
  len?: number;
  stripped?: boolean;
}

export interface MatScrew {
  id: string;
  type: ScrewType;
  length: number;
  from: string; // node id it came from
}

export interface PhoneInst {
  id: string;
  modelId: string;
  serial: string;
  imei: string;
  variant: number;
  colour: string;
  components: Partial<Record<Slot, ComponentInst>>;
  loose: Partial<Record<Slot, ComponentInst>>; // removed parts on the tray
  nodes: Record<string, NodeState>;
  mat: MatScrew[];
  heat: Record<string, number>;
  softwareFaults: string[];
  lock: 'none' | 'icloud' | 'frp';
  pta: boolean;
  stolen: boolean;
  cosmetic: number; // 0..100
  waterSeal: boolean;
  history: { day: number; slot: Slot; grade: PartGrade; by: string }[];
  owner: 'customer' | 'player';
  /** Seller's claims (may be lies). */
  claimed?: string;
  forSale?: { price: number; listedDay: number; grade: string };
  purchasePrice?: number;
  repairCost?: number;
  knownFaults?: string[]; // faults the player has discovered (for display)
  diagRun?: boolean;
}

export interface Customer {
  id: string;
  name: string;
  personality: 'regular' | 'impatient' | 'picky' | 'cheap' | 'emergency' | 'business' | 'scammer';
  phoneId: string;
  symptoms: string[];
  budget: number;
  patience: number; // minutes left in queue
  maxPatience: number;
  expectedQuality: number;
  deadlineDays: number;
  arrivedAt: number;
  bargainRound: number;
  lastOffer?: number;
  repeat: boolean;
  loyalty: number;
  warrantyJobId?: string;
  mailIn?: boolean;
  scam?: 'swapped' | 'physical';
  note?: string;
}

export interface Job {
  id: string;
  customerName: string;
  customerId: string;
  personality: Customer['personality'];
  phoneId: string;
  symptoms: string[];
  services: string[];
  price: number;
  depositPaid: number;
  dueDay: number;
  createdDay: number;
  status: 'open' | 'ready' | 'done' | 'cancelled';
  assignedTo: string | null;
  progress: number; // 0..1 for employee jobs
  waitingParts?: boolean;
  quality: number | null;
  mistakes: string[];
  partsCost: number;
  warranty: boolean;
  warrantyOf?: string;
  originalImei: string;
  expectedQuality: number;
  budget: number;
  mailIn?: boolean;
  businessId?: string;
  pickupAt?: number;
  testsAfter?: Partial<Record<TestId, boolean>>;
  log: string[];
  replacedGrades: PartGrade[];
  counterfeitUsed: boolean;
  completedDay?: number;
  loyalty: number;
  scam?: 'swapped' | 'physical';
}

export interface Employee {
  id: string;
  name: string;
  skill: number; // 0..100
  specs: string[]; // 'screens','batteries','microsoldering','software','diagnostics'
  salary: number; // per day
  speed: number; // 0.6..1.5
  honesty: number; // hidden 0..1
  morale: number; // 0..100
  jobId: string | null;
  x: number;
  y: number;
  tx: number;
  ty: number;
  state: 'idle' | 'walking' | 'working' | 'training';
  repairs: number;
  fails: number;
  revenue: number;
  hiredDay: number;
  trainingUntil?: number;
  suspicious?: number;
  benchId?: string;
}

export interface Candidate extends Omit<Employee, 'jobId' | 'x' | 'y' | 'tx' | 'ty' | 'state' | 'repairs' | 'fails' | 'revenue' | 'hiredDay'> {}

export interface Order {
  id: string;
  supplierId: string;
  items: { partNo: string; slot: Slot | 'chip' | 'consumable'; modelId: string; grade: PartGrade; qty: number; unit: number; chipType?: string; consumable?: string }[];
  dueDay: number;
  total: number;
}

export interface Listing {
  id: string;
  phoneId: string;
  source: 'walkin' | 'auction' | 'wholesale' | 'business';
  ask: number;
  sellerName: string;
  description: string;
  expiresDay: number;
  inspected: boolean;
  bargainRound: number;
  auction?: { bid: number; leader: 'you' | 'rival'; endsMinute: number; endsDay: number };
  lot?: string[]; // wholesale: several phone ids
}

export interface Furniture {
  id: string;
  defId: string;
  x: number;
  y: number;
}

export interface Branch {
  id: string;
  name: string;
  area: string;
  openedDay: number;
  staff: number;
  quality: number;
  franchise: boolean;
}

export interface Review {
  day: number;
  stars: number;
  text: string;
  name: string;
  online: boolean;
}

export interface BusinessAccount {
  id: string;
  company: string;
  phonesPerWeek: number;
  pricePerJob: number;
  daysLeft: number;
  satisfaction: number;
  delivered: number;
}

export interface GameState {
  version: number;
  mode: GameMode;
  shopName: string;
  day: number;
  minute: number; // minute of day
  speed: number;
  cash: number;
  rep: number;
  stage: number;
  playerSkill: number;
  stats: { repairs: number; failed: number; refurbSold: number; partsSold: number; customersServed: number; customersLost: number; warrantyClaims: number };
  phones: Record<string, PhoneInst>;
  customers: Customer[];
  jobs: Job[];
  employees: Employee[];
  candidates: Candidate[];
  inventory: ComponentInst[];
  chips: Record<string, number>;
  consumables: Record<string, number>;
  orders: Order[];
  tools: Record<string, { id: string; wear: number; broken?: boolean }>;
  research: { done: string[]; active: { id: string; minutesLeft: number } | null };
  listings: Listing[];
  devices: string[]; // player-owned phone ids
  ledger: Record<number, Record<string, number>>; // day -> category -> amount (+income / -expense)
  loans: { id: string; principal: number; remaining: number; rate: number; daysLeft: number }[];
  insurance: string;
  pricing: { global: number; services: Record<string, number>; tiers: Record<string, number> };
  partPriceIndex: Record<string, number>;
  modelDemand: Record<string, number>;
  priceHistory: Record<string, number[]>;
  competitors: { id: string; name: string; priceIndex: number; rep: number; branches: number; priceWar: number; share: number }[];
  shareHistory: number[];
  reviews: Review[];
  shop: { locationId: string; owned: boolean; furniture: Furniture[]; wall: string; floor: string; signColor: string };
  branches: Branch[];
  businessAccounts: BusinessAccount[];
  offers: { id: string; kind: 'contract'; company: string; phones: number; pricePerJob: number; days: number; expiresDay: number }[];
  manufacturing: { setup: boolean; designs: { id: string; name: string; tier: 'budget' | 'mid' | 'flagship'; price: number; quality: number }[]; stock: Record<string, number>; sold: number };
  effects: { loadshedding: number; demandMult: number; demandDays: number; spikeSlot: string | null; spikeDays: number; supplierDelay: number };
  bench: { phoneId: string | null; jobId: string | null; tool: string; bit: ScrewType; screwSel: string | null; mistakes: string[] };
  log: { day: number; minute: number; text: string; kind: string }[];
  dayReport: null | { day: number; income: number; expense: number; lines: string[] };
  challenge?: { puzzle: number; score: number; startedMinute: number; startedDay: number; history: { puzzle: number; score: number }[] };
  tutorialSeen?: boolean;
  regulars: { name: string; loyalty: number; visits: number }[];
  policy: { autoAssign: boolean; autoOrder?: boolean; grade: PartGrade; warrantyDays: number };
  onlineRequests: { id: string; name: string; modelId: string; symptom: string; faultId: string; expiresDay: number }[];
  scrap: number; // dead shells waiting for e-waste disposal
}

let game: GameState | null = null;
export const G = () => game!;
export const hasGame = () => !!game;
export const setGame = (g: GameState | null) => {
  game = g;
};

// ---------------- notification bus ----------------
type Listener = (text: string, kind: string) => void;
const listeners: Listener[] = [];
export const onNotify = (l: Listener) => listeners.push(l);
export function notify(text: string, kind: 'info' | 'good' | 'bad' | 'warn' | 'event' = 'info') {
  const g = game;
  if (g) {
    g.log.unshift({ day: g.day, minute: g.minute, text, kind });
    if (g.log.length > 200) g.log.length = 200;
  }
  listeners.forEach((l) => l(text, kind));
}

/** Generic "something changed" signal so UI can re-render. */
const changeListeners: (() => void)[] = [];
export const onChange = (l: () => void) => changeListeners.push(l);
export const changed = () => changeListeners.forEach((l) => l());

export const fmtMoney = (n: number) => `${CONFIG.currency} ${Math.round(n).toLocaleString('en-US')}`;
export const fmtTime = (minute: number) => {
  const h = Math.floor(minute / 60) % 24;
  const m = Math.floor(minute % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
