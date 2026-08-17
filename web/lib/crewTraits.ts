// THE LEVIATHAN TABLE — every trait the deep re-cut can produce, as a list.
//
// WHY A LIST AND NOT A ROLL.
//
// The re-cut used to build a trait by rolling three stats independently, each
// anywhere from -4 to +4. That is a 9 x 9 x 9 lattice: 729 outcomes, of which
// Divine is exactly one corner. Nobody chose 729; it is just what falls out of
// rolling three things separately, and it made the best trait in the game a
// 0.137% shot -- roughly 30x rarer than the top modifier on a Terraria reforge,
// which is the feel this bunk was reaching for.
//
// Worse, a lattice has no author. Of those 729 outcomes 82% came out mixed-sign
// mush: arithmetic leftovers nobody wrote, that read as "+2 power, -1 dodge,
// +1 fortune" and meant nothing. Reforging is fun because every result has a
// NAME. "Errant" is a leftover. "Reckless" is a prize you turned down.
//
// So the deep roll now draws uniformly from the table below. Divine is one
// entry of TABLE_SIZE, which puts it in Terraria's 2-5% band, and the list
// length IS the difficulty dial -- add entries to make it rarer, remove them to
// make it commoner. No weights, no per-rarity tables, no tuning constants.
//
// RARITY IS DELIBERATELY ABSENT. It already decides the thing that matters:
// STAT_BUDGET gives a Legendary 28-34 base points against a Common's 8-13, and
// a trait tops out at +12. A Common holding Divine (~22) is still worse than a
// Legendary holding nothing (~31). Weighting this table by rarity too would be
// counting the same advantage twice.
//
// THE RECRUIT BOARD DOES NOT USE THIS. Board traits keep their old weighted
// roll (crewGen.MAG_WEIGHTS), so rarity still shapes what a recruit shows up
// with, every bought crew still tops out at 3, and nothing about existing
// balance moves. A 4 remains something only the top hall can produce.

export interface CrewTraitDef {
  /** Its own name, shown wherever the trait is. Unique per stat line. */
  name: string
  power: number
  dodge: number
  fortune: number
}

/**
 * Uniform draw. Every entry is equally likely, so the odds of any one result
 * are 1/CREW_TRAITS.length and nothing here needs a weight column.
 *
 * Stat lines are UNIQUE across the table, which is load-bearing: the label
 * lookup keys on the line, so two entries sharing one would make a trait's
 * name ambiguous.
 *
 * The mix is roughly Terraria's: a fifth of it is worth having, the rest is
 * texture that makes the good ones land. Deliberately includes real disasters
 * -- the re-cut can now hand back something worse than you had, which is the
 * whole reason the offer became a choice instead of an automatic upgrade.
 */
export const CREW_TRAITS: CrewTraitDef[] = [
  // ── The ceiling. One entry, and the only way to a perfect line. ──────────
  { name: 'Divine',        power:  4, dodge:  4, fortune:  4 },

  // ── Near-perfect. The heartbreak tier: everything you wanted bar one. ────
  { name: 'Ascendant',     power:  4, dodge:  4, fortune:  3 },
  { name: 'Exalted',       power:  4, dodge:  3, fortune:  3 },
  { name: 'Sovereign',     power:  3, dodge:  3, fortune:  3 },

  // ── Specialists. One stat at the ceiling and nothing to show elsewhere. ──
  { name: 'Brutal',        power:  4, dodge:  0, fortune:  0 },
  { name: 'Uncatchable',   power:  0, dodge:  4, fortune:  0 },
  { name: 'Blessed',       power:  0, dodge:  0, fortune:  4 },
  { name: 'Ironhanded',    power:  3, dodge:  1, fortune:  0 },
  { name: 'Slippery',      power:  0, dodge:  3, fortune:  1 },
  { name: 'Fortunate',     power:  0, dodge:  1, fortune:  3 },
  { name: 'Storm-Tested',  power:  2, dodge:  2, fortune:  2 },

  // ── Tradeoffs. The interesting middle: good at a price you can read. ─────
  { name: 'Reckless',      power:  4, dodge: -2, fortune:  0 },
  { name: 'Gambler',       power: -2, dodge:  0, fortune:  4 },
  { name: 'Heavyset',      power:  3, dodge: -2, fortune:  1 },
  { name: 'Brash',         power:  3, dodge: -1, fortune: -1 },
  { name: 'Nimble',        power: -1, dodge:  3, fortune:  1 },
  { name: 'Cagey',         power: -2, dodge:  3, fortune:  0 },
  { name: 'Wary',          power: -1, dodge:  2, fortune:  2 },
  { name: 'Steady',        power:  2, dodge:  2, fortune: -1 },
  { name: 'Chancer',       power: -2, dodge: -1, fortune:  3 },

  // ── The wreckage. Most of a table like this has to be bad or the good
  //    entries mean nothing. Blighted is the floor and, like Divine, is
  //    reachable nowhere else in the game. ────────────────────────────────
  { name: 'Sluggish',      power: -2, dodge: -1, fortune:  0 },
  { name: 'Clumsy',        power: -1, dodge: -3, fortune:  0 },
  { name: 'Leaden',        power: -3, dodge: -2, fortune:  0 },
  { name: 'Hapless',       power:  0, dodge: -2, fortune: -2 },
  { name: 'Broken',        power: -3, dodge: -1, fortune: -1 },
  { name: 'Cursed',        power: -2, dodge: -2, fortune: -2 },
  { name: 'Blighted',      power: -4, dodge: -4, fortune: -4 },

  // ── Nothing at all. A real Terraria outcome and an honest one: the hand
  //    came back the same as it went in. ─────────────────────────────────
  { name: 'Unremarkable',  power:  0, dodge:  0, fortune:  0 },
]

/** How many outcomes the deep re-cut has. THIS is the difficulty dial: the
 *  odds of any single named trait are exactly 1/this. */
export const TRAIT_TABLE_SIZE = CREW_TRAITS.length

/** Chance of drawing any one specific entry, for display and for tests. */
export const TRAIT_DRAW_CHANCE = 1 / TRAIT_TABLE_SIZE

/** Stat line -> definition. Built once. The key is the line itself because
 *  that is all the database stores (`s:P,D,F`), so a trait read back from
 *  user_crew can still find its own name. */
const BY_LINE: Map<string, CrewTraitDef> = new Map(
  CREW_TRAITS.map(t => [`${t.power},${t.dodge},${t.fortune}`, t]),
)

/** The table entry for a stat line, or null when the line is not from this
 *  table — every crew rolled before the table existed, and every recruit-board
 *  trait, which still uses the weighted roll. Callers fall back to the old
 *  band labels for those, so no existing crew is ever silently relabelled. */
export function traitDefFor(t: { power: number; dodge: number; fortune: number }): CrewTraitDef | null {
  return BY_LINE.get(`${t.power},${t.dodge},${t.fortune}`) ?? null
}

/** Draw one trait, uniformly. The whole roll. */
export function drawDeepTrait(): CrewTraitDef {
  return CREW_TRAITS[Math.floor(Math.random() * CREW_TRAITS.length)]
}
