// WHAT IS BURIED OUT THERE, and is on no chart anywhere.
//
// Plain module, NOT 'use server' — that directive silently drops every
// non-async export and all of this is data.
//
// ── THE ONE THING THAT IS NOT ADVERTISED ────────────────────────────────────
//
// Everything else on this sea announces itself once you are near it. Isles put
// a gold ring on the minimap the moment you clear the fog around them; traders
// show as pins; the reef is 387 rocks you can see from a mile off. That is
// correct for all of it, and it means the chart has no SECRETS — sweep the fog
// and you have been handed the complete list of things worth doing.
//
// These are the exception. A dig site is never drawn on the chart and never
// pinned on the minimap, in any state. There are exactly two ways to end up on
// one: a bottle gave you the bearing, or you happened to sail across it. The
// second is rare enough to be a story and common enough to be possible, which
// is the whole reason the site is physically there rather than being a riddle
// answer you type in.
//
// ── WHAT THEY PAY ───────────────────────────────────────────────────────────
//
// 1,600 ◆ and 70,000 ⟡ across twelve, and every dig out-pays the isle cache in
// the same band, because it is harder to be standing on one. Bands do not
// overlap here either: the meanest dig in a band beats the richest in the band
// inside it.
//
// TOGETHER WITH THE ISLES that is 3,600 ◆ and 169,000 ⟡ for the whole chart,
// which is the number to look at when retuning. Both tables are flat literals
// for exactly that reason.

import { PLACES } from '@/app/(app)/sea/chart'

export type DigSite = {
  /** Stable forever: it is the key of a claim row. */
  id: string
  /** What the bottle calls it. Never shown until you hold the bearing. */
  name: string
  band: string
  x: number
  y: number
  gems: number
  doubloons: number
  /** One line, read as the spade goes in. */
  found: string
}

/**
 * HOW CLOSE COUNTS AS BEING ON THE SPOT.
 *
 * 420, which is two boat lengths. Generous, because a buried thing has no
 * silhouette to steer at: you are working from a bearing in a bottle and the
 * water all looks the same. Tight enough that you cannot sit in one place and
 * cover two sites.
 *
 * MEASURED, not guessed: twelve discs of this size are about one part in 120 of
 * the sea, and the wider hint ring below is one part in 26. So a captain who
 * sails a lot WILL eventually notice one they were never told about, which is
 * the intent — rare enough to be a story, common enough to be possible.
 */
export const DIG_RANGE = 420

/**
 * HOW CLOSE BEFORE THE WATER LOOKS ODD.
 *
 * Wider than the range you can dig at, so there is a moment of "hold on" before
 * the offer appears. This is the entire accidental-discovery path: something in
 * the water reads as wrong, you slow down, and the spade comes out. Without it
 * a site you have no bearing for is genuinely invisible and might as well not
 * be placed at all.
 */
export const DIG_HINT_RANGE = 900

export const DIG_SITES: DigSite[] = [
  // ── THE SHALLOWS ── 50 ◆ / 2,400 ⟡ ──────────────────────────────────
  {
    id: 'shallows-dig-0', name: 'The Cook’s Share', band: 'shallows',
    x: 2402, y: 1945, gems: 50, doubloons: 2400,
    found: 'A ship’s cook buried this the day before he was paid off, and was never paid off.',
  },

  // ── OPEN WATERS ── 150 ◆ / 7,200 ⟡ ──────────────────────────────────
  {
    id: 'open_waters-dig-0', name: 'The Second Purse', band: 'open_waters',
    x: 3367, y: 4961, gems: 70, doubloons: 3400,
    found: 'Whoever put this here had a first purse somewhere else, and did not trust the same water twice.',
  },
  {
    id: 'open_waters-dig-1', name: 'Bellow’s Cache', band: 'open_waters',
    x: -3509, y: 4930, gems: 80, doubloons: 3800,
    found: 'Wrapped in three coats against the wet. Two of the coats worked.',
  },

  // ── THE DEEP ── 330 ◆ / 15,000 ⟡ ────────────────────────────────────
  {
    id: 'deep-dig-0', name: 'The Quartermaster’s Error', band: 'deep',
    x: 8746, y: 2439, gems: 100, doubloons: 4600,
    found: 'Buried a full league from where the ledger says it was buried. The ledger has been wrong for years.',
  },
  {
    id: 'deep-dig-1', name: 'The Long Count', band: 'deep',
    x: 3261, y: 9290, gems: 110, doubloons: 5000,
    found: 'Somebody counted this out coin by coin before they sank it. The tally is still in the box and it is short.',
  },
  {
    id: 'deep-dig-2', name: 'Two Fathom Hollow', band: 'deep',
    x: -9088, y: 3308, gems: 120, doubloons: 5400,
    found: 'Dug at low water by a crew who meant to come back at the next one.',
  },

  // ── THE ABYSS ── 450 ◆ / 19,800 ⟡ ───────────────────────────────────
  {
    id: 'abyss-dig-0', name: 'The Widow’s Portion', band: 'abyss',
    x: 11656, y: 7102, gems: 140, doubloons: 6200,
    found: 'Set aside for somebody ashore, by somebody who did not get ashore.',
  },
  {
    id: 'abyss-dig-1', name: 'The Deep Consignment', band: 'abyss',
    x: 1018, y: 14961, gems: 150, doubloons: 6600,
    found: 'Sunk here on purpose and marked on nothing. Whoever hid it was hiding it from their own crew.',
  },
  {
    id: 'abyss-dig-2', name: 'Coldhand’s Keeping', band: 'abyss',
    x: -14963, y: 2728, gems: 160, doubloons: 7000,
    found: 'Still tied the way it was tied going down. Nobody has been back to this water since.',
  },

  // ── THE ANCIENT DEEP ── 620 ◆ / 25,600 ⟡ ────────────────────────────
  {
    id: 'ancient_deep-dig-0', name: 'The Last Wage', band: 'ancient_deep',
    x: 17166, y: 5281, gems: 200, doubloons: 8200,
    found: 'A whole crew’s pay, buried where none of them could reach it, by the one who could.',
  },
  {
    id: 'ancient_deep-dig-1', name: 'The Old Deposit', band: 'ancient_deep',
    x: 4740, y: 17319, gems: 205, doubloons: 8600,
    found: 'Down so long the box has taken the shape of the seabed around it.',
  },
  {
    id: 'ancient_deep-dig-2', name: 'The Far Keeping', band: 'ancient_deep',
    x: -15790, y: 9418, gems: 215, doubloons: 8800,
    found: 'The furthest thing anybody ever bothered to bury. They did not bother to mark it either.',
  },
]

export const DIG_BY_ID: Record<string, DigSite> = Object.fromEntries(DIG_SITES.map(d => [d.id, d]))

/** The site you are standing on, or null. */
export function digAt(x: number, y: number): DigSite | null {
  for (const d of DIG_SITES) {
    if (Math.hypot(d.x - x, d.y - y) < DIG_RANGE) return d
  }
  return null
}

/** The site close enough that the water should look wrong, or null. */
export function digHintAt(x: number, y: number): DigSite | null {
  for (const d of DIG_SITES) {
    if (Math.hypot(d.x - x, d.y - y) < DIG_HINT_RANGE) return d
  }
  return null
}

export function digBandName(band: string): string {
  return PLACES.find(p => p.id === band)?.name ?? band
}

/**
 * HOW A BEARING IS WRITTEN.
 *
 * In the pirate's units, not the engine's. Nobody buries treasure at 17166,
 * 5281 — they bury it so far east of a thing and so far south of another, and
 * that is what a note in a bottle would say.
 *
 * The numbers are still exact, so a captain who follows them lands on the spot.
 * The chart's own distance readout is in metres at a tenth of a world pixel
 * (see the compass), so these convert the same way and agree with everything
 * else on screen.
 */
export function bearingText(d: DigSite): string {
  const east = d.x >= 0
  return `${Math.round(Math.abs(d.x) / 10).toLocaleString()}m ${east ? 'east' : 'west'} of the Mainland, ` +
    `and ${Math.round(d.y / 10).toLocaleString()}m out.`
}

export const DIG_TOTALS = {
  sites: DIG_SITES.length,
  gems: DIG_SITES.reduce((n, d) => n + d.gems, 0),
  doubloons: DIG_SITES.reduce((n, d) => n + d.doubloons, 0),
}
