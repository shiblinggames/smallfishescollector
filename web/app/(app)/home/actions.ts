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
  HOUSE, FURNISHING_BY_ID, EMPTY_HOMESTEAD, PINNED_MAX,
  openSlots, builtAt, houseTier,
  ROOM_BY_ID,
  type Homestead, type FurnitureSlot,
} from '@/lib/homestead'
import { PLACES } from '../sea/chart'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { coastline, standsOnLand } from '@/lib/islandShape'
import { ISLES } from '@/lib/seaIsles'

export type BuildResult =
  | { ok: true; homestead: Homestead; spent: number; built: string }
  | { ok: false; error: string }

/** Rows come back as loose json; this is the one place that is tidied up. */
function rowToHomestead(row: {
  house: number; garden: number; beacon: number
  furniture: unknown; owned: string[] | null; pinned: string[] | null
} | null): Homestead {
  if (!row) return EMPTY_HOMESTEAD
  const furniture = (row.furniture ?? {}) as Partial<Record<FurnitureSlot, string>>
  return {
    // ONE LADDER. `garden` and `beacon` joined `portal`, `gallery`, `dock` and
    // `layout` as columns nothing reads: dropping a column is the one migration
    // that can only lose data, and these hold what people paid. See Homestead.
    house: row.house ?? 0,
    furniture,
    owned: row.owned ?? [],
    pinned: (row.pinned ?? []).slice(0, PINNED_MAX),
  }
}

// ONE STRING LITERAL, never a concatenation — supabase-js infers the row type
// from the literal text of this argument and a joined expression degrades the
// whole result to an error type.
const COLS = 'house, furniture, owned, pinned'

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
export async function build(): Promise<BuildResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const admin = createAdminClient()
  const current = await loadFor(user.id)
  const tier = houseTier(current)
  const next = HOUSE[tier + 1]
  if (!next) return { ok: false, error: 'The Estate is finished.' }

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
    .update({ house: tier + 1, updated_at: new Date().toISOString() })
    .eq('user_id', user.id).eq('house', tier)
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
    homestead: { ...current, house: tier + 1 },
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
    return { ok: false, error: `${builtAt(current).name} has no room for that yet.` }
  }
  const prev = current.furniture[slot]
  if (prev === item.id) return { ok: false, error: 'That is already there.' }

  // ── SALVAGE CANNOT BE BOUGHT ──────────────────────────────────────────
  //
  // A `found` piece carries `cost: 0`, because it genuinely has no price. The
  // payment branch below is guarded on `item.cost > 0`, so without this check
  // every one of them would have been free to anybody who tapped it — the six
  // best pieces in the game, handed out for a click.
  //
  // Owning one means having stood on the isle that holds it. `owned` is the
  // record of that, written by goAshore.
  if (item.found && !(current.owned ?? []).includes(item.id)) {
    const isle = ISLES.find(i => i.id === item.found!.isle)
    return { ok: false, error: `Nobody sells that. There is one, on ${isle?.name ?? 'an isle a long way out'}.` }
  }

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
  // THE GALLERY IS A ROOM NOW, opened by the house rather than bought as its
  // own building — so what gates pinning is having the room at all. Same gate,
  // read off the thing that actually grants it.
  if (houseTier(current) < ROOM_BY_ID.gallery.needsHouse) {
    return { ok: false, error: 'Nowhere to hang them yet.' }
  }
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

// ── portalDestinations, stepThrough AND moveBuilding ARE GONE ───────────────
//
// THE FIRST TWO WERE A SECOND PORTAL. `homesteads.portal` had its own ladder,
// its own reach and its own teleport, and `profiles.portal_tier` had the ring on
// the water off the same island. Two portals, both working, both moving your
// boat, and only one of them was ever somewhere you sailed to. lib/seaPortal is
// the portal now; this one is deleted rather than left exported, because a dead
// teleport is one import away from being live again.
//
// AND moveBuilding WAS "ARRANGE THE ISLAND". With three spots rather than six
// there is nothing to arrange, and an island that reads as designed from a
// passing boat is worth more than one every captain has nudged slightly left.
