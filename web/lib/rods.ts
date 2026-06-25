import { fishingLevelReqForCost } from './gearGating'

export interface RodDef {
  tier: number
  name: string
  cost: number
  /** Fishing Level required to BUY this rod. Overrides the price-bracket gate
   *  in gearGating; tune unlock pacing here, one rod at a time. Leave unset to
   *  fall back to the bracket. Ignored for earnedOnly rods. */
  minLevel?: number
  earnedOnly?: boolean       // if true, cannot be purchased — claimed via special action
  description: string
  color: string
  rarityBonus: number      // shifts rarity distribution toward rares (0 = no effect)
  biteIntervalMs: number   // time between bite opportunities (lower = faster)
  catchZoneBonus: number   // degrees added to catch zone
  doubleCatchChance: number  // chance to catch 2 fish on a successful catch (0–1)
  retryOnMissChance: number  // chance to retry the dial on miss or snag (0–1)
  snagImmune: boolean        // if true, snag zones count as miss — no extra bait lost
  perfectZoneBonus: number   // degrees added to the perfect zone (base is 5°)
  jackpotChance?: number     // chance to catch jackpotMultiplier fish at once (0–1)
  jackpotMultiplier?: number // how many fish on a jackpot hit
  crateChanceMult?: number   // multiplies the per-cast crate spawn chance (default 1)
  perfectXpMult?: number     // multiplies XP on a *perfect* catch — incl. the
                             // streak bonus, so it scales with streaks (default 1)
  // ── Galaxy Rod — "Wormhole" ──
  // After any normal catch, the player may fold space and reroll the catch
  // into a DIFFERENT random fish from the same zone (weighted by normal rarity
  // odds — can come back better or worse). One-shot per catch, opt-in. Server
  // enforces single-use via profiles.pending_reroll. See rerollWormhole().
  wormhole?: boolean
  // ── Lightsaber Rod — "Lightspeed" ──
  // Chance (0–1) that a cast bites almost instantly — the fish are drawn to the
  // blade. Applied server-side in castLine by clamping waitMs. This is the only
  // rod stat that actually changes bite timing (biteIntervalMs is display-only).
  instantBiteChance?: number
  // 3-pose sprite slug. Loads /{slug}_rest.png / _wait.png / _cast.png.
  // Every rod's source sheet is sliced into raw quadrants by web/slice-rod.mjs
  // so a single CHAR_ROD_OVERLAY position applies to all of them.
  slug?: string
  imageUrl?: string          // legacy single-sprite fallback (deprecated; kept for rods without 3-pose art)
  glow?: boolean             // enable any glow aura at all
  // Theme of the glow effect. Driven by per-keyframe CSS in globals.css
  // (rod-glow-fire / sparkle / electric for marquee rods; moon / tech as
  // subtler accents). Falls back to the generic .rod-glow pulse when omitted.
  glowType?: 'fire' | 'sparkle' | 'electric' | 'moon' | 'tech' | 'galaxy' | 'saber'
}

// Resolve the CSS class for a rod's glow aura. Single source of truth so
// every place that renders a rod (live game, shop, profiles, gear picker)
// stays in sync if we add a new glowType later.
export function rodGlowClass(rod: RodDef): string | undefined {
  if (!rod.glow) return undefined
  return rod.glowType ? `rod-glow-${rod.glowType}` : 'rod-glow'
}

export const RODS: RodDef[] = [
  {
    tier: 0, name: 'Bamboo Rod', cost: 0, minLevel: 1,
    description: 'A simple bamboo pole. Gets the job done.',
    color: '#a07858', rarityBonus: 0, biteIntervalMs: 3800, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_bamboo',
  },
  {
    tier: 1, name: 'Driftwood Staff', cost: 1500, minLevel: 3,
    description: 'Heavy and slow, but the wide tip gives you a more forgiving catch window.',
    color: '#b8956a', rarityBonus: 0, biteIntervalMs: 4500, catchZoneBonus: 8,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_driftwood',
  },
  {
    tier: 2, name: 'Fiberglass Rod', cost: 2500, minLevel: 7,
    description: 'Lighter than bamboo with a wider tip. Gives you a more forgiving catch window.',
    color: '#9ca3af', rarityBonus: 0, biteIntervalMs: 3800, catchZoneBonus: 10,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_fiberglass',
  },
  {
    tier: 3, name: 'Reef Guard', cost: 8000, minLevel: 12,
    description: 'Responsive and fast. Fish bite 15% quicker than the baseline.',
    color: '#34d399', rarityBonus: 0, biteIntervalMs: 3230, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_reefguard',
  },
  {
    tier: 4, name: 'Telescoping Rod', cost: 8000, minLevel: 16,
    description: 'Extends deep. Something about the length draws rarer fish to the surface.',
    color: '#60a5fa', rarityBonus: 0.10, biteIntervalMs: 3800, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_telescoping',
  },
  {
    tier: 5, name: 'Moonwood Staff', cost: 14000, minLevel: 20,
    description: 'Carved from driftwood blessed by a full moon. Bites 10% faster with a wider catch window.',
    color: '#a78bfa', rarityBonus: 0, biteIntervalMs: 3420, catchZoneBonus: 10,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_moonwood', glow: true, glowType: 'moon',
  },
  {
    tier: 6, name: 'Graphite Rod', cost: 22000, minLevel: 28,
    description: 'Lightweight and stiff. Fish bite 25% faster than baseline.',
    color: '#64748b', rarityBonus: 0, biteIntervalMs: 2850, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_graphite',
  },
  {
    tier: 7, name: "Navigator's Rod", cost: 35000, minLevel: 32,
    description: 'A well-balanced deep-sea rod. Good speed and a wider catch zone.',
    color: '#38bdf8', rarityBonus: 0, biteIntervalMs: 2800, catchZoneBonus: 8,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_navigators',
  },
  {
    tier: 8, name: 'Carbon Rod', cost: 60000, minLevel: 42,
    description: 'Precision-engineered. Bites come 35% faster than baseline.',
    color: '#4ade80', rarityBonus: 0, biteIntervalMs: 2470, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_carbon', glow: true, glowType: 'tech',
  },
  {
    tier: 9, name: 'Deep Diver', cost: 90000, minLevel: 48,
    description: 'Built for the abyss. 38% faster bites and a wide catch window.',
    color: '#22d3ee', rarityBonus: 0, biteIntervalMs: 2356, catchZoneBonus: 13,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_deepdiver',
  },
  {
    tier: 10, name: 'Legendary Rod', cost: 200000, minLevel: 60,
    description: 'Forged from the mast of a sunken galleon. 40% faster bites — the rarest fish cannot resist.',
    color: '#ff6b35', rarityBonus: 1.50, biteIntervalMs: 2280, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_legendary', glow: true, glowType: 'fire',
  },
  {
    tier: 11, name: 'Twin-Strike', cost: 45000, minLevel: 37,
    description: 'Two hooks on one line. When luck strikes, they both bite.',
    color: '#fbbf24', rarityBonus: 0, biteIntervalMs: 3200, catchZoneBonus: 0,
    doubleCatchChance: 0.25, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_twinstrike',
  },
  {
    tier: 12, name: 'Second Wind', cost: 28000, minLevel: 24,
    description: "Stubborn rod. When you miss, sometimes it refuses to let go.",
    color: '#fb923c', rarityBonus: 0, biteIntervalMs: 3200, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0.25, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_secondwind',
  },
  {
    tier: 13, name: "Millionaire's Rod", cost: 175000, minLevel: 54,
    description: 'Hand-rolled in gold leaf. Every catch brings two.',
    color: '#f0c040', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 0,
    doubleCatchChance: 1.0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_millionaires', glow: true, glowType: 'sparkle',
  },
  {
    tier: 15, name: 'YOLO Rod', cost: 1000000, minLevel: 80,
    description: 'Roll the dice every cast for a 100-fish haul — and the odds climb the shallower you fish. The rest of the time? Just a regular catch.',
    color: '#60d9ff', rarityBonus: 0, biteIntervalMs: 2850, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    jackpotChance: 0.10, jackpotMultiplier: 100,
    slug: 'rod_yolo', glow: true, glowType: 'electric',
  },
  {
    tier: 14, name: 'Completionist Rod', cost: 0, earnedOnly: true,
    description: "Forged from the soul of every species in the sea. A master's tool on its own, and a vessel besides: fit up to three rods you own into it to carry their gifts, and re-forge whenever you like.",
    // Base "master tool" — fast bites, a wide window, snag-immune, no gimmick
    // procs. The unique effects come from the rods socketed into it (see
    // resolveCompletionistRod). Earlier this rod hard-coded every proc maxed;
    // now it's a build-your-own capstone.
    color: '#e8c84a', rarityBonus: 0, biteIntervalMs: 2000, catchZoneBonus: 16,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: true, perfectZoneBonus: 3,
  },
  {
    tier: 16, name: 'Treasure Rod', cost: 200000, minLevel: 64,
    description: 'Lures the deep’s lost hoards — doubles your chance of hooking a crate.',
    color: '#e8b54a', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    crateChanceMult: 2,
    slug: 'rod_treasure', glow: true, glowType: 'sparkle',
  },
  {
    tier: 17, name: 'Perfect Rod', cost: 200000, minLevel: 68,
    description: 'Rewards flawless form — perfect catches grant double XP, and it scales with your streak.',
    color: '#bfe3ff', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    perfectXpMult: 2,
    slug: 'rod_perfect', glow: true, glowType: 'moon',
  },
  {
    tier: 18, name: 'Galaxy Rod', cost: 300000, minLevel: 72,
    description: 'Spun from cosmic thread. After any catch, open a wormhole and reroll it into a different fish from the same waters — fortune or folly, you take what surfaces.',
    color: '#a78bfa', rarityBonus: 0, biteIntervalMs: 2660, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    wormhole: true,
    slug: 'rod_galaxy', glow: true, glowType: 'galaxy',
  },
  {
    tier: 19, name: 'Lightsaber Rod', cost: 300000, minLevel: 76,
    description: 'A blade of pure energy. Fish are drawn to the light — most casts bite almost the instant your line touches the water.',
    color: '#ff3b47', rarityBonus: 0, biteIntervalMs: 2470, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    instantBiteChance: 0.35,
    slug: 'rod_lightsaber', glow: true, glowType: 'saber',
  },
]

export function getRod(tier: number): RodDef {
  return RODS.find(r => r.tier === tier) ?? RODS[0]
}

// ── Completionist Rod forge ───────────────────────────────────────────────────
// The Completionist (the 100%-completion reward) is a plain master-tool base;
// the player sockets up to 3 of their OWNED rods' unique effects into it,
// reconfigurable at will (rods are not consumed). The absorbed rod tiers live
// in profiles.completionist_effects; resolveCompletionistRod merges them.
export const COMPLETIONIST_TIER = 14
export const COMPLETIONIST_MAX_EFFECTS = 3

/** A rod carries a "unique effect" worth absorbing if it has any proc beyond
 *  plain speed / catch-zone. The forge only accepts these (Bamboo, Graphite,
 *  etc. have nothing to give). The Completionist itself is never absorbable. */
export function rodHasUniqueEffect(rod: RodDef): boolean {
  if (rod.tier === COMPLETIONIST_TIER) return false
  return (rod.rarityBonus ?? 0) > 0
    || (rod.doubleCatchChance ?? 0) > 0
    || (rod.retryOnMissChance ?? 0) > 0
    || (rod.jackpotChance ?? 0) > 0
    || (rod.crateChanceMult ?? 1) > 1
    || (rod.perfectXpMult ?? 1) > 1
    || !!rod.wormhole
    || (rod.instantBiteChance ?? 0) > 0
}

/** Short label for a rod's signature effect — drives the forge UI. */
export function rodEffectLabel(rod: RodDef): string {
  if ((rod.doubleCatchChance ?? 0) >= 1)    return 'Always double catch'
  if ((rod.doubleCatchChance ?? 0) > 0)     return `${Math.round(rod.doubleCatchChance! * 100)}% double catch`
  if ((rod.jackpotChance ?? 0) > 0)         return `×${rod.jackpotMultiplier} jackpot haul`
  if ((rod.rarityBonus ?? 0) >= 1)          return 'Strong rare bias'
  if ((rod.rarityBonus ?? 0) > 0)           return 'Rare bias'
  if ((rod.retryOnMissChance ?? 0) > 0)     return `${Math.round(rod.retryOnMissChance! * 100)}% retry on miss`
  if ((rod.crateChanceMult ?? 1) > 1)       return `${rod.crateChanceMult}× crate odds`
  if ((rod.perfectXpMult ?? 1) > 1)         return `${rod.perfectXpMult}× perfect XP`
  if (rod.wormhole)                         return 'Wormhole reroll'
  if ((rod.instantBiteChance ?? 0) > 0)     return `${Math.round(rod.instantBiteChance! * 100)}% instant bite`
  return ''
}

/** Resolve the Completionist's effective stats from absorbed rod tiers. Starts
 *  from its plain master-tool base and folds in each donor rod's unique proc(s);
 *  overlapping numerics take the stronger value. Caps at COMPLETIONIST_MAX_EFFECTS
 *  and ignores unknown / non-unique / duplicate tiers, so bad/forged data can
 *  never over-power the rod. Returns a fresh object (never mutates the def). */
export function resolveCompletionistRod(effectTiers: number[]): RodDef {
  const base = { ...getRod(COMPLETIONIST_TIER) }
  const seen = new Set<number>()
  for (const tier of effectTiers ?? []) {
    if (seen.has(tier) || seen.size >= COMPLETIONIST_MAX_EFFECTS || tier === COMPLETIONIST_TIER) continue
    const donor = RODS.find(r => r.tier === tier)
    if (!donor || !rodHasUniqueEffect(donor)) continue
    seen.add(tier)
    base.rarityBonus       = Math.max(base.rarityBonus ?? 0, donor.rarityBonus ?? 0)
    base.doubleCatchChance = Math.max(base.doubleCatchChance ?? 0, donor.doubleCatchChance ?? 0)
    base.retryOnMissChance = Math.max(base.retryOnMissChance ?? 0, donor.retryOnMissChance ?? 0)
    base.crateChanceMult   = Math.max(base.crateChanceMult ?? 1, donor.crateChanceMult ?? 1)
    base.perfectXpMult     = Math.max(base.perfectXpMult ?? 1, donor.perfectXpMult ?? 1)
    if ((donor.jackpotChance ?? 0) > (base.jackpotChance ?? 0)) {
      base.jackpotChance = donor.jackpotChance
      base.jackpotMultiplier = donor.jackpotMultiplier
    }
    if (donor.wormhole) base.wormhole = true
    if ((donor.instantBiteChance ?? 0) > (base.instantBiteChance ?? 0)) base.instantBiteChance = donor.instantBiteChance
  }
  return base
}

/** Effective rod def for a player: identical to getRod EXCEPT the Completionist,
 *  whose stats resolve from the player's absorbed effect tiers. Use this
 *  everywhere gameplay or display reads the equipped rod's stats — pass the
 *  player's profiles.completionist_effects. */
export function getEffectiveRod(tier: number, completionistEffects: number[] | null | undefined): RodDef {
  if (tier !== COMPLETIONIST_TIER) return getRod(tier)
  return resolveCompletionistRod(completionistEffects ?? [])
}

// ── Captain-only rods ────────────────────────────────────────────────────────
// The top end of the catalogue (anything in the cost >= 200k bracket) is
// reserved for Captains. Deliberately keyed off the PRICE bracket, NOT each
// rod's hand-tuned `minLevel` — so re-pacing unlock levels never silently
// changes who's Captain-locked. The current Captain set is Legendary, Treasure,
// Perfect, Galaxy, Lightsaber, YOLO (all >= 200k); Millionaire's (175k) is open.
export const CAPTAIN_ROD_MIN_LEVEL = 70
export function isCaptainRod(rod: RodDef): boolean {
  return !rod.earnedOnly && rod.cost > 0 && fishingLevelReqForCost(rod.cost) >= CAPTAIN_ROD_MIN_LEVEL
}

// ── YOLO Rod — per-zone jackpot odds ─────────────────────────────────────────
// The jackpot pays its full ×100 in every zone; the CHANCE is scaled per zone
// so the expected haul lands ~150k doubloons/hr everywhere instead of spiking
// in the richest zone. Richer zones earn more per catch, so they need a smaller
// chance to hit the same ceiling (and it kills the old "farm the Abyss to dodge
// the Ancient Deep cap" loophole). Tuned 2026-06-19 against live fish values +
// endgame catch rates; retune here if zone values change.
export const ZONE_JACKPOT_CHANCE: Record<string, number> = {
  shallows:     0.172,
  open_waters:  0.131,
  deep:         0.087,
  abyss:        0.042,
  ancient_deep: 0.013,
}

// ── TEMP toggle ──────────────────────────────────────────────────────────────
// true  → YOLO rod runs its ORIGINAL flat jackpot rate (rod.jackpotChance, ~10%)
//         in EVERY zone — the pre-nerf behavior, for a side-by-side test.
// false → live per-zone balance (ZONE_JACKPOT_CHANCE).
// Flip this one line + redeploy to switch back. Only YOLO-rod owners are
// affected, and effectively only Yoon has it.
export const YOLO_FLAT_RATE_TEST = false

/** Jackpot chance for a rod in a given zone. 0 unless the rod actually has a
 *  jackpot. Falls back to the rod's flat chance for any unlisted zone. */
export function jackpotChanceForZone(rod: RodDef, habitat: string): number {
  if (!rod.jackpotChance) return 0
  if (YOLO_FLAT_RATE_TEST) return rod.jackpotChance
  return ZONE_JACKPOT_CHANCE[habitat] ?? rod.jackpotChance
}
