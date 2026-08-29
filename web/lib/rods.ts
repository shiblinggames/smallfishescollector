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
  /**
   * NOT SOLD ASHORE. The tackle shop will not list it and buyRod refuses it;
   * the only place it changes hands is a rare trader out on the chart, at
   * night, in deep water.
   *
   * Chosen from the prestige end on purpose. These are still Completionist
   * donors, so the build is now partly an exploration problem rather than
   * purely a saving one — which is the point of them being rare, but it does
   * mean anything moved here has to stay genuinely findable. The rare traders
   * appear every night, not once a week.
   */
  traderOnly?: boolean
  description: string
  color: string
  rarityBonus: number      // shifts rarity distribution toward rares (0 = no effect)
  biteIntervalMs: number   // time between bite opportunities (lower = faster)
  catchZoneBonus: number   // degrees added to catch zone
  doubleCatchChance: number  // chance to catch 2 fish on a successful catch (0–1)
  retryOnMissChance: number  // chance to retry the dial on miss or snag (0–1)
  snagImmune: boolean        // if true, snag zones count as miss — no extra bait lost
  /** DEPRECATED, AND IT MUST STAY 0 ON EVERY ROD.
   *  The perfect zone is deliberately the one width no gear touches: it is the
   *  skill floor the whole fishing game is measured against, and a rod that
   *  widened it would be buying accuracy rather than rewarding it. The
   *  Completionist carried +3 here by oversight; that is gone. Kept on the type
   *  only so the existing display/filter plumbing still compiles. */
  perfectZoneBonus: number
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
  // Streak-scaling "Locked-In Rod": its power grows with the player's live
  // perfect streak (see lockedInState below). Applied server-side off
  // profiles.current_perfect_streak, cheat-proof; the client reads the same pure
  // helper for the glow/HUD. One miss resets the streak → the rod drops to base.
  lockedIn?: boolean
  // Sold by one of the sea's regulars at full rapport rather than by a
  // wandering runner. Keeps them out of RUNNER_RODS; who sells which is
  // written on the person, in lib/seaFolk.ts.
  soldByFolk?: boolean
  // 3-pose sprite slug. Loads /{slug}_rest.png / _wait.png / _cast.png.
  // Every rod's source sheet is sliced into raw quadrants by web/slice-rod.mjs
  // so a single CHAR_ROD_OVERLAY position applies to all of them.
  slug?: string
  imageUrl?: string          // legacy single-sprite fallback (deprecated; kept for rods without 3-pose art)
  glow?: boolean             // enable any glow aura at all
  // Theme of the glow effect. Driven by per-keyframe CSS in globals.css
  // (rod-glow-fire / sparkle / electric for marquee rods; moon / tech as
  // subtler accents). Falls back to the generic .rod-glow pulse when omitted.
  glowType?: 'fire' | 'sparkle' | 'electric' | 'moon' | 'tech' | 'galaxy' | 'saber' | 'forge' | 'prismatic' | 'lockedin'
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
    description: 'Responsive and fast. Bites come a little quicker than the baseline.',
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
    description: 'Carved from driftwood blessed by a full moon. Quicker bites and a wider catch window.',
    color: '#a78bfa', rarityBonus: 0, biteIntervalMs: 3420, catchZoneBonus: 10,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_moonwood', glow: true, glowType: 'moon',
  },
  {
    tier: 6, name: 'Graphite Rod', cost: 22000, minLevel: 28,
    description: 'Lightweight and stiff. Noticeably quicker bites.',
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
    description: 'Precision-engineered for quick, snappy bites.',
    color: '#4ade80', rarityBonus: 0, biteIntervalMs: 2470, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_carbon', glow: true, glowType: 'tech',
  },
  {
    tier: 9, name: 'Deep Diver', cost: 90000, minLevel: 48,
    description: 'Built for the abyss. Fast bites and a wide catch window.',
    color: '#22d3ee', rarityBonus: 0, biteIntervalMs: 2356, catchZoneBonus: 13,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    slug: 'rod_deepdiver',
  },
  {
    tier: 10, name: 'Legendary Rod', cost: 200000, minLevel: 60,
    description: 'Forged from the mast of a sunken galleon. Faster bites, and the rarest fish cannot resist.',
    // rarityBonus 1.50 → 0.80 (2026-07-23): at 1.50 this was the ONLY rod that
    // shifted the rarity curve (tier-5 ×7 weight), and since prestige is gated on
    // catching every species, it was a ~3.3x accelerant on the rarest-fish
    // bottleneck with zero competition. 0.80 keeps it the best rare rod (~2.6x)
    // without being a mandatory god-rod. Also softens its trophy-chance multiplier
    // (1+bonus*4: ×7 → ×4.2). Tunable here — single source of truth.
    color: '#ff6b35', rarityBonus: 0.80, biteIntervalMs: 2280, catchZoneBonus: 0,
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
    tier: 15, name: 'YOLO Rod', cost: 1000000, minLevel: 80, traderOnly: true,
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
    slug: 'rod_completionist', glow: true, glowType: 'prismatic',
    color: '#e8c84a', rarityBonus: 0, biteIntervalMs: 2000, catchZoneBonus: 16,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: true, perfectZoneBonus: 0,
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
    tier: 18, name: 'Galaxy Rod', cost: 300000, minLevel: 72, traderOnly: true,
    description: 'Spun from cosmic thread. After any catch, open a wormhole and reroll it into a different fish from the same waters — fortune or folly, you take what surfaces.',
    color: '#a78bfa', rarityBonus: 0, biteIntervalMs: 2660, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    wormhole: true, soldByFolk: true,
    slug: 'rod_galaxy', glow: true, glowType: 'galaxy',
  },
  {
    tier: 19, name: 'Lightsaber Rod', cost: 300000, minLevel: 76, traderOnly: true,
    description: 'A blade of pure energy. Fish are drawn to the light — most casts bite almost the instant your line touches the water.',
    color: '#ff3b47', rarityBonus: 0, biteIntervalMs: 2470, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    instantBiteChance: 0.35, soldByFolk: true,
    slug: 'rod_lightsaber', glow: true, glowType: 'saber',
  },
  {
    tier: 20, name: "Yoon's Locked-In Rod", cost: 350000, minLevel: 75,
    description: 'Rewards a hot hand. Chain perfect catches to LOCK IN: 3 in a row quickens your bites, 5 lands a triple haul on every catch, and 10 quickens them further into a rare-fish frenzy. Hold the streak to keep it all — one miss and you start over.',
    // Baseline is a plain, capable rod; ALL of the power comes from the streak
    // stages (lockedInState), applied server-side off current_perfect_streak.
    color: '#c084fc', rarityBonus: 0, biteIntervalMs: 3000, catchZoneBonus: 0,
    doubleCatchChance: 0, retryOnMissChance: 0, snagImmune: false, perfectZoneBonus: 0,
    lockedIn: true,
    /**
     * YOON SELLS THIS. NOBODY ELSE DOES.
     *
     * `traderOnly` takes it out of the tackle shop's catalogue entirely: the
     * rod is named after him, and a rod named after somebody that you buy off a
     * shelf is just a rod with a name on it. He is moored in the Ancient Deep —
     * the same Fishing 75 the rod itself asks for — so getting it means sailing
     * the whole chart and finding him.
     *
     * The 350,000 is unchanged. The cost of this rod was never the money.
     */
    traderOnly: true,
    // Glow is dynamic (cyan→gold→prismatic by streak) and driven client-side; the
    // static glowType is the streak-0 baseline.
    slug: 'rod_yoons', glow: true, glowType: 'lockedin',
  },
]

// ── The Locked-In Rod's streak stages ───────────────────────────────────────
// Pure + shared: the SERVER applies these off profiles.current_perfect_streak at
// cast time (cheat-proof), and the CLIENT calls the same helper off its mirrored
// streak to drive the glow, the "LOCKED IN" HUD, and the triple-catch treatment.
// Effects are cumulative and held only while the streak holds; a miss resets the
// streak to 0 and the rod drops straight back to baseline. Tunable in ONE place.
export const LOCKED_IN = {
  speedStreak:   3,     // stage 1: faster bites
  speedWaitMult: 0.80,  //          −20% bite wait
  tripleStreak:  5,     // stage 2: guaranteed triple haul
  tripleQty:     3,
  frenzyStreak:  10,    // stage 3: −35% bite wait + rare-fish bias
  frenzyWaitMult: 0.65,
  frenzyRarityBonus: 1.0,
} as const

export interface LockedInState {
  stage: 0 | 1 | 2 | 3   // 0 base · 1 speed · 2 +triple · 3 +frenzy (LOCKED IN)
  waitMult: number       // rod bite-wait multiplier from the streak (1 = base)
  catchQty: number       // guaranteed fish per catch (1, or 3 at stage 2+)
  rarityBonus: number    // added to the rod's rarity bias (0 until stage 3)
}

/** The Locked-In Rod's active effects at a given live perfect streak. Identity
 *  (stage 0, no bonuses) for any other rod, or below the first threshold. */
export function lockedInState(rod: RodDef | { lockedIn?: boolean }, streak: number): LockedInState {
  const base: LockedInState = { stage: 0, waitMult: 1, catchQty: 1, rarityBonus: 0 }
  if (!rod?.lockedIn) return base
  let s = base
  if (streak >= LOCKED_IN.speedStreak)  s = { ...s, stage: 1, waitMult: LOCKED_IN.speedWaitMult }
  if (streak >= LOCKED_IN.tripleStreak) s = { ...s, stage: 2, catchQty: LOCKED_IN.tripleQty }
  if (streak >= LOCKED_IN.frenzyStreak) s = { ...s, stage: 3, waitMult: LOCKED_IN.frenzyWaitMult, rarityBonus: LOCKED_IN.frenzyRarityBonus }
  return s
}

export function getRod(tier: number): RodDef {
  return RODS.find(r => r.tier === tier) ?? RODS[0]
}

// ── Bite speed (made real 2026-07-23, but deliberately gentle) ────────────────
// biteIntervalMs was DISPLAY-ONLY for years — the wait calc never read it, so
// every "X% faster bites" claim was fiction. Rather than delete the claims (which
// leaves 3 rods with no effect at all), we make a FRACTION of the display speed
// real. Only a quarter lands, so a rod nudges bite wait without competing with the
// two real speed levers: BAIT stays primary (best bait -45%), then fishing level
// (-33%), then the rod (top rod ~-10%). Tune the whole system with this one knob.
export const ROD_WAIT_SCALE = 0.25

/** Multiplier a rod applies to the base bite wait (<1 = faster, >1 = slower).
 *  A quarter of the rod's display speed, railed so no rod can rival bait/level. */
export function rodWaitMult(rod: RodDef): number {
  const implied = (3800 - rod.biteIntervalMs) / 3800   // + faster · - slower
  return Math.max(0.85, Math.min(1.10, 1 - ROD_WAIT_SCALE * implied))
}

/** The REAL speed a rod gives as a signed % (positive = faster). Drives the
 *  shop/gear display so the shown number matches what actually happens now. */
export function rodSpeedPct(rod: RodDef): number {
  return Math.round((1 - rodWaitMult(rod)) * 100)
}

/** Tiers of every rod that can be BOUGHT — excludes the free Bamboo starter
 *  (cost 0) and the earned-only Completionist. Drives the "own every rod"
 *  badge; auto-grows as new purchasable rods ship. */
export const BUYABLE_ROD_TIERS: number[] = RODS.filter(r => !r.earnedOnly && !r.traderOnly && r.cost > 0).map(r => r.tier)

/** Rods the shop will not sell. The rare traders read this rather than a list
 *  of their own, so moving a rod on or off the shelf is one flag in one place. */
/**
 * WHAT A ROD FETCHES BACK, as a fraction of what it cost.
 *
 * Lived as a private const inside the tackle shop's `'use server'` actions
 * file, which meant the shop's own UI could not read it to print the number on
 * the button — and a 'use server' file SILENTLY DROPS every non-async export,
 * so exporting it from there would have compiled and then been undefined at
 * runtime. It is a constant, so it belongs in a plain module beside the rods it
 * prices.
 */
export const ROD_SELL_RATE = 0.65

/**
 * WHAT A BLOCKADE RUNNER MIGHT BE CARRYING.
 *
 * `traderOnly` only means "not on a shop shelf", and three rods carry it. Two
 * of those three are now the last thing two of the regulars will do for you
 * once you have maxed your rapport with them, the way Yoon's rod always was —
 * so they cannot also turn up on a stranger in the dark, or the friendship is
 * just the slow way to buy something. The runner keeps the YOLO Rod, which
 * belongs to nobody.
 */
export const RUNNER_RODS = RODS.filter(r => r.traderOnly && !r.soldByFolk)

// ── Completionist Rod forge ───────────────────────────────────────────────────
// The Completionist (the 100%-completion reward) is a plain master-tool base;
// the player sockets up to 3 of their OWNED rods' unique effects into it,
// reconfigurable at will (rods are not consumed). The absorbed rod tiers live
// in profiles.completionist_effects; resolveCompletionistRod merges them.
export const COMPLETIONIST_TIER = 14
export const COMPLETIONIST_MAX_EFFECTS = 3
// Flat doubloon fee to RE-forge (change effects) after the free first forge.
export const REFORGE_COST = 50_000

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

// ── Forge: is this donor actually worth a socket? ────────────────────────────
// resolveCompletionistRod merges donors with Math.max PER FIELD, so two rods
// whose signature lands on the same field do not stack: the stronger one wins
// and the weaker one burns a socket for nothing. The Telescoping Rod (+0.10 rare
// bias) next to the Legendary Rod (+0.80) is the clearest case, and the forge
// gave no sign of it -- both simply read as a rare-bias effect.
//
// Fields split by what "no effect" means for them: 0 for chances and bonuses,
// 1 for multipliers.
const DONOR_ZERO_FIELDS = ['rarityBonus', 'doubleCatchChance', 'retryOnMissChance', 'jackpotChance', 'instantBiteChance'] as const
const DONOR_MULT_FIELDS = ['crateChanceMult', 'perfectXpMult'] as const

/** Would socketing this rod alongside `otherTiers` change the resolved rod at
 *  all? False means every effect it carries is already matched or beaten. */
export function completionistDonorAdds(donorTier: number, otherTiers: number[]): boolean {
  const donor = RODS.find(r => r.tier === donorTier)
  if (!donor || !rodHasUniqueEffect(donor)) return false
  const merged = resolveCompletionistRod(otherTiers.filter(t => t !== donorTier))
  for (const f of DONOR_ZERO_FIELDS) if ((donor[f] ?? 0) > (merged[f] ?? 0)) return true
  for (const f of DONOR_MULT_FIELDS) if ((donor[f] ?? 1) > (merged[f] ?? 1)) return true
  if (donor.wormhole && !merged.wormhole) return true
  return false
}

/** WHO is already covering it, so the forge can name the rod rather than just
 *  greying a row out. Returns a single rod's name where one covers the lot,
 *  otherwise null for "between them, your other picks". */
export function completionistDonorCoveredBy(donorTier: number, otherTiers: number[]): string | null {
  const donor = RODS.find(r => r.tier === donorTier)
  if (!donor) return null
  for (const t of otherTiers) {
    if (t === donorTier) continue
    const other = RODS.find(r => r.tier === t)
    if (!other) continue
    const covers =
      DONOR_ZERO_FIELDS.every(f => (other[f] ?? 0) >= (donor[f] ?? 0))
      && DONOR_MULT_FIELDS.every(f => (other[f] ?? 1) >= (donor[f] ?? 1))
      && (!donor.wormhole || !!other.wormhole)
    if (covers) return other.name
  }
  return null
}

/** Effective rod def for a player: identical to getRod EXCEPT the Completionist,
 *  whose stats resolve from the player's absorbed effect tiers. Use this
 *  everywhere gameplay or display reads the equipped rod's stats — pass the
 *  player's profiles.completionist_effects. */
export function getEffectiveRod(tier: number, completionistEffects: number[] | null | undefined): RodDef {
  if (tier !== COMPLETIONIST_TIER) return getRod(tier)
  return resolveCompletionistRod(completionistEffects ?? [])
}

/** Split a rod's stat labels into its fixed BASE (speed / catch-zone / perfect-
 *  zone / snag-immunity) and its proc effects. For the Completionist those procs
 *  are FORGED IN from socketed rods, so the split reads as "base vs forged"; for
 *  every other rod its procs are its own identity, so `forged` is empty and they
 *  fold into `base`. One source of truth so every display groups it the same way. */
export function rodStatSplit(rod: RodDef): { base: string[]; forged: string[] } {
  const isComp = rod.tier === COMPLETIONIST_TIER
  const base: string[] = []
  const forged: string[] = []
  const proc = isComp ? forged : base   // procs are "forged" only on the Completionist

  const sp = rodSpeedPct(rod)
  if (sp > 0) base.push(`${sp}% faster bites`)
  if ((rod.catchZoneBonus ?? 0) > 0) base.push(`+${rod.catchZoneBonus}° catch zone`)
  if ((rod.perfectZoneBonus ?? 0) > 0) base.push(`+${rod.perfectZoneBonus}° perfect zone`)
  if (rod.snagImmune) base.push('Snag immune')

  if ((rod.doubleCatchChance ?? 0) >= 1) proc.push('Always double catch')
  else if ((rod.doubleCatchChance ?? 0) > 0) proc.push(`${Math.round(rod.doubleCatchChance! * 100)}% double catch`)
  if ((rod.retryOnMissChance ?? 0) > 0) proc.push(`${Math.round(rod.retryOnMissChance! * 100)}% retry on miss`)
  if ((rod.rarityBonus ?? 0) > 0) proc.push(`+${Math.round(rod.rarityBonus! * 100)}% rare bias`)
  if ((rod.jackpotChance ?? 0) > 0) proc.push(`×${rod.jackpotMultiplier} jackpot`)
  if ((rod.crateChanceMult ?? 1) > 1) proc.push(`${rod.crateChanceMult}× crate odds`)
  if ((rod.perfectXpMult ?? 1) > 1) proc.push(`${rod.perfectXpMult}× perfect XP`)
  if (rod.wormhole) proc.push('Wormhole reroll')
  if ((rod.instantBiteChance ?? 0) > 0) proc.push(`${Math.round(rod.instantBiteChance! * 100)}% instant bite`)

  return { base, forged }
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
// so the expected haul lands ~175k doubloons/hr everywhere instead of spiking
// in the richest zone. Richer zones earn more per catch, so they need a smaller
// chance to hit the same ceiling (and it kills the old "farm the Abyss to dodge
// the Ancient Deep cap" loophole). Tuned 2026-06-19 against live fish values +
// endgame catch rates (bumped 150k -> 175k on 2026-06-25); retune if values change.
export const ZONE_JACKPOT_CHANCE: Record<string, number> = {
  shallows:     0.203,
  open_waters:  0.155,
  deep:         0.103,
  abyss:        0.050,
  ancient_deep: 0.015,
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
