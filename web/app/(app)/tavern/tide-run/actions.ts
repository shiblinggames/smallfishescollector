'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TIDE_CHAMPION_CONTEST_ID, TIDE_CHAMPION_GOAL_M, TIDE_CHAMPION_PRIZE_CODE } from '@/lib/contests'
import { flagAnomaly } from '@/lib/anomaly'
import { issueRunToken, consumeRunToken } from '@/lib/runToken'

// Beacon counts are CLIENT-AUTHORED, so these two lines are the only thing
// standing between a forged call and minted currency. Flagging alone was not
// enough: one account replayed 10,000 beacons 283 times over 25 days and minted
// 5,660,000 doubloons while every call was dutifully flagged and paid.
//
// Both numbers come from the 2,678 real credits on the ledger, not from taste.
// A real run smashes 2.6 beacons on average, 8 at the 99th percentile, 14 at the
// 99.9th, and the highest ever recorded is 200.
//
// MAX is what a run can be PAID for. 250 sits above the highest real run ever
// seen, so it can never cut a legitimate player, while a forged 10,000 pays as
// 250 — the exploit keeps 2.5% of its yield. Same shape as maxLegitKillGrant()
// for raid gold.
//
// PLAUSIBLE is what gets FLAGGED, and it was 500: thirty-six times the 99.9th
// percentile, so a patient cheat could have sent 499 a call, about 240,000
// doubloons an hour, and never tripped anything. 25 is clear of real play and
// catches abuse roughly twenty times sooner.
const TIDE_RUN_MAX_BEACONS = 250
const TIDE_RUN_PLAUSIBLE_BEACONS = 25

/**
 * Record the player's distance for the all-time best (leaderboard). Only
 * updates `profiles.tide_run_best_distance` if the new distance is higher.
 * Called from the client after every death (and on mount with localStorage
 * best, to backfill old scores).
 */
export async function submitTideRunBest(distance: number): Promise<{ ok: true; best: number; wonTideChampion?: boolean } | { error: string }> {
  try {
    if (typeof distance !== 'number' || !isFinite(distance) || distance < 0) {
      return { error: 'Invalid distance' }
    }
    // Persist at 1-decimal precision (column is numeric(10,1)). Tighter
    // separation on the leaderboard — two runs that landed at 324 and 324
    // before now read as 324.4 and 324.7, no tie. Toggle Math.round
    // back to floor here if we ever want stricter "integer meters only"
    // again.
    const meters = Math.round(distance * 10) / 10
    if (meters < 0.1 || meters > 100000) return { error: 'Invalid distance' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('tide_run_best_distance')
      .eq('id', user.id)
      .single()
    if (!profile) return { error: 'Profile not found' }

    // PostgREST may return numeric() as a string — coerce to be safe
    // so the comparison and the return value are always numbers.
    const currentBest = Number(profile.tide_run_best_distance ?? 0)

    // Tide Champion contest — the first captain to cross 500m wins. Atomic:
    // the first INSERT for this contest_id wins; every later one fails the
    // PK and reads back as null (same pattern as the first-ancient-catch).
    // Checked before the PB early-return so a 500m run always claims it.
    let wonTideChampion = false
    if (meters >= TIDE_CHAMPION_GOAL_M) {
      const { data: claimed } = await admin
        .from('contests')
        .insert({ contest_id: TIDE_CHAMPION_CONTEST_ID, winner_user_id: user.id, prize_code: TIDE_CHAMPION_PRIZE_CODE })
        .select('contest_id')
        .maybeSingle()
      if (claimed) {
        wonTideChampion = true
        // Targeted mail — prize details + claim instructions, only the
        // winner sees it (target_user_id filter), mirroring first-ancient.
        await admin.from('mail_messages').insert({
          subject: '🏆 Tide Champion — You Crossed 500m',
          body: "You did it. You're the first captain ever to push a Tide Run past 500 meters.\n\nAs promised, you've won a special customization reward, designed just for you. Reply to this email to claim it:\n\nhello@shiblinggames.com\n\nInclude your prize code: TIDE-CHAMPION-500\n\nWe'll work with you on the design. The deep current is yours.\n\n— Cap'n Shibling",
          sender_label: "Cap'n Shibling",
          target_user_id: user.id,
        })
      }
    }

    if (meters <= currentBest) return { ok: true, best: currentBest, wonTideChampion }

    // Stamp the moment alongside the new best so the leaderboard tiebreaks
    // ties on first-to-reach (see leaderboard_tide_run view + the
    // tide_run_best_distance_set_at backfill migration).
    const { error: updateErr } = await admin
      .from('profiles')
      .update({
        tide_run_best_distance: meters,
        tide_run_best_distance_set_at: new Date().toISOString(),
      })
      .eq('id', user.id)
    if (updateErr) return { error: 'Update failed' }

    return { ok: true, best: meters, wonTideChampion }
  } catch {
    return { error: 'Server error' }
  }
}

/**
 * Accumulate lifetime Tide Run stats on EVERY run end (win or lose), unlike
 * submitTideRunBest which only fires on a new record. Atomic increment via
 * bump_tide_run_stats() so it's race-safe. Fire-and-forget from the client.
 * These per-player counters let admins pull aggregates later (total distance
 * sailed by everyone, most beacons smashed, etc.).
 */
export async function recordTideRunRun(distance: number, beacons: number): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const dist = Math.max(0, Math.min(100000, Math.floor(Number(distance) || 0)))
    // Same ceiling as the payout path. These counters feed admin aggregates and
    // "most beacons smashed", so leaving this at 10,000 would keep the career
    // stats inflated even once the doubloons were clamped — the exploit would
    // simply buy a record instead of money.
    const smashed = Math.max(0, Math.min(TIDE_RUN_MAX_BEACONS, Math.floor(Number(beacons) || 0)))
    if (dist === 0 && smashed === 0) return
    const admin = createAdminClient()
    await admin.rpc('bump_tide_run_stats', { uid: user.id, dist, beacons: smashed })
  } catch {
    // best-effort; never block the wreck screen
  }
}

/** Doubloon payout per beacon smashed. Tiny passive income so every
 *  run feels rewarded; the leaderboard chase is what drives long
 *  runs. Replaces the old "commit one run per day" scheme that left
 *  players confused about whether un-committed runs still counted
 *  toward leaderboard PBs (they always did). */
const DOUBLOONS_PER_BEACON = 2

/**
 * Open a run and mint the token its reward will be paid against.
 *
 * The beacon count is authored by the client and always will be — the game is a
 * canvas loop in the browser and the server never simulates it, so something has
 * to be reported. What the server CAN own is how many times that report is
 * honoured, and this is that: one token per run, consumed by the payout.
 *
 * The clamp added earlier bounds a single forged call. It does not stop the same
 * call being sent again, which is exactly what happened: one account replayed a
 * reward every fifteen seconds for twenty-five days. A spent token rejects the
 * second send outright, which is the difference between narrowing a faucet and
 * closing it.
 *
 * Fails SOFT. If the token cannot be minted the run still plays; the reward path
 * falls back to the capped-but-unverified route rather than eating the run.
 */
export async function startTideRun(): Promise<{ token: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { token: null }
    const admin = createAdminClient()
    return { token: await issueRunToken(admin, user.id, 'tide_run') }
  } catch {
    return { token: null }
  }
}

export type AwardTideRunResult =
  | { ok: true; doubloons: number; newDoubloonTotal: number }
  | { error: string }

/** Award doubloons for beacons smashed in a single run. Called on
 *  every wreck (or successful completion if we ever add one), no
 *  daily cap. Beacons are sanity-clamped against absurd values; the
 *  client is trusted enough that the leaderboard is just distance,
 *  but a hard ceiling keeps a manipulated payload from minting
 *  arbitrary doubloons. */
export async function awardTideRunBeacons(beacons: number, token?: string | null): Promise<AwardTideRunResult> {
  try {
    if (typeof beacons !== 'number' || !isFinite(beacons) || beacons < 0) {
      return { error: 'Invalid beacon count' }
    }
    const smashed = Math.max(0, Math.min(10000, Math.floor(beacons)))
    if (smashed === 0) return { error: 'No beacons smashed' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('doubloons')
      .eq('id', user.id)
      .single()
    if (!profile) return { error: 'Profile not found' }

    // Beacon count is client-authored, so a forged call arrives looking exactly
    // like a good run. Flag it AND clamp it: flagging alone let one account mint
    // 5.66M over 25 days with every call recorded and paid.
    if (smashed > TIDE_RUN_PLAUSIBLE_BEACONS) {
      await flagAnomaly(admin, user.id, 'implausible:tideRunBeacons', smashed > 5000 ? 3 : 2, { beacons: smashed })
    }

    // ONE PAYOUT PER RUN. The token was minted when the run opened and is
    // consumed atomically here, so a replayed call finds it already spent and
    // gets nothing. This is what the clamp above could not do: the clamp bounds
    // what a single forged call is worth, and this bounds how many times any
    // call — forged or genuine — can be honoured.
    //
    // Rejects rather than falling back when a token is supplied and refused: a
    // present-but-spent token is a replay, and the only correct answer to a
    // replay is no.
    const spent = await consumeRunToken(admin, user.id, 'tide_run', token)
    if (token && !spent) {
      await flagAnomaly(admin, user.id, 'replay:tideRunReward', 3, { beacons: smashed })
      return { error: 'That run has already been paid out.' }
    }

    // The clamp is what actually costs a cheat anything. It is deliberately
    // above the best run ever recorded, so no honest player ever meets it, and
    // the flag above still records the raw figure for review.
    const paidBeacons = Math.min(smashed, TIDE_RUN_MAX_BEACONS)
    const doubloonsEarned = paidBeacons * DOUBLOONS_PER_BEACON
    const newDoubloons = (profile.doubloons ?? 0) + doubloonsEarned

    const { error: updateErr } = await admin
      .from('profiles')
      .update({ doubloons: newDoubloons })
      .eq('id', user.id)
    if (updateErr) return { error: 'Update failed' }

    // Best-effort audit row.
    await admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloonsEarned,
      // Records what was PAID, and the raw claim too when they differ, so the
      // ledger reads as forensics rather than as a payout that never happened.
      reason: paidBeacons === smashed
        ? `Tide Run beacons smashed (${smashed})`
        : `Tide Run beacons smashed (${paidBeacons}, capped from ${smashed})`,
    }).then(() => {}, () => {})

    return { ok: true, doubloons: doubloonsEarned, newDoubloonTotal: newDoubloons }
  } catch {
    return { error: 'Server error — please try again' }
  }
}

/** Top-of-leaderboard reader. Shown on the wreck screen so the
 *  player always sees the target to beat right next to their own
 *  result. Returns null if no one has any distance yet (clean cold
 *  start). */
export type TopTideRunHolder = { username: string; distance: number }

export async function getTopTideRunHolder(): Promise<TopTideRunHolder | null> {
  try {
    const admin = createAdminClient()
    // leaderboard_tide_run view already excludes admins and resolves
    // tiebreaks by first-to-reach, so the #1 row is the canonical
    // public hiscore holder.
    const { data } = await admin
      .from('leaderboard_tide_run')
      .select('username, score')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .single()
    if (!data) return null
    return {
      username: (data as { username: string }).username,
      // Coerce — score is now numeric(10,1); PostgREST can return that
      // as a string and downstream `.toLocaleString()` would throw on
      // a string. See submitTideRunBest for the matching coerce.
      distance: Number((data as { score: number | string }).score),
    }
  } catch {
    return null
  }
}

/** Player's current spot on the Tide Run leaderboard + the gap to the
 *  position above. Drives the wreck-screen "you're #5 · 300m from #4"
 *  motivator — gap-to-next-rank is a much stronger pull than abstract
 *  rank alone. Returns the rank as null when the player has no
 *  distance on the board yet (cold-start state — show the global
 *  hiscore as the carrot instead). Fetched on page load and again
 *  after every wreck so PB-driven rank shifts land live. */
export type PlayerTideRunRank = {
  rank: number | null
  totalPlayers: number
  yourDistance: number
  /** Position of the player immediately above on the board. null when
   *  the player is rank 1 (or not ranked at all). */
  nextRankDistance: number | null
  nextRankUsername: string | null
}

export async function getPlayerTideRunRank(): Promise<PlayerTideRunRank | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const admin = createAdminClient()
    // Pull the full leaderboard once and walk it in JS. The Tide Run
    // board is tiny (low hundreds at most for a long while), so a
    // single round-trip is cheaper than a count + lookup-above pair.
    // Admins are already filtered out by the view.
    const { data: rows } = await admin
      .from('leaderboard_tide_run')
      .select('user_id, username, score')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })

    // score is numeric(10,1) — PostgREST may serialize as string. Coerce
    // every row up front so subtraction + display formatting downstream
    // never sees a string masquerading as a number.
    const list = ((rows ?? []) as { user_id: string; username: string; score: number | string }[])
      .map(r => ({ user_id: r.user_id, username: r.username, score: Number(r.score) }))
    const totalPlayers = list.length

    const meIdx = list.findIndex(r => r.user_id === user.id)
    if (meIdx === -1) {
      // Player has no distance on the board yet — caller surfaces the
      // global hiscore as the carrot in this case.
      return { rank: null, totalPlayers, yourDistance: 0, nextRankDistance: null, nextRankUsername: null }
    }

    const me = list[meIdx]
    if (meIdx === 0) {
      // Rank 1 — no one above to chase.
      return {
        rank: 1, totalPlayers,
        yourDistance: me.score,
        nextRankDistance: null, nextRankUsername: null,
      }
    }
    const above = list[meIdx - 1]
    return {
      rank: meIdx + 1, totalPlayers,
      yourDistance: me.score,
      nextRankDistance: above.score,
      nextRankUsername: above.username,
    }
  } catch {
    return null
  }
}
