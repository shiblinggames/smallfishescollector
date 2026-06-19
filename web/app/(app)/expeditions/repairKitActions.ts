'use server'

// Repair-kit upgrade ladder — doubloon-bought, Nav-gated, buy in tier order.
// Mirrors holdActions.upgradeFishHold (auth via createClient, mutate via
// createAdminClient, ledger row in doubloon_transactions). Buying a kit adds it
// to owned_repair_kits AND auto-equips it; equip swaps among owned kits.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRepairKit, nextRepairKit } from '@/lib/repairKits'
import { getLevelFromXP } from '@/lib/expeditionLevel'

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

  const doubloons = profile.doubloons ?? 0
  if (doubloons < next.cost) return { error: 'Not enough doubloons.' }

  const newDoubloons = doubloons - next.cost
  const newOwned = [...owned, next.id]

  const [{ error }] = await Promise.all([
    admin.from('profiles').update({
      doubloons: newDoubloons,
      owned_repair_kits: newOwned,
      equipped_repair_kit: next.id,
    }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: -next.cost, reason: `Bought ${next.name}` }),
  ])
  if (error) return { error: 'Could not complete the purchase.' }

  return { ok: true, equippedRepairKit: next.id, ownedRepairKits: newOwned, doubloons: newDoubloons }
}

export async function equipRepairKit(id: string): Promise<{ ok: true; equippedRepairKit: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  if (!getRepairKit(id)) return { error: 'No such repair kit.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('owned_repair_kits').eq('id', user.id).single()
  const owned = (profile?.owned_repair_kits as string[] | null) ?? ['basic_repair_kit']
  if (!owned.includes(id)) return { error: 'You don’t own that kit.' }

  const { error } = await admin.from('profiles').update({ equipped_repair_kit: id }).eq('id', user.id)
  if (error) return { error: 'Could not equip the kit.' }
  return { ok: true, equippedRepairKit: id }
}
