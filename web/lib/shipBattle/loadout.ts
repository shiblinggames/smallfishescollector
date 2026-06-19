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
import type { BattleLoadout } from './resolver'

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
    // Display-only.
    characterColor: stats.characterColor,
    equippedHat: stats.equippedHat,
    avatarBgColor: stats.avatarBgColor,
    avatarBorderColor: stats.avatarBorderColor,
    equippedRaidItems: stats.equippedRaidItems,
    shipClasses: stats.shipClasses,
  }
}
