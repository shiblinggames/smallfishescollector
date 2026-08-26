// THE DISCOVERABLE ISLES.
//
// Plain module, NOT 'use server' — a file with that directive silently drops
// every non-async export and all of this is data. Read by the chart (to draw
// them), by the minimap (to pin the ones you have found) and by the claim
// action (which is the ONLY thing that may believe a reward), and all three
// have to agree, so there is exactly one table.
//
// ── WHAT THEY ARE FOR ───────────────────────────────────────────────────────
//
// The chart is 45,200 world pixels across and almost all of it is water you
// have no reason to enter. The fishing bands reward DEPTH, which is one axis,
// so the whole east and west of every band is scenery. These are the reason to
// sail sideways: 27 small islands ringed around the bands, spread by bearing so
// no two sit on the same heading out from the dock, each one paying once.
//
// ── ONCE, AND SERVER-SIDE ───────────────────────────────────────────────────
//
// Every isle pays exactly once per captain, ever, and the record of that lives
// in `sea_discoveries` with a unique index doing the enforcing. Nothing here is
// a drop table and nothing rolls: what an isle holds is written down, so two
// captains who find the same rock get the same thing and neither can farm it.
// The values below are read by the SERVER when granting. The client is told
// what it won only after the row is safely in.
//
// ── THE CURVE ───────────────────────────────────────────────────────────────
//
// 2,000 ◆ and 99,000 ⟡ across all 18 caches, and it is weighted hard toward the
// far water: the one cache in the Shallows pays 35 ◆, the poorest in the Ancient
// Deep pays 175. The bands do not overlap — the meanest cache in a band always
// beats the richest in the band inside it, so sailing further is never a
// downgrade. This pays for the sailing, not for the finding,
// and a captain who only ever works the near bands should feel that the rest of
// the chart is worth the crossing.
//
// Nine of the isles hold no coin at all, only a note. They are not consolation:
// the shallow ones carry things about this sea that are genuinely useful and
// nowhere else on the surface, and the deep ones carry the crews who did not
// make it back. See NOTE ISLES below.

import { PLACES } from '@/app/(app)/sea/chart'

export type IsleNote = { title: string; body: string }

export type Isle = {
  /** Stable forever. This string is the primary key of a discovery row, so
   *  renaming one un-finds it for everybody who found it. */
  id: string
  name: string
  /** Which band it sits in. Drives the label and nothing else — the reward is
   *  written per isle, not derived, so it can be tuned one rock at a time. */
  band: string
  x: number
  y: number
  /** Island radius in world pixels. Every one is different: these are the small
   *  rocks the chart is scattered with, not ports, so none of them is as big as
   *  the smallest port (r 200). */
  r: number
  kind: 'cache' | 'note'
  gems?: number
  doubloons?: number
  note?: IsleNote
}

/**
 * NOTE ISLES.
 *
 * Two kinds of writing, split by how far out the rock is, which is the only
 * split that makes sense: a hint is worth most to someone who has not been far,
 * and a dead crew's last page is worth most to someone who has.
 *
 * NEAR WATER carries CHART HINTS. These are plain and literal on purpose, per
 * the house rule that copy whose job is explaining a mechanic stops performing
 * and just says the thing. Everything asserted in one is true of the live game;
 * if a system named here is retuned, the note is part of that system's surface
 * and has to move with it.
 *
 * FAR WATER carries LOGS. Flavour, no mechanics, and deliberately clear of the
 * campaign: the Sunken Hand arc is delivered through raid story nodes north of
 * the Harbour, and the bible's own warning is that incidental copy is exactly
 * how a reveal leaks early. Nothing out here knows anything about the Finndicate.
 * These are crews who sailed too far and wrote it down.
 */
const NOTES: Record<string, IsleNote> = {
  // ── the hints ────────────────────────────────────────────────────────
  'shallows-1': {
    title: 'A chart scrap, weighted with a stone',
    body: 'Fish are worth more the further out you catch them. The lanes price by how far you hauled it, not by what it is, so a common thing from the deep can beat a rare thing from the shallows.',
  },
  'shallows-2': {
    title: 'A note nailed to the post',
    body: 'The water goes in rings and each ring wants a better captain than the last. Open Waters asks Fishing 15, the Deep asks 30, the Abyss asks 50 and the Ancient Deep asks 75. Nothing out there is hidden. It is only far.',
  },
  'open_waters-4': {
    title: 'A page torn from a logbook',
    body: 'The shoals that shimmer are worth steering for. Three of them sit on this sea at any time, each one helping with something different, and they pick up and move about every ten minutes. Sail into one and it will tell you what it is doing for you.',
  },
  'open_waters-5': {
    title: 'A bottle, corked with wax',
    body: 'Watch the light. This sea runs a full turn from dawn back to dawn in about three quarters of an hour, and the mark up in the corner tells you where in it you are. Some out here only trade after dark.',
  },
  'deep-4': {
    title: 'A note in a tin, still dry',
    body: 'If the haul out here is wearing you down, it is the boat and not you. The Shipyard sells hull, and hull is the difference between a crossing you dread and one you do not think about. Stock rides at three hundred. It does not have to.',
  },
  'deep-5': {
    title: 'The last page of the Wreckwood log',
    body: 'Day fifty one. We have eaten the bait and the cook has stopped pretending otherwise. He says the water here is older than the water at home and I have given up arguing.\n\nWhoever finds this: the fishing is better nearer the shelf. Do not take our heading.',
  },

  // ── the logs ─────────────────────────────────────────────────────────
  'abyss-4': {
    title: 'Scratched into the post itself',
    body: 'We put in here to wait out the dark and the dark did not end. Counted eleven turns of it. On the ninth the youngest asked whether we had sailed past the morning and none of us had an answer worth giving her.\n\nWe are going on. The hold is empty and going back is further than going on.',
  },
  'abyss-5': {
    title: 'A bundle of pages, tied with line',
    body: 'The Farthing went down four lengths off this rock in water so still you could read by it. No squall. No reason. She simply stopped being a boat.\n\nWe pulled six of her crew out and left with them. If you are anchored here reading this, do not anchor here.',
  },
  'ancient_deep-5': {
    title: 'One line, cut deep',
    body: 'We were nineteen days past the last rock anybody had named and we named this one anyway, because a thing with a name is a thing you can come back to.\n\nWe did not come back to it. Somebody should.',
  },
}

/**
 * THE TABLE.
 *
 * Positions came out of a placement pass (`scripts/place-isles.mts`) that
 * rejection-samples against every port, landmark, moored trader and each other,
 * then spreads what survives by BEARING so each band is ringed rather than
 * clumped down one corridor. They are baked here rather than generated at
 * runtime for the same reason LANDMARKS is: a discovery has to be in the same
 * place tomorrow, and a generator is one refactor away from moving it.
 *
 * `r` is varied, and floored at 130 for a hard reason: the boat is 210 pixels
 * across, and an earlier pass put isles at r 87 — a 174px island NARROWER than
 * the boat moored at it, which reads as a stone you would run over rather than
 * somewhere you go ashore. They run 130 to 210 now, so the smallest is wider
 * than the boat and the largest matches a port's footprint. Landfall, not a town.
 */
/**
 * WHAT EACH ISLE IS HOLDING, beyond coin.
 *
 * Six caches hold the only copy of a homestead furnishing (lib/homestead.ts,
 * `found`). Kept HERE rather than only on the furnishing so the isle table
 * reads as a complete manifest of what is out there, and so the ashore code has
 * one place to look.
 *
 * All six sit in the Abyss or the Ancient Deep. The point is that the finest
 * things in a captain's house are things they sailed a long way for.
 */
export const ISLE_FURNISHING: Record<string, string> = {
  'abyss-1': 'window-seaglass',
  'abyss-2': 'floor-abyssal',
  'ancient_deep-0': 'hearth-firestone',
  'ancient_deep-2': 'mount-giant',
  'ancient_deep-3': 'table-starglass',
  'ancient_deep-4': 'corner-orrery',
}

export const ISLES: Isle[] = [
  // ── THE SHALLOWS ── 35 ◆ / 1,400 ⟡ ──────────────────────────────────
  { id: 'shallows-0', name: 'Cormorant Rock', band: 'shallows', x: 3080, y: 496, r: 131, kind: 'cache', gems: 35, doubloons: 1400 },
  { id: 'shallows-1', name: 'Gannet Bank', band: 'shallows', x: -988, y: 2877, r: 137, kind: 'note', note: NOTES['shallows-1'] },
  { id: 'shallows-2', name: 'Low Kelp', band: 'shallows', x: -1938, y: 784, r: 130, kind: 'note', note: NOTES['shallows-2'] },

  // ── OPEN WATERS ── 210 ◆ / 8,800 ⟡ ──────────────────────────────────
  { id: 'open_waters-0', name: 'Brine Knuckle', band: 'open_waters', x: 5738, y: 1842, r: 168, kind: 'cache', gems: 45, doubloons: 1900 },
  { id: 'open_waters-1', name: 'Halfmast Rock', band: 'open_waters', x: 4788, y: 4031, r: 152, kind: 'cache', gems: 50, doubloons: 2100 },
  { id: 'open_waters-2', name: 'Pale Shoal', band: 'open_waters', x: 2132, y: 5930, r: 150, kind: 'cache', gems: 55, doubloons: 2300 },
  { id: 'open_waters-3', name: 'The Kettle', band: 'open_waters', x: -835, y: 6138, r: 169, kind: 'cache', gems: 60, doubloons: 2500 },
  { id: 'open_waters-4', name: 'Spar Spit', band: 'open_waters', x: -3631, y: 2582, r: 156, kind: 'note', note: NOTES['open_waters-4'] },
  { id: 'open_waters-5', name: 'Old Anchorage', band: 'open_waters', x: -5651, y: 1460, r: 157, kind: 'note', note: NOTES['open_waters-5'] },

  // ── THE DEEP ── 330 ◆ / 15,200 ⟡ ────────────────────────────────────
  { id: 'deep-0', name: 'Blackfin Rise', band: 'deep', x: 9927, y: 1395, r: 175, kind: 'cache', gems: 70, doubloons: 3200 },
  { id: 'deep-1', name: 'The Cradle', band: 'deep', x: 6489, y: 6338, r: 179, kind: 'cache', gems: 80, doubloons: 3600 },
  { id: 'deep-2', name: 'Saltbone Isle', band: 'deep', x: 967, y: 9319, r: 181, kind: 'cache', gems: 85, doubloons: 4000 },
  { id: 'deep-3', name: 'Thirty Fathom Rock', band: 'deep', x: -3240, y: 9437, r: 157, kind: 'cache', gems: 95, doubloons: 4400 },
  { id: 'deep-4', name: 'The Quiet Shelf', band: 'deep', x: -5974, y: 5532, r: 155, kind: 'note', note: NOTES['deep-4'] },
  { id: 'deep-5', name: 'Wreckwood', band: 'deep', x: -9518, y: 1163, r: 170, kind: 'note', note: NOTES['deep-5'] },

  // ── THE ABYSS ── 480 ◆ / 24,400 ⟡ ───────────────────────────────────
  { id: 'abyss-0', name: 'The Black Tooth', band: 'abyss', x: 12931, y: 1689, r: 178, kind: 'cache', gems: 105, doubloons: 5200 },
  { id: 'abyss-1', name: 'Coldwater Cay', band: 'abyss', x: 10474, y: 8925, r: 164, kind: 'cache', gems: 115, doubloons: 5800 },
  { id: 'abyss-2', name: 'The Drowned Step', band: 'abyss', x: 5784, y: 13078, r: 192, kind: 'cache', gems: 125, doubloons: 6400 },
  { id: 'abyss-3', name: 'Lantern Rock', band: 'abyss', x: -1606, y: 14323, r: 171, kind: 'cache', gems: 135, doubloons: 7000 },
  { id: 'abyss-4', name: 'Deadwater', band: 'abyss', x: -12157, y: 8522, r: 191, kind: 'note', note: NOTES['abyss-4'] },
  { id: 'abyss-5', name: 'Farthing Rock', band: 'abyss', x: -14141, y: 5095, r: 191, kind: 'note', note: NOTES['abyss-5'] },

  // ── THE ANCIENT DEEP ── 945 ◆ / 49,200 ⟡ ────────────────────────────
  { id: 'ancient_deep-0', name: 'The First Stone', band: 'ancient_deep', x: 18859, y: 8860, r: 176, kind: 'cache', gems: 175, doubloons: 9200 },
  { id: 'ancient_deep-1', name: 'The Old Shell', band: 'ancient_deep', x: 12203, y: 13851, r: 199, kind: 'cache', gems: 185, doubloons: 9600 },
  { id: 'ancient_deep-2', name: 'Worldsend Rock', band: 'ancient_deep', x: 6602, y: 16175, r: 189, kind: 'cache', gems: 190, doubloons: 10000 },
  { id: 'ancient_deep-3', name: 'Stillwater Isle', band: 'ancient_deep', x: -5984, y: 20420, r: 178, kind: 'cache', gems: 195, doubloons: 10200 },
  { id: 'ancient_deep-4', name: 'Nobody’s Rock', band: 'ancient_deep', x: -11564, y: 14089, r: 182, kind: 'cache', gems: 200, doubloons: 10200 },
  { id: 'ancient_deep-5', name: 'The Far Sounding', band: 'ancient_deep', x: -19106, y: 7132, r: 190, kind: 'note', note: NOTES['ancient_deep-5'] },
]

/** By id, for the claim action. Built once. */
export const ISLE_BY_ID: Record<string, Isle> = Object.fromEntries(ISLES.map(i => [i.id, i]))

/**
 * HOW CLOSE YOU HAVE TO BE TO GO ASHORE.
 *
 * Measured from the isle's centre, so it scales with the rock: the offer
 * appears once you are within its own radius plus a boat length or so. Ports
 * use MOOR = 420 flat, which would swallow the smallest isle whole and let you
 * land on it from open water.
 */
export function ashoreRange(isle: Isle): number {
  return isle.r + 260
}

/** The nearest isle you could go ashore at, or null. */
export function isleNear(x: number, y: number): Isle | null {
  let best: Isle | null = null
  let bestD = Infinity
  for (const i of ISLES) {
    const d = Math.hypot(i.x - x, i.y - y)
    if (d < ashoreRange(i) && d < bestD) { best = i; bestD = d }
  }
  return best
}

/** The band's display name, for the isle's label. */
export function bandName(band: string): string {
  return PLACES.find(p => p.id === band)?.name ?? band
}

/**
 * WHICH CHEST AN ISLE SHOWS.
 *
 * The ornate barnacled one from the Deep out, the plain banded one nearer in.
 * It is worth more out there and it should look like it before you land.
 */
export function chestArt(isle: Isle): string {
  const deep = isle.band === 'deep' || isle.band === 'abyss' || isle.band === 'ancient_deep'
  return deep ? '/sea/isle-chest-deep.png' : '/sea/isle-chest.png'
}

/** Totals, so the curve can be asserted in a test rather than trusted. */
export const ISLE_TOTALS = {
  isles: ISLES.length,
  caches: ISLES.filter(i => i.kind === 'cache').length,
  notes: ISLES.filter(i => i.kind === 'note').length,
  gems: ISLES.reduce((n, i) => n + (i.gems ?? 0), 0),
  doubloons: ISLES.reduce((n, i) => n + (i.doubloons ?? 0), 0),
}
