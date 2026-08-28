'use server'

// EVERYTHING THAT CHANGES A FRIENDSHIP.
//
// Rapport is a value, so it moves only here, on the server, through the
// service-role client. The client says who it is talking to and nothing else:
// how much a chat is worth, whether a gift was loved and whether today's visit
// has already happened are all decided against the row.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  FOLK, folkById, tierFor, nextLine, giftWorth, CHAT_POINTS,
  type FolkId, type FolkTier,
} from '@/lib/seaFolk'

/** UTC date string, the same convention lib/dailyChallenges and lib/bounties
 *  use, so every daily thing in the game turns over together. */
function today(): string { return new Date().toISOString().slice(0, 10) }

export type Rapport = {
  folkId: string
  points: number
  tier: FolkTier
  seenLines: string[]
  chattedToday: boolean
  giftedToday: boolean
  giftsGiven: number
}

export type FolkTalk = {
  line: string
  points: number
  tier: FolkTier
  /** Set only on the visit that crossed into a new tier, and it is the whole
   *  payoff of the system, so the panel gives it its own moment. */
  tierUp: string | null
}

export type FolkGift = {
  line: string
  how: 'loved' | 'liked' | 'plain'
  points: number
  tier: FolkTier
  tierUp: string | null
  fishName: string
}

async function me() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Every standing this captain holds. Rows only exist once somebody has been
 *  spoken to, so a missing row IS tier zero and needs no backfill. */
export async function folkState(): Promise<Rapport[]> {
  const user = await me()
  if (!user) return []
  const { data } = await createAdminClient()
    .from('sea_rapport')
    .select('folk_id, points, seen_lines, last_chat_on, last_gift_on, gifts_given')
    .eq('user_id', user.id)
  const d = today()
  const rows = (data ?? []) as {
    folk_id: string; points: number; seen_lines: string[] | null
    last_chat_on: string | null; last_gift_on: string | null; gifts_given: number
  }[]
  return FOLK.map(f => {
    const r = rows.find(x => x.folk_id === f.id)
    const points = r?.points ?? 0
    return {
      folkId: f.id,
      points,
      tier: tierFor(points),
      seenLines: r?.seen_lines ?? [],
      chattedToday: r?.last_chat_on === d,
      giftedToday: r?.last_gift_on === d,
      giftsGiven: r?.gifts_given ?? 0,
    }
  })
}

/**
 * A VISIT.
 *
 * One a day per regular. THE DAY IS CLAIMED BY THE UPDATE ITSELF — a
 * conditional write that only matches a row whose last chat was not today — so
 * two taps cannot both be the first. Read-then-write would hand a double point
 * to anybody with a slow connection and two thumbs.
 *
 * Missing a day costs nothing. There is no streak to break and nothing decays.
 */
export async function talkToFolk(folkId: string): Promise<FolkTalk | { error: string }> {
  const user = await me()
  if (!user) return { error: 'Unauthorized' }
  const folk = folkById(folkId)
  if (!folk) return { error: 'There is nobody by that name out here.' }

  const admin = createAdminClient()
  const d = today()

  // The row has to exist before it can be claimed conditionally. Inserting
  // with ignoreDuplicates makes this safe to run every visit.
  await admin.from('sea_rapport')
    .upsert({ user_id: user.id, folk_id: folk.id }, {
      onConflict: 'user_id,folk_id', ignoreDuplicates: true,
    })

  const { data: before } = await admin.from('sea_rapport')
    .select('points, seen_lines, last_chat_on')
    .eq('user_id', user.id).eq('folk_id', folk.id).single()
  if (!before) return { error: 'That did not take.' }
  if (before.last_chat_on === d) {
    return { error: `You have already had a word with ${folk.name} today.` }
  }

  const wasTier = tierFor(before.points ?? 0)
  const seen = (before.seen_lines ?? []) as string[]
  const { line, key } = nextLine(folk, wasTier, seen)
  const points = (before.points ?? 0) + CHAT_POINTS
  const tier = tierFor(points)

  // A NEW TIER WIPES THE SEEN LIST for the tiers below it only in the sense
  // that it stops mattering: the pool is per tier, so the list simply grows.
  const { data: claimed } = await admin.from('sea_rapport')
    .update({
      points,
      last_chat_on: d,
      seen_lines: seen.includes(key) ? seen : [...seen, key],
    })
    .eq('user_id', user.id).eq('folk_id', folk.id)
    .or(`last_chat_on.is.null,last_chat_on.neq.${d}`)
    .select('points')
  if (!claimed || claimed.length === 0) {
    return { error: `You have already had a word with ${folk.name} today.` }
  }

  return {
    line,
    points,
    tier,
    tierUp: tier > wasTier ? folk.tierUp[(tier - 1) as 0 | 1 | 2 | 3] : null,
  }
}

/**
 * A FISH, HANDED OVER.
 *
 * One a day per regular, and it costs you the fish. Claims the day FIRST and
 * takes the catch second, reverting the claim if the hold turns out to be
 * empty: the opposite order would let a failed take spend somebody's daily
 * gift on nothing.
 *
 * Nothing is ever refused. A captain who sailed all the way out with a gift
 * should not be told they picked the wrong one, so the worst case is still a
 * point and a warm line.
 */
export async function giftToFolk(folkId: string, fishId: number): Promise<FolkGift | { error: string }> {
  const user = await me()
  if (!user) return { error: 'Unauthorized' }
  const folk = folkById(folkId)
  if (!folk) return { error: 'There is nobody by that name out here.' }

  const admin = createAdminClient()
  const d = today()

  await admin.from('sea_rapport')
    .upsert({ user_id: user.id, folk_id: folk.id }, {
      onConflict: 'user_id,folk_id', ignoreDuplicates: true,
    })

  const { data: before } = await admin.from('sea_rapport')
    .select('points, gifts_given, last_gift_on')
    .eq('user_id', user.id).eq('folk_id', folk.id).single()
  if (!before) return { error: 'That did not take.' }
  if (before.last_gift_on === d) {
    return { error: `${folk.name} has had a gift from you today.` }
  }

  // What it is, and whether they can even be given it.
  const { data: fish } = await admin.from('fish_species')
    .select('id, name, habitat').eq('id', fishId).single()
  if (!fish) return { error: 'No such fish.' }

  // ── CLAIM THE DAY ───────────────────────────────────────────────────
  const worth = giftWorth(folk, fishId, (fish.habitat as string | null) ?? null)
  const points = (before.points ?? 0) + worth.points
  const wasTier = tierFor(before.points ?? 0)
  const tier = tierFor(points)

  const { data: claimed } = await admin.from('sea_rapport')
    .update({
      points, last_gift_on: d, gifts_given: (before.gifts_given ?? 0) + 1,
    })
    .eq('user_id', user.id).eq('folk_id', folk.id)
    .or(`last_gift_on.is.null,last_gift_on.neq.${d}`)
    .select('points')
  if (!claimed || claimed.length === 0) {
    return { error: `${folk.name} has had a gift from you today.` }
  }

  // ── THEN TAKE THE FISH ──────────────────────────────────────────────
  // Optimistic: the update only matches while the quantity is still what was
  // read, so two gifts cannot spend the same last fish.
  const { data: held } = await admin.from('fish_inventory')
    .select('quantity').eq('user_id', user.id).eq('fish_id', fishId).single()
  const have = Number(held?.quantity ?? 0)
  let took = false
  if (have >= 1) {
    if (have === 1) {
      const { data: gone } = await admin.from('fish_inventory')
        .delete().eq('user_id', user.id).eq('fish_id', fishId).eq('quantity', 1).select('fish_id')
      took = !!gone && gone.length > 0
    } else {
      const { data: cut } = await admin.from('fish_inventory')
        .update({ quantity: have - 1 })
        .eq('user_id', user.id).eq('fish_id', fishId).eq('quantity', have).select('fish_id')
      took = !!cut && cut.length > 0
    }
  }
  if (!took) {
    // Give the day back. They never got the fish, so they never used it.
    await admin.from('sea_rapport')
      .update({
        points: before.points ?? 0, last_gift_on: before.last_gift_on,
        gifts_given: before.gifts_given ?? 0,
      })
      .eq('user_id', user.id).eq('folk_id', folk.id)
    return { error: 'That is not in your hold any more.' }
  }

  return {
    line: worth.how === 'loved' ? folk.onLoved : worth.how === 'liked' ? folk.onLiked : folk.onPlain,
    how: worth.how,
    points,
    tier,
    tierUp: tier > wasTier ? folk.tierUp[(tier - 1) as 0 | 1 | 2 | 3] : null,
    fishName: String(fish.name ?? 'that'),
  }
}

/** The hold, for the gift picker. Names and counts only. */
export async function holdForGifting(): Promise<{ id: number; name: string; qty: number; habitat: string | null }[]> {
  const user = await me()
  if (!user) return []
  const admin = createAdminClient()
  const { data: rows } = await admin.from('fish_inventory')
    .select('fish_id, quantity').eq('user_id', user.id)
  const held = (rows ?? []) as { fish_id: number; quantity: number }[]
  if (!held.length) return []
  const { data: species } = await admin.from('fish_species')
    .select('id, name, habitat').in('id', held.map(h => h.fish_id))
  const byId = new Map((species ?? []).map(s => [s.id as number, s]))
  return held.map(h => ({
    id: h.fish_id,
    name: String(byId.get(h.fish_id)?.name ?? 'Unknown'),
    qty: h.quantity,
    habitat: (byId.get(h.fish_id)?.habitat as string | null) ?? null,
  })).filter(f => f.qty > 0)
}

