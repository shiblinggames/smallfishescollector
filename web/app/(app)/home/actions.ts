'use server'

// BUILDING, FURNISHING, AND STEPPING THROUGH THE STONES.
//
// Every price lives in lib/homestead.ts and is read HERE. Nothing about what a
// thing cost is ever stored, so retuning the ladder can never leave a row
// disagreeing with the shop.
//
// ── HOW THE MONEY MOVES ─────────────────────────────────────────────────────
//
// `deduct_doubloons` first, then a GUARDED update, then the ledger row. That is
// the house pattern (see crew/bunkActions.ts) and every part of it earns its
// place:
//
//   The RPC is an atomic relative debit, so two concurrent buys cannot both
//   read the same balance and pay once between them.
//
//   It returns the NEW BALANCE, or null when there was not enough. Checked
//   against null and never for truthiness: a captain who spends their way to
//   exactly zero gets 0 back, and `if (!balance)` would tell them they could
//   not afford the thing they had just been charged for.
//
//   The update is filtered on the tier we priced against, so if two taps both
//   paid, only one can land the build and the loser is refunded.
//
// `upgradeCrewHall` predates all of this and uses an absolute overwrite with no
// ledger row. Follow this, not that.
//
// The ledger row is written after, with the name of what was bought, so a spend
// nobody remembers making can be traced back to the exact build.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  HOTSPOT_BY_ID, FURNISHING_BY_ID, EMPTY_HOMESTEAD, PINNED_MAX,
  openSlots, builtAt,
  type Homestead, type HotspotId, type FurnitureSlot,
} from '@/lib/homestead'
import { PLACES } from '../sea/chart'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { coastline, standsOnGrass } from '@/lib/islandShape'

export type BuildResult =
  | { ok: true; homestead: Homestead; spent: number; built: string }
  | { ok: false; error: string }

/** Rows come back as loose json; this is the one place that is tidied up. */
function rowToHomestead(row: {
  house: number; portal: number; gallery: number; dock: number; garden: number; beacon: number
  furniture: unknown; owned: string[] | null; pinned: string[] | null
  layout?: unknown
} | null): Homestead {
  if (!row) return EMPTY_HOMESTEAD
  const furniture = (row.furniture ?? {}) as Partial<Record<FurnitureSlot, string>>
  return {
    spots: {
      house: row.house ?? 0, portal: row.portal ?? 0, gallery: row.gallery ?? 0,
      dock: row.dock ?? 0, garden: row.garden ?? 0, beacon: row.beacon ?? 0,
    },
    furniture,
    owned: row.owned ?? [],
    pinned: (row.pinned ?? []).slice(0, PINNED_MAX),
    layout: (row.layout ?? {}) as Homestead['layout'],
  }
}

// ONE STRING LITERAL, never a concatenation — supabase-js infers the row type
// from the literal text of this argument and a joined expression degrades the
// whole result to an error type.
const COLS = 'house, portal, gallery, dock, garden, beacon, furniture, owned, pinned, layout'

/**
 * THE CAPTAIN'S HOMESTEAD, creating the row on first look.
 *
 * A missing row and a brand new homestead are the same thing, so this never
 * errors on absence — it returns the empty one and lets the first purchase
 * create the row.
 */
/**
 * A FAILED READ IS NOT AN EMPTY HOMESTEAD.
 *
 * This threw away the error and passed the null straight to `rowToHomestead`,
 * which returns EMPTY_HOMESTEAD — indistinguishable from a captain who has
 * never built anything. So when three columns turned out to be missing from the
 * table, a finished house read back as a lean-to and every piece of furniture
 * read back as unowned and had to be bought again. The writes had been landing
 * the whole time; only the reads were lying.
 *
 * Throwing is the right answer for something people spend millions of doubloons
 * on. A page that fails loudly gets fixed; a page that quietly says you own
 * nothing gets you charged twice.
 */
function orThrow<T>(data: T, error: { message?: string } | null, where: string): T {
  if (error) throw new Error(`homestead ${where}: ${error.message ?? 'read failed'}`)
  return data
}

export async function getHomestead(): Promise<Homestead> {
  const supabase = await createClient()
  // getSession, not getUser: own-row read on a page load.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return EMPTY_HOMESTEAD
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('homesteads').select(COLS).eq('user_id', session.user.id).maybeSingle()
  return rowToHomestead(orThrow(data, error, 'load') as Parameters<typeof rowToHomestead>[0])
}

/** Read for a write. Same shape, but with the id we are about to spend against. */
async function loadFor(userId: string): Promise<Homestead> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('homesteads').select(COLS).eq('user_id', userId).maybeSingle()
  // MUST NOT PROCEED ON A BAD READ. Everything downstream prices against this:
  // an empty homestead means tier 0 everywhere and nothing owned, so a failed
  // read would happily charge somebody to build what they already have.
  return rowToHomestead(orThrow(data, error, 'load') as Parameters<typeof rowToHomestead>[0])
}

/**
 * BUILD THE NEXT THING ON A SPOT.
 *
 * One step at a time and always the next one: the client sends WHICH SPOT, never
 * which tier. A tier from the client is a number somebody can edit, and the
 * cheapest way to make that meaningless is to never read it.
 */
export async function build(spotId: string): Promise<BuildResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const spot = HOTSPOT_BY_ID[spotId as HotspotId]
  if (!spot) return { ok: false, error: 'No such spot.' }

  const admin = createAdminClient()
  const current = await loadFor(user.id)
  const tier = current.spots[spot.id] ?? 0
  const next = spot.builds[tier + 1]
  if (!next) return { ok: false, error: `${spot.label} is finished.` }

  // THE ROW HAS TO EXIST BEFORE IT CAN BE GUARDED. A first-time builder has no
  // homestead row, and there is nothing to put a conditional update against.
  await admin.from('homesteads').upsert(
    { user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true },
  ).then(() => {}, () => {})

  // ── PAY ───────────────────────────────────────────────────────────────
  // Returns the NEW BALANCE, or null when there was not enough. Compared
  // against null and not for truthiness: a captain who spends their way to
  // exactly zero gets back 0, and `if (!balance)` would tell them they could
  // not afford the thing they had just paid for.
  const { data: balance } = await admin.rpc('deduct_doubloons', { uid: user.id, amount: next.cost })
  if (balance == null) return { ok: false, error: `Need ${next.cost.toLocaleString()} \u27e1` }

  // ── BUILD, GUARDED ON THE TIER WE PRICED AGAINST ──────────────────────
  // Two taps in the same instant both read tier N and both pay; without this
  // filter both would then write N+1 and one of those payments would buy
  // nothing. Only one update can match, and the loser gets refunded.
  const { data: done } = await admin.from('homesteads')
    .update({ [spot.id]: tier + 1, updated_at: new Date().toISOString() })
    .eq('user_id', user.id).eq(spot.id, tier)
    .select('user_id')

  if (!done?.length) {
    await admin.rpc('deduct_doubloons', { uid: user.id, amount: -next.cost })
    return { ok: false, error: 'That was already built. Nothing was taken.' }
  }

  await admin.from('doubloon_transactions')
    .insert({ user_id: user.id, amount: -next.cost, reason: `Homestead: ${next.name}` })
    .then(() => {}, () => {})

  return {
    ok: true, spent: next.cost, built: next.name,
    homestead: { ...current, spots: { ...current.spots, [spot.id]: tier + 1 } },
  }
}

/**
 * PUT SOMETHING IN A SLOT.
 *
 * Buying and placing are the same act. A separate inventory of furniture you
 * own but have not put out would be a second screen for a decision nobody wants
 * to make twice, and every piece is permanent anyway — so swapping back to one
 * you already paid for is free, which is what the `owned` check below is for.
 */
export async function furnish(furnishingId: string): Promise<BuildResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const found = FURNISHING_BY_ID[furnishingId]
  if (!found) return { ok: false, error: 'No such thing.' }
  const { slot, item } = found

  const admin = createAdminClient()
  const current = await loadFor(user.id)

  // THE HOUSE HAS TO BE BIG ENOUGH. Slots open with the house, and a slot that
  // is not open is not a slot you can put anything in.
  if (!openSlots(current).includes(slot)) {
    return { ok: false, error: `${builtAt(current, 'house').name} has no room for that yet.` }
  }
  const prev = current.furniture[slot]
  if (prev === item.id) return { ok: false, error: 'That is already there.' }

  await admin.from('homesteads').upsert(
    { user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true },
  ).then(() => {}, () => {})

  // ALREADY PAID FOR ONCE. Pieces are permanent, so putting back something you
  // owned before is free — otherwise every captain picks one piece per slot and
  // never touches it again, which is the opposite of a room you decorate.
  const owned = (current.owned ?? []).includes(item.id)
  if (item.cost > 0 && !owned) {
    const { data: balance } = await admin.rpc('deduct_doubloons', { uid: user.id, amount: item.cost })
    if (balance == null) return { ok: false, error: `Need ${item.cost.toLocaleString()} \u27e1` }
  }

  const furniture = { ...current.furniture, [slot]: item.id }
  const ownedNext = owned ? current.owned ?? [] : [...(current.owned ?? []), item.id]
  const { data: done } = await admin.from('homesteads')
    .update({ furniture, owned: ownedNext, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('user_id')

  if (!done?.length) {
    if (item.cost > 0 && !owned) {
      await admin.rpc('deduct_doubloons', { uid: user.id, amount: -item.cost })
    }
    return { ok: false, error: 'It would not sit right. Nothing was taken.' }
  }

  if (item.cost > 0 && !owned) {
    await admin.from('doubloon_transactions')
      .insert({ user_id: user.id, amount: -item.cost, reason: `Homestead: ${item.name}` })
      .then(() => {}, () => {})
  }
  return {
    ok: true, spent: owned ? 0 : item.cost, built: item.name,
    homestead: { ...current, furniture, owned: ownedNext },
  }
}

/** Which badges hang large. Costs nothing; the gallery already paid for it. */
export async function pinBadges(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }
  const admin = createAdminClient()
  const current = await loadFor(user.id)
  if (current.spots.gallery < 2) return { ok: false, error: 'Nowhere to hang them yet.' }
  const pinned = [...new Set(ids)].slice(0, PINNED_MAX)
  // A plain UPDATE, touching only what changed. The upsert-the-whole-row shape
  // this used to have would happily write back a stale copy of every other
  // column if anything else had moved in between.
  await admin.from('homesteads')
    .update({ pinned, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
  return { ok: true }
}

export type Destination = { id: string; name: string; x: number; y: number; note: string }

/**
 * WHERE THE STONES WILL TAKE YOU, for this captain, right now.
 *
 * Computed on the SERVER from the portal tier and the fishing level, so the
 * list the client renders is the list the client is allowed to have. A tier 1
 * portal offering a band it cannot reach would be a button that lies.
 */
export async function portalDestinations(): Promise<Destination[]> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return []
  const admin = createAdminClient()
  const [{ data: profile }, home] = await Promise.all([
    admin.from('profiles').select('fishing_xp').eq('id', session.user.id).single(),
    loadFor(session.user.id),
  ])
  const tier = home.spots.portal ?? 0
  if (tier < 1) return []

  const out: Destination[] = []
  if (tier >= 2) {
    for (const p of PLACES) {
      if (p.kind !== 'port' || p.id === 'home') continue
      out.push({ id: p.id, name: p.name, x: p.x, y: p.y, note: p.blurb })
    }
  }
  if (tier >= 3) {
    // THE OUTER EDGE OF EACH BAND, not its middle. The middle is where the
    // fishing is the same as anywhere else in the ring; the outer edge is the
    // part that costs the most to sail to, which is the part worth skipping.
    const level = getLevelFromXP(Number(profile?.fishing_xp ?? 0))
    for (const p of PLACES) {
      if (p.outer === undefined || level < p.minLevel) continue
      out.push({
        id: p.id, name: p.name,
        x: 0, y: p.outer - 400,
        note: `The far edge, ${Math.round((p.outer - 400) / 10).toLocaleString()}m out`,
      })
    }
  }
  return out
}

/**
 * STEP THROUGH.
 *
 * Writes the boat's position and nothing else. The destination is re-derived
 * here rather than taken from the client, so the only places the stones can put
 * you are the ones `portalDestinations` was willing to offer.
 *
 * There is no cooldown and no fee. The portal removes the sail you have already
 * done; charging for that would just be a tax on having finished something.
 */
export async function stepThrough(destId: string): Promise<{ ok: boolean; error?: string; x?: number; y?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const home = await loadFor(user.id)
  if ((home.spots.portal ?? 0) < 1) return { ok: false, error: 'The stones are down.' }

  // Home is always reachable once the stones are up, and is not in the list.
  let target: { x: number; y: number } | null = null
  if (destId === 'home') {
    const h = PLACES.find(p => p.id === 'home')
    if (h) target = { x: h.x, y: h.y + h.r + 120 }
  } else {
    const allowed = await portalDestinations()
    const d = allowed.find(a => a.id === destId)
    if (d) target = { x: d.x, y: d.y }
  }
  if (!target) return { ok: false, error: 'The stones will not reach there.' }

  const admin = createAdminClient()
  await admin.from('profiles')
    .update({ sea_x: target.x, sea_y: target.y }).eq('id', user.id)
  return { ok: true, x: target.x, y: target.y }
}

/**
 * MOVE ONE OF YOUR BUILDINGS.
 *
 * The six spots ship with designed positions and those stay the default. This
 * writes an override into `homesteads.layout`, so a homestead nobody has
 * rearranged reads exactly the way it was laid out, and a spot with no override
 * falls through to the default even after a seventh is added later.
 *
 * ── THE SERVER DECIDES WHAT IS ON THE LAND ──────────────────────────────
 *
 * The drag happens in a browser and a browser belongs to its player, so the
 * position arriving here is a request rather than a fact. It is checked against
 * `lib/islandShape` — the SAME module the chart draws the coastline from and
 * the build check polices it with — so there is no second opinion about where
 * the grass is. That mattered: for months there WAS a second opinion, the
 * checker's, and it was 35% too generous.
 *
 * Checked against the WIDEST build on the spot, not the one standing there
 * today. Otherwise a captain parks a lean-to on a headland it just fits, buys
 * the Estate, and the Estate is in the sea with no way to move it back that the
 * game ever offered them.
 */
export async function moveBuilding(spotId: string, x: number, y: number): Promise<
  { ok: true; homestead: Homestead } | { ok: false; error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const spot = HOTSPOT_BY_ID[spotId as HotspotId]
  if (!spot) return { ok: false, error: 'No such spot.' }

  // Reject NaN and Infinity before they reach the geometry, where they would
  // quietly pass every comparison and be written to the row.
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, error: 'Nowhere in particular.' }
  const nx = Math.round(Math.max(0, Math.min(100, x)))
  const ny = Math.round(Math.max(0, Math.min(100, y)))

  const widest = Math.max(...spot.builds.map(b => b.scale))
  if (!standsOnGrass(coastline('home'), nx, ny, widest)) {
    return { ok: false, error: 'It would not stand there.' }
  }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('homesteads').select(COLS).eq('user_id', user.id).maybeSingle()
  if (error) throw new Error(error.message)

  const home = rowToHomestead(row as Parameters<typeof rowToHomestead>[0])
  const layout = { ...home.layout, [spot.id]: { x: nx, y: ny } }

  const { error: wErr } = await admin.from('homesteads')
    .upsert({ user_id: user.id, layout }, { onConflict: 'user_id' })
  if (wErr) throw new Error(wErr.message)

  return { ok: true, homestead: { ...home, layout } }
}
