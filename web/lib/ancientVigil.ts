// THE LONG VIGIL — the six Ancient Deep giants, mastered.
//
// The endgame problem this solves: the ancients are caught once and then the
// mechanic is spent. All six are catch_difficulty 5 with FIXED lengths
// (length_min === length_max), so there is no size roll, no personal best,
// nothing to be better at — a second catch is identical to the first, which is
// why re-catching them was never worth doing.
//
// So the Vigil gives them their own axis. Each giant carries a RANK, 1 to 5.
// Rank 1 is the original catch — the one that gated the finale — so a captain
// who clears One Last Ride starts at six ranks already earned rather than at
// zero. To climb, you RELEASE a mounted giant back into the deep and land it
// again, and only a PERFECT final phase counts.
//
// THIS DOES NOT INVENT A FIGHT. Every giant already has its own multi-phase
// boss reel in FishingGame's BOSS_CONFIG — precision, drift, accelerate, gyre,
// surge, shrink — written so "no two giants fight alike". A Vigil rank SCALES
// that existing fight rather than layering a second difficulty system over it:
// more phases, and a perfect window that closes harder and a needle that
// quickens more with each one.
//
// Megalodon already proves the shape. It runs 4 phases of perfect-only, opening
// on a deliberately WIDE perfect (perfectShrinkStart: -18) that tightens 6° a
// phase. The Vigil hands that same curve to every giant and steepens it: at
// rank 5 a Plesiosaurus is a five-phase drift fight whose landing window is
// closing under you, and Megalodon is six phases of the same.
//
// WHY THE PERFECT WINDOW IS THE MEASURE. `perfectZoneBonus` is pinned to 0 on
// every rod by explicit design — "the skill floor the whole fishing game is
// measured against" — so NO GEAR widens it. The boss phases move it; a rod
// never can. That is what makes this ladder unbuyable by construction rather
// than merely balanced to be.

/** The six giants, by fish_species.id. Megalodon is last on purpose: it never
 *  surfaces until the other five are on the wall (enforced in castLine). */
export const ANCIENT_IDS = [144, 145, 146, 147, 148, 143] as const

export const VIGIL_MAX_RANK = 5
/** Every giant at rank 5. The capstone: the ancient pet. */
export const VIGIL_MAX_TOTAL = ANCIENT_IDS.length * VIGIL_MAX_RANK   // 30
/** What a captain holds the moment they clear the finale — all six mounted at
 *  rank 1. The floor of the ladder, not zero. */
export const VIGIL_START_TOTAL = ANCIENT_IDS.length                  // 6

export type VigilEntry = { rank: number; released: boolean }
export type VigilState = Record<string, VigilEntry>

/** How a Vigil rank steepens a giant's EXISTING boss fight. Merged over its
 *  BOSS_CONFIG row — never replacing the mechanic, which is that giant's
 *  identity. */
export interface VigilScale {
  /** Added to BossConfig.phases. More stages to hold your nerve through. */
  extraPhases: number
  /** The phase-1 perfect window, as a shrink (NEGATIVE = opens wider than the
   *  shipped 5 degrees). Applied only to giants with no curve of their own —
   *  Megalodon ships one and keeps it whole. */
  perfectShrinkStart: number
  /** Degrees the window closes per phase, for those same giants. */
  perfectShrinkStep: number
  /** Needle speed multiplier compounded per phase. */
  speedStepMult: number
  /** Added to the zone's blackout chance. Megalodon's noBlackout still wins. */
  blackoutBonus: number
}

/** Keyed by the rank you are ATTEMPTING, 2 through 5. Rank 1 was the original
 *  catch at the fight's shipped difficulty, so it has no row — the ladder is
 *  four rungs, not five.
 *
 *  perfectShrinkStart is NEGATIVE on purpose. applyBossMods floors the perfect
 *  half-width at 2 (a 4-degree window), and the band ships at 5 degrees, so a
 *  window that only ever narrows has ONE degree of travel and saturates on the
 *  first phase. Megalodon already solved this: it opens deliberately WIDE
 *  (-18) and closes hard, which is what gives its fight an arc instead of a
 *  wall. The Vigil hands every giant that same shape, opening wider the higher
 *  the rank so the close has further to fall. */
const VIGIL_SCALE: Record<number, VigilScale> = {
  2: { extraPhases: 0, perfectShrinkStart: -6,  perfectShrinkStep: 2.5, speedStepMult: 1.06, blackoutBonus: 0.00 },
  3: { extraPhases: 1, perfectShrinkStart: -9,  perfectShrinkStep: 3.0, speedStepMult: 1.09, blackoutBonus: 0.03 },
  4: { extraPhases: 1, perfectShrinkStart: -12, perfectShrinkStep: 3.5, speedStepMult: 1.12, blackoutBonus: 0.05 },
  5: { extraPhases: 2, perfectShrinkStart: -15, perfectShrinkStep: 4.0, speedStepMult: 1.15, blackoutBonus: 0.08 },
}

// -- THE HUNT ---------------------------------------------------------------
// Finding a released giant is deliberately NOT the same roll as finding one
// for the first time.
//
// The original hunt (uncaught giants, the one that gates the finale) is
// untouched at 20% on a Golden Lure, amplified x(1 + bonus*4) -- which the
// Legendary Rod turns into 84%, near enough a guaranteed summon. That is fine
// for a one-time story gate you clear six times and never again.
//
// It is NOT fine for a repeatable ladder. At 84% the hunt is a formality and
// the whole cost of a rank sits in the fight. So a released giant runs its own
// rate: lower to begin with, TIGHTER THE HIGHER THE RANK (the ones you have
// beaten most are the wariest), and with the rod's influence cut from x4 to
// x1.5 so gear still clearly helps without erasing the search.
const VIGIL_HUNT_BASE: Record<number, number> = { 2: 0.15, 3: 0.12, 4: 0.10, 5: 0.08 }
/** Even a maxed build cannot make the hunt a formality. */
const VIGIL_HUNT_CAP = 0.45
/** Luminous finds them less readily than Golden, same ratio as the first hunt. */
const VIGIL_LUMINOUS_RATIO = 0.75

/** Chance a single lure cast raises this released giant. `rarityBonus` is the
 *  summed rod + event + Locked-In bonus, exactly as the first hunt reads it. */
export function vigilHuntChance(attemptingRank: number, rarityBonus: number, lure: 'golden' | 'luminous'): number {
  const base = VIGIL_HUNT_BASE[attemptingRank]
  if (!base) return 0
  const lured = lure === 'luminous' ? base * VIGIL_LUMINOUS_RATIO : base
  return Math.min(VIGIL_HUNT_CAP, lured * (1 + Math.max(0, rarityBonus) * 1.5))
}

/** The scaling for an attempt. Null at rank 1 (the fight as shipped). */
export function vigilScale(attemptingRank: number): VigilScale | null {
  return VIGIL_SCALE[attemptingRank] ?? null
}

/** How each giant fights, in words, for the release sheet. DISPLAY COPY ONLY —
 *  the mechanic itself lives in FishingGame's BOSS_CONFIG and is the single
 *  source of truth; this just names it so a captain knows what they are
 *  signing up for before they give up a mount. */
export const VIGIL_FIGHT_TELL: Record<number, string> = {
  143: 'Perfect or nothing, every phase. No dark to fight, just your own hands.',
  144: 'The ring circles you the whole way down.',
  145: 'The armoured ram. Every phase comes faster than the last.',
  146: 'It coils, and the ring rocks like a swell.',
  147: 'It bears down: the ring drifts and the needle quickens together.',
  148: 'The breathing jaw. The window closes and opens as you watch.',
}

/** What changes at the rank you are about to attempt, in plain words. Built
 *  from the DIFF against the rank below so it can never go stale. */
export function vigilChanges(attemptingRank: number): string[] {
  const next = vigilScale(attemptingRank)
  if (!next) return []
  const prev = vigilScale(attemptingRank - 1)
  const out: string[] = []
  const extra = next.extraPhases - (prev?.extraPhases ?? 0)
  if (extra > 0) out.push(extra === 1 ? 'One more phase to hold.' : `${extra} more phases to hold.`)
  if (!prev) out.push('The landing window now closes with every phase.')
  else if (next.perfectShrinkStep > prev.perfectShrinkStep) out.push('The window closes faster.')
  if (next.perfectShrinkStart > (prev?.perfectShrinkStart ?? 0)) out.push('It starts tighter than before.')
  if (!prev || next.speedStepMult > prev.speedStepMult) out.push('The needle quickens harder each phase.')
  if (next.blackoutBonus > (prev?.blackoutBonus ?? 0)) out.push('The light fails more often.')
  return out
}

// ── State helpers ───────────────────────────────────────────────────────────

export function readVigil(raw: unknown): VigilState {
  if (!raw || typeof raw !== 'object') return {}
  const out: VigilState = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const e = v as { rank?: unknown; released?: unknown }
    const rank = Math.max(1, Math.min(VIGIL_MAX_RANK, Math.floor(Number(e.rank ?? 1)) || 1))
    out[k] = { rank, released: e.released === true }
  }
  return out
}

/** The Vigil a captain holds. Ranks are seeded from ancient_catches so the six
 *  they already landed count as rank 1 without a backfill — a giant on the
 *  wall with no vigil row IS rank 1, mounted. */
export function vigilFor(raw: unknown, ancientCatches: number[] | null | undefined): VigilState {
  const stored = readVigil(raw)
  const out: VigilState = { ...stored }
  for (const id of ancientCatches ?? []) {
    if (!out[String(id)]) out[String(id)] = { rank: 1, released: false }
  }
  return out
}

export function vigilEntry(state: VigilState, fishId: number): VigilEntry | null {
  return state[String(fishId)] ?? null
}

/** Sum of ranks — 6 with all six mounted at rank 1, 30 at the capstone.
 *  Mirrors the SQL vigil_total() used by the leaderboard. */
export function vigilTotal(state: VigilState): number {
  return Object.values(state).reduce((s, e) => s + Math.max(0, Math.min(VIGIL_MAX_RANK, e.rank)), 0)
}

/** Every giant at rank 5 — the ancient pet is owed. */
export function vigilComplete(state: VigilState): boolean {
  return ANCIENT_IDS.every(id => (state[String(id)]?.rank ?? 0) >= VIGIL_MAX_RANK)
}

/** Currently out in the water rather than on the wall. castLine's pool filter
 *  reads this: a giant is catchable if it was never caught OR is released. */
export function isReleased(state: VigilState, fishId: number): boolean {
  return state[String(fishId)]?.released === true
}

// -- THE DIAL, PER RANK -----------------------------------------------------
// Green catch and gold perfect have been constant since the first cast, and
// the Ancient Deep already bends that once (cyan water, gold target, rose
// danger, violet void). The Vigil bends it again per rank, because breaking a
// constant the whole game has held IS the statement that this is endgame.
//
// TWO RULES SURVIVE THE REPAINT, and everything else is free:
//
//  1. PERFECT IS ALWAYS THE BRIGHTEST BAND ON THE DIAL. That, not the colour
//     gold, is what players actually read at speed -- so the hue can move as
//     long as the luminance hierarchy does not. Every `perfect` below is a
//     near-white tint of its rank, verified 26-51% brighter than its catch.
//  2. DANGER STAYS IN THE RED FAMILY. Snag costs bait, so the one band that
//     must never be mistaken keeps its shipped meaning at every rank. That is
//     also why no rank paints its CATCH band red -- at Blood-dark the catch
//     goes violet instead of crimson, precisely so it cannot be confused with
//     the penalty sitting beside it.
export interface VigilDial { catch: string; perfect: string; penalty: string; miss: string }

export const VIGIL_DIAL: Record<number, VigilDial> = {
  // I -- the Ancient Deep exactly as it ships. The baseline you already know.
  1: { catch: '#22d3ee', perfect: '#fde68a', penalty: '#fb5f7a', miss: '#4b3a63' },
  // II -- cold forged iron. Colour drains out of the water.
  2: { catch: '#93c5fd', perfect: '#f1f5f9', penalty: '#fb5f7a', miss: '#2b3648' },
  // III -- verdigris. The one rank that lands near the game's original green,
  // which reads as a homecoming rather than a repeat.
  3: { catch: '#34d399', perfect: '#ecfccb', penalty: '#fb5f7a', miss: '#173c37' },
  // IV -- blood-dark. Catch goes VIOLET, not crimson: the danger band is red
  // and these two sit next to each other on the dial.
  4: { catch: '#a78bfa', perfect: '#fce7f3', penalty: '#fb5f7a', miss: '#3a1220' },
  // V -- struck in gold. The whole dial runs molten; perfect is the white-hot
  // centre of it, so it still wins on luminance against an amber catch band.
  5: { catch: '#fcd34d', perfect: '#fffbeb', penalty: '#fb5f7a', miss: '#3d2a08' },
}

/** The capstone: all six giants at rank 5 pays the one pet in the game that no
 *  crate can produce. Lives here rather than in lib/pets so the Vigil owns what
 *  the Vigil awards. */
export const VIGIL_PET_ID = 'plesiosaur_baby'

/** Roman numeral for the rank chrome. Only ever 1-5 here. */
export function vigilNumeral(rank: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V'][Math.max(0, Math.min(5, rank))] ?? ''
}

/** THE FRAME A RANK WEARS. The giant's own art is the hero at every rank; this
 *  is everything AROUND it, which is how five genuinely different-looking
 *  cards cost no new art.
 *
 *  The ladder is material, and it climbs: lashed rope, then iron, then brass
 *  gone green in the salt, then gilding — and at the top the whole thing turns
 *  to gold, fish included. Rank V is not a fifth colourway, it is the mount
 *  becoming a trophy, and it reuses the game's existing golden-fish treatment
 *  (SHINY_FISH_FILTER) so it reads as the same kind of prize a golden catch is.
 *
 *  `plate` is a full background, deliberately layered gradients rather than a
 *  flat fill — the house rule is no solid gold, and a translucent build also
 *  lets the zone art behind it show through. */
export const VIGIL_FRAME: Record<number, {
  label: string
  accent: string
  glow: string
  /** Background layers for the slab at this rank. */
  plate: string
  /** Border. Thickens and brightens as the ladder climbs. */
  border: string
  /** Applied to the fish art. Rank V turns it to gold. */
  fishFilter?: string
  /** Rank V only: the card is a trophy and says so. */
  trophy?: boolean
}> = {
  1: {
    // Salt-bleached driftwood and lashed rope. Warm and humble on purpose: it
    // is the rung everyone starts on, and it must not compete with anything.
    label: 'Rope and driftwood', accent: '#c08a5a', glow: 'rgba(192,138,90,0.20)',
    plate: 'linear-gradient(180deg, rgba(34,24,14,0.5) 0%, rgba(8,10,16,0.85) 100%)',
    border: '1px solid rgba(192,138,90,0.45)',
  },
  2: {
    // Cold forged iron. The first real metal.
    label: 'Iron banding', accent: '#b8c4d0', glow: 'rgba(184,196,208,0.26)',
    plate: 'linear-gradient(180deg, rgba(30,38,48,0.72) 0%, rgba(8,12,20,0.9) 100%)',
    border: '2px solid rgba(184,196,208,0.55)',
  },
  3: {
    // Brass gone green in the salt.
    label: 'Verdigris brass', accent: '#2dd4bf', glow: 'rgba(45,212,191,0.3)',
    plate: 'radial-gradient(120% 70% at 50% 0%, rgba(45,212,191,0.24) 0%, transparent 58%), linear-gradient(180deg, rgba(10,40,38,0.74) 0%, rgba(5,14,18,0.92) 100%)',
    border: '2px solid rgba(45,212,191,0.62)',
  },
  4: {
    // ANCIENT CRIMSON -- the game's own rarity colour for Finn's spoils, and
    // the one rung that is not a metal. It used to be "Gilded", a warm gold,
    // which made rank IV and rank V read as the same card twice: the gold has
    // to arrive ONCE, at the top, or it means nothing. Crimson also earns its
    // place in the story -- this is the rung where a giant turns dangerous.
    label: 'Blood-dark', accent: '#e0455a', glow: 'rgba(224,69,90,0.34)',
    plate: 'radial-gradient(120% 70% at 50% 0%, rgba(224,69,90,0.28) 0%, transparent 60%), linear-gradient(180deg, rgba(48,10,16,0.8) 0%, rgba(14,4,8,0.95) 100%)',
    border: '2px solid rgba(224,69,90,0.72)',
  },
  5: {
    // Struck in gold, fish and all. The only gold on the ladder, so it lands
    // as an arrival rather than one more warm rung.
    label: 'Struck in gold', accent: '#fbcc4a', glow: 'rgba(251,204,74,0.55)',
    plate: 'radial-gradient(120% 80% at 50% 0%, rgba(251,204,74,0.40) 0%, rgba(240,160,32,0.18) 45%, transparent 70%), linear-gradient(180deg, rgba(78,54,12,0.86) 0%, rgba(30,19,4,0.95) 60%, rgba(12,8,2,0.97) 100%)',
    border: '3px solid rgba(251,204,74,0.95)',
    fishFilter:
      'grayscale(1) sepia(1) saturate(7) hue-rotate(-15deg) brightness(1.25) contrast(1.05) '
      + 'drop-shadow(0 0 10px rgba(251,191,36,0.95)) drop-shadow(0 0 22px rgba(251,191,36,0.5))',
    trophy: true,
  }
}
