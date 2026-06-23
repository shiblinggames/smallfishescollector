// Trawls — shared constants + pure reward math for crew passive fishing.
// Plain module (NOT 'use server') so the helpers + types survive the build and
// can feed both the server actions and the client panel/preview.
//
// Model (all locked with design): send ONE crew to passively fish a zone for a
// 1h hard-locked cycle; collect, then redeploy. Savvy → fishing XP, Fortune →
// doubloons. Per-slot maxed = 40% of that zone's active xp/hr and 15% of its
// active doubloons/hr; scaled by the crew's stat (floor 0.2, ref 40); each haul
// rolls a tight ±15%. One trawl per zone; up to 4 concurrent slots gated by
// BOTH fishing + Nav level.

export type TrawlZoneKey = 'shallows' | 'open_waters' | 'deep' | 'abyss' | 'ancient_deep'

export interface TrawlZone {
  key: TrawlZoneKey
  label: string
  /** Fishing level required to TRAWL here. Deliberately offset +3 above the
   *  zone's active-fishing unlock (ZONE_MIN_LEVEL) so you have to fish a new
   *  zone with your own rod for a few levels before you can automate it. */
  minLevel: number
  /** Active-fishing xp/hr in this zone — the benchmark the trawl rate scales off. */
  activeXpHr: number
  /** Active-fishing doubloons/hr (65% quick-sell estimate) — the doubloon benchmark. */
  activeDblHr: number
  /** Hard-locked cycle length in minutes. Deeper zones take longer, so their
   *  big hauls pay out at a lower EFFECTIVE xp/hr — offsetting the deep-zone
   *  reward without shrinking the haul itself. Still all roughly "hourly". */
  durationMin: number
}

// Ordered shallow → deep. Anchors per the locked balance model. minLevel is the
// zone's active-fishing unlock (1/15/30/50/75) PLUS a +3 trawl offset — you fish
// a fresh zone yourself before you can automate it. (The +3 only bites on Deep/
// Abyss/Ancient; shallows/open are moot since trawl slot 1 needs Fishing 25.)
export const TRAWL_ZONES: TrawlZone[] = [
  { key: 'shallows',     label: 'Shallows',     minLevel: 4,  activeXpHr: 2_000,  activeDblHr: 1_300, durationMin: 45 },
  { key: 'open_waters',  label: 'Open Waters',  minLevel: 18, activeXpHr: 5_000,  activeDblHr: 2_100, durationMin: 55 },
  { key: 'deep',         label: 'Deep',         minLevel: 33, activeXpHr: 11_000, activeDblHr: 2_850, durationMin: 65 },
  { key: 'abyss',        label: 'Abyss',        minLevel: 53, activeXpHr: 19_000, activeDblHr: 5_800, durationMin: 78 },
  { key: 'ancient_deep', label: 'Ancient Deep', minLevel: 78, activeXpHr: 42_000, activeDblHr: 5_400, durationMin: 120 },
]

export const TRAWL_ZONE_BY_KEY: Record<TrawlZoneKey, TrawlZone> =
  Object.fromEntries(TRAWL_ZONES.map(z => [z.key, z])) as Record<TrawlZoneKey, TrawlZone>

/** Cycle length (ms) for a zone's trawl — deeper = longer (see durationMin). */
export function trawlDurationMs(zoneKey: TrawlZoneKey): number {
  return (TRAWL_ZONE_BY_KEY[zoneKey]?.durationMin ?? 60) * 60 * 1000
}

/** Pretty cycle length, e.g. "50m" or "1h 35m". */
export function fmtTrawlDuration(zoneKey: TrawlZoneKey): string {
  const m = TRAWL_ZONE_BY_KEY[zoneKey]?.durationMin ?? 60
  return m < 60 ? `${m}m` : m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`
}

/** You can't even trawl until Fishing 25 (slot 1). */
export const TRAWL_UNLOCK_LEVEL = 25

/** Slot ladder — each slot needs BOTH a fishing AND a Nav level (hard AND-gate),
 *  forcing investment in both core loops. Max 4 slots (5 zones — you always
 *  leave one idle, usually Shallows). */
export const TRAWL_SLOT_LADDER: { slot: number; fishing: number; nav: number }[] = [
  { slot: 1, fishing: 25, nav: 0 },
  { slot: 2, fishing: 45, nav: 20 },
  { slot: 3, fishing: 70, nav: 45 },
  { slot: 4, fishing: 90, nav: 50 },
]
export const TRAWL_MAX_SLOTS = TRAWL_SLOT_LADDER.length

/** How many concurrent trawl slots the player has unlocked. */
export function unlockedTrawlSlots(fishingLevel: number, navLevel: number): number {
  let n = 0
  for (const s of TRAWL_SLOT_LADDER) {
    if (fishingLevel >= s.fishing && navLevel >= s.nav) n++
    else break
  }
  return n
}

/** The next slot's requirement, or null if all 4 are unlocked. */
export function nextTrawlSlot(fishingLevel: number, navLevel: number): { slot: number; fishing: number; nav: number } | null {
  const have = unlockedTrawlSlots(fishingLevel, navLevel)
  return have < TRAWL_MAX_SLOTS ? TRAWL_SLOT_LADDER[have] : null
}

// ── Reward math ──────────────────────────────────────────────────────────────
export const TRAWL_XP_PCT = 0.40   // maxed crew = 40% of the zone's active xp/hr
export const TRAWL_DBL_PCT = 0.15  // maxed crew = 15% of the zone's active doubloons/hr
export const TRAWL_STAT_REF = 40   // a maxed affinity-skewed Legendary's Savvy/Fortune
export const TRAWL_FACTOR_FLOOR = 0.2

/** Stat → yield factor: weak crew floor at 0.2, maxed (stat ≥ 40) = 1.0. */
export function trawlStatFactor(stat: number): number {
  return Math.max(TRAWL_FACTOR_FLOOR, Math.min(1, stat / TRAWL_STAT_REF))
}

// ── Bumper hauls ─────────────────────────────────────────────────────────────
// Most hauls are normal; a fortune-weighted roll can upgrade a haul to a bigger
// one, multiplying BOTH xp + doubloons. The reveal celebrates anything above
// 'normal'. Tuned so jackpots stay rare even on a maxed Fortune crew.
export type BumperTier = 'slim' | 'normal' | 'good' | 'bumper' | 'jackpot'

// The haul payout is a CONTINUOUS multiplier in [0.8, 1.2] (rollHaulMult). These
// entries only label the band a haul landed in, to flavour the reveal — 'slim'
// is the gentle downside (flavour, no celebration glow), normal is silent.
export const TRAWL_BUMPERS: Record<BumperTier, { label: string; blurb: string; accent: string }> = {
  slim:    { label: 'Slim Haul',     blurb: 'Quiet waters today.',           accent: '#9a958c' },
  normal:  { label: '',              blurb: '',                              accent: '#f0c040' },
  good:    { label: 'Good Haul',     blurb: 'The nets came back heavy.',     accent: '#7fd49a' },
  bumper:  { label: 'Bumper Haul',   blurb: 'The nets came back full!',      accent: '#5ec8e8' },
  jackpot: { label: 'Jackpot Haul',  blurb: 'A once-in-a-voyage catch!',     accent: '#c4a0ff' },
}

export const TRAWL_MULT_MIN = 0.8
export const TRAWL_MULT_MAX = 1.2

/** Continuous haul multiplier in [0.8, 1.2]. Center-weighted (average of two
 *  uniform rolls → triangular, so most hauls sit near 1.0 and the extremes are
 *  rare), nudged upward by the crew's Fortune. */
export function rollHaulMult(fortune: number, rng: () => number = Math.random): number {
  const base = (rng() + rng()) / 2                              // triangular, peak 0.5
  const fortuneShift = (Math.min(40, fortune) / 40) * 0.15 - 0.05  // -0.05 weak → +0.10 maxed
  const t = Math.max(0, Math.min(1, base + fortuneShift))
  return TRAWL_MULT_MIN + (TRAWL_MULT_MAX - TRAWL_MULT_MIN) * t
}

/** Band a rolled multiplier into a flavour tier for the reveal. */
export function bumperTierForMult(mult: number): BumperTier {
  if (mult >= 1.17) return 'jackpot'
  if (mult >= 1.10) return 'bumper'
  if (mult >= 1.04) return 'good'
  if (mult <= 0.90) return 'slim'
  return 'normal'
}

export interface TrawlHaul { xp: number; doubloons: number; bumper: BumperTier; mult: number }

// ── Haul flavour events ──────────────────────────────────────────────────────
// One is rolled per collect, tied to the haul's band, to explain WHY it came in
// big or light. Lots per band so it feels fresh every time. Voice: pirate, sea-
// creatures as the crew (never "men"), funny-but-charming, no em-dashes.
export const TRAWL_EVENTS: Record<BumperTier, string[]> = {
  jackpot: [
    "Your crew hauled up a sunken galleon's strongbox, still locked and heavy with gold.",
    'A giant squid surfaced, dropped a chest it had been hoarding, and slipped back into the dark.',
    "The nets snagged a merchant wreck's whole payroll, coins and all.",
    'A whale breached clean over the deck and rained half the sea into the hold.',
    'Your crew followed a lone gull to a reef no chart has ever marked.',
    'They found the honey hole. The nets nearly tore loose from the weight of it.',
    'A mermaid took a shine to the cook and pointed the crew straight to the motherlode.',
    "Your crew won a kraken's hoard in a game of cards and didn't stick around to gloat.",
    'A waterspout dropped a wriggling fortune right into the open hold.',
    'The tide rolled in silver by the thousand, with a little gold besides.',
  ],
  bumper: [
    'A whole school swam into the nets like they had somewhere to be.',
    'The crew found a feeding frenzy and rode it until the hold groaned.',
    'Fat tuna all morning. Nobody aboard is complaining.',
    'The nets came up so full the crew had to bail just to stay afloat.',
    'A pod of dolphins herded the catch right to the boat, the show-offs.',
    'Warm sun, flat sea, and fish practically queueing to come aboard.',
    'Your crew trawled clean over a sunken pier swarming with the things.',
    'The bait was perfect today. The fish filed a complaint, then got caught anyway.',
    'A deckhand sang a shanty so fine the fish surfaced to listen.',
  ],
  good: [
    "Steady nets, steady fins, a good morning's work.",
    'Nothing flashy, just a reliably heavy haul.',
    'The crew read the current right and it paid them back.',
    'A clean run. The fish cooperated for once in their lives.',
    'Fair weather and willing fish. It adds up.',
    'The crew found a good patch and had the sense to stay put.',
    "A tidy haul, and the cook's already eyeing the biggest one.",
  ],
  normal: [
    "An honest day's trawl. Nothing to write the captain about.",
    'The crew did their job and came home for supper.',
    "Fish were biting, then they weren't. An average sort of day.",
    'Nets in, nets out, a bit of everything in between.',
    "A respectable hold and a crew already asking what's for dinner.",
    "Some came, some didn't. Fair is fair.",
    'The usual. The sea gave what it felt like giving.',
    'Quiet shift. One deckhand swears the big one got away.',
  ],
  slim: [
    'A kraken spooked half the catch clean out of the nets.',
    'The crew spent most of the cycle arguing about lunch.',
    'A gull made off with the bait. All of it. Brazenly.',
    'The fish unionised and refused to cooperate.',
    'Your crew got into a staring contest with a grouper and lost track of the day.',
    'Choppy water, tangled nets, and a great deal of swearing.',
    'The crew swears they saw a sea serpent and rowed the other way.',
    'Somebody forgot to actually lower the nets for a good hour.',
    'The fish were biting somewhere else entirely. Typical.',
    'A whale settled on the net for a nap. The crew waited. The whale won.',
    'Half the crew got seasick. The other half found it hilarious.',
  ],
}

/** Pick a random flavour event for a haul's band. */
export function pickTrawlEvent(tier: BumperTier, rng: () => number = Math.random): string {
  const pool = TRAWL_EVENTS[tier]
  return pool[Math.floor(rng() * pool.length)] ?? ''
}

/** Expected (mean) haul for a 1h cycle — used for the panel preview (no bumper). */
export function expectedTrawlHaul(zoneKey: TrawlZoneKey, savvy: number, fortune: number): { xp: number; doubloons: number } {
  const z = TRAWL_ZONE_BY_KEY[zoneKey]
  return {
    xp:        Math.round(z.activeXpHr  * TRAWL_XP_PCT  * trawlStatFactor(savvy)),
    doubloons: Math.round(z.activeDblHr * TRAWL_DBL_PCT * trawlStatFactor(fortune)),
  }
}

/** Actual rolled haul (independent ±15% rolls for XP vs doubloons). Server rolls
 *  with Math.random at collect; tests can pass a deterministic rng. */
export function rollTrawlHaul(
  zoneKey: TrawlZoneKey, savvy: number, fortune: number, rng: () => number = Math.random,
): TrawlHaul {
  const exp = expectedTrawlHaul(zoneKey, savvy, fortune)
  // One continuous luck multiplier for the whole haul (xp + doubloons move
  // together), banded only to flavour the reveal.
  const mult = rollHaulMult(fortune, rng)
  return {
    xp:        Math.max(0, Math.round(exp.xp * mult)),
    doubloons: Math.max(0, Math.round(exp.doubloons * mult)),
    bumper:    bumperTierForMult(mult),
    mult,
  }
}

// ── State shapes (server → client) ───────────────────────────────────────────
export interface TrawlCrewView {
  id: number
  name: string
  filename: string
  savvy: number
  fortune: number
  level: number
}

export interface ActiveTrawlView {
  zone: TrawlZoneKey
  crew: TrawlCrewView
  endsAt: string       // ISO
  ready: boolean
  expectedXp: number
  expectedDoubloons: number
}

export interface TrawlState {
  fishingLevel: number
  navLevel: number
  unlockedSlots: number
  nextSlot: { slot: number; fishing: number; nav: number } | null
  /** Zones the player can trawl (fishing level), with their active-trawl (if any). */
  zones: { key: TrawlZoneKey; label: string; minLevel: number; unlocked: boolean; trawl: ActiveTrawlView | null }[]
  /** Crew free to send (alive, not at sea). */
  freeCrew: TrawlCrewView[]
}

export interface CollectTrawlResult {
  zone: TrawlZoneKey
  xpGained: number
  doubloonsGained: number
  newFishingXP: number
  oldFishingLevel: number
  newFishingLevel: number
  newDoubloons: number
  fish: string[]           // sample species names from the zone, for the haul reveal
  crewName: string
  bumper: BumperTier       // the band the haul landed in (flavours the reveal)
  mult: number             // the raw 0.8-1.2 luck multiplier this haul rolled
}
