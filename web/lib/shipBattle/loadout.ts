// Freezes a player's combat loadout into the immutable BattleLoadout snapshot
// stored on the ship_battles row at accept-time, so mid-battle gear swaps never
// change an in-flight duel. Reuses the existing getRaidPlayerStats() (the same
// stat assembly the PvE raids use) and re-derives the raid-item damage/defense
// multipliers it doesn't already expose (it only bakes HP + the class damage
// mult; per-shot item mults are applied at hit time in PvE).

import { getRaidPlayerStats } from '@/app/(app)/raids/actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveEffects } from '@/lib/raidItems'
import { raidItemSlotsForTier } from '@/lib/expeditions'
import { classForSlug, CLASS_UNLOCK_LEVEL } from '@/lib/crewClasses'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { getRepairKit, repairKitRange } from '@/lib/repairKits'
import type { BattleLoadout, BattleCrew } from './resolver'

// The duel Specials slice covers the 5 base crew classes; the legendary
// signatures (Leviathan / Apex / Tidecaller) are deferred.
const PVP_BASE_CLASSES = new Set(['mender', 'sharpshot', 'snare', 'anchor', 'navigator'])

export async function snapshotLoadout(userId: string): Promise<BattleLoadout> {
  const stats = await getRaidPlayerStats(userId)

  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('equipped_raid_items, ship_tier').eq('id', userId).single()
  const shipTier = (data?.ship_tier as number | null) ?? 0
  const cap = raidItemSlotsForTier(shipTier)
  const items = ((data?.equipped_raid_items as string[] | null) ?? []).slice(0, cap)
  const effects = getActiveEffects(items)
  const prod = (type: string) => effects.filter(e => e.type === type).reduce((a, e) => a * e.value, 1)
  const sum  = (type: string) => effects.filter(e => e.type === type).reduce((a, e) => a + e.value, 0)
  // Proc/parry chances aggregate by MAX across items (mirrors RaidCombat).
  const max  = (type: string) => effects.filter(e => e.type === type).reduce((a, e) => Math.max(a, e.value), 0)

  // Crew Specials — only base-class crew that have already unlocked their
  // ability (Lv 10+). Capped at 6 so the chooser stays tight.
  const crew: BattleCrew[] = stats.crewMembers
    .map(c => ({ id: c.id, name: c.name, classId: classForSlug(c.slug), level: crewLevelFromXP(c.xp) }))
    .filter((c): c is BattleCrew => !!c.classId && PVP_BASE_CLASSES.has(c.classId) && c.level >= CLASS_UNLOCK_LEVEL)
    .slice(0, 6)

  const kit = getRepairKit(stats.equippedRepairKit)
  const kitRange = kit ? repairKitRange(kit, stats.totalFortune) : null
  const repairKit = kit && kitRange ? { name: kit.name, healMin: kitRange.min, healMax: kitRange.max } : null

  return {
    username: stats.username ?? 'Captain',
    shipImageUrl: stats.shipImageUrl,
    shipTier,
    hpMax: stats.playerHPMax,
    shipMinDamage: stats.shipMinDamage,
    shipSpeed: stats.shipSpeed,
    totalPower: stats.totalPower,
    navigation: stats.totalDodge,
    damagePct: stats.raidMods.damagePct,
    critPct: stats.raidMods.critPct,
    classDamageMult: stats.classDamageMult,
    critDamageMult: prod('crit_damage_mult'),
    noncritDamageMult: prod('noncrit_damage_mult'),
    incomingDamageMult: prod('incoming_damage_mult'),
    navSpeedBonusPct: sum('speed_roll_nav_pct'),
    // Crew raid mods that the resolver now honors (turn order + defense).
    firstStrike: !!stats.raidMods.firstStrike,
    damageTakenPct: stats.raidMods.damageTakenPct ?? 0,
    // Astrolabe parry (reflect a slice of a dodged shot) — max across items.
    parryChance: max('parry_chance'),
    parryReflectPct: max('parry_reflect_pct'),
    // Incendiary / Frozen cannonball on-hit procs — max across items.
    burnChance: max('burn_chance'),
    freezeChance: max('freeze_chance'),
    // First Cut (open a fight with a charge loaded) — rolled at battle start.
    startChargeChance: max('start_charge_chance'),
    // Escalating damage per round elapsed — sum across items.
    rampDamagePerTurn: sum('ramp_damage_per_turn'),
    crew,
    repairKit,
    // Display-only.
    characterColor: stats.characterColor,
    equippedHat: stats.equippedHat,
    avatarBgColor: stats.avatarBgColor,
    avatarBorderColor: stats.avatarBorderColor,
    equippedRaidItems: stats.equippedRaidItems,
    shipClasses: stats.shipClasses,
  }
}
