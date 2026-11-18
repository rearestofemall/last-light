/**
 * Part catalogue data. Phone parts are derived per model + slot using the
 * price fractions below (genuine price = launch price * fraction * brand
 * price level). Chips and consumables are generic and cross-compatible.
 */
import type { Slot } from './types';

/** Fraction of a phone's launch price that a genuine part costs. */
export const SLOT_PRICE_FRACTION: Record<Slot, number> = {
  display: 0.24, innerDisplay: 0.38, backCover: 0.06, battery: 0.055, battery2: 0.05,
  chargePort: 0.03, subBoard: 0.045, chargeFlex: 0.05, bridgeFlex: 0.025,
  mainCam: 0.09, wideCam: 0.05, teleCam: 0.06, frontCam: 0.04, faceId: 0.08, fingerprint: 0.035,
  earpiece: 0.02, loudspeaker: 0.025, mic: 0.015, board: 0.4, powerFlex: 0.02, volumeFlex: 0.018,
  simTray: 0.008, antenna: 0.015, vibrator: 0.02, frame: 0.1, hinge: 0.12, midframe: 0.02,
};

/** Approx. weight in grams (used for fake-part detection by weighing). */
export const SLOT_WEIGHT: Partial<Record<Slot, number>> = {
  display: 42, innerDisplay: 60, battery: 46, battery2: 40, backCover: 22, mainCam: 6, faceId: 4, loudspeaker: 4, earpiece: 2, subBoard: 5, chargeFlex: 3,
};

export const SLOT_NAMES: Record<Slot, string> = {
  display: 'Display', innerDisplay: 'Inner display', backCover: 'Back cover', battery: 'Battery', battery2: 'Battery (2)',
  chargePort: 'Charging port', subBoard: 'Sub-board', chargeFlex: 'Charge flex', bridgeFlex: 'Main flex',
  mainCam: 'Main camera', wideCam: 'Ultrawide camera', teleCam: 'Telephoto camera', frontCam: 'Front camera', faceId: 'Face ID module', fingerprint: 'Fingerprint sensor',
  earpiece: 'Earpiece', loudspeaker: 'Loudspeaker', mic: 'Microphone', board: 'Logic board', powerFlex: 'Power flex', volumeFlex: 'Volume flex',
  simTray: 'SIM tray', antenna: 'Antenna', vibrator: 'Vibration motor', frame: 'Frame', hinge: 'Hinge', midframe: 'Midframe',
};

/** Slots that suppliers sell as spare parts. */
export const SELLABLE_SLOTS: Slot[] = [
  'display', 'innerDisplay', 'backCover', 'battery', 'battery2', 'subBoard', 'chargeFlex', 'bridgeFlex', 'mainCam', 'wideCam', 'teleCam',
  'frontCam', 'faceId', 'fingerprint', 'earpiece', 'loudspeaker', 'powerFlex', 'volumeFlex', 'simTray', 'antenna', 'vibrator', 'hinge',
];

/** Board-level chips: generic, shared across all models. */
export const CHIP_PARTS: { type: string; name: string; price: number; needsReball?: boolean }[] = [
  { type: 'chargeIC', name: 'Charging IC', price: 1_800 },
  { type: 'audioIC', name: 'Audio codec IC', price: 2_200 },
  { type: 'backlight', name: 'Backlight / display PMIC', price: 1_500 },
  { type: 'wifi', name: 'Wi-Fi / BT module', price: 3_500 },
  { type: 'pmic', name: 'Power management IC', price: 4_500 },
  { type: 'baseband', name: 'Baseband modem', price: 9_000, needsReball: true },
  { type: 'nand', name: 'NAND storage (pre-programmed)', price: 12_000, needsReball: true },
  { type: 'cap_vbus', name: 'Capacitor 0402 (VBUS)', price: 80 },
  { type: 'cap_main', name: 'Capacitor 0402 (VDD_MAIN)', price: 80 },
  { type: 'cap_bl', name: 'Capacitor 0201 (backlight)', price: 80 },
  { type: 'filter_bl', name: 'Backlight filter coil', price: 250 },
  { type: 'conn_disp', name: 'Display FPC connector', price: 600 },
  { type: 'conn_batt', name: 'Battery FPC connector', price: 500 },
];

/** Consumables bought in packs. */
export const CONSUMABLES: { id: string; name: string; packSize: number; price: number; desc: string }[] = [
  { id: 'adhesive', name: 'Pre-cut adhesive strips', packSize: 10, price: 2_000, desc: 'Needed to reseal glued covers, screens and batteries. Without it you lose water resistance and quality.' },
  { id: 'glassOca', name: 'Front glass + OCA sheet', packSize: 5, price: 6_500, desc: 'For glass-only refurbishment (needs separator + laminator).' },
  { id: 'flux', name: 'Flux syringe', packSize: 5, price: 1_500, desc: 'Each microsoldering job uses a little flux. Without it joints fail more often.' },
  { id: 'kapton', name: 'Kapton tape roll', packSize: 20, price: 800, desc: 'Shield neighbouring parts from hot air.' },
  { id: 'jumper', name: 'Jumper wire (0.02mm)', packSize: 20, price: 600, desc: 'Repair torn traces and ripped pads.' },
  { id: 'solderBalls', name: 'Solder balls + stencils', packSize: 5, price: 3_000, desc: 'For reballing BGA chips.' },
  { id: 'ipa', name: 'Isopropyl alcohol 99%', packSize: 10, price: 900, desc: 'Cleaning boards and dissolving battery adhesive.' },
];
