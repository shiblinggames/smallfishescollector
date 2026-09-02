'use server'

// GOING ASHORE AT A DISCOVERABLE ISLE.
//
// One isle pays one captain once, ever. Everything that decides what an isle is
// worth lives in lib/seaIsles.ts and is read HERE, on the server — the client
// is told what it found only after the row is safely in.
//
// ── HOW ONCE IS ENFORCED ────────────────────────────────────────────────────
//
// Insert first, grant second, and let the UNIQUE index be the guard. Not
// select-then-insert: that is a check and a write with a gap between them, and
// two taps that land in the same millisecond both pass the check. This is the
// exact bug `collectTrawl` has (read, verify, delete) and the reason it is
// protected today only by a `busy` flag on the client, which is not protection.
//
// A duplicate insert comes back as Postgres 23505 and is not an error worth
// showing: it means somebody double-tapped, or two tabs raced, and the honest
// answer is "you already have this one".

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ISLE_BY_ID, type IsleNote } from '@/lib/seaIsles'
import { PORTAL_STONE_ISLES } from '@/lib/seaPortal'
import { ISLE_FURNISHING } from '@/lib/seaIsles'
import { FURNISHING_BY_ID } from '@/lib/homestead'
import { PLACES } from './chart'
import { getLevelFromXP } from '@/lib/fishingLevel'

export type AshoreResult =
  | { ok: true; already: false; name: string; gems: number; doubloons: number; note: IsleNote | null
      /** A furnishing that was in the chest. The only way to own one. */
      salvage: { id: string; name: string } | null
      /**
       * THE PORTAL STONE, and true only on the landing that WAKES the portal.
       *
       * Derived rather than granted: nothing is written anywhere for this. The
       * discovery row that this landing just inserted is itself the stone, and
       * the flag exists purely so the chest sheet can say so out loud. Finding
       * the one thing that changes how the map works and being told nothing
       * would be the whole reward landing silently.
       */
      stone: boolean }
  | { ok: true; already: true; name: string; note: IsleNote | null }
  | { ok: false; error: string }

/** Every isle this captain has already been ashore at. */
export async function getDiscoveries(): Promise<string[]> {
  const supabase = await createClient()
  // getSession, not getUser: this is a read of the caller's own rows on a hot
  // page load, and getUser costs a round trip to the auth server.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('sea_discoveries').select('isle_id').eq('user_id', session.user.id)
  return ((data ?? []) as { isle_id: string }[]).map(r => r.isle_id)
}

/**
 * GO ASHORE. Claims the isle and returns what was on it.
 *
 * ── WHAT IS ACTUALLY GUARDED, AND WHAT IS NOT ───────────────────────────────
 *
 * The FISHING LEVEL gate is real. The band an isle sits in has a `minLevel`,
 * the same one that locks the water itself, and the server knows the captain's
 * level from their XP. A fresh account cannot reach round the Ancient Deep and
 * strip 945 ◆ off it, because the water it is standing in is shut to them.
 * This is the guard that matters and it is the one that cannot be forged.
 *
 * The POSITION check is best-effort and is documented as such rather than
 * dressed up. `saveSeaPosition` deliberately does not validate what it stores —
 * there is nothing on the chart you can reach by starting somewhere that you
 * could not reach by sailing there — so a forged position is possible, and
 * checking against it only means a client has to lie twice instead of once.
 * It is kept because it costs one column read and it makes the honest path the
 * easy path. It is NOT what stops anyone; the level gate is.
 *
 * Making this properly unforgeable would need the server to simulate the boat,
 * which this hub does not do and should not start doing for 2,000 ◆ spread over
 * 27 rocks on an admin-gated surface.
 */
export async function goAshore(isleId: string): Promise<AshoreResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const isle = ISLE_BY_ID[isleId]
  if (!isle) return { ok: false, error: 'No such island.' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('fishing_xp, sea_x, sea_y').eq('id', user.id).single()
  if (!profile) return { ok: false, error: 'No captain found.' }

  // ── THE LEVEL GATE ────────────────────────────────────────────────────
  const band = PLACES.find(p => p.id === isle.band)
  const level = getLevelFromXP(Number(profile.fishing_xp ?? 0))
  if (band && level < band.minLevel) {
    return { ok: false, error: `${band.name} is shut until Fishing ${band.minLevel}.` }
  }

  // ── THE POSITION CHECK ────────────────────────────────────────────────
  // Generous on purpose: the boat flushes its position on a timer, so the row
  // is behind where you actually are. Three times the ashore range means a
  // legitimate landing never trips it.
  const sx = Number(profile.sea_x ?? NaN), sy = Number(profile.sea_y ?? NaN)
  if (Number.isFinite(sx) && Number.isFinite(sy)) {
    if (Math.hypot(isle.x - sx, isle.y - sy) > (isle.r + 260) * 3) {
      return { ok: false, error: 'You are not close enough to land.' }
    }
  }

  // ── THE CLAIM ─────────────────────────────────────────────────────────
  const { error: insErr } = await admin
    .from('sea_discoveries').insert({ user_id: user.id, isle_id: isle.id })

  if (insErr) {
    // 23505 is the unique index doing its job. Anything else is real.
    if (insErr.code === '23505') {
      return { ok: true, already: true, name: isle.name, note: isle.note ?? null }
    }
    return { ok: false, error: 'The landing did not take. Try again.' }
  }

  // ── THE PAYOUT ────────────────────────────────────────────────────────
  // Only reached when the insert took, so this runs at most once per isle per
  // captain. Notes pay nothing and skip it entirely.
  const gems = isle.gems ?? 0
  const doubloons = isle.doubloons ?? 0
  if (gems > 0) {
    await admin.rpc('increment_gems', { user_id: user.id, amount: gems })
  }
  if (doubloons > 0) {
    // The ledger IS the grant for doubloons, and it is what makes the payout
    // auditable later — an isle that turns out to be paying twice shows up here
    // as two rows with the same reason.
    await admin.from('doubloon_transactions')
      .insert({ user_id: user.id, amount: doubloons, reason: `Ashore: ${isle.name}` })
  }

  // ── AND WHAT WAS ACTUALLY IN THE CHEST ────────────────────────────────
  //
  // Six isles hold the only copy of a homestead furnishing. Inside the same
  // insert-took branch as the coin, so it is granted at most once per captain
  // and the unique index is the guard rather than a read-then-write.
  //
  // Appended to `owned`, which is the list of everything ever acquired — so it
  // behaves like a piece that was paid for from here on: put it out, take it
  // down, put it back, at no cost. It is HOW you got it that is different.
  let salvage: { id: string; name: string } | null = null
  const fid = ISLE_FURNISHING[isle.id]
  if (fid) {
    const item = FURNISHING_BY_ID[fid]
    const { data: row } = await admin
      .from('homesteads').select('owned').eq('user_id', user.id).maybeSingle()
    const owned = ((row?.owned as string[] | null) ?? [])
    if (!owned.includes(fid)) {
      await admin.from('homesteads')
        .upsert({ user_id: user.id, owned: [...owned, fid] }, { onConflict: 'user_id' })
    }
    salvage = item ? { id: fid, name: item.item.name } : null
  }

  // ── DID THIS ONE WAKE THE PORTAL? ─────────────────────────────────────
  // True on the FIRST of the near caches and never again, so the announcement
  // is a moment rather than a label on every chest in the Shallows. Read back
  // from the table so it counts the row we have just written.
  let stone = false
  if (PORTAL_STONE_ISLES.has(isle.id)) {
    const { data: rows } = await admin
      .from('sea_discoveries').select('isle_id').eq('user_id', user.id)
    const opened = ((rows ?? []) as { isle_id: string }[])
      .filter(r => PORTAL_STONE_ISLES.has(r.isle_id))
    stone = opened.length === 1
  }

  return { ok: true, already: false, name: isle.name, gems, doubloons, note: isle.note ?? null, salvage, stone }
}
