/**
 * Every document in the world.
 *
 * The truth, revealed piece by piece: Project HALCYON built an array in the northern
 * mountains to shield power grids from solar storms by damping induced currents in the
 * upper atmosphere. On 14 October at 21:14 Dr. Ines Okafor's team ran it at full power.
 * The field inverted and settled over the whole planet: "the Quiet". Electrons no longer
 * flow through conductors above a trickle. Fire, chemistry and muscle still work.
 * The Array still runs on its geothermal core and keeps the Quiet alive.
 *
 * J. — the player's travelling companion — follows the clues ahead of the player and is
 * finally found in the Array's control hall, keeping a fire alive in the dark.
 */
export type NoteKind = 'note' | 'sign' | 'photo' | 'radio';

export interface NoteDef {
  id: string;
  title: string;
  body: string;
  kind: NoteKind;
  /** Main story beats; everything else is an optional discovery. */
  main?: boolean;
}

const N = (id: string, kind: NoteKind, title: string, body: string, main = false): NoteDef => ({ id, kind, title, body, main });

export const NOTES: Record<string, NoteDef> = Object.fromEntries(
  [
    // ------------------------------------------------------------- Verdant Woods
    N('j-note-1', 'note', 'Note pinned to the tent', `You were still out cold when I left. Fever broke around dawn, I think.

Everything's dead. The lantern, the truck, my watch, even the little hand-crank radio. Not broken — just quiet, like the whole world was switched off at once.

I've gone east along the trail to the ranger station. They'll have a long-range radio, or at least a map.

Stay by the fire if you can. If it goes out, don't sit in the dark. I mean it.

— J.

(There's a pencilled sketch on the back: an axe, a stone ring for a fire, a torch. "In case you need these." You could make them yourself — press C.)`, true),
    N('trail-sign', 'sign', 'Pinebrook Trailhead', `VERDANT WOODS NATIONAL FOREST

→  Blackwater Crossing ........ 0.5 km
→  Ranger Station ................. 1.1 km
→  Hunter's Lodge (private) ..... 3.6 km
→  Old Highway 9 / City ........ 4.2 km

←  Halcyon Pass — CLOSED
     Restricted federal land beyond.
     No unauthorised entry.

Leave no trace. Keep fires small and attended.`),
    N('ranger-log', 'note', "Ranger's Duty Log — Station 4", `Oct 14 — 21:14. Every light in the station went out at once. Generator, truck, battery lamps, my wristwatch. The old wind-up clock is the only thing still ticking.

Oct 15 — No traffic on the highway. No aircraft. Nothing on any band. Before the radio died there was a hum on every frequency — low, steady, coming from the north.

Oct 17 — Green light over Halcyon Pass last night. Not aurora. Too low, too regular. The station up there was supposed to be decommissioned years ago.

Oct 21 — Something circles the station after dark. Never comes into the lamplight — the oil lamp still works, any flame does. Only electric things died.

Oct 22 — Wolves. A whole pack, bold as you like. They won't cross the firelight. Fire is the only light left in the world. I'm keeping it high.

(Clipped inside: a page of the Forest Service shelter manual — floors, walls, roofs, a storage chest.)`, true),
    N('ranger-manual', 'note', 'Forest Service Field Manual, ch. 7', `7.2 — A shelter is a roof, a back wall and a fire. Everything else is comfort.

7.3 — Glazed panels let you watch the weather without standing in it.

7.4 — A workbench pays for itself the first night. Fit a vise and keep your tools sharp.

7.5 — Tables are underrated. Raise your food off the floor and something other than you will go hungry.

(Margin, in the ranger's hand: "Built the loft myself. Crates make a good step.")`),
    N('j-note-2', 'note', 'Note tucked under a sleeping bag', `If you followed me — good. You're stronger than you looked.

The ranger's gone. His log is downstairs. Read it.

His radio is dead like everything else, but I found a map: there's a hunter's lodge past the ridge, and the old highway runs from there to the city. People in town said the coast still had lights at night, before the Quiet. Somebody there might know something.

Going over Eastridge. Watch your footing on the rocks. Make yourself a bedroll — nights are getting longer.

— J.`, true),
    N('hunter-journal', 'note', "Hunter's Journal", `Week three. Deer stopped coming down to Hollow Creek. Tracks all lead east, away from the pass. Animals know something.

Wolves run at dusk now, not at dawn. They circle the lodge but they won't cross the firelight.

A young one came through yesterday — J. something. Asked about the city. I traded them my spare lantern for coffee. First coffee in a month. Showed them how to braid a rope from grass fibre and a strip of hide — the highway bridge is down and the only way across the gorge is to climb.

Told them what I'll tell anyone: travel by day, camp by fire, and if you hear the hum, walk the other way.

(Below, a sketch of a storm lantern, with notes on fitting it at a workbench.)`, true),
    N('photo-1', 'photo', 'Photograph: The Lodge, summer', `A faded print, pinned above the bed. Three people squint into the sun outside this lodge, a string of fish held up between them. Someone has written on the back:

"Dad, me and Ollie — Hollow Creek, the year the trout came back."`),
    N('bridge-sign', 'sign', 'Highway notice', `HWY 9 — BRIDGE OUT
Gorge crossing closed until further notice.

Someone has scratched underneath: "rope + nerve = city"`),

    // ------------------------------------------------------------- Forgotten City
    N('city-poster', 'sign', 'Emergency notice, taped to a lamp post', `CIVIL EMERGENCY — OCTOBER 15
By order of the Mayor's Office

• Remain indoors after dark.
• Do not attempt to restart vehicles or generators.
• Water will be distributed from St. Brigid Clinic at noon daily.
• Listen for announcements from KVLT Broadcast House.

Underneath, in red paint: NOBODY CAME.`),
    N('j-note-3', 'note', "J.'s note, apartment 2B", `The whole city is empty. Not ruined — empty. Coffee cups on tables. Shoes by doors. Everyone just... walked out.

I found the building where the broadcast flyers came from. KVLT, two streets east. Somebody was still running a radio there after the Quiet. A crystal set — no batteries, no power. It works.

I heard a voice. A woman, from the coast. A lighthouse.

I'm going to the broadcast house to listen again, then to the coast. If you're reading this, follow the transmissions. Take what you need from the hardware store — Kessler's had everything.

— J.

P.S. The overpass east of the metro collapsed. Use the tunnels.`, true),
    N('photo-2', 'photo', 'Photo-booth strip', `Four frames from a booth at the mall. Two kids pulling faces, then laughing, then a blur, then — in the last frame — both of them perfectly still, looking past the camera at something.

Printed in the corner: 14 OCT 21:13.`),
    N('hardware-ledger', 'note', 'Kessler Hardware — back office ledger', `Oct 16. Sold out of lamp oil, matches, candles, rope. Took IOUs. People are scared.

Oct 18. Gave away the rest. Who am I keeping it for?

Oct 20. Built a pick from bar stock and a pallet slat — the old forge out back still works. Wrote it down in case anyone needs to break rock. Same with an oil lamp from a coffee tin; hang it high and it'll light a room for a night on a cup of oil.

Oct 23. Heading north with my brother to see what the army is doing at Halcyon. If we're not back, the workbench is yours.`),
    N('radio-1', 'radio', 'KVLT crystal radio — transmission', `[The crystal set hisses, then catches a voice, faint and patient, repeating on a loop.]

"...this is Greywater Light, on the coast. If you can hear this, you're not alone. We have fire and fresh water. The lighthouse lamp burns oil. Look for it at night.

The city metro runs under the collapsed overpass and comes up near the dunes.

If you are travelling from the north — the people at Halcyon Station knew this would happen. Ask them why. Greywater Light, repeating..."`, true),
    N('broadcast-log', 'note', 'KVLT — engineer’s notebook', `Valves don't care about the Quiet if you feed them nothing. Crystal set, long-wire antenna up the mast, earphone from a 1950s kit. It picks up the coast.

Whoever is out there is running a spark-gap transmitter off a hand crank. Clever. Everything electrical dies above a few volts — but a spark is a spark.

There's a pattern under the hiss when the wind is from the north. A carrier at 7.83 Hz, perfectly steady. That's not natural. That's the Array.`),
    N('clinic-notes', 'note', 'St. Brigid Clinic — nurse’s notes', `Without the machines we went back a hundred years overnight. Willow bark for pain. Yarrow for bleeding. Boil everything.

REMEDY: three handfuls of herbs steeped in clean, boiled water over a fire. Bitter, but it works. Heals better than bandages and settles the stomach — we lost people to bad water before we learned.

Keep wounds clean. Keep people warm. Keep the fire going at night: the dogs from the park have gone wild.`),
    N('metro-sign', 'sign', 'Union Line — service notice', `ALL SERVICES SUSPENDED

Pedestrian access to Coast Road via tunnel only. Overpass closed (structural).
Bring a light. The tunnel is long and very, very dark.`),

    // ------------------------------------------------------------- Drowned Coast
    N('radio-2', 'radio', 'Fisher’s cottage — radio scraps', `[A notebook beside a home-made crystal set. Transcriptions in shaky pencil.]

"...Halcyon to Meridian, Halcyon to Meridian, return to port, the field has..."

"...seventy-two hours of full power or the inversion won't hold, Ines, we don't know what..."

"...Meridian is taking on water, we have the dossier, we are making for Greywater..."

That was the last of it.`),
    N('fisher-letter', 'note', 'Unsent letter', `Mara —

The boats are useless now, the engines are just iron. I've been fishing off the pier with a hand line like Grandpa did.

The keeper at the lighthouse lit the old oil lamp. Every night. People are walking in from the dunes because of it. It's the only light for fifty miles.

I hope you saw it from wherever you are.`),
    N('keeper-log', 'note', 'Greywater Lighthouse — keeper’s log', `Day 1 after. Lamp dark. Lit the old oil wick in the lantern room for the first time since '74.

Day 6. Survivors from the city. Taught them to stitch hide over cloth for coats — the wind here goes straight through you. A proper bed, too; nobody heals sleeping on a floor.

Day 9. A ship went aground on the north beach in the storm. Research vessel MERIDIAN. Crew drowned. A briefcase washed into the wreck's hold, sealed. I couldn't bring myself to open it.

Day 12. A young traveller — J. — came looking for answers. I sent them to the wreck.`, true),
    N('meridian-dossier', 'note', 'Sealed dossier, MERIDIAN', `PROJECT HALCYON — EYES ONLY

The Halcyon Array is a 140-element ionospheric phased array built to protect continental power grids from geomagnetic storms. By projecting a standing field that damps induced currents in the upper atmosphere, it can neutralise a Carrington-class event.

Full-power test authorised for 14 Oct, 21:00. Lead: Dr. Ines Okafor.

ADDENDUM (handwritten): At 21:14 the field inverted. It no longer damps currents in the sky — it damps them everywhere, at ground level, in every conductor on Earth. We have stopped the world's electricity.

The Array cannot be shut down remotely. Its geothermal core will sustain the field indefinitely. Someone must go inside and break the field coupling by hand.

We are taking this to the capital. God help us.`, true),
    N('j-note-4', 'note', 'Note in the lantern room', `I've read the dossier. It's the Array. Somebody at Halcyon did this, and it's still running.

The keeper says the pass to the north is buried under a rockslide — you'll need a pick to dig through. Kessler's hardware in the city had plans for one.

It's freezing up there. Make a hide parka; the keeper showed me how. Carry fire. Wolves own the snow at night.

I'm going to Halcyon Station. I'm going to turn it off.

If I don't come back — keep the light burning.

— J.`, true),
    N('photo-3', 'photo', 'Photograph: sea cave', `Tucked in a tin on a dry ledge: a photograph of a woman in a lab coat, standing in front of a vast field of white masts under a green sky. On the back:

"Ines — first light at Halcyon. We did it. — R."`),
    N('cave-cache', 'note', 'Smuggler’s tally', `Old tallies carved in the wall. Someone used this cave long before the Quiet. A newer note pinned beside them:

"Stores for the winter, if we make it that far. Oil, cloth, tins. Take what you need — leave some for the next one."`),

    // ------------------------------------------------------------- Frostlands
    N('hut-log', 'note', 'Weather Hut 3 — observer’s log', `Oct 14. 21:14 local. Every instrument flatlined at once. Anemometer still spinning (it's mechanical).

Oct 15. Green light over the Array, pulsing at 7.83 Hz. Temperature dropping faster than any model I know. The Array is dumping heat into the field; the whole valley is a cold sink.

Oct 19. Two soldiers came down from the station. Wouldn't talk. One kept saying "she's still inside".

Oct 20. Leaving. Fire barrel's full. If you're heading north: keep moving, keep warm, keep a fire behind you.`),
    N('okafor-1', 'note', 'Halcyon Station — Dr. Okafor’s desk', `If anyone reads this: I'm sorry.

The field coupling is in the control hall below the station. The geothermal core feeds it through four breaker channels. The safeties all failed electrical — of course they did. They have to be thrown by hand.

I went down on the third day. I couldn't make myself do it. If the field collapses, every grid on Earth comes back at once, unregulated, unprepared. Fires. Surges. People will die.

And if it doesn't collapse, people will die anyway. Slowly. In the dark.

The hatch to the lab is beside the main building. Take a light. It's colder down there than you'd think.`, true),
    N('okafor-final', 'note', 'Dr. Okafor’s last entry', `Day 31. I've kept a fire going in the control hall. The cold here isn't natural; it's the field drawing the heat out of everything.

I understand now. The Quiet isn't an accident we can undo safely. It's a choice we have to make.

The lever is in front of me.

Somebody braver than me will come. Light the way for them.

— I.O.`, true),
    N('j-found', 'note', 'J.', `[J. looks up from the fire. Their face is thin and wind-burned, but it's them.]

"You came. Of course you came."

"I found the console three days ago. I've been sitting here trying to make myself pull that lever. Okafor sat in this exact spot for a month and never could."

"If we throw it, every grid on Earth wakes up at once. Fires. Surges. Some people will die tonight because of us."

"If we don't, they all die slowly. In the cold. In the dark."

[J. holds out a hand, then lets it fall.]

"I can't do it. But I don't think I should be the one to decide anyway. You walked all this way. It's your call."`, true),
    N('j-found-2', 'note', 'J.', `"The breaker's at the end of the hall. The big red lever.

Whatever you choose, I'm not leaving this fire until you do."`),
    N('epilogue', 'note', 'Epilogue', `The lever was cold enough to burn.

For a moment, nothing happened. Then the hum that had lived under everything for weeks — in the air, in your teeth — simply stopped. The silence afterwards was enormous.

You and J. climbed out of the Array at dawn. Across the valley, the green light over the masts flickered once and went out.

It took the world a long time to remember itself. There were fires, as J. had feared, and hard months after. But on the first night, far to the south, somebody in the Forgotten City flicked a switch out of old habit, and a single bulb glowed above an empty street.

Somewhere on the coast, the lighthouse kept burning anyway.

Light is life. You kept it.

— THE LAST LIGHT —

Thank you for playing. The world is still yours to explore.`, true),
  ].map((n) => [n.id, n]),
);

/** Short inspection texts for objects that don't warrant a full document. */
export const INSPECT: Record<string, string> = {
  'cold-fire': 'The ashes are cold. Someone banked this fire carefully, then left in a hurry.',
  radio: 'A ranger’s field radio. The battery gauge reads full, but it won’t even hiss.',
  car: 'A sedan abandoned mid-road, door hanging open, keys in the ignition. The dashboard clock froze at 9:14.',
  rockslide: 'A fresh rockslide buries the trail to Halcyon Pass. With a pickaxe, you could dig through.',
  bridge: 'The highway bridge has collapsed into the gorge. With a rope, you could climb down and across.',
  overpass: 'The overpass has come down across the road in a wall of concrete and rebar. There’s no climbing this. The metro runs underneath.',
  'array-masts': 'A forest of white masts, humming. The air tastes of copper. Frost grows on the steel in feathers.',
  cliff: 'The land ends in a sheer drop to the sea. Gulls wheel below.',
  fence: 'A double fence topped with razor wire. HALCYON — RESTRICTED. Beyond it, only white.',
  'tunnel-end': 'Rubble blocks the old tunnel. The way out is back the way you came.',
  'gas-pump': 'The pumps are full, but the electric pumps won’t pump. A rusted hand-crank lies uselessly beside them.',
};
