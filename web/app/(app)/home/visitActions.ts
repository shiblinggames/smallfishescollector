'use server'

// VISITING SOMEBODY ELSE'S HOMESTEAD.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// The flex half of the homestead is priced at six million doubloons on the
// argument that those pieces exist to be SEEN. It shipped with no way for
// anybody to see them, which made the argument false and the prices arbitrary.
// A captain who spends 1.1M on a mounted giant is currently showing it to an
// empty room.
//
// ── WHAT "FRIEND" MEANS HERE ────────────────────────────────────────────────
//
// MUTUAL follow, both directions. `crew` is a one-way graph — following
// somebody does not ask their permission — so a one-way check would let
// anybody who followed you walk through your house. Requiring both directions
// makes the follow itself the consent, which is why there is no separate
// privacy toggle to forget to set.
//
// Everything here is READ ONLY. There is no action anywhere that spends a
// visitor's money or moves a host's furniture, and the page renders without the
// controls rather than with disabled ones.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EMPTY_HOMESTEAD, builtAt, type Homestead, type HotspotId, type FurnitureSlot } from '@/lib/homestead'
import { PINNED_MAX } from '@/lib/homestead'
import { getEffectiveRod } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getHook } from '@/lib/hooks'
import { PETS } from '@/lib/pets'

export type Visitable = {
  username: string
  /** What their house is, so the list says something before you sail. */
  house: string
  /** How much of the island they have built on, out of six spots. */
  built: number
}

type Row = {
  house: number; portal: number; gallery: number; dock: number; garden: number; beacon: number
  furniture: unknown; owned: string[] | null; pinned: string[] | null
}

const COLS = 'user_id, house, portal, gallery, dock, garden, beacon, furniture, owned, pinned'

function toHomestead(row: Row | null): Homestead {
  if (!row) return EMPTY_HOMESTEAD
  return {
    spots: {
      house: row.house ?? 0, portal: row.portal ?? 0, gallery: row.gallery ?? 0,
      dock: row.dock ?? 0, garden: row.garden ?? 0, beacon: row.beacon ?? 0,
    },
    furniture: (row.furniture ?? {}) as Partial<Record<FurnitureSlot, string>>,
    owned: row.owned ?? [],
    pinned: (row.pinned ?? []).slice(0, PINNED_MAX),
  }
}

/**
 * THE MUTUAL CREW, as a set of ids.
 *
 * Two queries and an intersection rather than a join, because `crew` is read
 * from both directions here and Postgrest cannot express the self-join without
 * a view. Both are indexed lookups on a handful of rows.
 */
async function friendIds(admin: ReturnType<typeof createAdminClient>, me: string): Promise<string[]> {
  const [{ data: iFollow }, { data: followMe }] = await Promise.all([
    admin.from('crew').select('following_id').eq('follower_id', me),
    admin.from('crew').select('follower_id').eq('following_id', me),
  ])
  const mine = new Set(((iFollow ?? []) as { following_id: string }[]).map(r => r.following_id))
  return ((followMe ?? []) as { follower_id: string }[])
    .map(r => r.follower_id)
    .filter(id => mine.has(id))
}

/**
 * WHOSE HOMESTEAD YOU MAY CALL AT.
 *
 * Only friends who have actually built something. A list full of lean-tos
 * belonging to people who have never opened the page is a list nobody reads,
 * and turning up at an empty rock is a wasted sail.
 */
export async function visitableHomesteads(): Promise<Visitable[]> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return []
  const admin = createAdminClient()

  const ids = await friendIds(admin, session.user.id)
  if (!ids.length) return []

  const [{ data: rows }, { data: profiles }] = await Promise.all([
    admin.from('homesteads').select(COLS).in('user_id', ids),
    admin.from('profiles').select('id, username').in('id', ids),
  ])
  const name = Object.fromEntries(((profiles ?? []) as { id: string; username: string | null }[])
    .map(p => [p.id, p.username ?? '']))

  return ((rows ?? []) as (Row & { user_id: string })[])
    .map(r => {
      const h = toHomestead(r)
      const built = (Object.keys(h.spots) as HotspotId[]).filter(k => (h.spots[k] ?? 0) > 0).length
      return { username: name[r.user_id] ?? '', house: builtAt(h, 'house').name, built }
    })
    .filter(v => v.username && v.built > 0)
    .sort((a, b) => b.built - a.built || a.username.localeCompare(b.username))
}

export type Visit = {
  username: string
  homestead: Homestead
  /** Their badges, for the gallery. Read here so the page cannot ask for more
   *  of somebody's profile than the gallery needs. */
  unlocked: string[]
  stamps: Record<string, string | null>
}

/**
 * ONE FRIEND'S HOMESTEAD, or null.
 *
 * Null covers every refusal — not a friend, no such captain, nothing built —
 * with no way to tell them apart from the outside. A visit that fails should
 * not report WHY it failed, or it becomes a way to ask the server whether
 * somebody follows you back.
 */
export async function homesteadOf(username: string): Promise<Visit | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null
  const clean = (username ?? '').trim().toLowerCase()
  if (!clean) return null

  const admin = createAdminClient()
  const { data: host } = await admin
    .from('profiles').select('id, username, unlocked_badges, badge_unlocked_at')
    .ilike('username', clean).maybeSingle()
  if (!host) return null

  // THE GUARD. Checked against the live graph on every visit rather than
  // trusted from the list that was rendered a minute ago — an unfollow has to
  // shut the door immediately, not at the next page load.
  const ids = await friendIds(admin, session.user.id)
  if (!ids.includes(host.id as string)) return null

  const { data: row } = await admin
    .from('homesteads').select(COLS).eq('user_id', host.id).maybeSingle()
  if (!row) return null

  return {
    username: (host.username as string) ?? clean,
    homestead: toHomestead(row as Row),
    unlocked: (host.unlocked_badges as string[] | null) ?? [],
    stamps: (host.badge_unlocked_at as Record<string, string | null> | null) ?? {},
  }
}

/**
 * A FRIEND CURRENTLY ON THE WATER, drawn the way they draw themselves.
 *
 * The whole look travels, not a simplified one. The sea traders get a cut-down
 * `TraderLook` because they are scenery and nobody looks twice; a friend is
 * somebody you sailed out to meet, and the first thing you want to know is
 * whether they are on the good boat yet. Same hull, same hat, same rod, same
 * pet, same character sprite — the exact props `Skipper` takes for you.
 */
export type FriendAtSea = {
  username: string
  x: number
  y: number
  /** Seconds since their boat last reported in. The chart uses it to fade a
   *  mark rather than to hide one: a friend who has just gone quiet is still
   *  worth steering toward for a little while. */
  ago: number
  characterColor: string
  boatId: string | null
  hatId: string | null
  gear: {
    rodSlug: string | null
    rod: string | null
    rodGlow: string | null
    rodColor: string | null
    reel: string | null
    hook: string | null
    pet: string | null
    petArt: string | null
  }
}

/**
 * HOW LONG A BOAT COUNTS AS STILL BEING OUT THERE.
 *
 * The chart flushes a position every twenty seconds while you sail, so two
 * minutes is six missed flushes. Long enough to survive a tunnel, a backgrounded
 * tab or a phone deciding to sleep for a moment; short enough that an arrow
 * never points at somebody who closed the game and went to bed.
 */
const AT_SEA_MS = 2 * 60_000

/**
 * FRIENDS CURRENTLY SAILING.
 *
 * Polled rather than pushed. There is no realtime anywhere in this codebase and
 * this does not need it: the position is already written every twenty seconds
 * for the boat's own sake, so reading it costs one query and is at worst twenty
 * seconds behind. Twenty seconds of sailing is roughly a screen, which is close
 * enough to steer by and gets closer every time either of you flushes.
 *
 * Mutual crew only, same as visiting. Being followed by somebody is not consent
 * to have them told where you are.
 */
export async function friendsAtSea(): Promise<FriendAtSea[]> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return []
  const admin = createAdminClient()

  const ids = await friendIds(admin, session.user.id)
  if (!ids.length) return []

  const cutoff = new Date(Date.now() - AT_SEA_MS).toISOString()
  // Everything `Skipper` needs and nothing else. An explicit column list rather
  // than select('*'), because this is one captain reading another's row and the
  // list is the statement of exactly how much of them is visible.
  const { data } = await admin
    .from('profiles')
    // ONE STRING LITERAL, not a concatenation. supabase-js infers the row type
    // from the literal text of this argument; joining two strings gives it an
    // expression it cannot read, and the whole result silently degrades to an
    // error type that only shows up as a confusing cast failure downstream.
    .select('username, sea_x, sea_y, sea_seen_at, character_color, equipped_boat, equipped_hat, rod_tier, reel_tier, hook_tier, equipped_pet, completionist_effects')
    .in('id', ids)
    .gte('sea_seen_at', cutoff)

  type Row = {
    username: string | null; sea_x: number | null; sea_y: number | null; sea_seen_at: string
    character_color: string | null; equipped_boat: string | null; equipped_hat: string | null
    rod_tier: number | null; reel_tier: number | null; hook_tier: number | null
    equipped_pet: string | null; completionist_effects: number[] | null
  }

  const now = Date.now()
  return ((data ?? []) as Row[])
    .filter(r => r.username && Number.isFinite(Number(r.sea_x)) && Number.isFinite(Number(r.sea_y)))
    .map(r => {
      // Resolved HERE, not on the client. The rod alone needs the completionist
      // effects folded in to know which sprite it is, and shipping tiers would
      // mean every viewer re-deriving the same answer from tables they would
      // then also have to be handed.
      const rod = getEffectiveRod(Number(r.rod_tier ?? 0), r.completionist_effects ?? null)
      const pet = r.equipped_pet ? PETS.find(x => x.species === r.equipped_pet) ?? null : null
      return {
        username: r.username as string,
        x: Number(r.sea_x), y: Number(r.sea_y),
        ago: Math.max(0, Math.round((now - new Date(r.sea_seen_at).getTime()) / 1000)),
        characterColor: r.character_color ?? 'default',
        boatId: r.equipped_boat ?? null,
        hatId: r.equipped_hat ?? null,
        gear: {
          rodSlug: rod.slug ?? null,
          rod: rod.imageUrl ?? null,
          rodGlow: rod.glow ? (rod.glowType ?? 'default') : null,
          rodColor: rod.color ?? null,
          reel: getReel(Number(r.reel_tier ?? 0)).imageUrl ?? null,
          hook: getHook(Number(r.hook_tier ?? 0)).imageUrl ?? null,
          pet: pet?.species ?? null,
          petArt: pet?.restImageUrl ?? null,
        },
      }
    })
}
