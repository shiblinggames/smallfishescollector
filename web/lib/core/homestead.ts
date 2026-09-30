// ── THE HOMESTEAD, CORE (Steam prep, 2026-09-29) ──
//
// Building the house, naming the island, furnishing the rooms and pinning
// badges, with nothing of the web in it. Each takes the store (ProgressData)
// and the captain's id. On the web home/actions checks the session and hands
// these the Supabase store; offline, the local save's.
//
// Every price lives in lib/homestead and is read HERE; nothing about what a
// thing cost is ever stored. THE MONEY MOVES the house way: spend first (in
// place, the result is the guard), then a guarded write, then the ledger line,
// and a write that does not land hands the coin back.
//
// Visiting somebody else's homestead is between players and stays on the web
// (home/visitActions).
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; table reads and guarded writes became store operations; the clock is
// the game's.

import { clockNow } from '@/lib/clock'
import {
  HOUSE, FURNISHING_BY_ID, EMPTY_HOMESTEAD, PINNED_MAX,
  openSlots, builtAt, houseTier, ROOM_BY_ID,
  type Homestead, type FurnitureSlot,
} from '@/lib/homestead'
import { ISLES } from '@/lib/seaIsles'
import type { ProgressData, HomesteadDbRow } from '@/lib/data/progressData'

export type BuildResult =
  | { ok: true; homestead: Homestead; spent: number; built: string }
  | { ok: false; error: string }

const nowIso = () => new Date(clockNow()).toISOString()

/** Rows come back as loose json; this is the one place that is tidied up. */
function rowToHomestead(row: HomesteadDbRow | null): Homestead {
  if (!row) return EMPTY_HOMESTEAD
  return {
    house: row.house ?? 0,
    name: row.name ?? null,
    furniture: (row.furniture ?? {}) as Partial<Record<FurnitureSlot, string>>,
    owned: row.owned ?? [],
    pinned: (row.pinned ?? []).slice(0, PINNED_MAX),
  }
}

/** The captain's homestead. A missing row IS a brand-new homestead; a FAILED
 *  read throws (the store's homestead() does), because a read that quietly
 *  says you own nothing gets you charged twice. */
export async function getHomestead(db: ProgressData, uid: string): Promise<Homestead> {
  return rowToHomestead(await db.homestead(uid))
}

/** Build the next step of the house. Always the next one: the client never
 *  sends a tier. */
export async function build(db: ProgressData, uid: string): Promise<BuildResult> {
  const current = rowToHomestead(await db.homestead(uid))
  const tier = houseTier(current)
  const next = HOUSE[tier + 1]
  if (!next) return { ok: false, error: 'The Estate is finished.' }

  // The row has to exist before it can be guarded.
  await db.ensureHomestead(uid)

  // PAY. Compared against null, never for truthiness: spending your way to
  // exactly zero gets back 0.
  const balance = await db.spend(uid, 'doubloons', next.cost)
  if (balance === null) return { ok: false, error: `Need ${next.cost.toLocaleString()} ⟡` }

  // BUILD, GUARDED ON THE TIER WE PRICED AGAINST: two taps both pay, only one
  // lands, the loser is refunded.
  if (!(await db.buildHouse(uid, tier, tier + 1, nowIso()))) {
    await db.grant(uid, 'doubloons', next.cost)
    return { ok: false, error: 'That was already built. Nothing was taken.' }
  }
  await db.ledger(uid, -next.cost, `Homestead: ${next.name}`).catch(() => {})
  return { ok: true, spent: next.cost, built: next.name, homestead: { ...current, house: tier + 1 } }
}

/**
 * Name your own island. Free, unlimited and not unique. It goes on a signboard
 * that strangers sail past, so the character class is most of the defence (no
 * markup, no links, no zero-width tricks). An empty box goes back to the
 * default name.
 */
export async function renameHomestead(db: ProgressData, uid: string, name: string): Promise<BuildResult> {
  // Collapse runs of whitespace, so spacing cannot fake indentation on the chart.
  const clean = name.replace(/\s+/g, ' ').trim()
  const current = rowToHomestead(await db.homestead(uid))

  if (clean === '') {
    await db.upsertHomestead(uid, { name: null })
    return { ok: true, spent: 0, built: 'The Homestead', homestead: { ...current, name: null } }
  }
  if (clean.length < 2 || clean.length > 24) return { ok: false, error: 'A name wants between 2 and 24 characters.' }
  if (!/^[\p{L}\p{N} '\-&]+$/u.test(clean)) return { ok: false, error: 'Letters, numbers, spaces, apostrophes and hyphens only.' }

  await db.upsertHomestead(uid, { name: clean })
  return { ok: true, spent: 0, built: clean, homestead: { ...current, name: clean } }
}

/**
 * Put something in a slot. Buying and placing are one act; every piece is
 * permanent, so putting back one you already own is free.
 */
export async function furnish(db: ProgressData, uid: string, furnishingId: string): Promise<BuildResult> {
  const found = FURNISHING_BY_ID[furnishingId]
  if (!found) return { ok: false, error: 'No such thing.' }
  const { slot, item } = found
  const current = rowToHomestead(await db.homestead(uid))

  // The house has to be big enough: slots open with the house.
  if (!openSlots(current).includes(slot)) return { ok: false, error: `${builtAt(current).name} has no room for that yet.` }
  if (current.furniture[slot] === item.id) return { ok: false, error: 'That is already there.' }

  // SALVAGE CANNOT BE BOUGHT: a found piece has no price, so without this every
  // one would be free to anybody who tapped it. Owning one means having stood on
  // the isle that holds it.
  if (item.found && !(current.owned ?? []).includes(item.id)) {
    const isle = ISLES.find(i => i.id === item.found!.isle)
    return { ok: false, error: `Nobody sells that. There is one, on ${isle?.name ?? 'an isle a long way out'}.` }
  }

  await db.ensureHomestead(uid)
  const owned = (current.owned ?? []).includes(item.id)
  if (item.cost > 0 && !owned) {
    const balance = await db.spend(uid, 'doubloons', item.cost)
    if (balance === null) return { ok: false, error: `Need ${item.cost.toLocaleString()} ⟡` }
  }

  const furniture = { ...current.furniture, [slot]: item.id }
  const ownedNext = owned ? current.owned ?? [] : [...(current.owned ?? []), item.id]
  if (!(await db.updateHomestead(uid, { furniture, owned: ownedNext, updated_at: nowIso() }))) {
    if (item.cost > 0 && !owned) await db.grant(uid, 'doubloons', item.cost)
    return { ok: false, error: 'It would not sit right. Nothing was taken.' }
  }
  if (item.cost > 0 && !owned) await db.ledger(uid, -item.cost, `Homestead: ${item.name}`).catch(() => {})
  return { ok: true, spent: owned ? 0 : item.cost, built: item.name, homestead: { ...current, furniture, owned: ownedNext } }
}

/** Which badges hang large. Free; the gallery room is what gates it, and only
 *  badges actually earned can hang. */
export async function pinBadges(db: ProgressData, uid: string, ids: string[]): Promise<{ ok: boolean; error?: string }> {
  const current = rowToHomestead(await db.homestead(uid))
  if (houseTier(current) < ROOM_BY_ID.gallery.needsHouse) return { ok: false, error: 'Nowhere to hang them yet.' }
  const earned = new Set(((await db.profile(uid, 'unlocked_badges'))?.unlocked_badges as string[] | null) ?? [])
  const pinned = [...new Set(Array.isArray(ids) ? ids : [])]
    .filter(id => typeof id === 'string' && earned.has(id))
    .slice(0, PINNED_MAX)
  // Only what changed, never a stale copy of the whole row.
  await db.updateHomestead(uid, { pinned, updated_at: nowIso() })
  return { ok: true }
}
