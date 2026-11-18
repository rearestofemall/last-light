/**
 * Business data: suppliers, furniture, locations, competitors, events and
 * name pools.
 */
import type { CompetitorDef, EventDef, FurnitureDef, LocationDef, SupplierDef } from './types';

export const SUPPLIERS: SupplierDef[] = [
  { id: 'hallroad', name: 'Hall Road Wholesale', grades: ['genuine', 'refurbished', 'aftermarket'], priceMult: 0.9, deliveryDays: 0, reliability: 0.92, fakeRisk: 0.35, minStage: 1, desc: 'Walk-in bazaar wholesaler. Same-day pickup. Their "original" parts... are sometimes not.' },
  { id: 'shenzhen', name: 'Shenzhen Direct', grades: ['genuine', 'refurbished', 'aftermarket'], priceMult: 0.7, deliveryDays: 5, reliability: 0.75, fakeRisk: 0.15, minStage: 1, desc: 'Cheap import, slow shipping, customs delays.' },
  { id: 'refurbco', name: 'ReCell Pulls', grades: ['refurbished'], priceMult: 0.85, deliveryDays: 1, reliability: 0.95, fakeRisk: 0, minStage: 1, desc: 'Pulled original parts, graded and tested.' },
  { id: 'oemhub', name: 'OEM Parts Hub', grades: ['genuine'], priceMult: 1.12, deliveryDays: 2, reliability: 0.97, fakeRisk: 0, minStage: 2, desc: 'Authorised genuine parts. Pricey, never fake.' },
  { id: 'chipworld', name: 'ChipWorld Components', grades: ['genuine'], priceMult: 1.0, deliveryDays: 1, reliability: 0.95, fakeRisk: 0.05, minStage: 2, desc: 'Board-level ICs, caps and connectors.' },
];

export const FURNITURE: FurnitureDef[] = [
  { id: 'bench_basic', name: 'Basic workbench', w: 2, h: 1, price: 8_000, kind: 'bench', color: '#8b6a45', effect: { benchTier: 1 } },
  { id: 'bench_pro', name: 'ESD pro workbench', w: 2, h: 1, price: 35_000, kind: 'bench', color: '#4a6b8a', effect: { benchTier: 2 }, stage: 2 },
  { id: 'bench_elite', name: 'Elite repair station', w: 3, h: 1, price: 90_000, kind: 'bench', color: '#2f4f6f', effect: { benchTier: 3 }, stage: 3 },
  { id: 'counter', name: 'Reception counter', w: 3, h: 1, price: 12_000, kind: 'reception', color: '#b08850', effect: { rep: 1 } },
  { id: 'counter_glass', name: 'Glass display counter', w: 3, h: 1, price: 40_000, kind: 'reception', color: '#9fc6d8', effect: { rep: 3 }, stage: 2 },
  { id: 'shelf_small', name: 'Parts shelf', w: 1, h: 1, price: 5_000, kind: 'shelf', color: '#7a7a7a', effect: { storage: 60 } },
  { id: 'shelf_large', name: 'Parts cabinet (ESD drawers)', w: 2, h: 1, price: 18_000, kind: 'shelf', color: '#5e6b78', effect: { storage: 180 } },
  { id: 'chairs', name: 'Waiting chairs', w: 2, h: 1, price: 6_000, kind: 'seating', color: '#c04a4a', effect: { patience: 0.15 } },
  { id: 'sofa', name: 'Waiting sofa', w: 2, h: 1, price: 20_000, kind: 'seating', color: '#6b4a8a', effect: { patience: 0.3, rep: 1 }, stage: 2 },
  { id: 'plant', name: 'Potted plant', w: 1, h: 1, price: 1_500, kind: 'decor', color: '#3f8f4a', effect: { rep: 0.5 } },
  { id: 'poster', name: 'Brand poster wall', w: 1, h: 1, price: 3_000, kind: 'decor', color: '#d8a03a', effect: { rep: 0.5 } },
  { id: 'neon', name: 'Neon sign', w: 1, h: 1, price: 12_000, kind: 'decor', color: '#ff3fa4', effect: { rep: 2 } },
  { id: 'ac', name: 'Air conditioner', w: 1, h: 1, price: 45_000, kind: 'utility', color: '#dfe7ee', effect: { patience: 0.2, rep: 1 } },
  { id: 'ups', name: 'UPS + solar backup', w: 1, h: 1, price: 60_000, kind: 'utility', color: '#2f2f2f', effect: { power: true } },
  { id: 'cctv', name: 'CCTV system', w: 1, h: 1, price: 18_000, kind: 'utility', color: '#444', effect: {} },
  { id: 'showcase', name: 'Refurb phone showcase', w: 2, h: 1, price: 25_000, kind: 'decor', color: '#c9d6e3', effect: { rep: 1 } },
];
export const furnitureById = (id: string) => FURNITURE.find((f) => f.id === id)!;

export const LOCATIONS: LocationDef[] = [
  { id: 'booth', name: 'Booth in Hafeez Centre', w: 7, h: 5, rentPerDay: 1_200, buyPrice: 2_500_000, traffic: 1.0, stage: 1, desc: 'A tiny booth in a busy electronics mall.' },
  { id: 'shop', name: 'Street shop, Liberty Market', w: 10, h: 7, rentPerDay: 3_500, buyPrice: 9_000_000, traffic: 1.5, stage: 2, desc: 'Your own shop front with room for staff.' },
  { id: 'centre', name: 'Service centre, Gulberg', w: 14, h: 9, rentPerDay: 9_000, buyPrice: 25_000_000, traffic: 2.2, stage: 3, desc: 'Professional service centre with premium walk-ins.' },
  { id: 'hq', name: 'Flagship HQ, DHA', w: 18, h: 11, rentPerDay: 22_000, buyPrice: 70_000_000, traffic: 3.0, stage: 4, desc: 'Headquarters and showroom.' },
];
export const locationById = (id: string) => LOCATIONS.find((l) => l.id === id)!;

export const COMPETITORS: CompetitorDef[] = [
  { id: 'c1', name: 'Mobile Doctor', priceIndex: 0.85, rep: 35, branches: 1, aggression: 0.6 },
  { id: 'c2', name: 'FixIt Point', priceIndex: 1.0, rep: 45, branches: 2, aggression: 0.4 },
  { id: 'c3', name: 'Hafeez Telecom & Repair', priceIndex: 0.75, rep: 25, branches: 1, aggression: 0.8 },
  { id: 'c4', name: 'iCare Premium Service', priceIndex: 1.4, rep: 60, branches: 1, aggression: 0.3 },
];

export const EVENTS: EventDef[] = [
  { id: 'supplier_delay', name: 'Supplier delay', weight: 6, minStage: 1, desc: 'Customs hold-up: pending orders are delayed.' },
  { id: 'tool_break', name: 'Equipment breakdown', weight: 4, minStage: 1, desc: 'One of your tools broke down.' },
  { id: 'price_spike', name: 'Part price spike', weight: 5, minStage: 1, desc: 'A shortage pushes up the price of a part type.' },
  { id: 'price_drop', name: 'Part price drop', weight: 4, minStage: 1, desc: 'A flood of stock makes a part type cheap.' },
  { id: 'demand_up', name: 'Demand surge', weight: 4, minStage: 1, desc: 'More customers than usual this week.' },
  { id: 'phone_launch', name: 'New phone launch', weight: 3, minStage: 1, desc: 'A new phone launched. Older models drop in value.' },
  { id: 'price_war', name: 'Competitor price war', weight: 3, minStage: 1, desc: 'A rival slashed their prices.' },
  { id: 'loadshedding', name: 'Load-shedding', weight: 6, minStage: 1, desc: 'Power cuts today. Benches stop without backup power.' },
  { id: 'viral_review', name: 'Viral review', weight: 2, minStage: 1, desc: 'A TikTok about your shop went viral.' },
  { id: 'bulk_contract', name: 'Business opportunity', weight: 3, minStage: 2, desc: 'A company offers a bulk repair contract.' },
  { id: 'market_crash', name: 'Used-phone market crash', weight: 1, minStage: 2, desc: 'Used phone prices fall sharply.' },
  { id: 'police_raid', name: 'Police check for stolen phones', weight: 2, minStage: 1, desc: 'Police inspect stock for stolen devices.' },
  { id: 'theft', name: 'Break-in', weight: 1, minStage: 1, desc: 'Someone broke in overnight.' },
  { id: 'competitor_branch', name: 'Competitor expansion', weight: 2, minStage: 2, desc: 'A rival opened a branch nearby.' },
];

export const FIRST_NAMES = [
  'Ali', 'Ahmed', 'Bilal', 'Usman', 'Hamza', 'Saad', 'Fahad', 'Zain', 'Imran', 'Kashif', 'Asad', 'Hassan', 'Omer', 'Danish', 'Faisal',
  'Ayesha', 'Fatima', 'Hira', 'Sana', 'Mahnoor', 'Zara', 'Amna', 'Iqra', 'Maryam', 'Nida', 'Rabia', 'Sadia', 'Komal', 'Anum', 'Mehwish',
  'Tariq', 'Naveed', 'Shahid', 'Junaid', 'Waqas', 'Rizwan', 'Sobia', 'Uzma', 'Bushra', 'Kiran',
];
export const LAST_NAMES = [
  'Khan', 'Malik', 'Butt', 'Sheikh', 'Qureshi', 'Chaudhry', 'Raza', 'Hussain', 'Iqbal', 'Siddiqui', 'Mirza', 'Javed', 'Akhtar', 'Aslam', 'Baig',
  'Rana', 'Abbasi', 'Hashmi', 'Gill', 'Bhatti',
];
export const COMPANY_NAMES = ['TeleNet Logistics', 'Crescent Textiles', 'Indus Foods', 'Raavi Ride-hailing', 'Margalla Bank', 'SwiftCourier PK', 'Ravi Pharma', 'Karakoram Security'];
