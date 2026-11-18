import type { ResearchDef, ServiceDef } from './types';

/** Research tree. Ids referenced by CONFIG.progression must exist here. */
export const RESEARCH: ResearchDef[] = [
  { id: 'software-flash', name: 'Firmware flashing', cost: 15_000, hours: 6, requires: [], stage: 1, desc: 'Fix boot loops and OS corruption with the diagnostic computer.' },
  { id: 'water-damage', name: 'Liquid damage treatment', cost: 20_000, hours: 8, requires: [], stage: 1, desc: 'Ultrasonic cleaning of corroded boards.' },
  { id: 'diagnostics-pro', name: 'Advanced diagnostics', cost: 30_000, hours: 10, requires: [], stage: 1, desc: 'Thermal camera, precision multimeter, schematic reference values.' },
  { id: 'flagships', name: 'Flagship certification', cost: 40_000, hours: 12, requires: [], stage: 1, desc: 'Flagship owners start trusting you with their phones.' },
  { id: 'glass-only', name: 'Glass-only refurbishing', cost: 60_000, hours: 16, requires: [], stage: 2, desc: 'Separate cracked glass from a working panel and laminate new glass: huge margins.' },
  { id: 'microsoldering', name: 'Microsoldering', cost: 80_000, hours: 20, requires: ['diagnostics-pro'], stage: 2, desc: 'Hot air + iron board repair: caps, ICs, jumpers.' },
  { id: 'online-repairs', name: 'Online booking & mail-in', cost: 50_000, hours: 12, requires: [], stage: 2, desc: 'Accept mail-in repairs and online bookings.' },
  { id: 'training-1', name: 'Technician training programme', cost: 45_000, hours: 12, requires: [], stage: 2, desc: 'Training sessions give +50% skill.' },
  { id: 'reballing', name: 'BGA reballing', cost: 150_000, hours: 30, requires: ['microsoldering'], stage: 3, desc: 'Replace baseband/NAND chips and recover dead boards.' },
  { id: 'parts-pairing', name: 'Parts pairing / programming', cost: 120_000, hours: 24, requires: ['microsoldering'], stage: 3, desc: 'Remove "unknown part" warnings with a programmer.' },
  { id: 'faceid-transfer', name: 'Face ID transfer', cost: 160_000, hours: 30, requires: ['parts-pairing'], stage: 3, desc: 'Program replacement dot projectors.' },
  { id: 'data-recovery', name: 'Data recovery', cost: 200_000, hours: 36, requires: ['reballing'], stage: 3, desc: 'Recover photos from dead boards. Customers pay a fortune.' },
  { id: 'foldables', name: 'Foldable repair certification', cost: 180_000, hours: 30, requires: ['flagships'], stage: 3, desc: 'Foldable customers + hinge and inner screen repair.' },
  { id: 'business-accounts', name: 'Business accounts', cost: 150_000, hours: 24, requires: ['online-repairs'], stage: 3, desc: 'Corporate fleet contracts.' },
  { id: 'training-2', name: 'Repair academy', cost: 250_000, hours: 40, requires: ['training-1'], stage: 4, desc: 'Training is cheaper and doubles gains.' },
  { id: 'refurb-line', name: 'Refurbishment line', cost: 300_000, hours: 40, requires: [], stage: 4, desc: 'Staff refurbish your stock phones automatically.' },
  { id: 'franchising', name: 'Franchise programme', cost: 1_000_000, hours: 60, requires: ['business-accounts'], stage: 5, desc: 'Sell franchises of your brand.' },
  { id: 'manufacturing', name: 'Own phone manufacturing', cost: 3_000_000, hours: 80, requires: ['refurb-line'], stage: 4, desc: 'Design and manufacture your own phones.' },
];

export const researchById = (id: string) => RESEARCH.find((r) => r.id === id)!;

/** Customer-facing services. Price = basePrice * tier multiplier * your price setting. */
export const SERVICES: ServiceDef[] = [
  { id: 'sv_screen', name: 'Screen replacement', basePrice: 4_000, minutes: 60, slots: ['display'], fixes: ['f_screen_cracked', 'f_display_dead', 'f_display_lines', 'f_touch_dead', 'f_flex_torn'] },
  { id: 'sv_glass', name: 'Glass-only refurbish', basePrice: 6_000, minutes: 120, slots: ['display'], research: 'glass-only', fixes: ['f_screen_cracked'] },
  { id: 'sv_inner', name: 'Foldable inner screen', basePrice: 9_000, minutes: 150, slots: ['innerDisplay'], research: 'foldables', fixes: ['f_inner_crease'] },
  { id: 'sv_hinge', name: 'Hinge replacement', basePrice: 7_000, minutes: 150, slots: ['hinge'], research: 'foldables', fixes: ['f_hinge'] },
  { id: 'sv_battery', name: 'Battery replacement', basePrice: 2_000, minutes: 40, slots: ['battery', 'battery2'], fixes: ['f_batt_worn', 'f_batt_swollen', 'f_batt_dead'] },
  { id: 'sv_port', name: 'Charging port repair', basePrice: 2_000, minutes: 50, slots: ['subBoard', 'chargeFlex', 'chargePort'], fixes: ['f_port_dirty', 'f_port_damaged', 'f_chargeflex', 'f_screw_sub'] },
  { id: 'sv_rearcam', name: 'Rear camera replacement', basePrice: 2_500, minutes: 50, slots: ['mainCam', 'wideCam', 'teleCam'], fixes: ['f_maincam', 'f_widecam', 'f_telecam'] },
  { id: 'sv_frontcam', name: 'Front camera replacement', basePrice: 2_000, minutes: 50, slots: ['frontCam'], fixes: ['f_frontcam'] },
  { id: 'sv_speaker', name: 'Speaker / earpiece', basePrice: 1_500, minutes: 40, slots: ['loudspeaker', 'earpiece'], fixes: ['f_loudspeaker', 'f_earpiece'] },
  { id: 'sv_mic', name: 'Microphone repair', basePrice: 1_500, minutes: 45, slots: ['subBoard', 'chargeFlex'], fixes: ['f_mic'] },
  { id: 'sv_back', name: 'Back glass / cover', basePrice: 2_500, minutes: 60, slots: ['backCover'], fixes: ['f_backglass'] },
  { id: 'sv_buttons', name: 'Button flex repair', basePrice: 1_500, minutes: 60, slots: ['powerFlex', 'volumeFlex'], fixes: ['f_power_btn', 'f_volume_btn'] },
  { id: 'sv_vibe', name: 'Vibration motor', basePrice: 1_200, minutes: 35, slots: ['vibrator'], fixes: ['f_vibrator'] },
  { id: 'sv_network', name: 'Network / antenna / SIM', basePrice: 2_000, minutes: 50, slots: ['antenna', 'simTray', 'bridgeFlex'], fixes: ['f_antenna', 'f_simtray', 'f_bridgeflex'] },
  { id: 'sv_biometric', name: 'Face ID / fingerprint', basePrice: 4_000, minutes: 70, slots: ['faceId', 'fingerprint'], fixes: ['f_faceid', 'f_fingerprint'] },
  { id: 'sv_water', name: 'Liquid damage treatment', basePrice: 3_500, minutes: 90, research: 'water-damage', fixes: ['f_water'] },
  { id: 'sv_software', name: 'Software repair / flashing', basePrice: 1_500, minutes: 30, research: 'software-flash', fixes: ['f_bootloop', 'f_os_glitch'] },
  { id: 'sv_board', name: 'Board repair (microsoldering)', basePrice: 7_000, minutes: 150, research: 'microsoldering', fixes: ['f_backlight_ic', 'f_cap_bl', 'f_charge_ic', 'f_cap_vbus', 'f_audio_ic', 'f_wifi', 'f_cap_main', 'f_pmic', 'f_screw_backlight', 'f_screw_board', 'f_short_damage'] },
  { id: 'sv_board_adv', name: 'Advanced board repair (reballing)', basePrice: 14_000, minutes: 240, research: 'reballing', fixes: ['f_baseband', 'f_nand'] },
];

export const serviceById = (id: string) => SERVICES.find((s) => s.id === id)!;
