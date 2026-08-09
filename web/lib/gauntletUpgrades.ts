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

/** Which part of the wider game a Permanent Upgrades upgrade touches — groups the
 *  shop into sections. Run Upgrades (scope 'gauntlet') don't carry one. */
export type UpgradeCategory = 'voyages' | 'raids' | 'fishing'

/** Which Gauntlet's Locker sells this upgrade. Omitted = Davy's (the original).
 *  Don's Gauntlet has a FULLY SEPARATE, bespoke tree (own ids, own column
 *  `dons_gauntlet_upgrades`) — see the DON entries below. The two never mix in
 *  a shop; a run reads only its own variant's catalog + column. */
export type UpgradeGauntlet = 'davy' | 'don'

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
  /** Permanent Upgrades section this lands in. */
  category?: UpgradeCategory
  /** Which Gauntlet's Locker this belongs to (omitted = Davy's). */
  gauntlet?: UpgradeGauntlet
  /** Painted art for the MILESTONE unlocks, and the flag that marks them.
   *
   *  Most upgrades are a number getting bigger and read fine as a line of text.
   *  The Forge chain is not: each step opens a whole system with its own board,
   *  and buried in a list of stat nudges it read as one more nudge. Carrying
   *  art is what separates "this changes a number" from "this opens a place",
   *  so the shop treats any upgrade WITH art as featured: bigger card, its
   *  picture, and sorted to the top of its section. Reuse the art the system
   *  already ships rather than drawing shop-only icons, so the card and the
   *  place it unlocks are visibly the same thing. */
  art?: string
  /** Another upgrade id that must be owned first (checked across BOTH Lockers
   *  for account/world perks, so a Don's upgrade can build on a Davy's one). */
  requires?: string
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
    description: "Once per curse the Locker lays on you, throw it back and force a different one. The new curse could be milder, or worse. It's a gamble.",
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
  // ── Permanent Upgrades (scope 'account'/'world') — PERMANENT power for the wider
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
    art: '/forge/forge.png',
  },
  {
    id: 'swift_sails',
    name: 'Swift Sails',
    description: 'Your crew voyages return 30% faster. Less waiting, more sailing.',
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

  // ══ DON'S GAUNTLET — a FULLY SEPARATE, bespoke Locker (gauntlet: 'don') ══════
  // Own ids (dg_*), own column (dons_gauntlet_upgrades), own depth gates (read
  // against dons_gauntlet_deepest). Priced DEAR — Don's is the endgame grind and
  // drops 2× Fathoms, so its Locker costs run well above Davy's. The effect
  // CHANNELS reuse the same helpers below (each gains a dg_* branch) — a run
  // reads only one column, so the ids never collide. Themed to the ghost fleet +
  // the Ch3/4 threat. Catalog order is grouped by theme; the shop sorts the run
  // list by cost at render, so new entries can be appended anywhere.
  // ── Run Upgrades (scope 'gauntlet') ─────────────────────────────────────────
  { id: 'dg_calm',         name: 'Uncursed Descent', description: "The Locker's first curse passes you by. You descend clean until the second.", depthRequired: 0,  cost: 90,  scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_hp',           name: 'Deep Lungs',       description: 'Start every dive with 20% more max HP. A bigger hull for a nastier deep.',      depthRequired: 0,  cost: 140, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_hp_2',         name: 'Deep Lungs II',    description: 'Deepen your hull: start every dive with 35% more max HP instead.',                depthRequired: 4,  cost: 240, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_hp' },
  { id: 'dg_hp_3',         name: 'Deep Lungs III',   description: 'The deepest hull: start every dive with 50% more max HP.',                         depthRequired: 10, cost: 380, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_hp_2' },
  { id: 'dg_peek',         name: 'Ghostlight',       description: 'Before each dive, read what waits below: a lone hull, an elite and its trick, or a boss.', depthRequired: 0, cost: 140, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_fathoms',      name: 'Spoils of the Deep', description: 'Earn 40% more Fathoms from every dive, win or lose. A real early investment that pays for itself over the grind.', depthRequired: 0, cost: 300, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_reroll_boon',  name: 'Rechamber',        description: 'Once per power draft, throw the offered boons back and draw three fresh ones.',  depthRequired: 0,  cost: 175, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_reroll_boon_2', name: 'Rechamber II',    description: 'Twice per power draft, throw the offered boons back and draw three fresh ones.',  depthRequired: 8,  cost: 300, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_reroll_boon' },
  { id: 'dg_reroll_curse', name: 'Break the Hex',    description: "Once per curse the Locker lays on you, throw it back and force a different one. Could be milder, could be worse.", depthRequired: 0, cost: 190, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_reroll_curse_2', name: 'Break the Hex II', description: 'Twice per curse the Locker lays on you, throw it back and force a different one.', depthRequired: 8, cost: 320, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_reroll_curse' },
  { id: 'dg_boon_filter',  name: 'Blacklist',        description: 'Once per dive, banish one offered boon for good. Mark it on any power draft and it never surfaces again for the rest of the run. Cut the dead weight so the good draws come up more often.', depthRequired: 0, cost: 200, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_boon_filter_2', name: 'Blacklist II',    description: 'Banish up to two boons per dive instead of one. Shape the pool harder toward the build you want.', depthRequired: 8, cost: 320, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_boon_filter' },
  { id: 'dg_armor',        name: 'Spectral Plate',   description: 'Take 12% less damage from every enemy for the whole dive.',                       depthRequired: 0,  cost: 210, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_armor_2',      name: 'Spectral Plate II', description: 'Thicker plate: take 18% less damage from every enemy for the whole dive.',        depthRequired: 6,  cost: 320, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_armor' },
  { id: 'dg_armor_3',      name: 'Spectral Plate III', description: 'Ghost-forged plate: take 25% less damage from every enemy for the whole dive.',   depthRequired: 12, cost: 480, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_armor_2' },
  { id: 'dg_power',        name: 'Ghost Gunners',    description: 'Deal 10% more damage to every enemy for the whole dive.',                          depthRequired: 0,  cost: 210, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_power_2',      name: 'Ghost Gunners II', description: 'Re-bored guns: deal 16% more damage to every enemy for the whole dive.',           depthRequired: 6,  cost: 320, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_power' },
  { id: 'dg_power_3',      name: 'Ghost Gunners III', description: 'The ghost-fleet pattern: deal 22% more damage to every enemy for the whole dive.', depthRequired: 12, cost: 480, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_power_2' },
  { id: 'dg_lifedrain',    name: 'Bloodward',        description: 'Patch up 10% of your max HP each time you sink a ship.',                           depthRequired: 5,  cost: 230, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_lifedrain_2',  name: 'Bloodward II',     description: 'Patch up 15% of your max HP each time you sink a ship.',                           depthRequired: 10, cost: 340, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_lifedrain' },
  { id: 'dg_lifedrain_3',  name: 'Bloodward III',    description: 'Patch up 22% of your max HP each time you sink a ship.',                           depthRequired: 16, cost: 500, scope: 'gauntlet', gauntlet: 'don', requires: 'dg_lifedrain_2' },
  { id: 'dg_luck',         name: 'Drowned Fortune',  description: 'The deep deals you a better hand. Rare and Legendary boons surface far more often.', depthRequired: 8, cost: 250, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_veteran',      name: "Veteran's Start",  description: 'Begin every dive at depth 5: tougher ships, boons and curses sooner. Pot, chests and Fathoms still count only the ships you sink.', depthRequired: 10, cost: 270, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_haul',         name: 'Pieces of Eight',  description: 'Bank 20% more doubloons every time you cash out a dive.',                          depthRequired: 12, cost: 210, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_xp',           name: 'Deep Ledger',      description: 'Earn 25% more Nav XP every time you cash out a dive.',                             depthRequired: 14, cost: 300, scope: 'gauntlet', gauntlet: 'don' },
  // ── Bespoke to Don's — no Davy equivalent. Risk/reward + build-shaping. ──────
  { id: 'dg_loan_shark',   name: 'Loan Shark',       description: 'Sign the Don’s terms: deal 25% MORE damage for the whole dive, but take 18% more from every hit. The debt always comes due. Stacks with your other damage and plate.', depthRequired: 0, cost: 240, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_blood_oath',   name: 'Blood Oath',       description: 'Swear in before you dive: start every run already holding one random boon, a favor from the deep to build on from the first fight.', depthRequired: 4, cost: 280, scope: 'gauntlet', gauntlet: 'don' },
  { id: 'dg_consigliere',  name: 'Consigliere',      description: 'The Don whispers in your ear. Synergy offers (confluences and convergences) surface on far more of your power drafts, so you actually build toward them.', depthRequired: 6, cost: 300, scope: 'gauntlet', gauntlet: 'don' },
  // ── Permanent Upgrades (scope 'account'/'world') — permanent topside power. ────────
  { id: 'dg_deep_plating',   name: 'Deep-Sea Plating',   description: 'The Don’s shipwrights re-hull you in pressure-forged plate: 10% more ship max HP in EVERY raid and gauntlet dive, forever.', depthRequired: 10, cost: 320, scope: 'account', category: 'raids', gauntlet: 'don' },
  { id: 'dg_daily_tribute',  name: 'The Don’s Tribute',  description: 'The family looks after its own. Claim 10 Fathoms free from the Locker, once every day. A standing tribute from the deep.', depthRequired: 20, cost: 220, scope: 'account', category: 'raids', gauntlet: 'don' },
  { id: 'dg_kingpin_cut',    name: 'Kingpin’s Cut',      description: 'The Don marks the finest hauls for you: legendary boss-drop items drop twice as often from every raid crate, forever.', depthRequired: 12, cost: 420, scope: 'account', category: 'raids', gauntlet: 'don' },
  { id: 'dg_crimson_tithe',  name: 'Crimson Tithe',      description: 'The Don takes his cut in blood, and hands you a bigger one: earn 15% more Blood Gems from every Hardcore dive you survive.', depthRequired: 16, cost: 360, scope: 'account', category: 'raids', gauntlet: 'don' },
  { id: 'dg_master_catcher', name: 'Relentless Catcher', description: 'Upgrades your Tireless Catcher: the Auto Catcher now reels in epic fish on its own too, on top of rares. Legendaries and the Ancient Deep still want your hand.', depthRequired: 18, cost: 330, scope: 'world', category: 'fishing', gauntlet: 'don', requires: 'tireless_catcher' },
  { id: 'dg_abyssal_forge', name: 'The Abyssal Forge', description: 'Fuse two forged raid items into one tier-3 Abyssal item, carrying both effect sets in a single mount. The endgame forge.', depthRequired: 8, cost: 700, scope: 'account', category: 'raids', gauntlet: 'don', requires: 'forge', art: '/forge/abyssal_forge.png' },
  { id: 'dg_abyssal_accel', name: 'The Abyssal Accelerator', description: 'Bolts a transmutation bench onto the Abyssal Forge: charge it with gems, feed it an owned EPIC boss drop, and 24 hours later claim that item’s LEGENDARY chase counterpart. Stop grinding the same fight for the rare roll.', depthRequired: 14, cost: 500, scope: 'account', category: 'raids', gauntlet: 'don', requires: 'dg_abyssal_forge', art: '/forge/accelerator.png' },
]

/** Kingpin's Cut (Don's account perk): legendary-rarity boss-drop items drop
 *  twice as often (2x weight). Read against the UNION of both Lockers' upgrades —
 *  it's a topside permanent, not a run perk. Applied client-side in the raid
 *  loot roll. */
export const DONS_DAILY_TRIBUTE_ID = 'dg_daily_tribute'
/** Fathoms handed out per daily claim of The Don's Tribute. */
export const DONS_DAILY_TRIBUTE_AMOUNT = 10
export function donsLegendaryLootMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('dg_kingpin_cut') ? 2 : 1
}

/** Crimson Tithe (Don's account perk): +15% Blood Gems from any Hardcore dive. */
export function donsBloodGemMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('dg_crimson_tithe') ? 1.15 : 1
}

/** The upgrades sold in a given Gauntlet's Locker. Davy's = untagged; Don's =
 *  `gauntlet: 'don'`. A run/shop only ever sees its own variant's catalog. */
export function upgradesForVariant(variant: UpgradeGauntlet): GauntletUpgrade[] {
  return GAUNTLET_UPGRADES.filter(u => (u.gauntlet ?? 'davy') === variant)
}

/** An upgrade's position in its TIER CHAIN (Deep Lungs I/II/III), or null if it
 *  isn't tiered. A chain is upgrades linked by `requires` within the SAME family
 *  (same gauntlet tag) — so cross-Locker prereqs (Relentless → Tireless) don't
 *  read as tiers. Drives the "I of III" badge so players know more tiers exist. */
export function upgradeTierInfo(id: string): { tier: number; total: number } | null {
  if (!getGauntletUpgrade(id)) return null
  const fam = (x: string) => getGauntletUpgrade(x)?.gauntlet ?? 'davy'
  const sameFam = (a: string, b: string) => !!getGauntletUpgrade(a) && !!getGauntletUpgrade(b) && fam(a) === fam(b)
  // Walk back to the chain root through same-family `requires` links.
  let rootId = id
  for (let g = 0; g < 20; g++) {
    const req = getGauntletUpgrade(rootId)?.requires
    if (req && sameFam(rootId, req)) rootId = req
    else break
  }
  // Walk forward from the root, building the full chain.
  const chain = [rootId]
  for (let g = 0; g < 20; g++) {
    const last = chain[chain.length - 1]
    const next = GAUNTLET_UPGRADES.find(x => x.requires === last && sameFam(x.id, last))
    if (next) chain.push(next.id)
    else break
  }
  if (chain.length < 2) return null
  return { tier: chain.indexOf(id) + 1, total: chain.length }
}

/** Roman numeral for tier badges (1-5; enough for any realistic chain). */
export function romanTier(n: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V'][n] ?? String(n)
}

export function getGauntletUpgrade(id: string): GauntletUpgrade | null {
  return GAUNTLET_UPGRADES.find(u => u.id === id) ?? null
}

/** Run Upgrades (scope 'gauntlet') are the only upgrades a player can switch
 *  off — they shape a dive, so opting out is a real playstyle choice (e.g.
 *  starting from depth 1 instead of Veteran's Start). Permanent Upgrades permanents
 *  are always on. One source of truth for the toggle UI + the server guard. */
export function isToggleableUpgrade(id: string): boolean {
  return getGauntletUpgrade(id)?.scope === 'gauntlet'
}

/** The owned upgrades that actually apply this dive: everything claimed, minus
 *  the Run Upgrades the player has switched off. Effect helpers below all read
 *  this list, so a disabled upgrade contributes nothing (start depth, combat
 *  mods, cash-out multipliers) while staying purchased. Non-gauntlet ids can't
 *  be in `off`, so Permanent Upgrades power is never filtered out. */
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
 *  time. One source of truth for the client card + the server guard.
 *  (The Abyssal Forge went live with Don's Gauntlet on 2026-07-20.) */
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

/** The Abyssal Forge (Don's Permanent Upgrades): gates TIER-3 forging (fusing two
 *  already-forged items). Account-scope, so read against the UNION of both
 *  Lockers' upgrades — same as the other Don's account perks. Tier-2 forging
 *  stays on hasForge. */
export function hasAbyssalForge(unlocked: string[] | null | undefined): boolean {
  return (unlocked ?? []).includes('dg_abyssal_forge')
}

/** The Abyssal Accelerator (Don's Permanent Upgrades, requires the Abyssal Forge):
 *  unlocks the epic→legendary transmutation bench. Account-scope → read the
 *  UNION of both Lockers, same as every other Don's account perk. */
export function hasAbyssalAccelerator(unlocked: string[] | null | undefined): boolean {
  return (unlocked ?? []).includes('dg_abyssal_accel')
}

/** Deep-Sea Plating (Don's account perk): +10% ship max HP in every raid +
 *  gauntlet dive. Read against the UNION of both Lockers' upgrades. */
export function donsRaidHpMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('dg_deep_plating') ? 1.10 : 1
}

/** Seasoned Timbers: repair-kit heal multiplier in EVERY raid (account-wide). */
export function gauntletRepairHealMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('seasoned_timbers') ? 1.25 : 1
}

/** Swift Sails: voyage-duration multiplier (lower = faster). */
export function gauntletVoyageSpeedMult(unlocked: string[] | null | undefined): number {
  // Weakened 0.7 -> 0.85 (2026-08-05) with the voyage-length rework. At 30% off
  // it was the single biggest lever on voyage time, bigger than every other
  // factor combined, which made the published route lengths meaningless for
  // anyone holding it. Still the best time saver available, just not the only
  // one that matters.
  return (unlocked ?? []).includes('swift_sails') ? 0.85 : 1
}

/** The highest bite-rarity tier the Auto Catcher will reel on its own:
 *  2 (common+uncommon) by default, 3 (rares) with Tireless Catcher, 4 (epics)
 *  with Relentless Catcher on top. Legendaries (5) + the Ancient Deep always
 *  want the player's own hand. Reads the UNION of both Lockers' upgrades. */
export function gauntletAutoCatchMaxRarity(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  if (u.includes('dg_master_catcher')) return 4
  if (u.includes('tireless_catcher')) return 3
  return 2
}

/** Salvager's Eye (Davy) / Pieces of Eight (Don's): doubloon multiplier on a
 *  Gauntlet cash-out haul. */
export function gauntletHaulMult(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  if (u.includes('dg_haul')) return 1.20
  return u.includes('salvagers_eye') ? 1.15 : 1
}

/** Navigator's Log (Davy) / Deep Ledger (Don's): Nav XP multiplier on cash-out. */
export function gauntletXpMult(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  if (u.includes('dg_xp')) return 1.25
  return u.includes('navigators_log') ? 1.2 : 1
}

/** Lucky Locker (Davy) / Spoils of the Deep (Don's): Fathoms multiplier per run
 *  (cash-out AND death). */
export function gauntletFathomsMult(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  if (u.includes('dg_fathoms')) return 1.40
  return u.includes('lucky_locker') ? 1.33 : 1
}

/** Diving Bell (Davy) / Deep Lungs I-III (Don's, tiered): max-HP mult per run. */
export function gauntletRunHpMult(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  if (u.includes('dg_hp_3')) return 1.50
  if (u.includes('dg_hp_2')) return 1.35
  if (u.includes('dg_hp')) return 1.20
  return u.includes('diving_bell') ? 1.15 : 1
}

/** Veteran's Start (Davy OR Don's): the COMBAT depth the run opens at (enemies +
 *  boon/curse cadence + the displayed depth) — depth 5 for both. Rewards stay
 *  keyed to ships actually sunk, so this never inflates pot / chests / Fathoms /
 *  record. */
export function gauntletStartDepth(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  return (u.includes('veterans_start') || u.includes('dg_veteran')) ? 5 : 1
}

/** Extra lethal-save charges seeded at run start (beyond any from equipped
 *  items). No upgrade grants these right now — Second Wind was removed — so this
 *  is 0; kept as the hook if a run-start save is ever re-added. */
export function gauntletStartAnchorSaves(_unlocked: string[] | null | undefined): number {
  return 0
}

/** The depth offset Veteran's Start adds to the combat depth (0 without it). */
export function gauntletSkipOffset(unlocked: string[] | null | undefined): number {
  return gauntletStartDepth(unlocked) - 1
}

/** Calm Before (Davy) / Uncursed Descent (Don's): the Locker's first curse
 *  milestone passes without a curse. */
export function gauntletSkipsFirstCurse(unlocked: string[] | null | undefined): boolean {
  const u = unlocked ?? []
  return u.includes('calm_before') || u.includes('dg_calm')
}

/** Iron Hide: damageTakenPct mod folded into the run's RaidMods. NEGATIVE =
 *  less damage (matches the crewEffects convention; RaidCombat applies it as
 *  1 + pct/100, so -10 → ×0.9 incoming). */
export function gauntletDamageTakenMod(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  let base = u.includes('dg_armor_3') ? -25   // Spectral Plate III (Don's)
           : u.includes('dg_armor_2') ? -18   // Spectral Plate II
           : u.includes('dg_armor')   ? -12   // Spectral Plate I
           : u.includes('iron_hide')  ? -10   // Iron Hide (Davy)
           : 0
  // Loan Shark (Don's): the debt side of the pact — +18% damage taken, stacking
  // ON TOP of any plate (partially eats it, or +18 from nothing). Tuned as a real
  // glass-cannon trade so it doesn't strictly beat the Ghost Gunners ladder.
  if (u.includes('dg_loan_shark')) base += 18
  return base
}

/** Gunner's Eye (Davy) / Ghost Gunners I-III (Don's, tiered): bonus damage %
 *  DEALT during Gauntlet runs (into runRaidMods). */
export function gauntletDamageMod(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  let base = u.includes('dg_power_3') ? 22   // Ghost Gunners III (Don's)
           : u.includes('dg_power_2') ? 16   // Ghost Gunners II
           : u.includes('dg_power')   ? 10   // Ghost Gunners I
           : u.includes('gunners_eye') ? 10  // Gunner's Eye (Davy)
           : 0
  // Loan Shark (Don's): the payout side of the pact — +25% damage dealt, stacking
  // ON TOP of Ghost Gunners.
  if (u.includes('dg_loan_shark')) base += 25
  return base
}

/** Vigor (Davy) / Bloodward I-III (Don's, tiered): fraction of max HP restored
 *  after each enemy sunk in a run. */
export function gauntletKillHealPct(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  if (u.includes('dg_lifedrain_3')) return 0.22   // Bloodward III (Don's)
  if (u.includes('dg_lifedrain_2')) return 0.15   // Bloodward II
  if (u.includes('dg_lifedrain')) return 0.10     // Bloodward I
  return u.includes('vigor') ? 0.08 : 0
}

/** Sounding Line (Davy) / Ghostlight (Don's): the breather reveals the next
 *  fight (lone hull / elite + affix / boss) before the player commits. */
export function gauntletHasSoundingLine(unlocked: string[] | null | undefined): boolean {
  const u = unlocked ?? []
  return u.includes('sounding_line') || u.includes('dg_peek')
}

/** Diviner's Charm (Davy) / Drowned Fortune (Don's): multiplier on the draft
 *  weight of the non-Common boon rarities (Rare + Legendary). */
export function gauntletBoonLuck(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  if (u.includes('dg_luck')) return 1.8   // Drowned Fortune (Don's)
  return u.includes('diviners_charm') ? 1.7 : 1
}

/** Second Cast (Davy) / Rechamber I-II (Don's): boon rerolls per draft. */
export function gauntletBoonRerolls(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  if (u.includes('dg_reroll_boon_2')) return 2
  return u.includes('second_cast') || u.includes('dg_reroll_boon') ? 1 : 0
}

/** Salt Ward (Davy) / Break the Hex I-II (Don's): curse rerolls per imposed curse. */
export function gauntletCurseRerolls(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  if (u.includes('dg_reroll_curse_2')) return 2
  return u.includes('salt_ward') || u.includes('dg_reroll_curse') ? 1 : 0
}

/** Blacklist (Don's): how many boons the player may banish per RUN (not per
 *  draft). Tier 2 raises the cap to 2. A banished boon never surfaces again for
 *  the rest of that dive. */
export function gauntletBoonFilters(unlocked: string[] | null | undefined): number {
  const u = unlocked ?? []
  if (u.includes('dg_boon_filter_2')) return 2
  return u.includes('dg_boon_filter') ? 1 : 0
}

/** Consigliere (Don's): multiplier on the synergy (confluence/convergence) offer
 *  chance. Folds into the run's confluenceOfferMult so synergy cards surface far
 *  more often. 1 = untouched. */
export function gauntletSynergyOfferMult(unlocked: string[] | null | undefined): number {
  return (unlocked ?? []).includes('dg_consigliere') ? 2.2 : 1
}

/** Blood Oath (Don's): start every dive already holding one random boon. */
export function gauntletHasBloodOath(unlocked: string[] | null | undefined): boolean {
  return (unlocked ?? []).includes('dg_blood_oath')
}
