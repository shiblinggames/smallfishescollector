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

import { CORSAIRS_RECKONING, CAPTAIN_KRUST, type BossRaidConfig, type BroadsideEnemy, type RaidLootItem } from './bossRaids'

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

  // Loot crate — uniques (ship skins, named items) should drop at ~2× the
  // rate they do in the normal raid (the chase reward for grinding
  // challenge). The multiplier here is on the loot ROW WEIGHT, not the
  // final rate: because the total weight in the denominator also grows,
  // a 2.0× weight bump only yields ~1.7× actual drop rate. 2.5× gets us
  // to ~2.06× actual rate against both Pete and Krust's loot tables
  // (the math: 12.5 / 125 = 10.0% vs original 5 / 103 = 4.85%).
  //
  // Gems also bumped so the currency payout matches the harder fight.
  // Doubloon entries are left unscaled — per-kill gold already covers
  // that lane; double-dipping here would make doubloons dominate the
  // crate roll and crowd out uniques.
  uniqueDropWeightMult: 2.5,
  gemDropWeightMult:    1.5,
} as const

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
  }
}

/** Detect loot row "type" so we know which multiplier (if any) to apply.
 *  Doubloon and gem rows follow the convention `doubloons_<n>` / `gems_<n>`
 *  / `pack` (the gem-pack reward). Everything else is treated as a unique
 *  drop and gets the unique multiplier. */
function lootCategory(item: RaidLootItem): 'doubloons' | 'gems' | 'unique' {
  if (item.id.startsWith('doubloons_')) return 'doubloons'
  if (item.id.startsWith('gems_') || item.id === 'pack') return 'gems'
  return 'unique'
}

function scaleLoot(loot: RaidLootItem[]): RaidLootItem[] {
  return loot.map(item => {
    const cat = lootCategory(item)
    if (cat === 'unique') {
      return { ...item, weight: Math.round(item.weight * CHALLENGE_MODS.uniqueDropWeightMult * 100) / 100 }
    }
    if (cat === 'gems') {
      return { ...item, weight: Math.round(item.weight * CHALLENGE_MODS.gemDropWeightMult * 100) / 100 }
    }
    // Doubloons unscaled here — kill-gold already covers that lane.
    return item
  })
}

/** Build the challenge variant of a raid. Stat-scaled enemies, scaled
 *  per-kill payouts, weighted loot table, suffixed raid_id, title
 *  prefixed with "Challenge —" so the dialogue + clear modal still read
 *  in the same voice as the base raid. */
export function buildChallengeRaid(base: BossRaidConfig): BossRaidConfig {
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
    loot:             scaleLoot(base.loot),
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
  dialogueLine: "On your feet, old man. We're not done yet.",
}

// Krust's phase 2 — same revival shape as Pete, opposite character. Where
// Pete rises angrier and faster, Krust rises defiant and turtled. The
// pattern drops every dodge in phase 1 (the carapace IS the defense in
// phase 2), outgoing damage stays flat (1.0 mult), and on top of his
// existing 15% flat Carapace soak, phase 2 adds a 50% / -30% chance-
// gated mitigation that fires only on non-volley shots. The dialogue
// line doubles as the player's hint at the answer: heavy volleys punch
// through, every other shot might get soaked.
const KRUST_PHASE2: NonNullable<BroadsideEnemy['phase2']> = {
  revivePct:  0.5,
  damageMult: 1.0,
  // 8-turn loop: 4 reloads + 2 fires + 1 volley + 1 reload at cap. Charges:
  // 0→1→2→1→2→3→2→3→0. No dodges (the carapace IS the defense in phase 2).
  pattern: ['reload', 'reload', 'fire', 'reload', 'reload', 'fire', 'reload', 'volley'],
  dialogueLine: "Down? Plate's still warm. Try again.",
  damageTakenChance:        0.5,
  damageTakenMult:          0.7,
  damageTakenVolleyBypass:  true,
}

// Pre-built challenge variants — page files + raid map import these
// directly so the heavy lifting (the factory) only runs once at module
// load, not per-request. Pete and Krust both carry two-phase challenge
// fights, tuned to their character (Pete = aggression, Krust = plate).
export const CORSAIRS_RECKONING_CHALLENGE: BossRaidConfig =
  withBossPhase2(buildChallengeRaid(CORSAIRS_RECKONING), 'pete', PETE_PHASE2)
export const CAPTAIN_KRUST_CHALLENGE: BossRaidConfig =
  withBossPhase2(buildChallengeRaid(CAPTAIN_KRUST), 'krust', KRUST_PHASE2)
