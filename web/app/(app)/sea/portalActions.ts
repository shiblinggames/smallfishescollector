'use server'

// THE PORTAL'S LADDER, server-enforced.
//
// The client shows prices and components; this is what decides. Doubloons move
// through deduct_doubloons with a ledger row, the same shape as the tackle
// shop — never an absolute overwrite. Components are never granted anywhere:
// they ARE the cache chests recorded in sea_discoveries, minus what earlier
// tiers consumed, so the only mutation a purchase makes on that side is
// bumping portal_components_spent.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasStoneFor, PORTAL_TIERS, PORT_BY_ID } from '@/lib/seaPortal'

export async function buyPortalTier(): Promise<
  | { ok: true; tier: number; doubloons: number }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const [{ data: profile }, { data: found }] = await Promise.all([
    admin.from('profiles')
      .select('portal_tier, portal_components_spent, doubloons')
      .eq('id', user.id).single(),
    admin.from('sea_discoveries').select('isle_id').eq('user_id', user.id),
  ])
  if (!profile) return { error: 'Profile not found' }

  const current = Number(profile.portal_tier ?? 1)
  const next = PORTAL_TIERS.find(t => t.tier === current + 1)
  if (!next) return { error: 'The portal already reaches the Ancient Deep.' }

  const discovered = ((found ?? []) as { isle_id: string }[]).map(r => r.isle_id)

  // ── NO STONE, NO LADDER ───────────────────────────────────────────────
  // ── THE STONE FOR THE RUNG BEING BOUGHT ───────────────────────────────
  //
  // Each tier's stone is in a chest in the band that tier reaches, so this is
  // the whole rule stated once: the portal cannot take you anywhere you have
  // not already been. The client hides the button, but this is the guard that
  // matters, because this is the one that takes money — and it derives from the
  // same table the client does, so the two cannot disagree.
  if (!hasStoneFor(next.tier, discovered)) {
    return {
      error: `No stone for ${next.name} yet. There is one in a chest out in ${next.name} — `
        + 'sail it the long way first, then the portal will remember the road.',
    }
  }
  if (Number(profile.doubloons ?? 0) < next.cost) {
    return { error: `That stage costs ${next.cost.toLocaleString()} ⟡.` }
  }

  // CLAIM THE TIER FIRST, conditionally, then take the money. Two taps racing
  // both pass the reads above; the .eq on the CURRENT tier lets exactly one of
  // them advance, and the loser is refused before any doubloons move. If the
  // deduction then fails (drained between read and rpc), the claim is put
  // back — the opposite order risks money gone with no tier to show for it
  // only in the crash window, which the ledger row makes auditable.
  const { data: claimed } = await admin.from('profiles')
    .update({ portal_tier: next.tier })
    .eq('id', user.id).eq('portal_tier', current)
    .select('id').maybeSingle()
  if (!claimed) return { error: 'The portal is already being worked on. Look again.' }

  const { data: newDoubloons, error: payErr } = await admin
    .rpc('deduct_doubloons', { uid: user.id, amount: next.cost })
  if (payErr || newDoubloons == null) {
    await admin.from('profiles')
      .update({ portal_tier: current })
      .eq('id', user.id)
    return { error: 'The payment did not go through.' }
  }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -next.cost,
    reason: `Homestead Portal — ${next.name}`,
  })

  return {
    ok: true,
    tier: next.tier,
    doubloons: Number(newDoubloons),
  }
}

/**
 * ── BUYING A BERTH ──────────────────────────────────────────────────────────
 *
 * An island the portal will set you down beside. Bought outright, in any order,
 * and no stone: a stone says "you have been to this water" and every one of
 * these is somewhere you MOOR, by name, repeatedly, long before you could pay
 * for it. See PORTAL_PORTS.
 *
 * THE ARRAY IS CLAIMED BEFORE THE MONEY MOVES, and claimed CONDITIONALLY, the
 * same shape the tier ladder uses. Two taps racing both pass the read above;
 * writing the array back with a `not.cs` on the id lets exactly one of them
 * through, and the loser is refused before a doubloon has moved. If the payment
 * then fails the berth is taken back out — nobody keeps a berth they did not
 * pay for, and nobody pays for one they already had.
 */
export async function buyPortalPort(portId: string): Promise<
  | { ok: true; ports: string[]; doubloons: number }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const port = PORT_BY_ID[portId]
  if (!port) return { error: 'No such berth.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('portal_ports, doubloons').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }

  const owned = ((profile.portal_ports as string[] | null) ?? [])
  if (owned.includes(portId)) return { error: 'The portal already knows that berth.' }
  if (Number(profile.doubloons ?? 0) < port.cost) {
    return { error: `That berth costs ${port.cost.toLocaleString()} ⟡.` }
  }

  const next = [...owned, portId]
  const { data: claimed } = await admin
    .from('profiles')
    .update({ portal_ports: next })
    .eq('id', user.id)
    .not('portal_ports', 'cs', `{${portId}}`)
    .select('id')
    .maybeSingle()
  if (!claimed) return { error: 'That berth is already being taught. Look again.' }

  const { data: newDoubloons, error: payErr } = await admin
    .rpc('deduct_doubloons', { uid: user.id, amount: port.cost })
  if (payErr || newDoubloons == null) {
    await admin.from('profiles').update({ portal_ports: owned }).eq('id', user.id)
    return { error: 'The payment did not go through.' }
  }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -port.cost,
    reason: `Homestead Portal — ${port.name}`,
  })

  return { ok: true, ports: next, doubloons: Number(newDoubloons) }
}
