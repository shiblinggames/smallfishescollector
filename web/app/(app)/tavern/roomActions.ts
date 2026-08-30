'use server'

// ── WHO IS ABOUT ────────────────────────────────────────────────────────────
//
// The tavern's whole claim is that it is a room with people in it, and a room
// needs to know who is in it.
//
// ── PRESENCE IS NOT POSITION, AND THAT LINE IS THE DESIGN ───────────────────
//
// The chart already answers a much stronger question — where exactly a captain
// is, live — and it is gated hard: both parties hold a membership AND have
// agreed a pact, enforced in Postgres, because (as the pact system says out
// loud) following somebody back is not consent to be tracked.
//
// This is the weaker question. "Meg is aboard" is not "Meg is at 3,400 by
// -1,200", and it needs a weaker permission to match. A MUTUAL FOLLOW is that
// permission: you both pressed the button, which is exactly the floor the pact
// system uses before it will even offer to ask. No membership needed, because
// nothing here is a perk — it is the difference between an empty room and a
// room, and charging for that would make the tavern worse for the people most
// likely to leave.
//
// EVERYONE ELSE IS COUNTED AND NOT NAMED. "And fourteen other captains on the
// water" makes the room feel like a place without publishing a list of who is
// playing right now to anybody who asks. A count is not a disclosure about any
// one person; a wall of usernames is.
//
// ── WHY sea_seen_at AND NOT last_seen_at ────────────────────────────────────
//
// `last_seen_at` is stamped ONCE per app load, for the admin dashboard's
// seven-day count. Somebody two hours into a session still carries the stamp
// from when they opened the tab, so a five-minute window against it would show
// an empty room full of people. `sea_seen_at` is a real heartbeat: the chart
// flushes it every twenty seconds while you are on the water, which is what
// makes a two-minute window mean "now".
//
// The consequence is honest and worth stating: this counts captains ON THE
// CHART. Somebody reading their Captain's Log is not in the room. That is the
// right answer for a game whose front door is the sea.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/userData'

/** How stale a heartbeat may be and still count as "now". The same two minutes
 *  the chart uses to decide whether to draw a friend's hull, so the tavern and
 *  the water can never disagree about who is out. */
const AT_SEA_MS = 2 * 60_000

export type Aboard = {
  username: string
  characterColor: string
  equippedHat: string | null
  avatarBg: string | null
  avatarBorder: string | null
}

export type TheRoom = {
  /** Mutual crew on the water, named. */
  crew: Aboard[]
  /** Everybody else out there, counted. Excludes you and the named. */
  others: number
}

export async function whoIsAbout(): Promise<TheRoom> {
  const user = await getCurrentUser()
  if (!user) return { crew: [], others: 0 }
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - AT_SEA_MS).toISOString()

  const [{ data: iFollow }, { data: followMe }, { data: out }] = await Promise.all([
    admin.from('crew').select('following_id').eq('follower_id', user.id),
    admin.from('crew').select('follower_id').eq('following_id', user.id),
    // ONE sweep of everybody currently out, rather than a count query and a
    // second select: the window is two minutes wide and the row is five short
    // columns, so this is smaller than the round trip it would save.
    admin.from('profiles')
      .select('id, username, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
      .gte('sea_seen_at', cutoff),
  ])

  const mine = new Set(((iFollow ?? []) as { following_id: string }[]).map(r => r.following_id))
  const mutual = new Set(((followMe ?? []) as { follower_id: string }[])
    .map(r => r.follower_id).filter(id => mine.has(id)))

  type Row = {
    id: string; username: string | null; character_color: string | null
    equipped_hat: string | null; avatar_bg_color: string | null; avatar_border_color: string | null
  }
  const rows = (out ?? []) as Row[]

  const crew: Aboard[] = []
  let others = 0
  for (const r of rows) {
    if (r.id === user.id) continue        // you are not somebody you meet
    if (mutual.has(r.id) && r.username) {
      crew.push({
        username: r.username,
        characterColor: r.character_color ?? 'default',
        equippedHat: r.equipped_hat,
        avatarBg: r.avatar_bg_color,
        avatarBorder: r.avatar_border_color,
      })
    } else {
      others++
    }
  }
  crew.sort((a, b) => a.username.localeCompare(b.username))
  return { crew, others }
}
