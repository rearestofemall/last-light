/**
 * Fault database. One symptom deliberately maps to several faults
 * ("Won't charge" → port, flex, charging IC, VBUS capacitor, battery...).
 * Faults attach to the component they live in, so replacing the right part
 * (or fixing the right chip) removes the fault.
 */
import type { FaultDef } from './types';

export const FAULTS: FaultDef[] = [
  // ---------------- Display ----------------
  { id: 'f_screen_cracked', name: 'Cracked front glass', target: { slot: 'display' }, symptoms: ['Screen is cracked', 'Dropped it, glass is shattered', 'Touch is patchy on one side'], tests: [], visual: 'Shattered front glass', fix: 'replace', hiddenChance: 0, weight: 14, valueLoss: 0.3 },
  { id: 'f_display_dead', name: 'Display panel dead (OLED/LCD)', target: { slot: 'display' }, symptoms: ['Screen is black but it vibrates', 'No picture after a drop', 'Screen went black'], tests: ['display', 'touch'], visual: 'Black panel with ink bleed', fix: 'replace', hiddenChance: 0, weight: 7, valueLoss: 0.45 },
  { id: 'f_display_lines', name: 'Display lines / discolouration', target: { slot: 'display' }, symptoms: ['Green lines on the screen', 'Screen flickers', 'Pink line down the middle'], tests: ['display'], visual: 'Vertical lines on panel', fix: 'replace', hiddenChance: 0.05, weight: 6, valueLoss: 0.3 },
  { id: 'f_touch_dead', name: 'Digitizer / touch failure', target: { slot: 'display' }, symptoms: ['Touch not responding', 'Ghost touches, phone types by itself', 'Touch is patchy on one side'], tests: ['touch'], fix: 'replace', hiddenChance: 0.05, weight: 5, valueLoss: 0.3 },
  { id: 'f_inner_crease', name: 'Inner screen crease / dead pixels', target: { slot: 'innerDisplay' }, symptoms: ['Inner screen has a black line at the fold', 'Inner screen flickers'], tests: ['display'], visual: 'Dead line along the fold', fix: 'replace', hiddenChance: 0, weight: 9, valueLoss: 0.4 },
  { id: 'f_hinge', name: 'Hinge worn / stiff', target: { slot: 'hinge' }, symptoms: ['Hinge is loose and creaks', 'Phone will not stay folded'], tests: [], visual: 'Hinge wobble, gap when closed', fix: 'replace', hiddenChance: 0.1, weight: 6, valueLoss: 0.2 },
  { id: 'f_backlight_ic', name: 'Backlight IC failure', target: { chip: 'backlight' }, symptoms: ['Screen is black but it vibrates', 'Screen is very dim', 'No picture after a drop'], tests: ['display'], diode: 'open', microscope: 'Burn mark on the backlight/display PMIC', diag: 'Display power rail fault', fix: 'chipReplace', hiddenChance: 0.05, weight: 3, valueLoss: 0.4 },
  { id: 'f_cap_bl', name: 'Shorted backlight capacitor', target: { chip: 'cap_bl' }, symptoms: ['Screen is black but it vibrates', 'Screen is very dim'], tests: ['display'], diode: 'short', thermal: true, fix: 'chipRemove', hiddenChance: 0.05, weight: 2, valueLoss: 0.35 },
  // Damage from mistakes (never spawned randomly: weight 0)
  { id: 'f_screw_backlight', name: 'Long-screw damage: backlight filter line torn', target: { chip: 'filter_bl' }, symptoms: ['Screen is black after the repair'], tests: ['display'], diode: 'open', microscope: 'Crushed trace and torn pad next to a screw hole', fix: 'jumper', hiddenChance: 0, weight: 0, valueLoss: 0.5 },
  { id: 'f_screw_board', name: 'Long-screw damage: RF line cut', target: { chip: 'baseband' }, symptoms: ['No service after the repair'], tests: ['network'], diode: 'open', microscope: 'Screw tip punched through inner layer near baseband', fix: 'jumper', hiddenChance: 0, weight: 0, valueLoss: 0.4 },
  { id: 'f_screw_sub', name: 'Long-screw damage: sub-board trace', target: { slot: 'subBoard' }, symptoms: ['Charging stopped after the repair'], tests: ['charging'], ammeter: 0, fix: 'replace', hiddenChance: 0, weight: 0, valueLoss: 0.2 },
  { id: 'f_short_damage', name: 'Short circuit damage (worked with battery connected)', target: { chip: 'pmic' }, symptoms: ['Phone died during the repair'], tests: ['power'], ammeter: 0, diode: 'low', thermal: true, microscope: 'Scorched area near the PMIC', diag: 'No boot', fix: 'chipReplace', hiddenChance: 0, weight: 0, valueLoss: 0.6 },
  { id: 'f_flex_torn', name: 'Torn flex cable', target: { slot: 'display' }, symptoms: ['Screen glitching after the repair'], tests: ['display', 'touch'], visual: 'Torn display flex', fix: 'replace', hiddenChance: 0, weight: 0, valueLoss: 0.4 },

  // ---------------- Battery ----------------
  { id: 'f_batt_worn', name: 'Battery worn out', target: { slot: 'battery' }, symptoms: ['Phone dies at 30%', 'Battery drains very fast', 'Shuts off randomly in the cold'], tests: [], diag: 'Battery maximum capacity below 75%', fix: 'replace', hiddenChance: 0.35, weight: 14, valueLoss: 0.08 },
  { id: 'f_batt_swollen', name: 'Swollen battery', target: { slot: 'battery' }, symptoms: ['Screen is lifting off the frame', 'Battery drains very fast'], tests: [], visual: 'Battery swollen, display pushed out', diag: 'Battery service recommended', fix: 'replace', hiddenChance: 0.1, weight: 4, valueLoss: 0.15 },
  { id: 'f_batt_dead', name: 'Battery completely dead', target: { slot: 'battery' }, symptoms: ["Phone won't turn on", "Won't charge at all"], tests: ['power', 'charging'], ammeter: 0.12, fix: 'replace', hiddenChance: 0, weight: 4, valueLoss: 0.12 },

  // ---------------- Charging ----------------
  { id: 'f_port_dirty', name: 'Charging port full of lint', target: { slot: 'chargePort' }, symptoms: ["Won't charge at all", 'Only charges at an angle', 'Cable keeps falling out'], tests: ['charging'], ammeter: 0, microscope: 'Packed pocket lint in the port', fix: 'clean', hiddenChance: 0.05, weight: 9, valueLoss: 0.03 },
  { id: 'f_port_damaged', name: 'Charging port damaged', target: { slot: 'chargePort' }, symptoms: ["Won't charge at all", 'Charges very slowly', 'Cable keeps falling out'], tests: ['charging'], ammeter: 0, microscope: 'Bent / burnt pins in the port', fix: 'replace', hiddenChance: 0.05, weight: 8, valueLoss: 0.08 },
  { id: 'f_chargeflex', name: 'Charge flex / sub-board fault', target: { slot: 'chargeFlex' }, symptoms: ["Won't charge at all", "People can't hear me on calls"], tests: ['charging', 'mic'], ammeter: 0, fix: 'replace', hiddenChance: 0.1, weight: 4, valueLoss: 0.08 },
  { id: 'f_charge_ic', name: 'Charging IC failure', target: { chip: 'chargeIC' }, symptoms: ["Won't charge at all", 'Charges very slowly', 'Gets hot when charging'], tests: ['charging'], ammeter: 0, diode: 'short', thermal: true, diag: 'Charger IC not responding', microscope: 'Discoloured charging IC', fix: 'chipReplace', hiddenChance: 0.05, weight: 4, valueLoss: 0.25 },
  { id: 'f_cap_vbus', name: 'Shorted VBUS capacitor', target: { chip: 'cap_vbus' }, symptoms: ["Won't charge at all", 'Gets hot when charging'], tests: ['charging'], ammeter: 0.9, diode: 'short', thermal: true, fix: 'chipRemove', hiddenChance: 0.05, weight: 3, valueLoss: 0.2 },

  // ---------------- Audio ----------------
  { id: 'f_loudspeaker', name: 'Loudspeaker blown', target: { slot: 'loudspeaker' }, symptoms: ['No sound from the speaker', 'Speaker sounds crackly'], tests: ['loudspeaker'], fix: 'replace', hiddenChance: 0.1, weight: 6, valueLoss: 0.05 },
  { id: 'f_earpiece', name: 'Earpiece faulty', target: { slot: 'earpiece' }, symptoms: ["Can't hear people in calls", 'No sound in calls'], tests: ['earpiece'], fix: 'replace', hiddenChance: 0.1, weight: 5, valueLoss: 0.05 },
  { id: 'f_mic', name: 'Microphone faulty', target: { slot: 'mic' }, symptoms: ["People can't hear me on calls", 'No sound in calls'], tests: ['mic'], fix: 'replace', hiddenChance: 0.15, weight: 5, valueLoss: 0.05 },
  { id: 'f_audio_ic', name: 'Audio codec IC failure', target: { chip: 'audioIC' }, symptoms: ['No sound in calls', 'Speaker button greyed out in calls', 'Stuck on logo after update'], tests: ['earpiece', 'loudspeaker', 'mic'], diode: 'open', diag: 'Audio codec not detected', microscope: 'Cracked solder joints under audio IC', fix: 'chipReplace', hiddenChance: 0.1, weight: 3, valueLoss: 0.3 },

  // ---------------- Cameras / biometrics ----------------
  { id: 'f_maincam', name: 'Main camera faulty', target: { slot: 'mainCam' }, symptoms: ['Rear camera shows black', 'Camera shakes and buzzes', 'Photos are blurry'], tests: ['rearCam'], fix: 'replace', hiddenChance: 0.1, weight: 6, valueLoss: 0.12 },
  { id: 'f_widecam', name: 'Ultrawide camera faulty', target: { slot: 'wideCam' }, symptoms: ["Ultrawide mode doesn't work", 'Photos are blurry'], tests: ['rearCam'], fix: 'replace', hiddenChance: 0.3, weight: 2, valueLoss: 0.05 },
  { id: 'f_telecam', name: 'Telephoto camera faulty', target: { slot: 'teleCam' }, symptoms: ['Zoom photos are blurry', 'Camera shakes and buzzes'], tests: ['rearCam'], fix: 'replace', hiddenChance: 0.3, weight: 1, valueLoss: 0.05 },
  { id: 'f_frontcam', name: 'Front camera faulty', target: { slot: 'frontCam' }, symptoms: ['Front camera not working', 'Selfies are blurry'], tests: ['frontCam'], fix: 'replace', hiddenChance: 0.15, weight: 4, valueLoss: 0.06 },
  { id: 'f_faceid', name: 'Face ID dot projector failure', target: { slot: 'faceId' }, requiresFeature: 'faceId', symptoms: ['Face ID is not available', 'Face unlock stopped working'], tests: ['biometric'], diag: 'TrueDepth: problem detected with dot projector', fix: 'replace', hiddenChance: 0.15, weight: 4, valueLoss: 0.18 },
  { id: 'f_fingerprint', name: 'Fingerprint sensor failure', target: { slot: 'fingerprint' }, requiresFeature: 'fingerprint', symptoms: ['Fingerprint sensor not working', 'Face unlock stopped working'], tests: ['biometric'], fix: 'replace', hiddenChance: 0.15, weight: 4, valueLoss: 0.08 },

  // ---------------- Misc hardware ----------------
  { id: 'f_backglass', name: 'Cracked back glass / cover', target: { slot: 'backCover' }, symptoms: ['Back is cracked', 'Dropped it, back is shattered'], tests: [], visual: 'Cracked back panel', fix: 'replace', hiddenChance: 0, weight: 6, valueLoss: 0.15 },
  { id: 'f_power_btn', name: 'Power button flex broken', target: { slot: 'powerFlex' }, symptoms: ['Power button stuck', "Buttons don't work"], tests: ['buttons'], fix: 'replace', hiddenChance: 0.1, weight: 4, valueLoss: 0.05 },
  { id: 'f_volume_btn', name: 'Volume flex broken', target: { slot: 'volumeFlex' }, symptoms: ['Volume buttons do nothing', "Buttons don't work"], tests: ['buttons'], fix: 'replace', hiddenChance: 0.2, weight: 3, valueLoss: 0.04 },
  { id: 'f_vibrator', name: 'Vibration motor dead', target: { slot: 'vibrator' }, symptoms: ["Doesn't vibrate anymore", 'Rattling noise inside'], tests: ['vibration'], fix: 'replace', hiddenChance: 0.4, weight: 3, valueLoss: 0.03 },
  { id: 'f_antenna', name: 'Antenna cable damaged', target: { slot: 'antenna' }, symptoms: ['No service', 'Signal keeps dropping'], tests: ['network'], fix: 'replace', hiddenChance: 0.1, weight: 4, valueLoss: 0.06 },
  { id: 'f_simtray', name: 'Bent SIM tray / reader', target: { slot: 'simTray' }, symptoms: ['No SIM card detected', 'No service'], tests: ['network'], visual: 'Bent SIM tray', fix: 'replace', hiddenChance: 0, weight: 3, valueLoss: 0.02 },
  { id: 'f_bridgeflex', name: 'Main flex cable damaged', target: { slot: 'bridgeFlex' }, symptoms: ["Won't charge at all", 'No service', 'Signal keeps dropping'], tests: ['charging', 'network'], ammeter: 0, fix: 'replace', hiddenChance: 0.2, weight: 2, valueLoss: 0.05 },

  // ---------------- Board level ----------------
  { id: 'f_baseband', name: 'Baseband failure', target: { chip: 'baseband' }, symptoms: ['No service', 'Says "No IMEI"'], tests: ['network'], diode: 'open', diag: 'Baseband firmware: none / IMEI unknown', microscope: 'Underfill cracking around modem', fix: 'chipReplace', hiddenChance: 0.05, weight: 2, valueLoss: 0.45, minTier: ['mid', 'flagship', 'foldable'] },
  { id: 'f_wifi', name: 'Wi-Fi module failure', target: { chip: 'wifi' }, symptoms: ['Wi-Fi is greyed out', "Wi-Fi won't turn on"], tests: ['wifi'], diode: 'open', diag: 'Wi-Fi module not detected', fix: 'chipReplace', hiddenChance: 0.1, weight: 2, valueLoss: 0.2 },
  { id: 'f_cap_main', name: 'Shorted VDD_MAIN capacitor', target: { chip: 'cap_main' }, symptoms: ["Phone won't turn on", 'Dead after charging overnight'], tests: ['power'], ammeter: 0.85, diode: 'short', thermal: true, fix: 'chipRemove', hiddenChance: 0, weight: 4, valueLoss: 0.5 },
  { id: 'f_pmic', name: 'Power IC failure', target: { chip: 'pmic' }, symptoms: ["Phone won't turn on", 'Restarts every few minutes'], tests: ['power'], ammeter: 0.05, diode: 'low', diag: 'PMU fault (panic log)', microscope: 'Corroded balls on PMIC edge', fix: 'chipReplace', hiddenChance: 0.05, weight: 2, valueLoss: 0.55 },
  { id: 'f_nand', name: 'NAND storage failure', target: { chip: 'nand' }, symptoms: ['Stuck on logo', "Phone won't turn on"], tests: ['power'], diode: 'low', diag: 'Storage error 4013 (NAND)', fix: 'chipReplace', hiddenChance: 0.05, weight: 1, valueLoss: 0.6, minTier: ['flagship', 'foldable'] },
  { id: 'f_water', name: 'Liquid damage / corrosion', target: { board: true }, symptoms: ['Dropped it in water', 'Random problems after rain', "Phone won't turn on"], tests: ['loudspeaker', 'mic', 'charging'], microscope: 'Green corrosion around connectors and caps', diag: 'Liquid contact indicator tripped', fix: 'clean', hiddenChance: 0.3, weight: 5, valueLoss: 0.35 },

  // ---------------- Software ----------------
  { id: 'f_bootloop', name: 'Boot loop (software)', target: { software: true }, symptoms: ['Stuck on logo', 'Restarts every few minutes'], tests: ['power'], diag: 'Kernel panic: system partition corrupt', fix: 'software', hiddenChance: 0, weight: 6, valueLoss: 0.15 },
  { id: 'f_os_glitch', name: 'OS corruption / malware', target: { software: true }, symptoms: ['Phone is very slow', 'Apps keep crashing', 'Pop-up ads everywhere'], tests: [], diag: 'System partition errors, unknown packages', fix: 'software', hiddenChance: 0.3, weight: 6, valueLoss: 0.04 },
];

export const faultById = (id: string) => FAULTS.find((f) => f.id === id)!;

/** When a model has no node for a slot, the fault lives in this slot instead. */
export const SLOT_FALLBACK: Record<string, string> = {
  chargePort: 'subBoard',
  mic: 'subBoard',
  chargeFlex: 'subBoard',
};
/** Pear-style phones: port and mics live on the charge flex. */
export const SLOT_FALLBACK_2: Record<string, string> = {
  chargePort: 'chargeFlex',
  mic: 'chargeFlex',
  subBoard: 'chargeFlex',
};

/** Test descriptions for the post-repair suite. */
export const TESTS: { id: import('./types').TestId; name: string; needs: string[] }[] = [
  { id: 'power', name: 'Power on / boot', needs: ['board', 'battery'] },
  { id: 'display', name: 'Display (colour, lines, brightness)', needs: ['display'] },
  { id: 'touch', name: 'Touch grid', needs: ['display'] },
  { id: 'frontCam', name: 'Front camera', needs: ['frontCam'] },
  { id: 'rearCam', name: 'Rear cameras', needs: ['mainCam'] },
  { id: 'earpiece', name: 'Earpiece', needs: ['earpiece'] },
  { id: 'loudspeaker', name: 'Loudspeaker', needs: ['loudspeaker'] },
  { id: 'mic', name: 'Microphones', needs: [] },
  { id: 'charging', name: 'Charging', needs: [] },
  { id: 'network', name: 'Cellular network', needs: ['antenna', 'simTray'] },
  { id: 'wifi', name: 'Wi-Fi / Bluetooth', needs: [] },
  { id: 'sensors', name: 'Proximity / ambient sensors', needs: [] },
  { id: 'biometric', name: 'Face ID / fingerprint', needs: [] },
  { id: 'vibration', name: 'Vibration', needs: ['vibrator'] },
  { id: 'buttons', name: 'Buttons', needs: ['powerFlex'] },
];
