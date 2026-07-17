// ──────────────────────────────────────────────────────────────────────────
// Locker Upgrades — permanent perks unlocked via the Davy Jones Gauntlet.
// ──────────────────────────────────────────────────────────────────────────
// Each upgrade is gated TWO ways: you must have reached a depth milestone in
// the Gauntlet, AND pay a one-time cost in Fathoms — the Gauntlet's own
// meta-currency, earned only by descending (see fathomsForDepth in lib/gauntlet
// and the cash-out / death paths in gauntlet/actions). Claimed ids live in
// profiles.gauntlet_upgrades; their effects are derived here so combat / stat /
// voyage code reads a number or a boolean, never a hardcoded id.
//
// This is the roguelite meta-progression loop: descend → earn Fathoms → buy
// permanent power → descend deeper. Add a new upgrade by appending to
// GAUNTLET_UPGRADES and wiring its effect into the matching helper below (and
// the path that reads it).

/** Where an upgrade's effect lands — drives a small label on the card. */
export type UpgradeScope =
  | 'account'  // applies in every raid
  | 'world'    // applies out in the wider game (voyages, fishing…)
  | 'gauntlet' // applies only to Gauntlet runs

/** Which part of the wider game a Ship & Shore upgrade touches — groups the
 *  shop into sections. Run Upgrades (scope 'gauntlet') don't carry one. */
export type UpgradeCategory = 'voyages' | 'raids' | 'fishing'

export interface GauntletUpgrade {
  id: string
  name: string
  /** Plain-language effect, shown on the upgrade card. */
  description: string
  /** Deepest depth the player must have reached in the Gauntlet to claim. */
  depthRequired: number
  /** One-time cost in Fathoms. */
  cost: number
  scope: UpgradeScope
  /** Ship & Shore section this lands in. */
  category?: UpgradeCategory
}

export const GAUNTLET_UPGRADES: GauntletUpgrade[] = [
  // ── Run Upgrades (scope 'gauntlet') — only touch Gauntlet runs. NO depth
  //    gate: cost is the only ladder, capped at 100. The boosts that bank MAIN-
  //    GAME currency (Nav XP, doubloons) cost the most since that value carries
  //    out of the Gauntlet; the run-only combat/QoL perks are cheaper. Ordered
  //    cheap → expensive so the shop reads as a clean ladder. ────────────────
  {
    id: 'calm_before',
    name: 'Calm Before',
    description: "The Locker's first curse passes you by. You descend uncursed until the second.",
    depthRequired: 0,
    cost: 30,
    scope: 'gauntlet',
  },
  {
    id: 'diving_bell',
    name: 'Diving Bell',
    description: 'Start every Gauntlet run with 15% more max HP.',
    depthRequired: 0,
    cost: 45,
    scope: 'gauntlet',
  },
  {
    id: 'sounding_line',
    name: 'Sounding Line',
    description: 'Before each dive, you can read what waits below: a lone hull, an elite and its trick, or a boss.',
    depthRequired: 0,
    cost: 45,
    scope: 'gauntlet',
  },
  {
    // The economy accelerator — priced cheap + early on purpose so a smart
    // player grabs it first and it actually speeds the rest of the grind (its
    // whole point). Bonus trimmed 50% → 33% to match the lower price.
    id: 'lucky_locker',
    name: 'Lucky Locker',
    description: 'Earn 33% more Fathoms from every dive, win or lose.',
    depthRequired: 0,
    cost: 50,
    scope: 'gauntlet',
  },
  {
    id: 'second_cast',
    name: 'Second Cast',
    description: 'Once per power draft, throw the offered boons back and draw three fresh ones.',
    depthRequired: 0,
    cost: 60,
    scope: 'gauntlet',
  },
  {
    id: 'salt_ward',
    name: 'Salt Ward',
    description: "Once per curse the Locker lays on you, throw it back and force a different one. The new curse could be milder, or worse — it's a gamble.",
    depthRequired: 0,
    cost: 65,
    scope: 'gauntlet',
  },
  {
    id: 'iron_hide',
    name: 'Iron Hide',
    description: 'Take 10% less damage from every enemy for the whole Gauntlet run.',
    depthRequired: 0,
    cost: 65,
    scope: 'gauntlet',
  },
  {
    id: 'gunners_eye',
    name: "Gunner's Eye",
    description: 'Deal 10% more damage to every enemy for the whole Gauntlet run.',
    depthRequired: 0,
    cost: 65,
    scope: 'gauntlet',
  },
  {
    // Per-kill heal compounds over a long run — the strongest sustain perk, so
    // it sits above the flat combat perks on price.
    id: 'vigor',
    name: 'Vigor',
    description: 'Patch up 8% of your max HP each time you sink a ship in the Gauntlet.',
    depthRequired: 0,
    cost: 70,
    scope: 'gauntlet',
  },
  {
    id: 'veterans_start',
    name: "Veteran's Start",
    description: 'Begin every dive at depth 5: tougher ships, with boons and curses sooner. Pot, chests and Fathoms still count only the ships you sink, so it is no reward shortcut.',
    depthRequired: 0,
    cost: 75,
    scope: 'gauntlet',
  },
  {
    id: 'diviners_charm',
    name: "Diviner's Charm",
    description: 'The deep deals you a better hand. Rare and Legendary boons surface far more often when you draft.',
    depthRequired: 0,
    cost: 75,
    scope: 'gauntlet',
  },
  {
    id: 'salvagers_eye',
    name: "Salvager's Eye",
    description: 'Bank 15% more doubloons every time you cash out a Gauntlet run.',
    depthRequired: 0,
    cost: 90,
    scope: 'gauntlet',
  },
  {
    id: 'navigators_log',
    name: "Navigator's Log",
    description: 'Earn 20% more Nav XP every time you cash out a Gauntlet run.',
    depthRequired: 0,
    cost: 100,
    scope: 'gauntlet',
  },
  // ── Ship & Shore (scope 'account'/'world') — PERMANENT power for the wider
  //    game (raids, voyages, fishing forever). Cost ≈ gate × 10 — the depth
  //    requirement is the real limiter, so Fathoms are a modest top-up, not a
  //    second grind wall. Tireless Catcher is the exception (110, under its
  //    ladder spot): its depth-16 gate already does plenty of gating. ─────────
  {
    id: 'safe_voyages',
    name: 'Safe Passage',
    description: 'Your crew never dies on voyages. Sail any route risk-free.',
    depthRequired: 8,
    cost: 80,
    scope: 'world',
    category: 'voyages',
  },
  {
    id: 'cannonball_rack',
    name: 'Extra Cannonball Rack',
    description: 'Hold 4 cannonballs in raids instead of 3, so one stays loaded right after you fire a volley.',
    depthRequired: 10,
    cost: 100,
    scope: 'account',
    category: 'raids',
  },
  {
    // The big one — priced ABOVE the gate×10 rule (would be 120) because it's a
    // major capability, not a stat nudge: it unlocks the whole forge system,
    // letting players fuse raid-item recipes into one slot (more recipes land
    // over time). Gated deep + dear so it reads as a milestone unlock.
    id: 'forge',
    name: 'The Forge',
    description: 'Unlock the Forge at your ship loadout: fuse a recipe’s component items into one, stacking both effects into a single slot. New recipes are added over time.',
    depthRequired: 30,
    cost: 200,
    scope: 'account',
    category: 'raids',
  },
  {
    id: 'swift_sails',
    name: 'Swift Sails',
    description: 'Your crew voyages return 30% faster — less waiting, more sailing.',
    depthRequired: 12,
    cost: 120,
    scope: 'world',
    category: 'voyages',
  },
  {
    id: 'seasoned_timbers',
    name: 'Seasoned Timbers',
    description: 'Your repair kit patches you up 25% more in every raid.',
    depthRequired: 14,
    cost: 140,
    scope: 'account',
    category: 'raids',
  },
  {
    id: 'tireless_catcher',
    name: 'Tireless Catcher',
    description: 'Your Auto Catcher reels in rare fish on its own too, not just commons and uncommons.',
    depthRequired: 16,
    cost: 110,
    scope: 'world',
    category: 'fishing',
  },
]

export function getGauntletUpgrade(id: string): GauntletUpgrade | null {
  return GAUNTLET_UPGRADES.find(u => u.id === id) ?? null
}

/** Run Upgrades (scope 'gauntlet') are the only upgrades a player can switch
 *  off — they shape a dive, so opting out is a real playstyle choice (e.g.
 *  starting from depth 1 instead of Veteran's Start). Ship & Shore permanents
 *  are always on. One source of truth for the toggle UI + the server guard. */
export function isToggleableUpgrade(id: string): boolean {
  return getGauntletUpgrade(id)?.scope === 'gauntlet'
}

/** The owned upgrades that actually apply this dive: everything claimed, minus
 *  the Run Upgrades the player has switched off. Effect helpers below all read
 *  this list, so a disabled upgrade contributes nothing (start depth, combat
 *  mods, cash-out multipliers) while staying purchased. Non-gauntlet ids can't
 *  be in `off`, so Ship & Shore power is never filtered out. */
export function activeGauntletUpgrades(
  owned: string[] | null | undefined,
  off: string[] | null | undefined,
): string[] {
  const disabled = off ?? []
  if (disabled.length === 0) return owned ?? []
  return (owned ?? []).filter(id => !disabled.includes(id))
}

/** Upgrade ids that are built but NOT live for players yet — surfaced in the
 *  shop with a Coming Soon lock (no price, can't buy) and rejected at claim
 *  time. One source of truth for the client card + the server guard. */
export const COMING_SOON_UPGRADES = new Set<string>([])

export function isUpgradeComingSoon(id: string): boolean {
  return COMING_SOON_UPGRADES.has(id)
}

/** Extra player cannonball capacity (max charges) granted by claimed upgrades.
 *  Volley cost is unchanged — these are reserve slots. */
export function bonusChargeSlots(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('cannonball_rack') ? 1 : 0
}

/** Safe Passage: when owned, voyages never roll a crew casualty. */
export function hasSafeVoyages(unlocked: string[] | null | undefined): boolean {
  return (unlocked ?? []).includes('safe_voyages')
}

/** The Forge: gates the raid-item forge (combine recipes into one slot). Both
 *  the loadout UI and the forgeRaidItem server action check this. */
export function hasForge(unlocked: string[] | null | undefined): boolean {
  return (unlocked ?? []).includes('forge')
}

/** Seasoned Timbers: repair-kit heal multiplier in EVERY raid (account-wide). */
export function gauntletRepairHealMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('seasoned_timbers') ? 1.25 : 1
}

/** Swift Sails: voyage-duration multiplier (lower = faster). */
export function gauntletVoyageSpeedMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('swift_sails') ? 0.7 : 1
}

/** Tireless Catcher: the Auto Catcher also auto-reels rare fish (bite tier 3). */
export function gauntletAutoCatchRares(unlocked: string[] | null | undefined): boolean {
  return (unlocked ?? []).includes('tireless_catcher')
}

/** Salvager's Eye: doubloon multiplier applied to a Gauntlet cash-out haul. */
export function gauntletHaulMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('salvagers_eye') ? 1.15 : 1
}

/** Navigator's Log: Nav XP multiplier on a Gauntlet cash-out. */
export function gauntletXpMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('navigators_log') ? 1.2 : 1
}

/** Lucky Locker: multiplier on Fathoms earned per run (cash-out AND death). */
export function gauntletFathomsMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('lucky_locker') ? 1.33 : 1
}

/** Diving Bell: max-HP multiplier applied for the whole Gauntlet run. */
export function gauntletRunHpMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('diving_bell') ? 1.15 : 1
}

/** Veteran's Start: the COMBAT depth the run opens at (enemies + boon/curse
 *  cadence + the displayed depth). Rewards stay keyed to ships actually sunk,
 *  so this never inflates pot / chests / Fathoms / record. */
export function gauntletStartDepth(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('veterans_start') ? 5 : 1
}

/** The depth offset Veteran's Start adds to the combat depth (0 without it). */
export function gauntletSkipOffset(unlocked: string[] | null | undefined): number {
  return gauntletStartDepth(unlocked) - 1
}

/** Calm Before: the Locker's first curse milestone passes without a curse. */
export function gauntletSkipsFirstCurse(unlocked: string[] | null | undefined): boolean {
  return (unlocked ?? []).includes('calm_before')
}

/** Iron Hide: damageTakenPct mod folded into the run's RaidMods. NEGATIVE =
 *  less damage (matches the crewEffects convention; RaidCombat applies it as
 *  1 + pct/100, so -10 → ×0.9 incoming). */
export function gauntletDamageTakenMod(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('iron_hide') ? -10 : 0
}

/** Gunner's Eye: bonus damage % DEALT during Gauntlet runs (into runRaidMods). */
export function gauntletDamageMod(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('gunners_eye') ? 10 : 0
}

/** Vigor: fraction of max HP restored after each enemy sunk in a run. */
export function gauntletKillHealPct(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('vigor') ? 0.08 : 0
}

/** Sounding Line: when owned, the breather reveals the next fight (lone hull /
 *  elite + affix / boss) before the player commits to the dive. */
export function gauntletHasSoundingLine(unlocked: string[] | null | undefined): boolean {
  return (unlocked ?? []).includes('sounding_line')
}

/** Diviner's Charm: multiplier on the draft weight of the non-Common boon
 *  rarities (Rare + Legendary), so good boons are offered more often. */
export function gauntletBoonLuck(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('diviners_charm') ? 1.7 : 1
}

/** Second Cast: how many times the player may reroll the offered boons per draft. */
export function gauntletBoonRerolls(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('second_cast') ? 1 : 0
}

/** Salt Ward: how many times the player may reroll a curse the Locker imposes. */
export function gauntletCurseRerolls(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('salt_ward') ? 1 : 0
}
