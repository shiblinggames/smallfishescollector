'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SPOILS_PRICE } from '@/lib/shipBerth'

/** THE SPOILS OF THE SUNKEN HAND.
 *
 *  Beating Finn opens ONE of two permanent slots for free; the other can be
 *  bought later for SPOILS_PRICE. Each slot accepts exactly one item, and that
 *  item only ever drops from him, so neither side is a general expansion.
 *
 *    'fishing' -> a SECOND fishing special slot   (The Primeval Eye)
 *    'nav'     -> an extra raid item mount        (The Primeval Maw)
 *
 *  The two are stored as separate columns (free / paid) rather than a pair of
 *  booleans, precisely so the free pick can never be spent twice.
 */
export type SpoilSide = 'fishing' | 'nav'

const isSide = (v: unknown): v is SpoilSide => v === 'fishing' || v === 'nav'

async function loadSpoils() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' as const }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('doubloons, finn_spoil_free, finn_spoil_paid')
    .eq('id', user.id).single()
  if (!profile) return { error: 'No profile.' as const }

  // The whole feature hangs off having actually beaten him. Checked here rather
  // than trusted from the client, since both actions grant permanent unlocks.
  const { data: cleared } = await admin.from('raid_completions')
    .select('id').eq('user_id', user.id).eq('raid_id', 'the_sunken_hand').limit(1).maybeSingle()

  return { user, admin, profile, cleared: !!cleared }
}

/** Mark the spoils node itself as cleared.
 *
 *  Without this the node sat unfinished on the map forever: computeRaidMap
 *  reads raid_node_progress.cleared, and choosing a spoil wrote only the
 *  finn_spoil_* column — so the last node of the campaign kept its unclaimed
 *  chrome no matter what you took off the wreck. Same persistence every other
 *  interactive node uses (milestones, story reads, the berth). */
async function markSpoilsNodeCleared(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: row } = await admin.from('profiles')
    .select('raid_node_progress').eq('id', userId).single()
  const prog = (row?.raid_node_progress as { cleared?: string[] } | null) ?? {}
  if ((prog.cleared ?? []).includes('spoils_of_the_hand')) return
  await admin.from('profiles')
    .update({ raid_node_progress: { ...prog, cleared: [...new Set([...(prog.cleared ?? []), 'spoils_of_the_hand'])] } })
    .eq('id', userId)
}

/** Take one side FREE. Only ever succeeds once. */
export async function chooseSpoil(side: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!isSide(side)) return { ok: false, error: 'Unknown spoil.' }
  const ctx = await loadSpoils()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { user, admin, profile, cleared } = ctx

  if (!cleared) return { ok: false, error: 'Put him down first.' }
  if (profile.finn_spoil_free) return { ok: false, error: 'You already took one off his wreck.' }

  // Conditional write on the column still being null guards a double-tap
  // handing out both sides for nothing.
  const { data: updated } = await admin.from('profiles')
    .update({ finn_spoil_free: side })
    .eq('id', user.id)
    .is('finn_spoil_free', null)
    .select('finn_spoil_free')
    .maybeSingle()
  if (!updated) return { ok: false, error: 'You already took one off his wreck.' }
  await markSpoilsNodeCleared(admin, user.id)
  return { ok: true }
}

/** Buy the OTHER side. Must differ from the free pick, and costs SPOILS_PRICE. */
export async function buySpoil(side: unknown): Promise<{ ok: boolean; error?: string; doubloons?: number }> {
  if (!isSide(side)) return { ok: false, error: 'Unknown spoil.' }
  const ctx = await loadSpoils()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { user, admin, profile, cleared } = ctx

  if (!cleared) return { ok: false, error: 'Put him down first.' }
  if (!profile.finn_spoil_free) return { ok: false, error: 'Take your free pick first.' }
  if (profile.finn_spoil_free === side) return { ok: false, error: 'You already carry that one.' }
  if (profile.finn_spoil_paid) return { ok: false, error: 'You already bought the other.' }

  const doubloons = (profile.doubloons as number | null) ?? 0
  if (doubloons < SPOILS_PRICE) {
    return { ok: false, error: `You need ${SPOILS_PRICE.toLocaleString()} doubloons.` }
  }

  const newDoubloons = doubloons - SPOILS_PRICE
  const { data: updated } = await admin.from('profiles')
    .update({ finn_spoil_paid: side, doubloons: newDoubloons })
    .eq('id', user.id)
    .is('finn_spoil_paid', null)
    .select('finn_spoil_paid')
    .maybeSingle()
  if (!updated) return { ok: false, error: 'You already bought the other.' }
  await markSpoilsNodeCleared(admin, user.id)
  return { ok: true, doubloons: newDoubloons }
}

/** Seat (or clear) The Primeval Eye in the SECOND fishing special slot.
 *  Validated server-side: the slot must be unlocked, the item must be owned,
 *  and nothing else is allowed in there. */
export async function equipSecondSpecial(itemId: unknown): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles')
    .select('finn_spoil_free, finn_spoil_paid, has_anglers_patience')
    .eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'No profile.' }

  const hasSlot = profile.finn_spoil_free === 'fishing' || profile.finn_spoil_paid === 'fishing'
  if (!hasSlot) return { ok: false, error: 'You have not opened that slot.' }

  if (itemId === null) {
    await admin.from('profiles').update({ equipped_special_2: null }).eq('id', user.id)
    return { ok: true }
  }
  // The slot takes exactly ONE item, by design. This is the enforcement point:
  // without it the column is advisory and any special could be seated here.
  if (itemId !== 'anglers_patience') return { ok: false, error: 'Only his eye seats in that slot.' }
  if (profile.has_anglers_patience !== true) return { ok: false, error: "You do not carry The Primeval Eye." }

  await admin.from('profiles').update({ equipped_special_2: 'anglers_patience' }).eq('id', user.id)
  return { ok: true }
}
