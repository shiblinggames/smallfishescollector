'use server'

// Repair-kit upgrade ladder — doubloon-bought, Nav-gated, buy in tier order.
// Mirrors holdActions.upgradeFishHold (auth via createClient, mutate via
// createAdminClient, ledger row in doubloon_transactions). Buying a kit adds it
// to owned_repair_kits AND auto-equips it; equip swaps among owned kits.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { nextRepairKit } from '@/lib/repairKits'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { spend, grant, arrayAdd } from '@/lib/wallet'

interface KitResult {
  ok: true
  equippedRepairKit: string
  ownedRepairKits: string[]
  doubloons: number
}

export async function buyRepairKit(): Promise<KitResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, owned_repair_kits, expedition_xp')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const owned = (profile.owned_repair_kits as string[] | null) ?? ['basic_repair_kit']
  const next = nextRepairKit(owned)
  if (!next) return { error: 'Every repair kit is already yours.' }

  const navLevel = getLevelFromXP(profile.expedition_xp ?? 0)
  if (navLevel < next.navLevelReq) return { error: `Reach Nav Lv ${next.navLevelReq} to buy the ${next.name}.` }

  // The spend is the guard: taken in place, before the kit is handed over.
  const newDoubloons = await spend(admin, user.id, 'doubloons', next.cost)
  if (newDoubloons == null) return { error: 'Not enough doubloons.' }
  const newOwned = [...owned, next.id]

  // Added once. A twin that bought the same rung first gets its coin back.
  let added = false
  try {
    added = await arrayAdd(admin, user.id, 'owned_repair_kits', next.id)
  } catch { /* treated as not added: refunded below */ }
  if (!added) {
    await grant(admin, user.id, 'doubloons', next.cost)
    return { error: 'Could not complete the purchase.' }
  }
  await Promise.all([
    admin.from('profiles').update({ equipped_repair_kit: next.id }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: -next.cost, reason: `Bought ${next.name}` }),
  ])

  return { ok: true, equippedRepairKit: next.id, ownedRepairKits: newOwned, doubloons: newDoubloons }
}
