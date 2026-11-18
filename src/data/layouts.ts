/**
 * Internal layouts. Each layout is a full disassembly graph: covers, screws
 * (type + length), brackets, connectors and parts with their stacking order.
 *
 * Coordinates are millimetres, phone centre at the origin, +x right, +y top,
 * +z towards the screen. Phone models reference a layout and are scaled to
 * their own dimensions (and can be mirrored / have the battery shifted),
 * so each model ends up with its own internals.
 *
 * `requires` = nodes that sit on top and must be removed/opened first.
 * Requirements that point at nodes a model does not have (via `only`) are
 * ignored automatically.
 */
import type { ChipDef, LayoutDef, NodeDef, ScrewType, TestPointDef } from './types';

// ---------- tiny helpers to keep the data readable ----------
const screw = (
  id: string, type: ScrewType, length: number, pos: [number, number, number], requires: string[] = [], extra: Partial<NodeDef> = {},
): NodeDef => ({ id, kind: 'screw', label: `${type} screw ${length}mm`, screw: { type, length }, requires, shape: 'cyl', pos, size: [1.6, 0, 1.2], ...extra });

const conn = (id: string, label: string, connects: string, pos: [number, number, number], requires: string[], extra: Partial<NodeDef> = {}): NodeDef => ({
  id, kind: 'connector', label, connects, requires, shape: 'box', pos, size: [8, 4, 0.9], color: '#c9a227', ...extra,
});

const part = (id: string, label: string, slot: NodeDef['slot'], pos: [number, number, number], size: [number, number, number], requires: string[], extra: Partial<NodeDef> = {}): NodeDef => ({
  id, kind: 'part', label, slot, requires, shape: 'box', pos, size, ...extra,
});

const bracket = (id: string, label: string, pos: [number, number, number], size: [number, number, number], requires: string[], extra: Partial<NodeDef> = {}): NodeDef => ({
  id, kind: 'bracket', label, requires, shape: 'box', pos, size, color: '#8a8f98', ...extra,
});

/** Standard board chip set. Each layout places it differently. */
const chips = (shift: [number, number] = [0, 0], mirror = false): ChipDef[] => {
  const base: ChipDef[] = [
    { id: 'u_cpu', type: 'cpu', name: 'SoC (CPU/GPU)', pos: [50, 34], size: [18, 18] },
    { id: 'u_nand', type: 'nand', name: 'NAND storage', pos: [50, 60], size: [16, 11] },
    { id: 'u_pmic', type: 'pmic', name: 'Power management IC', pos: [24, 30], size: [12, 12] },
    { id: 'u_charge', type: 'chargeIC', name: 'Charging IC', pos: [22, 76], size: [8, 8] },
    { id: 'u_audio', type: 'audioIC', name: 'Audio codec IC', pos: [76, 72], size: [8, 8] },
    { id: 'u_bb', type: 'baseband', name: 'Baseband modem', pos: [78, 30], size: [12, 10] },
    { id: 'u_wifi', type: 'wifi', name: 'Wi-Fi / BT module', pos: [78, 50], size: [9, 9] },
    { id: 'u_bl', type: 'backlight', name: 'Backlight / display PMIC', pos: [30, 56], size: [6, 6] },
    { id: 'c_vbus', type: 'cap_vbus', name: 'VBUS filter capacitor', pos: [14, 86], size: [3, 2] },
    { id: 'c_main', type: 'cap_main', name: 'VDD_MAIN capacitor', pos: [38, 20], size: [3, 2] },
    { id: 'c_bl', type: 'cap_bl', name: 'Backlight capacitor', pos: [37, 63], size: [3, 2] },
    { id: 'l_bl', type: 'filter_bl', name: 'Backlight filter / coil', pos: [24, 63], size: [4, 3] },
    { id: 'j_disp', type: 'conn_disp', name: 'Display FPC connector', pos: [64, 88], size: [14, 5] },
    { id: 'j_batt', type: 'conn_batt', name: 'Battery FPC connector', pos: [10, 46], size: [10, 5] },
  ];
  return base.map((c) => ({ ...c, pos: [mirror ? 100 - c.pos[0] + shift[0] : c.pos[0] + shift[0], c.pos[1] + shift[1]] as [number, number] }));
};

const testPoints = (mirror = false): TestPointDef[] => {
  const tp: TestPointDef[] = [
    { id: 'tp_vbus', name: 'VBUS (USB input)', pos: [8, 93], ref: 0.452, chips: ['u_charge', 'c_vbus'] },
    { id: 'tp_main', name: 'PP_VDD_MAIN', pos: [40, 12], ref: 0.318, chips: ['u_pmic', 'c_main'] },
    { id: 'tp_bl', name: 'Backlight boost line', pos: [42, 70], ref: 0.611, chips: ['u_bl', 'c_bl', 'l_bl'] },
    { id: 'tp_audio', name: 'Audio codec rail', pos: [88, 80], ref: 0.548, chips: ['u_audio'] },
    { id: 'tp_batt', name: 'BATT+ connector', pos: [4, 54], ref: 0.401, chips: ['j_batt', 'u_pmic'] },
    { id: 'tp_disp', name: 'Display MIPI data', pos: [58, 96], ref: 0.483, chips: ['j_disp'] },
    { id: 'tp_rf', name: 'RF / baseband rail', pos: [92, 40], ref: 0.512, chips: ['u_bb', 'u_wifi'] },
    { id: 'tp_cpu', name: 'PP_CPU core', pos: [64, 22], ref: 0.205, chips: ['u_cpu', 'u_nand'] },
  ];
  return mirror ? tp.map((t) => ({ ...t, pos: [100 - t.pos[0], t.pos[1]] as [number, number] })) : tp;
};

// ============================================================
// A) Budget, screwed plastic back (Realmi / Tecnoh / Redmo style)
// ============================================================
const budgetScrewback: LayoutDef = {
  id: 'budget-screwback',
  name: 'Single board, screwed midframe, clip-on plastic back',
  opening: 'screwback',
  boardType: 'single',
  dims: [76, 165, 9],
  nodes: [
    part('simtray', 'SIM tray', 'simTray', [-38.3, 35, 0], [1.4, 26, 3.2], [], { color: '#9aa0a6' }),
    { id: 'backcover', kind: 'cover', label: 'Plastic back cover', slot: 'backCover', clips: true, requires: ['simtray'], shape: 'box', pos: [0, 0, -4.1], size: [75.5, 164.5, 0.8] },
    // top midframe screws
    screw('m1', 'phillips', 3.0, [-31, 76, -3.6], ['backcover']),
    screw('m2', 'phillips', 3.0, [31, 76, -3.6], ['backcover']),
    screw('m3', 'phillips', 3.0, [-31, 50, -3.6], ['backcover']),
    screw('m4', 'phillips', 3.0, [31, 50, -3.6], ['backcover']),
    screw('m5', 'phillips', 3.0, [-31, 20, -3.6], ['backcover']),
    screw('m6', 'phillips', 3.0, [31, 20, -3.6], ['backcover']),
    screw('m7', 'phillips', 3.5, [0, 78, -3.6], ['backcover']),
    screw('m8', 'phillips', 2.4, [-6, 46, -3.6], ['backcover']),
    screw('m9', 'phillips', 2.4, [10, 32, -3.6], ['backcover'], { longScrewFault: 'f_screw_backlight' }),
    screw('m10', 'phillips', 2.4, [18, 60, -3.6], ['backcover'], { longScrewFault: 'f_screw_board' }),
    bracket('midframe', 'Top midframe (antenna/NFC)', [0, 48, -3.15], [72, 64, 0.7], ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'], { color: '#2a2c30' }),
    // bottom speaker module screws
    screw('l1', 'phillips', 3.0, [-31, -62, -3.6], ['backcover']),
    screw('l2', 'phillips', 3.0, [31, -62, -3.6], ['backcover']),
    screw('l3', 'phillips', 3.0, [-20, -78, -3.6], ['backcover']),
    screw('l4', 'phillips', 2.4, [20, -78, -3.6], ['backcover'], { longScrewFault: 'f_screw_sub' }),
    part('loudspeaker', 'Loudspeaker module', 'loudspeaker', [0, -68, -2.7], [70, 22, 2.4], ['l1', 'l2', 'l3', 'l4'], { color: '#2f3237' }),
    // connectors on the main board
    conn('c_batt', 'Battery connector', 'battery', [-12, 14, -2.3], ['midframe'], { isBattery: true }),
    conn('c_disp', 'Display connector', 'display', [10, 18, -2.3], ['midframe']),
    conn('c_bridge_t', 'Main flex (board end)', 'bridgeflex', [28, 16, -2.3], ['midframe']),
    conn('c_cam', 'Main camera connector', 'maincam', [-6, 62, -2.3], ['midframe'], { size: [6, 4, 0.9] }),
    conn('c_wide', 'Ultrawide connector', 'widecam', [-6, 52, -2.3], ['midframe'], { size: [5, 3, 0.9], only: 'wide' }),
    conn('c_fcam', 'Front camera connector', 'frontcam', [10, 66, -2.3], ['midframe'], { size: [5, 3, 0.9] }),
    conn('c_ant_t', 'Antenna coax (top)', 'antenna', [-30, 30, -2.3], ['midframe'], { shape: 'round', size: [2.6, 2.6, 1], color: '#d0d0d0' }),
    conn('c_fp', 'Fingerprint connector', 'fingerprint', [30, 38, -2.3], ['midframe'], { size: [5, 3, 0.9], only: 'fingerprint' }),
    // sub board connectors
    conn('c_bridge_b', 'Main flex (sub-board end)', 'bridgeflex', [28, -55, -2.3], ['loudspeaker']),
    conn('c_ant_b', 'Antenna coax (bottom)', 'antenna', [-30, -57, -2.3], ['loudspeaker'], { shape: 'round', size: [2.6, 2.6, 1], color: '#d0d0d0' }),
    // parts
    part('maincam', 'Main camera', 'mainCam', [-20, 62, -1.9], [11, 0, 5.5], ['midframe', 'c_cam'], { shape: 'cyl', color: '#111' }),
    part('widecam', 'Ultrawide camera', 'wideCam', [-20, 48, -1.9], [8, 0, 4.5], ['midframe', 'c_wide'], { shape: 'cyl', color: '#151515', only: 'wide' }),
    part('frontcam', 'Front camera', 'frontCam', [0, 72, 1.6], [5, 0, 4], ['midframe', 'c_fcam'], { shape: 'cyl', color: '#111' }),
    part('earpiece', 'Earpiece speaker', 'earpiece', [16, 78, 0.6], [12, 3, 2], ['midframe'], { color: '#333' }),
    screw('b1', 'phillips', 2.4, [22, 40, -2.4], ['midframe']),
    part('board', 'Main logic board', 'board', [0, 45, -1.4], [68, 62, 1.2],
      ['midframe', 'c_batt', 'c_disp', 'c_bridge_t', 'c_cam', 'c_wide', 'c_fcam', 'c_ant_t', 'c_fp', 'maincam', 'widecam', 'frontcam', 'b1', 'earpiece'],
      { color: '#1d5c2e' }),
    part('battery', 'Battery', 'battery', [0, -16, -1.2], [64, 70, 4.4], ['backcover', 'c_batt'], { glued: true, pullTabs: true, color: '#bfc3c9' }),
    part('bridgeflex', 'Main flex cable', 'bridgeFlex', [33, -20, -1.0], [4, 70, 0.3], ['c_bridge_t', 'c_bridge_b'], { shape: 'flex', color: '#d98a1f' }),
    part('antenna', 'Antenna coax cable', 'antenna', [-33, -14, -1.0], [1.4, 84, 1.4], ['c_ant_t', 'c_ant_b'], { shape: 'flex', color: '#e6e6e6' }),
    screw('s1', 'phillips', 2.4, [-18, -56, -2.4], ['loudspeaker']),
    part('subboard', 'Sub-board (USB port + mic)', 'subBoard', [0, -59, -1.6], [64, 22, 1.2], ['loudspeaker', 'c_bridge_b', 'c_ant_b', 's1'], { color: '#1d5c2e' }),
    part('vibrator', 'Vibration motor', 'vibrator', [24, -48, -1.4], [8, 0, 3], ['loudspeaker'], { shape: 'cyl', color: '#888' }),
    part('fingerprint', 'Side fingerprint key', 'fingerprint', [37.6, 38, 0], [1.4, 12, 3], ['c_fp', 'board'], { only: 'fingerprint', color: '#555' }),
    part('powerflex', 'Power / volume flex', 'powerFlex', [36.6, 22, 0], [0.8, 34, 2.2], ['board'], { shape: 'flex', color: '#d98a1f' }),
    part('display', 'Display assembly (LCD)', 'display', [0, 0, 4.0], [75, 163, 1.4], ['c_disp'], { glued: true, color: '#050608' }),
  ],
  chips: chips(),
  testPoints: testPoints(),
};

// ============================================================
// B) Mid-range / Android flagship, glued glass back (Samsang / Oppa / Pixl)
// ============================================================
const midBackglass: LayoutDef = {
  id: 'mid-backglass',
  name: 'Single board, glued glass back, screwed midframe',
  opening: 'back',
  boardType: 'single',
  dims: [71, 158, 8.2],
  nodes: [
    part('simtray', 'SIM tray', 'simTray', [-35.8, 40, 0], [1.4, 24, 3], [], { color: '#9aa0a6' }),
    { id: 'backcover', kind: 'cover', label: 'Back glass', slot: 'backCover', glued: true, requires: ['simtray'], shape: 'box', pos: [0, 0, -3.8], size: [70.5, 157.5, 0.7] },
    screw('m1', 'phillips', 3.2, [-30, 74, -3.3], ['backcover']),
    screw('m2', 'phillips', 3.2, [30, 74, -3.3], ['backcover']),
    screw('m3', 'phillips', 3.2, [-30, 46, -3.3], ['backcover']),
    screw('m4', 'phillips', 3.2, [30, 46, -3.3], ['backcover']),
    screw('m5', 'phillips', 3.2, [-30, 18, -3.3], ['backcover']),
    screw('m6', 'phillips', 3.2, [30, 18, -3.3], ['backcover']),
    screw('m7', 'phillips', 3.2, [8, 76, -3.3], ['backcover']),
    screw('m8', 'phillips', 2.6, [-2, 40, -3.3], ['backcover']),
    screw('m9', 'phillips', 2.6, [14, 30, -3.3], ['backcover'], { longScrewFault: 'f_screw_backlight' }),
    screw('m10', 'phillips', 2.6, [20, 58, -3.3], ['backcover'], { longScrewFault: 'f_screw_board' }),
    bracket('midframe', 'Top midframe (NFC + wireless coil)', [0, 46, -2.95], [68, 62, 0.6], ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'], { color: '#25272b' }),
    screw('l1', 'phillips', 3.2, [-29, -60, -3.3], ['backcover']),
    screw('l2', 'phillips', 3.2, [29, -60, -3.3], ['backcover']),
    screw('l3', 'phillips', 3.2, [-18, -74, -3.3], ['backcover']),
    screw('l4', 'phillips', 2.6, [18, -74, -3.3], ['backcover'], { longScrewFault: 'f_screw_sub' }),
    part('loudspeaker', 'Loudspeaker module', 'loudspeaker', [0, -66, -2.5], [66, 20, 2.4], ['l1', 'l2', 'l3', 'l4'], { color: '#2f3237' }),
    conn('c_batt', 'Battery connector', 'battery', [-10, 12, -2.2], ['midframe'], { isBattery: true }),
    conn('c_disp', 'Display connector', 'display', [12, 16, -2.2], ['midframe']),
    conn('c_bridge_t', 'Main flex (board end)', 'bridgeflex', [27, 14, -2.2], ['midframe']),
    conn('c_cam', 'Main camera connector', 'maincam', [-6, 62, -2.2], ['midframe'], { size: [6, 4, 0.9] }),
    conn('c_wide', 'Ultrawide connector', 'widecam', [-6, 52, -2.2], ['midframe'], { size: [5, 3, 0.9] }),
    conn('c_tele', 'Telephoto connector', 'telecam', [-6, 42, -2.2], ['midframe'], { size: [5, 3, 0.9], only: 'tele' }),
    conn('c_fcam', 'Front camera connector', 'frontcam', [10, 66, -2.2], ['midframe'], { size: [5, 3, 0.9] }),
    conn('c_ant_t', 'Antenna coax (top)', 'antenna', [-28, 28, -2.2], ['midframe'], { shape: 'round', size: [2.6, 2.6, 1], color: '#d0d0d0' }),
    conn('c_bridge_b', 'Main flex (sub-board end)', 'bridgeflex', [26, -53, -2.2], ['loudspeaker']),
    conn('c_ant_b', 'Antenna coax (bottom)', 'antenna', [-28, -55, -2.2], ['loudspeaker'], { shape: 'round', size: [2.6, 2.6, 1], color: '#d0d0d0' }),
    conn('c_fp', 'Fingerprint connector', 'fingerprint', [10, -50, -2.2], ['loudspeaker'], { size: [5, 3, 0.9], only: 'fingerprint' }),
    part('maincam', 'Main camera', 'mainCam', [-22, 62, -1.8], [12, 0, 5.5], ['midframe', 'c_cam'], { shape: 'cyl', color: '#111' }),
    part('widecam', 'Ultrawide camera', 'wideCam', [-22, 49, -1.8], [10, 0, 4.5], ['midframe', 'c_wide'], { shape: 'cyl', color: '#151515' }),
    part('telecam', 'Telephoto camera', 'teleCam', [-22, 36, -1.8], [10, 0, 4.5], ['midframe', 'c_tele'], { shape: 'cyl', color: '#151515', only: 'tele' }),
    part('frontcam', 'Front camera', 'frontCam', [0, 70, 1.8], [4.5, 0, 4], ['midframe', 'c_fcam'], { shape: 'cyl', color: '#111' }),
    part('earpiece', 'Earpiece speaker', 'earpiece', [14, 76, 1.0], [12, 3, 2], ['midframe'], { color: '#333' }),
    screw('b1', 'phillips', 2.6, [22, 38, -2.3], ['midframe']),
    screw('b2', 'phillips', 2.6, [-14, 22, -2.3], ['midframe']),
    part('board', 'Main logic board', 'board', [0, 45, -1.3], [64, 60, 1.2],
      ['midframe', 'c_batt', 'c_disp', 'c_bridge_t', 'c_cam', 'c_wide', 'c_tele', 'c_fcam', 'c_ant_t', 'maincam', 'widecam', 'telecam', 'frontcam', 'b1', 'b2', 'earpiece'],
      { color: '#16324f' }),
    part('battery', 'Battery (hard-glued)', 'battery', [0, -14, -1.1], [62, 70, 4.2], ['backcover', 'c_batt'], { glued: true, color: '#c2c6cc' }),
    part('bridgeflex', 'Main flex cable', 'bridgeFlex', [31, -18, -1.0], [4, 66, 0.3], ['c_bridge_t', 'c_bridge_b'], { shape: 'flex', color: '#d98a1f' }),
    part('antenna', 'Antenna coax cable', 'antenna', [-31, -14, -1.0], [1.4, 80, 1.4], ['c_ant_t', 'c_ant_b'], { shape: 'flex', color: '#e6e6e6' }),
    part('fingerprint', 'Under-display fingerprint sensor', 'fingerprint', [0, -42, 2.4], [10, 10, 0.8], ['battery', 'c_fp'], { only: 'fingerprint', color: '#444' }),
    screw('s1', 'phillips', 2.6, [-16, -54, -2.3], ['loudspeaker']),
    part('subboard', 'Sub-board (USB-C + mic)', 'subBoard', [0, -57, -1.5], [60, 20, 1.2], ['loudspeaker', 'c_bridge_b', 'c_ant_b', 'c_fp', 's1'], { color: '#16324f' }),
    part('vibrator', 'Vibration motor', 'vibrator', [22, -46, -1.3], [8, 0, 3], ['loudspeaker'], { shape: 'cyl', color: '#888' }),
    part('powerflex', 'Power key flex', 'powerFlex', [35.2, 30, 0], [0.8, 18, 2.2], ['board'], { shape: 'flex', color: '#d98a1f' }),
    part('volumeflex', 'Volume key flex', 'volumeFlex', [35.2, 8, 0], [0.8, 18, 2.2], ['board'], { shape: 'flex', color: '#d98a1f' }),
    part('display', 'Display assembly (OLED)', 'display', [0, 0, 3.6], [70.5, 157.5, 1.2], ['c_disp'], { glued: true, color: '#050608' }),
  ],
  chips: chips([2, 0], true),
  testPoints: testPoints(true),
};

// ============================================================
// C) Pear-style flagship, opens from the front, sandwich board
// ============================================================
const flagshipFront: LayoutDef = {
  id: 'flagship-front',
  name: 'Sandwich board, front-opening display, bracketed connectors',
  opening: 'front',
  boardType: 'sandwich',
  dims: [71.5, 146.7, 7.7],
  nodes: [
    part('simtray', 'SIM tray', 'simTray', [-35.4, 10, 0], [1.4, 22, 3], [], { color: '#b0b4ba' }),
    screw('p1', 'pentalobe', 3.4, [-5.5, -73.2, -0.6], [], { label: 'Bottom pentalobe 3.4mm' }),
    screw('p2', 'pentalobe', 3.4, [5.5, -73.2, -0.6], [], { label: 'Bottom pentalobe 3.4mm' }),
    { id: 'display', kind: 'cover', label: 'Display assembly (OLED)', slot: 'display', glued: true, requires: ['p1', 'p2'], tetheredBy: ['c_disp', 'c_dig', 'c_fsens'], shape: 'box', pos: [0, 0, 3.3], size: [71, 146, 1.2], color: '#050608' },
    // battery bracket
    screw('t1', 'tripoint', 1.2, [12, -2, 2.6], ['display']),
    screw('t2', 'tripoint', 1.2, [24, -2, 2.6], ['display']),
    bracket('br_batt', 'Battery connector bracket', [18, -2, 2.25], [14, 7, 0.4], ['t1', 't2']),
    conn('c_batt', 'Battery connector', 'battery', [18, -2, 1.9], ['br_batt'], { isBattery: true }),
    // display bracket (three different screw lengths: classic trap)
    screw('t3', 'tripoint', 1.3, [14, 26, 2.6], ['display']),
    screw('t4', 'tripoint', 1.1, [27, 26, 2.6], ['display'], { longScrewFault: 'f_screw_backlight' }),
    screw('t5', 'tripoint', 1.5, [27, 13, 2.6], ['display']),
    bracket('br_disp', 'Display connector bracket', [20, 20, 2.25], [16, 18, 0.4], ['t3', 't4', 't5']),
    conn('c_disp', 'Display connector', 'display', [20, 24, 1.9], ['br_disp']),
    conn('c_dig', 'Digitizer connector', 'display', [20, 16, 1.9], ['br_disp'], { size: [7, 3.5, 0.9] }),
    conn('c_fsens', 'Front sensor flex connector', 'faceid', [14, 31, 1.9], ['br_disp'], { size: [6, 3, 0.9] }),
    conn('c_fcam', 'Front camera connector', 'frontcam', [26, 31, 1.9], ['br_disp'], { size: [5, 3, 0.9] }),
    conn('c_charge', 'Charge port flex connector', 'chargeflex', [24, -14, 1.9], ['display'], { size: [7, 3.5, 0.9] }),
    conn('c_ant', 'Antenna flex connector', 'antenna', [8, 40, 1.9], ['display'], { shape: 'round', size: [2.6, 2.6, 1], color: '#d0d0d0' }),
    // earpiece / front sensor bracket
    screw('t6', 'tripoint', 1.0, [-8, 68, 2.6], ['display']),
    screw('t7', 'tripoint', 1.6, [8, 68, 2.6], ['display']),
    bracket('br_ear', 'Earpiece / sensor bracket', [0, 68, 2.25], [26, 6, 0.4], ['t6', 't7']),
    part('earpiece', 'Earpiece speaker', 'earpiece', [0, 68.5, 1.4], [12, 4, 2], ['br_ear'], { color: '#333' }),
    part('faceid', 'Face ID dot projector / flood', 'faceId', [-14, 64, 1.0], [12, 6, 4], ['br_ear', 'c_fsens'], { only: 'faceId', color: '#202020' }),
    part('frontcam', 'Front camera', 'frontCam', [12, 64, 1.0], [6, 0, 4], ['br_ear', 'c_fcam'], { shape: 'cyl', color: '#111' }),
    // camera bracket
    screw('t8', 'tripoint', 1.4, [-30, 50, 2.6], ['display']),
    screw('t9', 'tripoint', 1.4, [-6, 50, 2.6], ['display']),
    bracket('br_cam', 'Rear camera bracket', [-18, 52, 2.25], [28, 24, 0.4], ['t8', 't9']),
    conn('c_cam', 'Main camera connector', 'maincam', [-4, 58, 1.9], ['br_cam'], { size: [5, 3, 0.9] }),
    conn('c_wide', 'Ultrawide connector', 'widecam', [-4, 46, 1.9], ['br_cam'], { size: [5, 3, 0.9] }),
    conn('c_tele', 'Telephoto connector', 'telecam', [-4, 40, 1.9], ['br_cam'], { size: [5, 3, 0.9], only: 'tele' }),
    part('maincam', 'Main camera', 'mainCam', [-24, 58, 0.2], [12, 0, 6], ['br_cam', 'c_cam'], { shape: 'cyl', color: '#111' }),
    part('widecam', 'Ultrawide camera', 'wideCam', [-24, 45, 0.2], [11, 0, 5.5], ['br_cam', 'c_wide'], { shape: 'cyl', color: '#151515' }),
    part('telecam', 'Telephoto camera', 'teleCam', [-11, 52, 0.2], [11, 0, 5.5], ['br_cam', 'c_tele'], { shape: 'cyl', color: '#151515', only: 'tele' }),
    // board standoffs
    screw('sd1', 'standoff', 1.6, [10, 38, 2.4], ['br_disp']),
    screw('sd2', 'standoff', 1.6, [30, 50, 2.4], ['display']),
    screw('sd3', 'standoff', 1.3, [30, 2, 2.4], ['br_batt'], { longScrewFault: 'f_screw_board' }),
    part('board', 'Logic board (sandwich)', 'board', [20, 30, 0.4], [28, 72, 3.0],
      ['c_batt', 'c_disp', 'c_dig', 'c_fsens', 'c_fcam', 'c_charge', 'c_ant', 'c_cam', 'c_wide', 'c_tele', 'maincam', 'widecam', 'telecam', 'sd1', 'sd2', 'sd3', 'simtray'],
      { color: '#173a2a' }),
    part('battery', 'Battery (L-shape, pull tabs)', 'battery', [-12, -8, 0.0], [42, 88, 4.4], ['c_batt'], { glued: true, pullTabs: true, color: '#c2c6cc' }),
    screw('t10', 'tripoint', 1.4, [-30, -54, 2.6], ['display']),
    screw('t11', 'tripoint', 1.4, [-4, -54, 2.6], ['display']),
    part('vibrator', 'Taptic engine', 'vibrator', [-17, -56, 0.4], [30, 9, 4], ['t10', 't11'], { color: '#7d828a' }),
    screw('x1', 'phillips', 1.8, [8, -62, 2.6], ['display']),
    screw('x2', 'tripoint', 1.3, [28, -62, 2.6], ['display']),
    part('loudspeaker', 'Loudspeaker', 'loudspeaker', [18, -62, 0.4], [24, 13, 4], ['x1', 'x2'], { color: '#2f3237' }),
    part('chargeflex', 'Charge port flex (port + mics)', 'chargeFlex', [0, -70, -0.6], [52, 6, 0.6], ['c_charge', 'loudspeaker', 'vibrator'], { glued: true, shape: 'flex', color: '#d98a1f' }),
    part('antenna', 'Antenna flex', 'antenna', [0, 71, -2.2], [50, 3, 0.4], ['c_ant', 'board'], { shape: 'flex', color: '#e6e6e6' }),
    part('powerflex', 'Power key flex', 'powerFlex', [35.2, 24, 0], [0.8, 20, 2.2], ['board', 'battery'], { shape: 'flex', color: '#d98a1f' }),
    part('volumeflex', 'Volume / mute flex', 'volumeFlex', [-35.2, 32, 0], [0.8, 26, 2.2], ['battery'], { shape: 'flex', color: '#d98a1f' }),
    { id: 'backcover', kind: 'cover', label: 'Back glass (full teardown)', slot: 'backCover', glued: true, requires: ['board', 'battery', 'chargeflex'], shape: 'box', pos: [0, 0, -3.5], size: [71, 146, 0.6] },
  ],
  chips: chips([0, 2]),
  testPoints: testPoints(),
};

// ============================================================
// D) Book-style foldable: hinge, inner screen, cover screen, two batteries
// ============================================================
const foldable: LayoutDef = {
  id: 'foldable',
  name: 'Foldable: hinge, inner + cover screens, split batteries',
  opening: 'back',
  boardType: 'sandwich',
  dims: [134, 155, 6.4],
  nodes: [
    part('simtray', 'SIM tray', 'simTray', [66.4, 30, 0], [1.4, 20, 2.8], [], { color: '#9aa0a6' }),
    { id: 'backcover', kind: 'cover', label: 'Back glass (right half)', slot: 'backCover', glued: true, requires: ['simtray'], shape: 'box', pos: [33.5, 0, -2.95], size: [66, 154, 0.5] },
    screw('m1', 'phillips', 2.2, [8, 70, -2.6], ['backcover']),
    screw('m2', 'phillips', 2.2, [60, 70, -2.6], ['backcover']),
    screw('m3', 'phillips', 2.2, [8, 42, -2.6], ['backcover']),
    screw('m4', 'phillips', 2.2, [60, 42, -2.6], ['backcover']),
    screw('m5', 'phillips', 2.2, [8, 14, -2.6], ['backcover']),
    screw('m6', 'phillips', 2.2, [60, 14, -2.6], ['backcover']),
    screw('m7', 'phillips', 1.8, [34, 24, -2.6], ['backcover'], { longScrewFault: 'f_screw_backlight' }),
    screw('m8', 'phillips', 1.8, [44, 56, -2.6], ['backcover'], { longScrewFault: 'f_screw_board' }),
    bracket('midframe', 'Midframe (right half)', [34, 42, -2.35], [60, 62, 0.5], ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'], { color: '#25272b' }),
    conn('c_batt', 'Battery connector (right)', 'battery', [20, 14, -1.9], ['midframe'], { isBattery: true }),
    conn('c_batt2', 'Battery connector (left, via hinge)', 'battery2', [14, 22, -1.9], ['midframe'], { isBattery: true }),
    conn('c_inner', 'Inner display connector', 'innerdisplay', [46, 16, -1.9], ['midframe']),
    conn('c_cover', 'Cover display connector', 'display', [28, 30, -1.9], ['midframe']),
    conn('c_bridge_t', 'Hinge flex (board end)', 'bridgeflex', [10, 34, -1.9], ['midframe'], { size: [6, 4, 0.9] }),
    conn('c_cam', 'Main camera connector', 'maincam', [42, 62, -1.9], ['midframe'], { size: [5, 3, 0.9] }),
    conn('c_wide', 'Ultrawide connector', 'widecam', [42, 54, -1.9], ['midframe'], { size: [5, 3, 0.9] }),
    conn('c_tele', 'Telephoto connector', 'telecam', [42, 46, -1.9], ['midframe'], { size: [5, 3, 0.9], only: 'tele' }),
    conn('c_fcam', 'Front camera connector', 'frontcam', [30, 66, -1.9], ['midframe'], { size: [5, 3, 0.9] }),
    conn('c_ant', 'Antenna coax', 'antenna', [58, 30, -1.9], ['midframe'], { shape: 'round', size: [2.6, 2.6, 1], color: '#d0d0d0' }),
    conn('c_fp', 'Side key fingerprint connector', 'fingerprint', [58, 20, -1.9], ['midframe'], { size: [5, 3, 0.9], only: 'fingerprint' }),
    part('maincam', 'Main camera', 'mainCam', [54, 62, -1.2], [11, 0, 4.4], ['midframe', 'c_cam'], { shape: 'cyl', color: '#111' }),
    part('widecam', 'Ultrawide camera', 'wideCam', [54, 50, -1.2], [10, 0, 4], ['midframe', 'c_wide'], { shape: 'cyl', color: '#151515' }),
    part('telecam', 'Telephoto camera', 'teleCam', [54, 38, -1.2], [10, 0, 4], ['midframe', 'c_tele'], { shape: 'cyl', color: '#151515', only: 'tele' }),
    part('frontcam', 'Inner front camera', 'frontCam', [30, 68, 1.6], [4, 0, 3], ['midframe', 'c_fcam'], { shape: 'cyl', color: '#111' }),
    part('earpiece', 'Earpiece', 'earpiece', [20, 74, 0.4], [12, 3, 2], ['midframe'], { color: '#333' }),
    part('board', 'Logic board (sandwich)', 'board', [34, 42, -0.9], [56, 58, 1.8],
      ['midframe', 'c_batt', 'c_batt2', 'c_inner', 'c_cover', 'c_bridge_t', 'c_cam', 'c_wide', 'c_tele', 'c_fcam', 'c_ant', 'c_fp', 'maincam', 'widecam', 'telecam', 'frontcam', 'earpiece'],
      { color: '#173a2a' }),
    part('battery', 'Battery (right)', 'battery', [34, -26, -0.6], [56, 78, 3.6], ['backcover', 'c_batt'], { glued: true, color: '#c2c6cc' }),
    part('display', 'Cover display (outer)', 'display', [-33.5, 0, -2.9], [64, 150, 0.9], ['c_cover'], { glued: true, color: '#050608' }),
    conn('c_bridge_b', 'Hinge flex (left end)', 'bridgeflex', [-20, 30, -2.2], ['display'], { size: [6, 4, 0.9] }),
    part('battery2', 'Battery (left)', 'battery2', [-34, -12, -0.6], [56, 90, 3.6], ['display', 'c_batt2'], { glued: true, color: '#c2c6cc' }),
    screw('l1', 'phillips', 2.2, [12, -66, -2.6], ['backcover']),
    screw('l2', 'phillips', 2.2, [56, -66, -2.6], ['backcover'], { longScrewFault: 'f_screw_sub' }),
    part('loudspeaker', 'Loudspeaker module', 'loudspeaker', [34, -70, -1.4], [56, 12, 2.4], ['l1', 'l2'], { color: '#2f3237' }),
    conn('c_sub', 'Sub-board connector', 'subboard', [34, -60, -1.9], ['loudspeaker']),
    part('subboard', 'Sub-board (USB-C + mic)', 'subBoard', [34, -64, -0.8], [50, 10, 1.0], ['loudspeaker', 'c_sub'], { color: '#173a2a' }),
    part('vibrator', 'Vibration motor', 'vibrator', [12, -54, -1.0], [8, 0, 2.6], ['loudspeaker'], { shape: 'cyl', color: '#888' }),
    part('antenna', 'Antenna coax', 'antenna', [63, -10, -1.0], [1.2, 90, 1.2], ['c_ant'], { shape: 'flex', color: '#e6e6e6' }),
    part('fingerprint', 'Side key fingerprint', 'fingerprint', [66.6, 12, 0], [1.2, 14, 2.6], ['c_fp', 'board'], { only: 'fingerprint', color: '#555' }),
    part('innerdisplay', 'Inner foldable display', 'innerDisplay', [0, 0, 2.9], [132, 153, 0.7], ['c_inner'], { glued: true, color: '#07080a' }),
    part('bridgeflex', 'Hinge flex cable', 'bridgeFlex', [0, 30, -1.6], [30, 6, 0.3], ['c_bridge_t', 'c_bridge_b'], { shape: 'flex', color: '#d98a1f' }),
    screw('h1', 'torx', 2.0, [-3, 60, 2.4], ['innerdisplay']),
    screw('h2', 'torx', 2.0, [3, 60, 2.4], ['innerdisplay']),
    screw('h3', 'torx', 2.0, [-3, -60, 2.4], ['innerdisplay']),
    screw('h4', 'torx', 2.0, [3, -60, 2.4], ['innerdisplay']),
    part('hinge', 'Hinge assembly', 'hinge', [0, 0, 0.4], [9, 150, 4.6], ['h1', 'h2', 'h3', 'h4', 'bridgeflex', 'innerdisplay'], { color: '#9aa0a8' }),
    part('powerflex', 'Power / volume flex', 'powerFlex', [66.4, -12, 0], [0.8, 26, 2.2], ['board'], { shape: 'flex', color: '#d98a1f' }),
  ],
  chips: chips([-2, 1]),
  testPoints: testPoints(),
};

export const LAYOUTS: LayoutDef[] = [budgetScrewback, midBackglass, flagshipFront, foldable];
export const layoutById = (id: string) => LAYOUTS.find((l) => l.id === id)!;
