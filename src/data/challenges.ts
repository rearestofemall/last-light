/** Challenge mode puzzles: hard diagnostic cases with a time limit. */
export const CHALLENGES: { id: string; name: string; modelId: string; faults: string[]; brief: string }[] = [
  { id: 'ch1', name: 'The slow charger', modelId: 'realmi-c55', faults: ['f_port_dirty', 'f_batt_worn'], brief: '"Charges only at an angle and dies at 30%." Find both causes.' },
  { id: 'ch2', name: 'Black screen, vibrates', modelId: 'galaxo-a54', faults: ['f_cap_bl'], brief: '"Screen is black but it vibrates." A new screen did not help at the last shop...' },
  { id: 'ch3', name: 'Silent calls', modelId: 'pear-13-pro', faults: ['f_mic', 'f_earpiece'], brief: '"No sound in calls." Two separate problems.' },
  { id: 'ch4', name: 'Dead after charging', modelId: 'redmo-note-12', faults: ['f_cap_main'], brief: '"Dead after charging overnight." Use the ammeter and thermal camera.' },
  { id: 'ch5', name: 'Water baby', modelId: 'galaxo-s22', faults: ['f_water', 'f_loudspeaker'], brief: '"Dropped it in the pool." Clean it and fix what is left.' },
  { id: 'ch6', name: 'Boot loop mystery', modelId: 'pixl-7a', faults: ['f_bootloop', 'f_charge_ic'], brief: '"Stuck on logo, and it does not charge anymore." Software AND hardware.' },
  { id: 'ch7', name: 'The cursed flagship', modelId: 'pear-14-pro-max', faults: ['f_screen_cracked', 'f_faceid', 'f_cap_vbus'], brief: 'A previous shop butchered this one. Make it pass every test.' },
  { id: 'ch8', name: 'Fold it right', modelId: 'galaxo-zfold5', faults: ['f_inner_crease', 'f_batt_worn'], brief: 'Inner screen line and a worn battery. Do not crack anything.' },
];
