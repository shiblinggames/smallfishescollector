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
import { EMPTY_HOMESTEAD, builtAt, houseTier, type Homestead, type FurnitureSlot } from '@/lib/homestead'
import { PINNED_MAX } from '@/lib/homestead'
import { isPremiumActive } from '@/lib/premium'
import { getEffectiveRod } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { getHook } from '@/lib/hooks'
import { PETS } from '@/lib/pets'

export type Visitable = {
  username: string
  /** What their house is, so the list says something before you sail. */
  house: string
  /** Which rung their house is on, 0..4. Sorts the list, so the captains
   *  worth the sail are at the top of it. */
  built: number
}

// ONE COLUMN OF THE SIX. `portal`, `gallery`, `dock`, `garden`, `beacon` and
// `layout` are all still there and all dead: each was a ladder that got folded
// into something else, and a column is never dropped here because dropping one
// is the only migration that cannot be undone. Nothing selects them.
type Row = {
  house: number
  furniture: unknown; owned: string[] | null; pinned: string[] | null
}

const COLS = 'user_id, house, furniture, owned, pinned'

function toHomestead(row: Row | null): Homestead {
  if (!row) return EMPTY_HOMESTEAD
  return {
    house: row.house ?? 0,
    furniture: (row.furniture ?? {}) as Partial<Record<FurnitureSlot, string>>,
    owned: row.owned ?? [],
    pinned: (row.pinned ?? []).slice(0, PINNED_MAX),
    // A VISITOR SEES THE ARRANGEMENT TOO. Half the point of being allowed to
    // move things is that somebody else comes and sees where you put them.
  }
}

/**
 * THE MUTUAL CREW, as a set of ids.
 *
 * Two queries and an intersection rather than a join, because `crew` is read
 * from both directions here and Postgrest cannot express the self-join without
 * a view. Both are indexed lookups on a handful of rows.
 */
/**
 * WHO YOUR MUTUALS ARE, REMEMBERED FOR A MINUTE.
 *
 * `friendsAtSea` is polled every two seconds while you are sailing alongside
 * somebody, and two of its three queries were this pair — asked sixty times a
 * minute, per player, to be told the same answer every time. The friend graph
 * is 27 rows and changes when somebody presses Follow, which is not sixty times
 * a minute.
 *
 * A minute of staleness costs a new mutual up to sixty seconds before their
 * boat can appear. That is invisible next to the twenty-second position
 * heartbeat it would then be waiting on anyway.
 *
 * Module-level, so it lives as long as the warm serverless instance and dies
 * with it. That is the right shape for a cache whose worst failure is one extra
 * pair of indexed lookups on a tiny table: a cold instance is simply correct
 * and slightly slower, and there is nothing to invalidate across instances.
 */
const FRIEND_TTL_MS = 60_000
const friendCache = new Map<string, { ids: string[]; at: number }>()

async function friendIds(admin: ReturnType<typeof createAdminClient>, me: string): Promise<string[]> {
  const hit = friendCache.get(me)
  const now = Date.now()
  if (hit && now - hit.at < FRIEND_TTL_MS) return hit.ids

  const [{ data: iFollow }, { data: followMe }] = await Promise.all([
    admin.from('crew').select('following_id').eq('follower_id', me),
    admin.from('crew').select('follower_id').eq('following_id', me),
  ])
  const mine = new Set(((iFollow ?? []) as { following_id: string }[]).map(r => r.following_id))
  const ids = ((followMe ?? []) as { follower_id: string }[])
    .map(r => r.follower_id)
    .filter(id => mine.has(id))

  // BOUNDED. One entry per captain who has sailed on this instance, and nothing
  // ever removed it — an instance that stayed warm for a week would hold every
  // player who had ever polled it. Small, but it is the kind of thing that is
  // only ever noticed as a slow leak, so it gets a ceiling.
  if (friendCache.size > 500) friendCache.clear()
  friendCache.set(me, { ids, at: now })
  return ids
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
      const built = houseTier(h)
      return { username: name[r.user_id] ?? '', house: builtAt(h).name, built }
    })
    .filter(v => v.username && v.built > 0)
    .sort((a, b) => b.built - a.built || a.username.localeCompare(b.username))
}

export type Visit = {
  username: string
  /** Their id. The rooms inside are filled from what the OWNER has done — their
   *  pets, their log, their giants — so the page needs to know whose feeds to
   *  read or you would stand in their gallery looking at your own badges. */
  userId: string
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

  const { data: row, error } = await admin
    .from('homesteads').select(COLS).eq('user_id', host.id).maybeSingle()
  // Same rule as the owner's loader: a broken read must not be dressed up as
  // "they have not built anything". Visiting is read only so nothing is priced
  // against it, but showing somebody a lean-to that is actually an Estate is
  // still a lie, and a silent one.
  if (error) throw new Error(`homestead visit: ${error.message}`)
  if (!row) return null

  return {
    userId: host.id as string,
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
  /** Their user id. The chart subscribes to `sea:<id>` for their live position
   *  — see lib/seaPresence.ts. Only ever handed to somebody who follows them
   *  back, and it opens nothing on its own: the Realtime policy re-checks the
   *  mutual follow at join time, and every table is behind RLS. */
  id: string
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

  // ── SAILING TOGETHER IS A CAPTAIN'S PERK ────────────────────────────
  //
  // BOTH captains have to hold a membership — yours is checked here, theirs in
  // the select below. A Captain sailing with a non-Captain sees nothing, the
  // same as their friend does; the alternative was asymmetric visibility, and
  // being visible to somebody you cannot see reads as surveillance rather than
  // as a perk they bought.
  //
  // This is the CHEAP half of the gate, not the real one. It keeps a
  // non-Captain's chart honest — no arrows, no marks, no arrival lines — but a
  // client belongs to its player, so the enforcement that matters is the RLS
  // policy on realtime.messages (the sea_presence_captains_only migration).
  // Without that, anyone who opened a console could subscribe to `sea:<uuid>`
  // directly and get the whole feature for nothing.
  const { data: meRow } = await admin
    .from('profiles')
    .select('is_premium, premium_expires_at')
    .eq('id', session.user.id)
    .single()
  if (!isPremiumActive(meRow)) return []

  // ── AND AN ACCEPTED PACT ────────────────────────────────────────────
  //
  // Being mutual crew is not consent to be tracked. It says "I want to see what
  // you are up to"; it does not say "I am happy for you to know where I am,
  // live, whenever I am playing". This game was handing out the second on the
  // strength of the first.
  //
  // So the follow is the floor and the pact is the permission — asked for by
  // one captain, accepted by the other, endable by either. Narrowed to the
  // pacted set here, and enforced for real by the RLS policy on
  // realtime.messages, because this filter only binds an honest client.
  const { data: pacts } = await admin
    .from('sea_pacts')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`)
  const pacted = new Set(((pacts ?? []) as { requester_id: string; addressee_id: string }[])
    .map(p => (p.requester_id === session.user.id ? p.addressee_id : p.requester_id)))
  const canSee = ids.filter(id => pacted.has(id))
  if (!canSee.length) return []

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
    .select('id, username, sea_x, sea_y, sea_seen_at, character_color, equipped_boat, equipped_hat, rod_tier, reel_tier, hook_tier, equipped_pet, completionist_effects, is_premium, premium_expires_at')
    .in('id', canSee)
    .gte('sea_seen_at', cutoff)

  type Row = {
    id: string
    is_premium: boolean | null; premium_expires_at: string | null
    username: string | null; sea_x: number | null; sea_y: number | null; sea_seen_at: string
    character_color: string | null; equipped_boat: string | null; equipped_hat: string | null
    rod_tier: number | null; reel_tier: number | null; hook_tier: number | null
    equipped_pet: string | null; completionist_effects: number[] | null
  }

  const now = Date.now()
  return ((data ?? []) as Row[])
    .filter(r => r.username && Number.isFinite(Number(r.sea_x)) && Number.isFinite(Number(r.sea_y)))
    // AND THEIRS. Filtered in TypeScript through the same `isPremiumActive` the
    // rest of the game uses, rather than as a second SQL predicate — a null
    // expiry means LIFETIME here, and every one of the 20 current Captains is
    // that shape, so a hand-rolled `premium_expires_at > now()` would have hid
    // all of them.
    .filter(r => isPremiumActive(r))
    .map(r => {
      // Resolved HERE, not on the client. The rod alone needs the completionist
      // effects folded in to know which sprite it is, and shipping tiers would
      // mean every viewer re-deriving the same answer from tables they would
      // then also have to be handed.
      const rod = getEffectiveRod(Number(r.rod_tier ?? 0), r.completionist_effects ?? null)
      const pet = r.equipped_pet ? PETS.find(x => x.species === r.equipped_pet) ?? null : null
      return {
        id: r.id,
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
