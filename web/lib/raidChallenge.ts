// Challenge-mode raid factory. Takes a base BossRaidConfig and produces a
// scaled-up variant — same enemies, same patterns, same dialogue, just
// harder + more rewarding. Players unlock the challenge variant of a raid
// by clearing the normal one once (gated on the map; see raidMap.ts).
//
// The factory keeps all balance knobs in one place so Pete + Krust scale
// identically without per-raid duplication. Future raids inherit the same
// challenge curve for free.
//
// PHASE 1 (this file): pure stat-scaling + payout multipliers + a suffixed
// raid_id so completions track in their own bucket on the leaderboard.
// PHASE 2: elite enemy variants + the affix system. PHASE 3: boss phases.

import { CORSAIRS_RECKONING, CAPTAIN_KRUST, THE_CARTOGRAPHER, THE_TOLLMASTER, THE_COFFERS_FLEET, THE_QUARTERMASTER, THE_BLOCKADE, THE_THRONE, type BossRaidConfig, type BroadsideEnemy, type BossPhase, type RaidLootItem } from './bossRaids'

/** Multipliers applied by buildChallengeRaid. Tweak here, not per-raid. */
export const CHALLENGE_MODS = {
  // Combat — challenge enemies have more HP and hit harder. Bosses scale
  // steeper so the headline fight feels meaningfully different, not just
  // longer-feeling trash.
  enemyHpMult:  1.3,
  enemyDmgMult: 1.15,
  bossHpMult:   1.5,
  bossDmgMult:  1.20,

  // Payouts — every kill pays more and the final clear bonus is higher,
  // so a challenge run nets a real bump over normal even before the loot
  // crate. Same numbers across mob + boss kills so the curve is uniform.
  goldMult: 1.5,
  xpMult:   1.5,

  // Flare Barrage (Coffers Fleet, Chapter 3 Raid 5) — challenge makes the
  // barrage a distinct threat, not just scaled stats: each penalty hits harder
  // and the fuses close faster. Applied to any enemy with a flare tier (decoyCount).
  flareDmgMult:  1.4,   // +40% damage per missed flare / tapped feint
  flareFuseMult: 0.85,  // fuses 15% shorter — the flares snap shut quicker
} as const

// Loot crate — EXACT, uniform rates for EVERY challenge raid (buildChallengeLoot
// below). The non-legendary chase item lands at 40% and the legendary at 20% on
// every raid, no exceptions. The trophy ship skin doubles its base normal rate;
// currency fills the table to exactly 100 so the weights read straight as
// percentages. One rule, applied everywhere — so new raids stay consistent for free.
export const CHALLENGE_ITEM_PCT = 40
export const CHALLENGE_LEGENDARY_PCT = 20

/** Suffix appended to raid_id so challenge completions track separately
 *  in raid_completions (lets the Boss Records block on the challenge node
 *  show its own fastest-clear leaderboard). */
export const CHALLENGE_RAID_ID_SUFFIX = '_challenge'

/** Returns true if a raid_id is the challenge variant of some raid. */
export function isChallengeRaidId(raidId: string): boolean {
  return raidId.endsWith(CHALLENGE_RAID_ID_SUFFIX)
}

/** Strip the suffix to recover the base raid_id from a challenge id.
 *  Used by the map to mark a challenge node cleared off either the
 *  challenge OR (transitively) the normal raid completion. */
export function baseRaidIdOf(raidId: string): string {
  return isChallengeRaidId(raidId)
    ? raidId.slice(0, -CHALLENGE_RAID_ID_SUFFIX.length)
    : raidId
}

function scaleEnemy(e: BroadsideEnemy, isBoss: boolean): BroadsideEnemy {
  const hpMult  = isBoss ? CHALLENGE_MODS.bossHpMult  : CHALLENGE_MODS.enemyHpMult
  const dmgMult = isBoss ? CHALLENGE_MODS.bossDmgMult : CHALLENGE_MODS.enemyDmgMult
  return {
    ...e,
    hpBase: Math.round(e.hpBase * hpMult),
    minDmg: Math.max(1, Math.round(e.minDmg * dmgMult)),
    maxDmg: Math.max(1, Math.round(e.maxDmg * dmgMult)),
    // Flare-carrying enemies (Coffers Fleet) get a harder, faster barrage.
    ...(e.decoyCount ? { flareDmgMult: CHALLENGE_MODS.flareDmgMult, flareFuseMult: CHALLENGE_MODS.flareFuseMult } : {}),
  }
}

/** Detect loot row "type" so we know which multiplier (if any) to apply.
 *  Doubloon and gem rows follow the convention `doubloons_<n>` / `gems_<n>`
 *  / `pack` (the gem-pack reward). Everything else is treated as a unique
 *  drop and gets the unique multiplier. */
function lootCategory(item: RaidLootItem): 'doubloons' | 'gems' | 'unique' {
  if (item.id.startsWith('doubloons_')) return 'doubloons'
  if (item.id.startsWith('gems_') || item.id.startsWith('pack')) return 'gems'
  return 'unique'
}

/** Build a challenge-mode loot table from a base raid's loot with rates that are
 *  IDENTICAL across every raid: the non-legendary item(s) total 40%, the
 *  legendary(s) total 20%, each trophy ship skin doubles its base rate, and the
 *  currency rows fill whatever's left so the table sums to exactly 100 (weights =
 *  percentages). Centralised so current + future raids stay consistent for free;
 *  a raid can still bypass it by passing an explicit lootOverride below. */
function buildChallengeLoot(loot: RaidLootItem[]): RaidLootItem[] {
  const isSkin = (l: RaidLootItem) => !!(l as { shipSkinId?: string }).shipSkinId
  const currency = loot.filter(l => lootCategory(l) !== 'unique')
  const uniques  = loot.filter(l => lootCategory(l) === 'unique')
  const skins       = uniques.filter(isSkin)
  const legendaries = uniques.filter(l => !isSkin(l) && l.rarity === 'legendary')
  const items       = uniques.filter(l => !isSkin(l) && l.rarity !== 'legendary')

  // Fixed-percentage specials (split evenly if a raid ever has more than one of a
  // kind). Trophy skin doubles its base rate — the established challenge cadence.
  const splitEven = (rows: RaidLootItem[], pct: number) =>
    rows.map(r => ({ ...r, weight: Math.round((pct / Math.max(1, rows.length)) * 100) / 100 }))
  const specials = [
    ...skins.map(r => ({ ...r, weight: r.weight * 2 })),
    ...splitEven(items, CHALLENGE_ITEM_PCT),
    ...splitEven(legendaries, CHALLENGE_LEGENDARY_PCT),
  ]
  const specialTotal = specials.reduce((a, r) => a + r.weight, 0)

  // Currency fills the remainder to 100, proportional to its base weights.
  const currencyTarget = Math.max(0, 100 - specialTotal)
  const currencyBase = currency.reduce((a, r) => a + r.weight, 0) || 1
  const scaledCurrency = currency.map(r => ({ ...r, weight: Math.round(r.weight / currencyBase * currencyTarget) }))

  // Correct any rounding drift on the largest currency row so the table totals
  // EXACTLY 100 — that's what pins the item to a true 40% and the legendary to 20%.
  const total = specialTotal + scaledCurrency.reduce((a, r) => a + r.weight, 0)
  if (scaledCurrency.length && total !== 100) {
    const biggest = scaledCurrency.reduce((a, b) => (b.weight > a.weight ? b : a))
    biggest.weight += 100 - total
  }
  return [...scaledCurrency, ...specials]
}

/** Build the challenge variant of a raid. Stat-scaled enemies, scaled
 *  per-kill payouts, suffixed raid_id, title prefixed with "Challenge:".
 *  Loot is built via buildChallengeLoot (exact 40%/20% rates, same for every
 *  raid), but a raid can still override the whole table by passing `lootOverride`
 *  for a bespoke case. */
export function buildChallengeRaid(base: BossRaidConfig, lootOverride?: BossRaidConfig['loot']): BossRaidConfig {
  const scaledEnemies: Record<string, BroadsideEnemy> = {}
  for (const [key, e] of Object.entries(base.enemies)) {
    scaledEnemies[key] = scaleEnemy(e, key === base.bossId)
  }

  const scaledKillRewards: Record<string, { gold: number; xp: number }> = {}
  for (const [key, r] of Object.entries(base.killRewards)) {
    scaledKillRewards[key] = {
      gold: Math.round(r.gold * CHALLENGE_MODS.goldMult),
      xp:   Math.round(r.xp   * CHALLENGE_MODS.xpMult),
    }
  }

  return {
    ...base,
    raidId:           base.raidId + CHALLENGE_RAID_ID_SUFFIX,
    raidTitle:        `Challenge: ${base.raidTitle}`,
    bossDefeatedText: base.bossDefeatedText, // same line; the title prefix is enough
    enemies:          scaledEnemies,
    killRewards:      scaledKillRewards,
    loot:             lootOverride ?? buildChallengeLoot(base.loot),
    // Challenge variants skip the pre-fight dialogue — the player has
    // already played the normal raid (challenge unlocks gate on that),
    // they've seen the story beat. The challenge IS the fight, not the
    // narrative; making them re-tap through "So another pup thinks..."
    // every retry would drag. RaidGame's bossDialoguePending gate falls
    // through cleanly when this is undefined.
    preFightDialogue: undefined,
  }
}

/** Attach a phase2 config to a single boss inside an already-built challenge
 *  variant. Hand-tuned per boss because phase 2 patterns + dialogue are
 *  character-specific. Called once at module load and folded into the
 *  exported challenge config below. */
function withBossPhase2(
  config: BossRaidConfig,
  bossKey: string,
  phase2: NonNullable<BroadsideEnemy['phase2']>,
): BossRaidConfig {
  return {
    ...config,
    enemies: {
      ...config.enemies,
      [bossKey]: { ...config.enemies[bossKey], phase2 },
    },
  }
}

// Pete's phase 2 — kicks in the moment the player lands the killing blow.
// Pete drops, the player thinks the fight's over, then he hauls himself
// back up at 50% of his max HP with a meaner streak: dodge-camping is
// gone, more volleys, +25% damage on every roll. Combined with the HP
// reset, phase 2 effectively doubles the run-length of the fight while
// trading lighter (phase 1) damage for heavier (phase 2) damage.
const PETE_PHASE2: NonNullable<BroadsideEnemy['phase2']> = {
  revivePct:  0.5,
  damageMult: 1.25,
  // 10-turn loop with 2 volleys + 2 fires + 1 dodge. Compare to phase 1's
  // 13-turn rhythm-trap that mostly threatens via dodge-camping. Charges:
  // 0→1→0→1→0→1→2→3→0→1→0. Note T6 volley fires only if charges are >=3,
  // which the prior three reloads cover. Falls through to reload if not.
  pattern: ['reload', 'fire', 'reload', 'fire', 'reload', 'reload', 'reload', 'volley', 'reload', 'volley'],
  dialogueLine: "On your feet, old captain. We're not done yet.",
}

// Krust's phase 2 — same revival shape as Pete, opposite character. Where
// Pete rises angrier and faster, Krust rises defiant and turtled. Keeps
// the raid-wide "no volleys" rule (Krust's whole crew plates up and
// trades, never charges a volley). Phase 2 holds the signature 2-reload
// buildup from phase 1 but tightens the cadence: drops one dodge per
// loop so he fires more often under pressure. Outgoing damage stays
// flat (1.0 mult). On top of his existing 15% flat Carapace soak,
// phase 2 adds a 50% / -30% chance-gated mitigation that fires only on
// non-volley shots. The dialogue line doubles as the player's hint:
// volleys punch through plate, every other shot might get soaked.
const KRUST_PHASE2: NonNullable<BroadsideEnemy['phase2']> = {
  revivePct:  0.5,
  damageMult: 1.0,
  // 7-turn loop: 4 reloads + 2 fires + 1 dodge. Same 2-reload buildup
  // as phase 1 but one fewer dodge per cycle. No volley (whole-raid
  // rule). Charges: 0→1→2→1→2→3→2→2
  pattern: ['reload', 'reload', 'fire', 'reload', 'reload', 'fire', 'dodge'],
  dialogueLine: "Down? Plate's still warm. Try again.",
  damageTakenChance:        0.5,
  damageTakenMult:          0.7,
  damageTakenVolleyBypass:  true,
}

// The Cartographer's phase 2 — he drops the methodical triple-reload telegraph
// and fights dirty through his own fog: a faster loop with the volley sooner and
// more single fires, +20% damage. His top-level Mist Veil + Riposte persist into
// phase 2 (the fog never lifts, his dodge still counters), so the revive layers
// pressure onto an already-tricky fight rather than re-teaching a mechanic.
const CARTOGRAPHER_PHASE2: NonNullable<BroadsideEnemy['phase2']> = {
  revivePct:  0.5,
  damageMult: 1.2,
  pattern: ['reload', 'fire', 'reload', 'volley', 'fire', 'reload', 'fire', 'dodge'],
  dialogueLine: "You sketched one chart of me. There's always a deeper sounding.",
}

// Tollmaster Spet's phase 2 — the toll doubles. He re-chambers and presses the
// heaviest cadence in the game even harder: back-to-back fires around a volley,
// barely a dodge, +20% damage. His doubled-opener aggression is the fight, so
// phase 2 just collects the second bill twice as hard.
const SPET_PHASE2: NonNullable<BroadsideEnemy['phase2']> = {
  revivePct:  0.5,
  damageMult: 1.2,
  pattern: ['reload', 'reload', 'fire', 'fire', 'reload', 'volley', 'fire', 'dodge'],
  dialogueLine: "You think the bill's settled? I always collect twice.",
}

// Pre-built challenge variants — page files + raid map import these directly so
// the factory only runs once at module load, not per-request. Every challenge boss
// carries a two-phase fight tuned to its character (Pete = aggression, Krust =
// plate, the Cartographer = fog-and-parry, Spet = doubled cadence; the Coffers
// admiral + the Quartermaster inherit phase 2 from their base config, spread
// through scaleEnemy). Loot comes from the shared exact-rate table
// (buildChallengeLoot): 40% item / 20% legendary on EVERY raid.
export const CORSAIRS_RECKONING_CHALLENGE: BossRaidConfig = {
  ...withBossPhase2(buildChallengeRaid(CORSAIRS_RECKONING), 'pete', PETE_PHASE2),
  // Hard mode keeps the original 6-mob grind — only the NORMAL entry raid was
  // shortened to 4 (2026-06-20). Challenge enemies still get the eased base
  // stats scaled back up by the challenge HP/dmg multipliers.
  sequence: ['brute', 'brute', 'sniper', 'sniper', 'corsair', 'corsair'],
}
export const CAPTAIN_KRUST_CHALLENGE: BossRaidConfig = {
  ...withBossPhase2(buildChallengeRaid(CAPTAIN_KRUST), 'krust', KRUST_PHASE2),
  // Hard mode keeps the original 8-mob gauntlet — only the NORMAL raid was
  // trimmed to 6 (2026-06-20). Challenge enemies still get the eased base
  // stats scaled up by the challenge HP/dmg multipliers.
  sequence: ['scout', 'scout', 'reg', 'reg', 'brute', 'brute', 'elite', 'elite'],
}
export const THE_CARTOGRAPHER_CHALLENGE: BossRaidConfig =
  withBossPhase2(buildChallengeRaid(THE_CARTOGRAPHER), 'cartographer', CARTOGRAPHER_PHASE2)
export const THE_TOLLMASTER_CHALLENGE: BossRaidConfig =
  withBossPhase2(buildChallengeRaid(THE_TOLLMASTER), 'spet', SPET_PHASE2)

// Chapter III. The Coffers admiral (Raid 5) + the Quartermaster (Raid 6, the
// chapter finale) inherit decoys / repossession / phase 2 automatically through
// scaleEnemy; loot rides the same shared 40%/20% table as every other raid.
export const THE_COFFERS_FLEET_CHALLENGE: BossRaidConfig =
  buildChallengeRaid(THE_COFFERS_FLEET)
// Challenge-only 5th phase for the Quartermaster — beyond "Empty Shelves" he
// runs out every last gun. Meaner than any base phase (damage + a brutal-but-
// answerable liquidation check) so the finale's hard mode is a real extra beat,
// not just scaled numbers. (damageMult multiplies his already challenge-scaled
// damage; the check consequence is % of the PLAYER's max HP, so it stays lethal
// unless braced/shielded.)
const QUARTERMASTER_CHALLENGE_PHASE5: BossPhase = {
  revivePct: 0.55, damageMult: 1.75, badge: 'Nothing Personal',
  pattern: ['fire', 'volley', 'dodge', 'fire', 'reload', 'volley', 'fire', 'dodge', 'fire'],
  dialogueLine: "You should have paid when the price was gold. Now it is your ship.",
  check: {
    id: 'total_liquidation', name: 'Total Liquidation', chargeTurns: 2,
    telegraph: 'The Quartermaster runs out every gun the Cache has left and levels them all at your hull.',
    responses: ['brace', 'shield'],
    counteredLine: 'You throw up cover and the last of his stock breaks against it.',
    failLine: 'Everything he had left lands at once.',
    consequence: { kind: 'damagePctMaxHp', value: 0.80 },
  },
}

// The Quartermaster's challenge adds a 5th phase on top of the scaled fight —
// the base config's 4 phases carry through scaleEnemy; we append the extra beat.
// Raid 7's challenge — the scaled blockade. Shields / magazines / specials /
// the boss's phase all carry through scaleEnemy's spread automatically.
export const THE_BLOCKADE_CHALLENGE: BossRaidConfig = buildChallengeRaid(THE_BLOCKADE)

// Raid 8's challenge — the scaled court. Ultimates / aim-bar attacks / the
// don's three phases all carry through scaleEnemy's spread automatically.
export const THE_THRONE_CHALLENGE: BossRaidConfig = buildChallengeRaid(THE_THRONE)

export const THE_QUARTERMASTER_CHALLENGE: BossRaidConfig = (() => {
  const base = buildChallengeRaid(THE_QUARTERMASTER)
  const qm = base.enemies.quartermaster
  if (!qm) return base
  return {
    ...base,
    // Both intro enforcers (The Leech, The Breaker) keep their signature affix
    // AND draw a random second affix each run — a fresh elite twist every try.
    mergeRandomAffix: true,
    enemies: {
      ...base.enemies,
      quartermaster: { ...qm, phases: [...(qm.phases ?? []), QUARTERMASTER_CHALLENGE_PHASE5] },
    },
  }
})()
