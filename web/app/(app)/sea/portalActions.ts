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
import { PORTAL_TIERS, CACHE_ISLE_IDS, componentsAvailable } from '@/lib/seaPortal'

export async function buyPortalTier(): Promise<
  | { ok: true; tier: number; components: number; doubloons: number }
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
  const spent = Number(profile.portal_components_spent ?? 0)
  const have = componentsAvailable(discovered, spent)
  if (have < next.components) {
    const opened = discovered.filter(id => CACHE_ISLE_IDS.has(id)).length
    return {
      error: `This stage needs ${next.components} components and you hold ${have}. ` +
        `They come from the sea's cache chests — you have opened ${opened} of ${CACHE_ISLE_IDS.size}.`,
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
    .update({ portal_tier: next.tier, portal_components_spent: spent + next.components })
    .eq('id', user.id).eq('portal_tier', current)
    .select('id').maybeSingle()
  if (!claimed) return { error: 'The portal is already being worked on. Look again.' }

  const { data: newDoubloons, error: payErr } = await admin
    .rpc('deduct_doubloons', { uid: user.id, amount: next.cost })
  if (payErr || newDoubloons == null) {
    await admin.from('profiles')
      .update({ portal_tier: current, portal_components_spent: spent })
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
    components: have - next.components,
    doubloons: Number(newDoubloons),
  }
}
