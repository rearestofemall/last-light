/**
 * Phone model database. Add a phone by adding one entry here.
 * `layout` picks the internal layout; `mirror`, `batteryShift` and `dims`
 * make each model's internals physically different.
 * `sharedParts` declares cross-compatible part numbers (a thing players learn).
 */
import type { PhoneModelDef, Tier } from './types';

type Opts = Partial<PhoneModelDef>;

const variantsFor = (tier: Tier, base: number): PhoneModelDef['variants'] => {
  if (tier === 'budget' || tier === 'legacy') return [{ ram: 4, storage: 64, priceAdd: 0 }, { ram: 6, storage: 128, priceAdd: Math.round(base * 0.12) }];
  if (tier === 'mid') return [{ ram: 6, storage: 128, priceAdd: 0 }, { ram: 8, storage: 256, priceAdd: Math.round(base * 0.15) }];
  return [{ ram: 8, storage: 256, priceAdd: 0 }, { ram: 12, storage: 512, priceAdd: Math.round(base * 0.18) }, { ram: 12, storage: 1024, priceAdd: Math.round(base * 0.35) }];
};

function phone(
  id: string, brand: string, name: string, year: number, tier: Tier, launchPrice: number, chipset: string,
  layout: string, dims: [number, number, number], features: string[], display: PhoneModelDef['display'], o: Opts = {},
): PhoneModelDef {
  return {
    id, brand, name, year, tier, launchPrice, chipset, layout, dims, features, display,
    variants: o.variants ?? variantsFor(tier, launchPrice),
    cameras: o.cameras ?? (features.includes('tele') ? '50MP main + 12MP ultrawide + 10MP 3x tele' : features.includes('wide') ? '50MP main + 8MP ultrawide' : '50MP main'),
    battery: o.battery ?? (tier === 'budget' ? 5000 : tier === 'foldable' ? 4400 : 4500),
    charging: o.charging ?? (tier === 'budget' ? 18 : 33),
    build: o.build ?? (layout === 'budget-screwback' ? 'Plastic back, plastic frame' : 'Glass back, aluminium frame'),
    colours: o.colours ?? ['Black', 'White', 'Blue'],
    ip: o.ip ?? (tier === 'budget' ? 'None' : 'IP67'),
    ...o,
  } as PhoneModelDef;
}

export const PHONES: PhoneModelDef[] = [
  // ---------------- The three detailed reference models ----------------
  phone('realmi-c55', 'realmi', 'Realmi C55', 2023, 'budget', 42_000, 'Heliox G88', 'budget-screwback', [76, 165.6, 7.9], ['fingerprint'],
    { size: 6.72, type: 'LCD', res: '1080x2400', hz: 90 }, { detailed: true, colours: ['Rainy Night', 'Sunshower'], battery: 5000, charging: 33, cameras: '64MP main + 2MP depth' }),
  phone('galaxo-a54', 'samsang', 'Galaxo A54', 2023, 'mid', 110_000, 'Exynoz 1380', 'mid-backglass', [76.7, 158.2, 8.2], ['wide', 'fingerprint'],
    { size: 6.4, type: 'AMOLED', res: '1080x2340', hz: 120 }, { detailed: true, colours: ['Awesome Graphite', 'Awesome Lime', 'Awesome Violet'], charging: 25, cameras: '50MP main + 12MP ultrawide + 5MP macro' }),
  phone('pear-13-pro', 'pear', 'Pear 13 Pro', 2021, 'flagship', 330_000, 'A15 Neural', 'flagship-front', [71.5, 146.7, 7.65], ['wide', 'tele', 'faceId'],
    { size: 6.1, type: 'LTPO OLED', res: '1170x2532', hz: 120 }, { detailed: true, colours: ['Graphite', 'Gold', 'Silver', 'Sierra Blue'], battery: 3095, charging: 23, cameras: '12MP main + 12MP ultrawide + 12MP 3x tele + LiDAR', build: 'Glass back, stainless steel frame', ip: 'IP68' }),

  // ---------------- Pear ----------------
  phone('pear-8', 'pear', 'Pear 8', 2017, 'legacy', 120_000, 'A11 Neural', 'flagship-front', [67.3, 138.4, 7.3], [], { size: 4.7, type: 'LCD', res: '750x1334', hz: 60 }, { battery: 1821, charging: 15, cameras: '12MP main', ip: 'IP67' }),
  phone('pear-11', 'pear', 'Pear 11', 2019, 'flagship', 180_000, 'A13 Neural', 'flagship-front', [75.7, 150.9, 8.3], ['wide', 'faceId'], { size: 6.1, type: 'LCD', res: '828x1792', hz: 60 }, { battery: 3110, charging: 18, cameras: '12MP main + 12MP ultrawide', mirror: true }),
  phone('pear-12', 'pear', 'Pear 12', 2020, 'flagship', 220_000, 'A14 Neural', 'flagship-front', [71.5, 146.7, 7.4], ['wide', 'faceId'], { size: 6.1, type: 'OLED', res: '1170x2532', hz: 60 }, { battery: 2815, charging: 20, cameras: '12MP main + 12MP ultrawide' }),
  phone('pear-13', 'pear', 'Pear 13', 2021, 'flagship', 250_000, 'A15 Neural', 'flagship-front', [71.5, 146.7, 7.65], ['wide', 'faceId'], { size: 6.1, type: 'OLED', res: '1170x2532', hz: 60 }, { battery: 3240, charging: 20, cameras: '12MP main + 12MP ultrawide', sharedParts: { display: 'PEAR-13/14-DISP' } }),
  phone('pear-14', 'pear', 'Pear 14', 2022, 'flagship', 280_000, 'A15 Neural', 'flagship-front', [71.5, 146.7, 7.8], ['wide', 'faceId'], { size: 6.1, type: 'OLED', res: '1170x2532', hz: 60 }, { battery: 3279, charging: 20, cameras: '12MP main + 12MP ultrawide', sharedParts: { display: 'PEAR-13/14-DISP' }, batteryShift: 3 }),
  phone('pear-14-pro-max', 'pear', 'Pear 14 Pro Max', 2022, 'flagship', 450_000, 'A16 Neural', 'flagship-front', [77.6, 160.7, 7.85], ['wide', 'tele', 'faceId'], { size: 6.7, type: 'LTPO OLED', res: '1290x2796', hz: 120 }, { battery: 4323, charging: 27, cameras: '48MP main + 12MP ultrawide + 12MP 3x tele' }),
  phone('pear-15-pro', 'pear', 'Pear 15 Pro', 2023, 'flagship', 480_000, 'A17 Neural Pro', 'flagship-front', [70.6, 146.6, 8.25], ['wide', 'tele', 'faceId'], { size: 6.1, type: 'LTPO OLED', res: '1179x2556', hz: 120 }, { battery: 3274, charging: 27, cameras: '48MP main + 12MP ultrawide + 12MP 3x tele', build: 'Glass back, titanium frame', ip: 'IP68' }),
  phone('pear-se-3', 'pear', 'Pear SE (3rd gen)', 2022, 'mid', 130_000, 'A15 Neural', 'flagship-front', [67.3, 138.4, 7.3], [], { size: 4.7, type: 'LCD', res: '750x1334', hz: 60 }, { battery: 2018, charging: 20, cameras: '12MP main' }),
  phone('pear-16', 'pear', 'Pear 16', 2025, 'flagship', 360_000, 'A18 Neural', 'flagship-front', [71.6, 147.6, 7.8], ['wide', 'faceId'], { size: 6.1, type: 'OLED', res: '1179x2556', hz: 60 }, { battery: 3561, charging: 25, mirror: true }),
  phone('pear-17-pro', 'pear', 'Pear 17 Pro', 2026, 'flagship', 540_000, 'A19 Neural Pro', 'flagship-front', [71.9, 150.0, 8.75], ['wide', 'tele', 'faceId'], { size: 6.3, type: 'LTPO OLED', res: '1206x2622', hz: 120 }, { battery: 4252, charging: 40, cameras: '48MP main + 48MP ultrawide + 48MP 4x tele', batteryShift: -3 }),

  // ---------------- Samsang ----------------
  phone('galaxo-s9', 'samsang', 'Galaxo S9', 2018, 'legacy', 150_000, 'Exynoz 9810', 'mid-backglass', [68.7, 147.7, 8.5], ['fingerprint'], { size: 5.8, type: 'AMOLED', res: '1440x2960', hz: 60 }, { battery: 3000, charging: 15, cameras: '12MP main' }),
  phone('galaxo-a14', 'samsang', 'Galaxo A14', 2023, 'budget', 45_000, 'Heliox G80', 'budget-screwback', [78, 167.7, 9.1], ['fingerprint'], { size: 6.6, type: 'PLS LCD', res: '1080x2408', hz: 60 }, { charging: 15, cameras: '50MP main + 5MP ultrawide + 2MP macro', mirror: true }),
  phone('galaxo-a34', 'samsang', 'Galaxo A34', 2023, 'mid', 85_000, 'Dimensia 1080', 'mid-backglass', [78.1, 161.3, 8.2], ['wide', 'fingerprint'], { size: 6.6, type: 'AMOLED', res: '1080x2340', hz: 120 }, { charging: 25, sharedParts: { subBoard: 'SAM-A34/54-SUB' } }),
  phone('galaxo-s22', 'samsang', 'Galaxo S22', 2022, 'flagship', 230_000, 'Snapdraco 8 Gen 1', 'mid-backglass', [70.6, 146, 7.6], ['wide', 'tele', 'fingerprint'], { size: 6.1, type: 'Dynamic AMOLED 2X', res: '1080x2340', hz: 120 }, { battery: 3700, charging: 25, ip: 'IP68', batteryShift: 2 }),
  phone('galaxo-s23-ultra', 'samsang', 'Galaxo S23 Ultra', 2023, 'flagship', 380_000, 'Snapdraco 8 Gen 2', 'mid-backglass', [78.1, 163.4, 8.9], ['wide', 'tele', 'fingerprint'], { size: 6.8, type: 'Dynamic AMOLED 2X', res: '1440x3088', hz: 120 }, { battery: 5000, charging: 45, cameras: '200MP main + 12MP ultrawide + 10MP 3x + 10MP 10x', ip: 'IP68' }),
  phone('galaxo-s25', 'samsang', 'Galaxo S25', 2025, 'flagship', 300_000, 'Snapdraco 8 Elite', 'mid-backglass', [70.5, 146.9, 7.2], ['wide', 'tele', 'fingerprint'], { size: 6.2, type: 'Dynamic AMOLED 2X', res: '1080x2340', hz: 120 }, { battery: 4000, charging: 25, ip: 'IP68', mirror: true }),
  phone('galaxo-zfold5', 'samsang', 'Galaxo Z Fold5', 2023, 'foldable', 520_000, 'Snapdraco 8 Gen 2', 'foldable', [129.9, 154.9, 6.1], ['wide', 'tele', 'fingerprint'], { size: 7.6, type: 'Foldable Dynamic AMOLED', res: '1812x2176', hz: 120, cover: '6.2" AMOLED' }, { charging: 25, ip: 'IPX8' }),
  phone('galaxo-zfold7', 'samsang', 'Galaxo Z Fold7', 2025, 'foldable', 620_000, 'Snapdraco 8 Elite', 'foldable', [143.2, 158.4, 4.2], ['wide', 'tele', 'fingerprint'], { size: 8.0, type: 'Foldable Dynamic AMOLED', res: '1968x2184', hz: 120, cover: '6.5" AMOLED' }, { charging: 25, ip: 'IP48' }),

  // ---------------- Googol Pixl ----------------
  phone('pixl-7a', 'googol', 'Googol Pixl 7a', 2023, 'mid', 95_000, 'Tensar G2', 'mid-backglass', [72.9, 152, 9.0], ['wide', 'fingerprint'], { size: 6.1, type: 'OLED', res: '1080x2400', hz: 90 }, { battery: 4385, charging: 18 }),
  phone('pixl-8-pro', 'googol', 'Googol Pixl 8 Pro', 2023, 'flagship', 280_000, 'Tensar G3', 'mid-backglass', [76.5, 162.6, 8.8], ['wide', 'tele', 'fingerprint'], { size: 6.7, type: 'LTPO OLED', res: '1344x2992', hz: 120 }, { battery: 5050, charging: 30, batteryShift: -2 }),
  phone('pixl-fold', 'googol', 'Googol Pixl Fold', 2023, 'foldable', 450_000, 'Tensar G2', 'foldable', [139.7, 139.7, 5.8], ['wide', 'tele', 'fingerprint'], { size: 7.6, type: 'Foldable OLED', res: '1840x2208', hz: 120, cover: '5.8" OLED' }, { charging: 30, ip: 'IPX8' }),

  // ---------------- Xiaomo ----------------
  phone('redmo-12c', 'xiaomo', 'Redmo 12C', 2023, 'budget', 32_000, 'Heliox G85', 'budget-screwback', [76.4, 168.8, 8.8], ['fingerprint'], { size: 6.71, type: 'LCD', res: '720x1650', hz: 60 }, { charging: 10, sharedParts: { subBoard: 'XM-12-SUB' } }),
  phone('redmo-note-12', 'xiaomo', 'Redmo Note 12', 2023, 'budget', 52_000, 'Snapdraco 685', 'budget-screwback', [76.2, 165.7, 8.0], ['wide', 'fingerprint'], { size: 6.67, type: 'AMOLED', res: '1080x2400', hz: 120 }, { charging: 33, sharedParts: { subBoard: 'XM-12-SUB' }, batteryShift: 2 }),
  phone('xiaomo-13t', 'xiaomo', 'Xiaomo 13T', 2023, 'flagship', 150_000, 'Dimensia 8200', 'mid-backglass', [75.7, 162.2, 8.5], ['wide', 'tele', 'fingerprint'], { size: 6.67, type: 'AMOLED', res: '1220x2712', hz: 144 }, { battery: 5000, charging: 67 }),

  // ---------------- Oppa ----------------
  phone('oppa-a78', 'oppa', 'Oppa A78', 2023, 'budget', 60_000, 'Snapdraco 680', 'budget-screwback', [73.2, 162.2, 8.0], ['fingerprint'], { size: 6.43, type: 'AMOLED', res: '1080x2400', hz: 90 }, { charging: 67, mirror: true }),
  phone('oppa-reno-10', 'oppa', 'Oppa Reno 10', 2023, 'mid', 115_000, 'Dimensia 7050', 'mid-backglass', [74.2, 162.4, 8.0], ['wide', 'tele', 'fingerprint'], { size: 6.7, type: 'AMOLED', res: '1080x2412', hz: 120 }, { charging: 67 }),
  phone('oppa-find-n3', 'oppa', 'Oppa Find N3', 2023, 'foldable', 550_000, 'Snapdraco 8 Gen 2', 'foldable', [142.2, 153.4, 5.8], ['wide', 'tele', 'fingerprint'], { size: 7.82, type: 'Foldable LTPO AMOLED', res: '2268x2440', hz: 120, cover: '6.31" AMOLED' }, { battery: 4805, charging: 67, ip: 'IPX4' }),

  // ---------------- Vivoh ----------------
  phone('vivoh-y36', 'vivoh', 'Vivoh Y36', 2023, 'budget', 50_000, 'Snapdraco 680', 'budget-screwback', [76.2, 164.1, 8.1], ['fingerprint'], { size: 6.64, type: 'LCD', res: '1080x2388', hz: 90 }, { charging: 44 }),
  phone('vivoh-v29', 'vivoh', 'Vivoh V29', 2023, 'mid', 120_000, 'Snapdraco 778G', 'mid-backglass', [74.4, 164.2, 7.5], ['wide', 'fingerprint'], { size: 6.78, type: 'AMOLED', res: '1260x2800', hz: 120 }, { charging: 80, mirror: true }),

  // ---------------- Realmi ----------------
  phone('realmi-11-pro', 'realmi', 'Realmi 11 Pro', 2023, 'mid', 90_000, 'Dimensia 7050', 'mid-backglass', [73.9, 161.6, 8.2], ['wide', 'fingerprint'], { size: 6.7, type: 'AMOLED', res: '1080x2412', hz: 120 }, { charging: 67, batteryShift: -2 }),

  // ---------------- Nokla ----------------
  phone('nokla-6-1', 'nokla', 'Nokla 6.1', 2018, 'legacy', 25_000, 'Snapdraco 630', 'budget-screwback', [75.8, 148.8, 8.2], ['fingerprint'], { size: 5.5, type: 'LCD', res: '1080x1920', hz: 60 }, { battery: 3000, charging: 10 }),
  phone('nokla-g21', 'nokla', 'Nokla G21', 2022, 'budget', 33_000, 'Unisock T606', 'budget-screwback', [75.9, 164.6, 8.5], ['fingerprint'], { size: 6.5, type: 'LCD', res: '720x1600', hz: 90 }, { charging: 18 }),

  // ---------------- Budget brands ----------------
  phone('tecnoh-spark-10', 'tecnoh', 'Tecnoh Spark 10', 2023, 'budget', 30_000, 'Heliox G37', 'budget-screwback', [76.6, 168.6, 8.4], ['fingerprint'], { size: 6.6, type: 'LCD', res: '720x1612', hz: 90 }, { sharedParts: { battery: 'TRN-BL-50' } }),
  phone('infinex-hot-30', 'infinex', 'Infinex Hot 30', 2023, 'budget', 33_000, 'Heliox G88', 'budget-screwback', [76.5, 168.5, 8.4], ['fingerprint'], { size: 6.78, type: 'LCD', res: '1080x2460', hz: 90 }, { sharedParts: { battery: 'TRN-BL-50' }, mirror: true }),
  phone('itell-a70', 'itell', 'iTell A70', 2023, 'budget', 18_000, 'Unisock T603', 'budget-screwback', [76.3, 166.6, 8.9], [], { size: 6.6, type: 'LCD', res: '720x1612', hz: 60 }, { charging: 10 }),
];

export const phoneById = (id: string) => PHONES.find((p) => p.id === id)!;
