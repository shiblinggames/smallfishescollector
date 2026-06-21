'use server'

// Server-authoritative gate + payout for the Davy Jones Gauntlet.
// Combat is client-driven (same trust model as every raid). The server:
//   - consumes the daily attempt on START (so a quit-retry can't reroll a
//     bad opener), keyed by a date string on the profile;
//   - on CASH OUT, clamps the reported pot to the depth ceiling, applies the
//     depth-tiered chest multiplier, and banks doubloons / XP / gems;
//   - on DEATH, closes the run and banks nothing.
// The once-a-day gate is the real limiter, so we trust the client's reported
// depth/pot up to the computed ceiling.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { aggregateShipClasses } from '@/lib/shipClasses'
import { grantXPToAssignedCrew, type CrewXPGrant } from '@/lib/crewXPGrant'
import { maxPotForDepth, chestForDepth, chestCannonDropChance, MAX_GAUNTLET_DEPTH, GAUNTLET_COOLDOWN_MS } from '@/lib/gauntlet'
import { DAVY_FORGE } from '@/lib/raidItems'

/** The single deepest run across all captains + this player's own deepest.
 *  Surfaced on the gauntlet map node. */
export async function getGauntletLeaderboard(): Promise<{
  top: { name: string; depth: number } | null
  mine: number
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data: top } = await admin
    .from('profiles')
    .select('username, ship_name, gauntlet_deepest')
    .gt('gauntlet_deepest', 0)
    .order('gauntlet_deepest', { ascending: false })
    .limit(1)
    .maybeSingle()

  let mine = 0
  if (user) {
    const { data: me } = await admin
      .from('profiles')
      .select('gauntlet_deepest')
      .eq('id', user.id)
      .single()
    mine = (me?.gauntlet_deepest as number | null) ?? 0
  }

  return {
    top: top
      ? {
          name: (top.username as string | null) ?? (top.ship_name as string | null) ?? 'A captain',
          depth: (top.gauntlet_deepest as number | null) ?? 0,
        }
      : null,
    mine,
  }
}

/** Whether the player can start a run now (cooldown elapsed) + their lifetime
 *  deepest + when the next run unlocks (ISO, null when available now). */
export async function getGauntletDailyState(): Promise<{ available: boolean; deepest: number; nextAt: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { available: false, deepest: 0, nextAt: null }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_last_run_at, gauntlet_deepest, is_admin')
    .eq('id', user.id)
    .single()

  // Admins can run it as often as they like (testing the curve).
  const isAdmin = profile?.is_admin === true
  const lastRunAt = profile?.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const nextMs = lastRunAt + GAUNTLET_COOLDOWN_MS
  const available = isAdmin || Date.now() >= nextMs

  return {
    available,
    deepest: (profile?.gauntlet_deepest as number | null) ?? 0,
    nextAt: available ? null : new Date(nextMs).toISOString(),
  }
}

/** Consume the run attempt (start the cooldown) and open a run. Starting (not
 *  finishing) spends it, so a quit-retry can't reroll a bad opener. */
export async function startGauntletRun(): Promise<{ started: boolean; reason?: 'cooldown'; deepest: number; nextAt?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { started: false, reason: 'cooldown', deepest: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_last_run_at, gauntlet_deepest, is_admin')
    .eq('id', user.id)
    .single()

  const deepest = (profile?.gauntlet_deepest as number | null) ?? 0
  const isAdmin = profile?.is_admin === true
  const lastRunAt = profile?.gauntlet_last_run_at ? new Date(profile.gauntlet_last_run_at as string).getTime() : 0
  const nextMs = lastRunAt + GAUNTLET_COOLDOWN_MS
  // Admins bypass the cooldown so they can run it repeatedly to test.
  if (!isAdmin && Date.now() < nextMs) {
    return { started: false, reason: 'cooldown', deepest, nextAt: new Date(nextMs).toISOString() }
  }

  await admin
    .from('profiles')
    .update({ gauntlet_last_run_at: new Date().toISOString(), gauntlet_run_open: true })
    .eq('id', user.id)

  return { started: true, deepest }
}

/** Cash out an open run at the reached depth, banking the (clamped) pot ×
 *  chest multiplier + the chest's gem bonus. Closes the run. */
export async function cashOutGauntlet(depth: number, pot: number): Promise<
  | { ok: false }
  | {
      ok: true
      depth: number
      chest: { tier: number; label: string; potMult: number }
      bankedDoubloons: number
      bankedXp: number
      gems: number
      newDoubloons: number
      newExpeditionXP: number
      deepest: number
      crewXP: CrewXPGrant[]
      /** Davy cannons that dropped this cash-out (chest chase items). */
      droppedItems: string[]
    }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_deepest, expedition_xp, doubloons, gems, ship_classes, raid_items')
    .eq('id', user.id)
    .single()

  if (!profile || profile.gauntlet_run_open !== true) return { ok: false }

  const d = Math.max(0, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(depth)))
  if (d <= 0) {
    // Nothing cleared — just close the run.
    await admin.from('profiles').update({ gauntlet_run_open: false }).eq('id', user.id)
    return { ok: false }
  }

  const cleanPot = Math.max(0, Math.min(Math.floor(pot), maxPotForDepth(d)))
  const chest = chestForDepth(d)

  // Davy cannon chest drops — each component rolls independently at the chest
  // tier's chance, only for cannons not yet owned, and never once the player
  // has forged them into the Grand Cannon.
  const ownedItems = (profile.raid_items as string[] | null) ?? []
  const dropChance = chestCannonDropChance(chest.tier)
  const droppedItems: string[] = []
  if (!ownedItems.includes(DAVY_FORGE.result)) {
    for (const cannon of DAVY_FORGE.components) {
      if (!ownedItems.includes(cannon) && Math.random() < dropChance) droppedItems.push(cannon)
    }
  }
  const newRaidItems = droppedItems.length > 0 ? [...new Set([...ownedItems, ...droppedItems])] : ownedItems

  const classPicks = (profile.ship_classes as Record<string, string> | null) ?? {}
  const doubloonMult = aggregateShipClasses(classPicks).doubloonMult

  const bankedDoubloons = Math.round(cleanPot * chest.potMult * doubloonMult)
  const bankedXp        = Math.round(cleanPot * chest.potMult)
  const gems            = chest.gems

  const newDoubloons     = (profile.doubloons ?? 0) + bankedDoubloons
  const newGems          = (profile.gems ?? 0) + gems
  const newExpeditionXP  = (profile.expedition_xp ?? 0) + bankedXp
  const deepest          = Math.max((profile.gauntlet_deepest as number | null) ?? 0, d)

  const [, , crewXP] = await Promise.all([
    admin.from('profiles').update({
      doubloons: newDoubloons,
      gems: newGems,
      expedition_xp: newExpeditionXP,
      gauntlet_run_open: false,
      gauntlet_deepest: deepest,
      raid_items: newRaidItems,
    }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: bankedDoubloons,
      reason: `Davy Jones Gauntlet: depth ${d}`,
    }),
    grantXPToAssignedCrew(admin, user.id, bankedXp),
  ])

  return {
    ok: true,
    depth: d,
    chest: { tier: chest.tier, label: chest.label, potMult: chest.potMult },
    bankedDoubloons,
    bankedXp,
    gems,
    newDoubloons,
    newExpeditionXP,
    deepest,
    crewXP,
    droppedItems,
  }
}

/** Close an open run after a wipe. Banks nothing; still records deepest. */
export async function resolveGauntletDeath(depth: number): Promise<{ ok: boolean; deepest: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, deepest: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gauntlet_run_open, gauntlet_deepest')
    .eq('id', user.id)
    .single()

  if (!profile || profile.gauntlet_run_open !== true) {
    return { ok: false, deepest: (profile?.gauntlet_deepest as number | null) ?? 0 }
  }

  const d = Math.max(0, Math.min(MAX_GAUNTLET_DEPTH, Math.floor(depth)))
  const deepest = Math.max((profile.gauntlet_deepest as number | null) ?? 0, d)

  await admin
    .from('profiles')
    .update({ gauntlet_run_open: false, gauntlet_deepest: deepest })
    .eq('id', user.id)

  return { ok: true, deepest }
}
