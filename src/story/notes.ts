/**
 * Written documents found in the world. The main thread: "J." — the player's travelling
 * companion — went ahead for help. Their trail, and the ranger's log, point north to the
 * Halcyon research station as the source of "the Quiet" (the blackout).
 */
export interface NoteDef {
  id: string;
  title: string;
  body: string;
  kind: 'note' | 'sign';
  /** Main story beats are flagged so the journal (M5) can distinguish them. */
  main?: boolean;
}

export const NOTES: Record<string, NoteDef> = {
  'j-note-1': {
    id: 'j-note-1',
    kind: 'note',
    main: true,
    title: 'Note pinned to the tent',
    body: `You were still out cold when I left. Fever broke around dawn, I think.

Everything's dead. The lantern, the truck, my watch, even the little hand-crank radio. Not broken — just quiet, like the whole world was switched off at once.

I've gone east along the trail to the ranger station. They'll have a long-range radio, or at least a map.

Stay by the fire if you can. If it goes out, don't sit in the dark. I mean it.

— J.`,
  },
  'trail-sign': {
    id: 'trail-sign',
    kind: 'sign',
    title: 'Pinebrook Trailhead',
    body: `VERDANT WOODS NATIONAL FOREST

→  Blackwater Crossing ........ 0.5 km
→  Ranger Station ................. 1.1 km
→  Hunter's Lodge (private) ..... 3.6 km
→  Old Highway 9 / City ........ 4.2 km

←  Halcyon Pass — CLOSED
     Restricted federal land beyond.
     No unauthorised entry.

Leave no trace. Keep fires small and attended.`,
  },
  'ranger-log': {
    id: 'ranger-log',
    kind: 'note',
    main: true,
    title: "Ranger's Duty Log — Station 4",
    body: `Oct 14 — 21:14. Every light in the station went out at once. Generator, truck, battery lamps, my wristwatch. The old wind-up clock is the only thing still ticking.

Oct 15 — No traffic on the highway. No aircraft. Nothing on any band. Before the radio died there was a hum on every frequency — low, steady, coming from the north.

Oct 17 — Green light over Halcyon Pass last night. Not aurora. Too low, too regular. The station up there was supposed to be decommissioned years ago.

Oct 21 — Something circles the station after dark. Never comes into the lamplight — the oil lamp still works, any flame does. Only electric things died.

Oct 22 — Fire is the only light left in the world. I'm keeping it high.`,
  },
  'j-note-2': {
    id: 'j-note-2',
    kind: 'note',
    main: true,
    title: 'Note tucked under a sleeping bag',
    body: `If you followed me — good. You're stronger than you looked.

The ranger's gone. His log is downstairs. Read it.

His radio is dead like everything else, but I found a map: there's a hunter's lodge past the ridge, and the old highway runs from there to the city. People in town said the coast still had lights at night, before the Quiet. Somebody there might know something.

Going over Eastridge. Watch your footing on the rocks.

— J.`,
  },
  'hunter-journal': {
    id: 'hunter-journal',
    kind: 'note',
    title: "Hunter's Journal",
    body: `Week three. Deer stopped coming down to Hollow Creek. Tracks all lead east, away from the pass. Animals know something.

Wolves run at dusk now, not at dawn. They circle the lodge but they won't cross the firelight.

A young one came through yesterday — J. something. Asked about the city. I traded them my spare lantern for coffee. First coffee in a month.

Told them what I'll tell anyone: travel by day, camp by fire, and if you hear the hum, walk the other way.`,
    main: true,
  },
};

/** Short inspection texts for objects that don't warrant a full document. */
export const INSPECT: Record<string, string> = {
  'cold-fire': 'The ashes are cold. Someone banked this fire carefully, then left in a hurry.',
  radio: 'A ranger\'s field radio. The battery gauge reads full, but it won\'t even hiss.',
  car: 'A sedan abandoned mid-road, door hanging open, keys in the ignition. The dashboard clock froze at 9:14.',
  rockslide: 'A fresh rockslide buries the trail to Halcyon Pass. There\'s no way through here — not yet.',
  bridge: 'The highway bridge has collapsed into the gorge. The city lies somewhere beyond. You\'ll need another way across.',
};
