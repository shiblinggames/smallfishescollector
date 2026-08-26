'use server'

// BOTTLES, BEARINGS, AND WHAT IS BURIED UNDER THEM.
//
// Two actions with one shape: the server re-derives the world itself, decides
// what you found, and writes the row BEFORE it grants anything.
//
// ── WHY THE SERVER RE-DERIVES THE BOTTLE ────────────────────────────────────
//
// The client sends a bottle KEY, not a bottle. The key is a cell and a window,
// and `bottleFromKey` runs the same hash the map ran to draw it — so a forged
// key either resolves to a bottle that genuinely is there, or to nothing. There
// is no way to describe a bottle into existence, and a key from an hour ago is
// refused outright.
//
// That matters more here than it did for the isles. A bottle is infinite, and
// anything infinite that can be faked is a faucet.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bottleFromKey, bottlePos, fragmentFor, carriesBearing, BOTTLE_REACH } from '@/lib/seaBottles'
import { DIG_BY_ID, DIG_SITES, DIG_RANGE, bearingText, type DigSite } from '@/lib/seaDigs'
import { PLACES } from './chart'
import { getLevelFromXP } from '@/lib/fishingLevel'

export type BottleResult =
  | { ok: true; kind: 'fragment'; text: string }
  | { ok: true; kind: 'bearing'; name: string; band: string; text: string; bearing: string }
  | { ok: false; error: string }

export type DigResult =
  | { ok: true; name: string; gems: number; doubloons: number; found: string }
  | { ok: false; error: string }

/** Bearings held, and which of those are already dug. */
export type DigState = { bearings: string[]; dug: string[] }

export async function getDigState(): Promise<DigState> {
  const supabase = await createClient()
  // getSession, not getUser: own-rows read on a hot page load.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { bearings: [], dug: [] }
  const admin = createAdminClient()
  const { data } = await admin
    .from('sea_digs').select('site_id, dug_at').eq('user_id', session.user.id)
  const rows = (data ?? []) as { site_id: string; dug_at: string | null }[]
  return {
    bearings: rows.map(r => r.site_id),
    dug: rows.filter(r => r.dug_at).map(r => r.site_id),
  }
}

/**
 * FISH A BOTTLE OUT AND READ IT.
 *
 * Grants no currency, ever — see the header of lib/seaBottles for why an
 * infinite thing must not pay. The most it can hand over is a bearing, and a
 * bearing is a row in a table, not money.
 */
export async function openBottle(key: string): Promise<BottleResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const bottle = bottleFromKey(key)
  if (!bottle) return { ok: false, error: 'The tide took it.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('fishing_xp, sea_x, sea_y').eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'No captain found.' }

  // WERE YOU ACTUALLY ALONGSIDE IT. The map flushes the boat's position
  // immediately before calling this, so the row is current rather than up to
  // twenty seconds stale — the mistake that made the isles refuse legitimate
  // landings. Generous anyway: the bottle drifts while you reach for it.
  const sx = Number(profile.sea_x ?? NaN), sy = Number(profile.sea_y ?? NaN)
  if (Number.isFinite(sx) && Number.isFinite(sy)) {
    const at = bottlePos(bottle, Date.now() / 1000)
    if (Math.hypot(at.x - sx, at.y - sy) > BOTTLE_REACH * 3) {
      return { ok: false, error: 'It is out of reach.' }
    }
  }

  const fragment = fragmentFor(bottle)
  if (!carriesBearing(bottle)) return { ok: true, kind: 'fragment', text: fragment }

  // ── THE BEARING ───────────────────────────────────────────────────────
  //
  // Chosen HERE rather than baked into the bottle, because which site is worth
  // pointing at depends on the captain: one they already hold is not a prize,
  // and the deep sites are meaningless to somebody who cannot legally sail
  // there. So a bottle that "carries a bearing" carries whichever bearing this
  // captain still needs, and once they need none it carries a fragment instead.
  const { data: held } = await admin
    .from('sea_digs').select('site_id').eq('user_id', user.id)
  const have = new Set(((held ?? []) as { site_id: string }[]).map(r => r.site_id))

  const fishing = getLevelFromXP(Number(profile.fishing_xp ?? 0))
  const open = DIG_SITES.filter(d => {
    if (have.has(d.id)) return false
    const band = PLACES.find(p => p.id === d.band)
    return !band || fishing >= band.minLevel
  })
  if (!open.length) return { ok: true, kind: 'fragment', text: fragment }

  // Nearest first, so an early captain is sent somewhere they can reach rather
  // than across the whole chart. Ties broken by the site's own order, which is
  // shallow to deep, so this is stable and never random.
  const pick = open.reduce<DigSite>((best, d) =>
    Math.hypot(d.x - bottle.x, d.y - bottle.y) < Math.hypot(best.x - bottle.x, best.y - bottle.y) ? d : best,
    open[0])

  // Insert, and treat a duplicate as already-held rather than an error: two
  // bottles opened in the same instant can both land on the same site.
  const { error: insErr } = await admin
    .from('sea_digs').insert({ user_id: user.id, site_id: pick.id })
  if (insErr && insErr.code !== '23505') {
    return { ok: false, error: 'The paper came apart in your hands. Try another.' }
  }

  return {
    ok: true, kind: 'bearing',
    name: pick.name, band: pick.band,
    text: fragment, bearing: bearingText(pick),
  }
}

/**
 * DIG.
 *
 * Claimed with a CONDITIONAL UPDATE — `dug_at is null` in the filter, and the
 * grant runs only for a row that actually came back. Two taps in the same
 * instant produce one payout, because the second update matches nothing.
 *
 * A bearing is NOT required. If you happened to sail across the spot, the spade
 * comes out: the row is created here in that case. Rewarding the accident is
 * most of what makes the sea feel like it has things in it rather than tasks.
 */
export async function digHere(siteId: string): Promise<DigResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const site = DIG_BY_ID[siteId]
  if (!site) return { ok: false, error: 'There is nothing here.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('fishing_xp, sea_x, sea_y').eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'No captain found.' }

  const band = PLACES.find(p => p.id === site.band)
  const level = getLevelFromXP(Number(profile.fishing_xp ?? 0))
  if (band && level < band.minLevel) {
    return { ok: false, error: `${band.name} is shut until Fishing ${band.minLevel}.` }
  }

  const sx = Number(profile.sea_x ?? NaN), sy = Number(profile.sea_y ?? NaN)
  if (Number.isFinite(sx) && Number.isFinite(sy)) {
    if (Math.hypot(site.x - sx, site.y - sy) > DIG_RANGE * 2) {
      return { ok: false, error: 'You are not over it.' }
    }
  }

  // Make sure there is a row to claim. Somebody digging on an accident has no
  // bearing row yet; somebody following a bottle does. Either way this settles
  // it without a read.
  await admin.from('sea_digs')
    .insert({ user_id: user.id, site_id: site.id })
    .then(() => {}, () => {})          // 23505 is fine and expected

  // THE CLAIM. Only matches while it is still unclaimed.
  const { data: claimed } = await admin
    .from('sea_digs')
    .update({ dug_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('site_id', site.id).is('dug_at', null)
    .select('id')

  if (!claimed?.length) {
    return { ok: false, error: 'This one is already up. The hole is still here.' }
  }

  await admin.rpc('increment_gems', { user_id: user.id, amount: site.gems })
  await admin.from('doubloon_transactions')
    .insert({ user_id: user.id, amount: site.doubloons, reason: `Dug up: ${site.name}` })

  return { ok: true, name: site.name, gems: site.gems, doubloons: site.doubloons, found: site.found }
}
