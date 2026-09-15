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
  FOLK, folkById, tierFor, nextLine, favouriteFor, favouriteById, wantKey,
  CHAT_POINTS, GIFT_FAVOURITE_POINTS,
  type FolkId, type FolkTier,
} from '@/lib/seaFolk'
import { RODS } from '@/lib/rods'
import { unlockBadge } from '@/app/(app)/achievements/badgeActions'

/** UTC date string, the same convention lib/dailyChallenges and lib/bounties
 *  use, so every daily thing in the game turns over together. */
function today(): string { return new Date().toISOString().slice(0, 10) }

export type Rapport = {
  folkId: string
  points: number
  tier: FolkTier
  seenLines: string[]
  chattedToday: boolean
  giftsGiven: number
  /**
   * THE JOB THEY HAVE GIVEN YOU, or null if you have not asked.
   *
   * One at a time, per person. The name rides along so a panel can print the
   * request without a round trip to the species table.
   */
  want: { fishId: number; name: string } | null
  /**
   * AND WHETHER YOU CAN SETTLE IT RIGHT NOW: holding one, landed since they
   * asked. Decided on the server against fish_collection, never on the client,
   * because it is the whole of what makes this a job rather than a hand-over.
   */
  wantReady: boolean
}

export type FolkTalk = {
  line: string
  points: number
  tier: FolkTier
  /** Set only on the visit that crossed into a new tier, and it is the whole
   *  payoff of the system, so the panel gives it its own moment. */
  tierUp: string | null
}

/** What they say when you ask what they are after. Costs nothing and moves
 *  nothing: asking is free, the same way every other thing you can say is. */
export type FolkAsk = {
  line: string
  fishId: number
  fishName: string
}

export type FolkGift = {
  line: string
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
  const admin = createAdminClient()
  const { data } = await admin
    .from('sea_rapport')
    .select('folk_id, points, seen_lines, last_chat_on, gifts_given, want_fish_id, want_asked_at')
    .eq('user_id', user.id)
  const d = today()
  const rows = (data ?? []) as {
    folk_id: string; points: number; seen_lines: string[] | null
    last_chat_on: string | null; gifts_given: number
    want_fish_id: number | null; want_asked_at: string | null
  }[]

  // ── WHICH OPEN REQUESTS CAN BE SETTLED RIGHT NOW ────────────────────────
  //
  // TWO CONDITIONS, AND THE SECOND IS THE POINT. You have to be holding one,
  // and fish_collection has to say you landed one AFTER they asked. Without
  // that second half the request is settled by whatever was already in the
  // hold, which is the old hand-over with a sentence in front of it.
  //
  // ONE PAIR OF QUERIES FOR ALL NINE, not one pair per regular. This runs
  // every time a panel opens.
  const open = rows.filter(r => r.want_fish_id != null && r.want_asked_at)
  const ready = new Set<string>()
  if (open.length) {
    const ids = [...new Set(open.map(r => r.want_fish_id as number))]
    const [inv, col] = await Promise.all([
      admin.from('fish_inventory').select('fish_id, quantity').eq('user_id', user.id).in('fish_id', ids),
      admin.from('fish_collection').select('fish_id, last_caught_at').eq('user_id', user.id).in('fish_id', ids),
    ])
    const held = new Map((inv.data ?? []).map(x => [x.fish_id as number, Number(x.quantity ?? 0)]))
    const last = new Map((col.data ?? []).map(x => [x.fish_id as number, String(x.last_caught_at ?? '')]))
    for (const r of open) {
      const fid = r.want_fish_id as number
      if ((held.get(fid) ?? 0) < 1) continue
      const caught = last.get(fid)
      if (!caught) continue
      if (Date.parse(caught) > Date.parse(r.want_asked_at as string)) ready.add(r.folk_id)
    }
  }

  return FOLK.map(f => {
    const r = rows.find(x => x.folk_id === f.id)
    const points = r?.points ?? 0
    // A stored id that is no longer one of their three reads as no request at
    // all, so editing the cast cannot strand somebody on a job that is gone.
    const fav = r?.want_fish_id != null ? favouriteById(f, r.want_fish_id) : null
    return {
      folkId: f.id,
      points,
      tier: tierFor(points),
      seenLines: r?.seen_lines ?? [],
      chattedToday: r?.last_chat_on === d,
      giftsGiven: r?.gifts_given ?? 0,
      want: fav ? { fishId: fav.id, name: fav.name } : null,
      wantReady: !!fav && ready.has(f.id),
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

/** One line out of a pool. Never empty: every pool ships with at least one, and
 *  a folk whose lines are still being written has exactly one. */
function pickLine(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? ''
}

/**
 * ── ASKING SOMEBODY WHAT THEY WANT ──────────────────────────────────────────
 *
 * Free, like every other thing you can say to these nine. It moves no points
 * and spends no day; all it does is open a job and write down which fish, so
 * that the delivery has something to be checked against.
 *
 * ONE AT A TIME, PER PERSON. Asking again while a request is open re-states the
 * one that is already open rather than rolling a new one, which is both the
 * honest answer and the thing that stops a captain shopping for an easier fish
 * by asking twenty times.
 *
 * WHICH ONE THEY NAME is favourites[gifts_given % 3], so it advances on
 * delivery and comes round in order. It is not stored: a third column would be
 * a second record of a number the row already has, and the two would drift.
 */
export async function askForFavourite(folkId: string): Promise<FolkAsk | { error: string }> {
  const user = await me()
  if (!user) return { error: 'Unauthorized' }
  const folk = folkById(folkId)
  if (!folk) return { error: 'There is nobody by that name out here.' }

  const admin = createAdminClient()
  await admin.from('sea_rapport')
    .upsert({ user_id: user.id, folk_id: folk.id }, {
      onConflict: 'user_id,folk_id', ignoreDuplicates: true,
    })

  const { data: row } = await admin.from('sea_rapport')
    .select('gifts_given, seen_lines, want_fish_id')
    .eq('user_id', user.id).eq('folk_id', folk.id).single()
  if (!row) return { error: 'That did not take.' }

  // Already asked. Say the same thing again rather than picking a new fish.
  const open = row.want_fish_id != null ? favouriteById(folk, row.want_fish_id) : null
  if (open) return { line: open.ask, fishId: open.id, fishName: open.name }

  const fav = favouriteFor(folk, row.gifts_given ?? 0)
  const seen = (row.seen_lines ?? []) as string[]
  const key = wantKey(folk, fav.id)

  // ── WHAT THEY ASKED FOR, AND WHEN ───────────────────────────────────────
  // The timestamp is the freshness line the delivery is measured against, so
  // it is written HERE, by the server, and never sent by a client.
  const { data: set } = await admin.from('sea_rapport')
    .update({
      want_fish_id: fav.id,
      want_asked_at: new Date().toISOString(),
      // The ask is a thing they told you, so it goes in the same list every
      // other thing they have told you goes in. See wantKey.
      seen_lines: seen.includes(key) ? seen : [...seen, key],
    })
    .eq('user_id', user.id).eq('folk_id', folk.id)
    .select('want_fish_id')
  if (!set || set.length === 0) return { error: 'That did not take.' }

  return { line: fav.ask, fishId: fav.id, fishName: fav.name }
}

/**
 * ── SETTLING THE JOB ────────────────────────────────────────────────────────
 *
 * Three points, repeatable, and no clock on it at all. What bounds it is the
 * sea: the fish has to be the one they asked for AND it has to have been landed
 * since they asked. See GIFT_FAVOURITE_POINTS for why the daily gate came off.
 *
 * THE CLIENT SENDS A FOLK ID AND NOTHING ELSE. Which fish is owed, when it was
 * asked for, whether the hold has one and whether it is a fresh one are all
 * read here, against the row and against fish_collection.
 *
 * "CAUGHT SINCE YOU ASKED" IS fish_collection.last_caught_at. It is the only
 * record of when anything was landed, and it is a single timestamp per species
 * rather than a log, which makes the rule exactly as strict as it needs to be:
 * the most recent one you caught has to be newer than the ask. A captain who
 * had three in the hold already and never went back out cannot settle anything.
 *
 * CLAIM FIRST, TAKE THE FISH SECOND. The update only matches a row whose want
 * is still the one being delivered, so two taps cannot both pay out; and if the
 * hold turns out to be empty after that, the whole claim is handed back. The
 * other order would spend somebody's request on nothing.
 */
export async function deliverToFolk(folkId: string): Promise<FolkGift | { error: string }> {
  const user = await me()
  if (!user) return { error: 'Unauthorized' }
  const folk = folkById(folkId)
  if (!folk) return { error: 'There is nobody by that name out here.' }

  const admin = createAdminClient()

  const { data: before } = await admin.from('sea_rapport')
    .select('points, gifts_given, want_fish_id, want_asked_at')
    .eq('user_id', user.id).eq('folk_id', folk.id).maybeSingle()
  if (!before?.want_fish_id || !before.want_asked_at) {
    return { error: `${folk.short} has not asked you for anything.` }
  }
  const fav = favouriteById(folk, before.want_fish_id)
  if (!fav) return { error: `${folk.short} has not asked you for anything.` }

  // ── IS IT A FRESH ONE ───────────────────────────────────────────────────
  const { data: caught } = await admin.from('fish_collection')
    .select('last_caught_at')
    .eq('user_id', user.id).eq('fish_id', fav.id).maybeSingle()
  const landedAfter = !!caught?.last_caught_at
    && Date.parse(String(caught.last_caught_at)) > Date.parse(String(before.want_asked_at))
  if (!landedAfter) {
    return { error: `You have not landed a ${fav.name} since they asked. One out of the hold does not count.` }
  }

  // ── CLAIM THE JOB ───────────────────────────────────────────────────────
  const points = (before.points ?? 0) + GIFT_FAVOURITE_POINTS
  const wasTier = tierFor(before.points ?? 0)
  const tier = tierFor(points)

  const { data: claimed } = await admin.from('sea_rapport')
    .update({
      points,
      gifts_given: (before.gifts_given ?? 0) + 1,
      want_fish_id: null,
      want_asked_at: null,
    })
    .eq('user_id', user.id).eq('folk_id', folk.id)
    .eq('want_fish_id', fav.id)
    .select('points')
  if (!claimed || claimed.length === 0) {
    return { error: 'You have already handed that over.' }
  }

  // ── THEN TAKE THE FISH ──────────────────────────────────────────────────
  // Optimistic: the write only matches while the quantity is still what was
  // read, so two deliveries cannot spend the same last fish.
  const { data: held } = await admin.from('fish_inventory')
    .select('quantity').eq('user_id', user.id).eq('fish_id', fav.id).maybeSingle()
  const have = Number(held?.quantity ?? 0)
  let took = false
  if (have >= 1) {
    if (have === 1) {
      const { data: gone } = await admin.from('fish_inventory')
        .delete().eq('user_id', user.id).eq('fish_id', fav.id).eq('quantity', 1).select('fish_id')
      took = !!gone && gone.length > 0
    } else {
      const { data: cut } = await admin.from('fish_inventory')
        .update({ quantity: have - 1 })
        .eq('user_id', user.id).eq('fish_id', fav.id).eq('quantity', have).select('fish_id')
      took = !!cut && cut.length > 0
    }
  }
  if (!took) {
    // Give the job back exactly as it was. They never got the fish, so the
    // request was never settled and the ask still stands.
    await admin.from('sea_rapport')
      .update({
        points: before.points ?? 0,
        gifts_given: before.gifts_given ?? 0,
        want_fish_id: fav.id,
        want_asked_at: before.want_asked_at,
      })
      .eq('user_id', user.id).eq('folk_id', folk.id)
    return { error: `There is no ${fav.name} in your hold.` }
  }

  // ── YOU REMEMBERED ──────────────────────────────────────────────────────
  //
  // The one badge on the Salt Road that cannot be derived. `gifts_given` counts
  // deliveries and nothing records WHICH fish each one was, so by tomorrow the
  // row cannot say whether anybody ever went out and caught somebody's fish on
  // purpose. A hook at the moment it happens is the only place the answer is.
  //
  // After the fish is confirmed taken, never before: everything above this line
  // can still hand the job back and fail, and a badge for a delivery that was
  // reverted is a badge for nothing. Best-effort, like every other hook.
  try { await unlockBadge('you_remembered') } catch { /* best-effort */ }

  return {
    line: pickLine(fav.brought),
    points,
    tier,
    tierUp: tier > wasTier ? folk.tierUp[(tier - 1) as 0 | 1 | 2 | 3] : null,
    fishName: fav.name,
  }
}


/**
 * ── THE LAST THING A FRIEND DOES FOR YOU ────────────────────────────────────
 *
 * Two of the regulars carry a rod no shop stocks, and they only offer it once
 * you are as far along with them as the friendship goes. Yoon has always been
 * that shape; this is the same shape written down properly, so Fitch and Nance
 * work the way he does rather than approximately like him.
 *
 * THE GATE IS THE ROW, NOT THE KEY. A runner's rod is guarded by a trader key
 * that carries the night it belongs to, because a runner is a place you sailed
 * to. This is not a place, it is a relationship, and the only honest record of
 * one is `sea_rapport`. So the client sends a folk id and nothing else, and
 * every term of the deal - whether they will sell to you at all, which rod, and
 * what it costs - is read here.
 *
 * OUTSIDE THE DAILY DEAL CAP, for the reason Yoon is: the cap bounds a rotation
 * of wanderers, and a cap on a once-ever purchase only makes somebody burn a
 * day's trading to find out they were one deal short of a rod they spent a
 * month earning.
 */
export async function buyFolkRod(folkId: FolkId): Promise<
  { ok: true; rodTier: number; rodName: string; spent: number; doubloons: number }
  | { error: string }
> {
  const user = await me()
  if (!user) return { error: 'Unauthorized' }

  const folk = folkById(folkId)
  if (!folk?.rodTier) return { error: 'They have nothing like that to sell.' }
  const rod = RODS.find(r => r.tier === folk.rodTier)
  if (!rod) return { error: 'The deal fell through.' }

  const admin = createAdminClient()

  // Are you actually that far along with them? Read, never taken on trust.
  const { data: standing } = await admin.from('sea_rapport')
    .select('points').eq('user_id', user.id).eq('folk_id', folk.id).maybeSingle()
  if (tierFor(standing?.points ?? 0) < 4) {
    return { error: `${folk.short} is not going to part with that for you yet.` }
  }

  // Say so BEFORE taking the money. You cannot own a rod twice.
  const { data: had } = await admin.from('rod_inventory')
    .select('rod_tier').eq('user_id', user.id).eq('rod_tier', folk.rodTier).maybeSingle()
  if (had) return { error: `You already carry the ${rod.name}.` }

  // ── CLAIM THE ROD, THEN CHARGE FOR IT. That order is deliberate.
  //
  // `rod_inventory` is keyed on (user_id, rod_tier), so this insert IS the
  // lock: two taps that both got past the check above cannot both get through
  // here, the loser comes back 23505, and nobody has been charged twice.
  //
  // Doing it the other way round - deduct, then insert - looks more natural and
  // is worse, because there is no `add_doubloons` to undo a deduct with. A
  // duplicate insert would leave a captain 300,000 lighter with nothing to show
  // for it and no way back. This way the only bad window is a crash between the
  // two lines, and it hands out a rod rather than eating a fortune.
  const { error: grantErr } = await admin.from('rod_inventory')
    .insert({ user_id: user.id, rod_tier: folk.rodTier })
  if (grantErr) return { error: `You already carry the ${rod.name}.` }

  // The RESULT is the guard, not the error: deduct_doubloons checks the balance
  // inside its own WHERE and returns NULL rather than raising.
  const { data: newBalance, error: spendErr } = await admin.rpc('deduct_doubloons', {
    uid: user.id, amount: rod.cost,
  })
  if (spendErr || newBalance == null) {
    await admin.from('rod_inventory')
      .delete().eq('user_id', user.id).eq('rod_tier', folk.rodTier)
    return { error: `They want ${rod.cost.toLocaleString()} and you have not got it.` }
  }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -rod.cost,
    reason: `Bought the ${rod.name} from ${folk.short} at sea`,
  })

  return {
    ok: true, rodTier: folk.rodTier, rodName: rod.name,
    spent: rod.cost, doubloons: Number(newBalance),
  }
}
