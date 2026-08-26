'use server'

// FINN, OUT ON THE CHART.
//
// The fishing screen's version of this lived in app/(app)/fishing/finnActions.ts
// and was built around a man who ambushed you. This one is built around a man
// you have to go and find — see lib/seaFinn.ts for where he stands.
//
// ── WHAT THE CLIENT IS ALLOWED TO SAY ───────────────────────────────────────
//
// The old settlement was:
//
//     settleFinnChallenge(won: boolean, rewardDoubloons: number, ...)
//     ...
//     newGold = doubloons + (won ? Math.floor(rewardDoubloons) : 0)
//
// The verdict AND the size of the payout were both arguments. Anyone with a
// console could call it with any number they liked. That shipped when the sea
// was two admins on an allowlist; the chart is open to all 81 players now, so
// it is rebuilt here with the server holding both.
//
// The bet is written into `profiles.finn_challenge` by the server when Finn
// offers it, so the tier and the multiplier are never in the client's gift. And
// the result is measured against counters `reelIn` already maintains and the
// client cannot touch:
//
//   perfect_streak  →  profiles.current_perfect_streak
//   speed_catch     →  sum(fish_lifetime.catches), snapshotted at accept
//
// Which means no change to the cast path at all: the numbers were already being
// written, they just had nobody reading them.
//
// The client's entire say in the matter is "I think I have done it". If it is
// wrong, the server says so and the bet is lost.
//
// ── AND HOW OFTEN HE CAN BE TALKED TO ───────────────────────────────────────
//
// The chart is client-side, so the server cannot check that you sailed anywhere
// — the same admission the trader system makes in docs/systems/sea-npcs.md.
// What it CAN do is refuse to advance the story twice for one meeting, which is
// the conditional update in `speakToFinn`. There is no coin in a conversation,
// so the worst a spoofer gets is the story faster than they earned it, and the
// story is the thing they came for.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { finnHaunt } from '@/lib/seaFinn'
import {
  FINN_PERFECT_TIERS, FINN_SPEED_TIERS, FINN_SPEED_ZONE_MULT,
  FINN_REVEAL_BEAT, FINN_OFFER_LINES, FINN_WIN_LINES, FINN_LOSS_LINES,
  FINN_EPILOGUE_OFFER_LINES, FINN_EPILOGUE_WIN_LINES, FINN_EPILOGUE_LOSS_LINES,
  FINN_EPILOGUE_LORE_LINES, FINN_EPILOGUE_LORE_CHANCE,
  FINN_RETURN_AFTER_WIN, FINN_RETURN_AFTER_LOSS, FINN_RETURN_AFTER_PASS,
  findNextEncounterBeat, findNextWinBeat, pickFinnTier, pickChallengeType,
  pickRandomLine,
  type FinnSceneLine, type FinnChallengeType,
} from '@/lib/finn'

/** How often a conversation ends with a bet. "From time to time" — not every
 *  meeting, or he stops being someone you talk to and becomes a slot machine
 *  you sail to. Never while a bet is already running. */
const OFFER_CHANCE = 0.45

export type FinnOffer = {
  type: FinnChallengeType
  tier: 1 | 2 | 3
  /** "Land 3 perfects in a row" — built here so the panel cannot disagree with
   *  what the server is actually going to measure. */
  targetText: string
  rewardText: string
}

export type FinnChallenge = {
  type: FinnChallengeType
  tier: 1 | 2 | 3
  targetText: string
  rewardText: string
  perfects?: number
  fish?: number
  /** Epoch ms. Speed bets only. */
  endsAt?: number
}

export type FinnSeaState = {
  encounters: number
  wins: number
  seenBeats: string[]
  revealed: boolean
  fishingLevel: number
  /** Where he is right now, for the marker and the compass. */
  at: { x: number; y: number; bandName: string }
  /** A bet in progress, if any. */
  challenge: FinnChallenge | null
}

export type FinnTalk = {
  lines: (string | FinnSceneLine)[]
  mode: 'offer' | 'reveal'
  offer: FinnOffer | null
  encounters: number
  seenBeats: string[]
  revealed: boolean
  /** Where he has moved to. */
  at: { x: number; y: number; bandName: string }
}

const SEL = 'finn_encounters, finn_wins, finn_seen_beats, finn_revealed, finn_last_outcome, finn_challenge, fishing_xp, doubloons, ancient_catches, current_perfect_streak, total_perfects'

type Row = {
  finn_encounters: number | null
  finn_wins: number | null
  finn_seen_beats: string[] | null
  finn_revealed: boolean | null
  finn_last_outcome: string | null
  finn_challenge: StoredBet | null
  fishing_xp: number | null
  doubloons: number | null
  ancient_catches: number[] | null
  current_perfect_streak: number | null
  total_perfects: number | null
}

type StoredBet = {
  state: 'offered' | 'active'
  type: FinnChallengeType
  tier: 1 | 2 | 3
  mult: number
  perfects?: number
  fish?: number
  /** How long the bet runs. Set while OFFERED; the clock has not started. */
  durMs?: number
  /** The deadline. Set at ACCEPT, when the clock starts. */
  endsAt?: number
  /** Lifetime fish landed when the bet was taken. Speed bets. */
  caught0?: number
  /** Lifetime perfects landed when the bet was taken. Streak bets — see the
   *  note in claimFinnChallenge for what it stops. */
  perf0?: number
}

/**
 * IS THIS BET STILL RUNNING?
 *
 * A speed bet has a deadline, and nothing guarantees anyone is watching when it
 * passes: the chart settles it on a timer, but closing the tab kills the timer
 * and leaves an active bet on the profile with its clock long gone. That bet
 * would then block every future offer forever, because Finn will not stack one
 * wager on another — so a captain who once shut their laptop mid-bet would
 * never be offered another for the life of the account.
 *
 * So an expired one is simply not running any more. It still SETTLES as a loss
 * if the player comes back and claims it (they did fail it), but it stops
 * standing in the way.
 */
function stillRunning(bet: StoredBet | null | undefined): boolean {
  if (!bet || bet.state !== 'active') return false
  if (bet.endsAt != null && Date.now() > bet.endsAt) return false
  return true
}

async function me() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/** Lifetime fish landed, straight off the table `reelIn` bumps. The snapshot
 *  and the settlement both come through here so they cannot measure different
 *  things. */
async function lifetimeCatches(admin: ReturnType<typeof createAdminClient>, uid: string): Promise<number> {
  const { data } = await admin.from('fish_lifetime').select('catches').eq('user_id', uid)
  return (data ?? []).reduce((a, r) => a + ((r as { catches: number | null }).catches ?? 0), 0)
}

/** What the panel shows, rebuilt from the stored bet so it can never drift from
 *  what will actually be measured. `secs` is only meaningful for speed bets. */
function viewOf(bet: StoredBet, fishingLevel: number, secs?: number): FinnChallenge {
  const reward = Math.max(0, Math.floor(fishingLevel * bet.mult))
  const targetText = bet.type === 'perfect_streak'
    ? (bet.perfects === 1 ? 'Land a perfect catch' : `Land ${bet.perfects} perfects in a row`)
    : `Land ${bet.fish} fish in ${secs ?? Math.max(0, Math.round(((bet.endsAt ?? 0) - Date.now()) / 1000))}s`
  return {
    type: bet.type, tier: bet.tier, targetText,
    rewardText: `+${reward.toLocaleString()} ⟡`,
    perfects: bet.perfects, fish: bet.fish, endsAt: bet.endsAt,
  }
}

/** Everything the chart needs to draw him and his outstanding bet. */
export async function finnState(): Promise<FinnSeaState | null> {
  const user = await me()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select(SEL).eq('id', user.id).single()
  const row = data as Row | null
  if (!row) return null

  const encounters = row.finn_encounters ?? 0
  const fishingLevel = getLevelFromXP(row.fishing_xp ?? 0)
  const h = finnHaunt(encounters, fishingLevel)
  const bet = row.finn_challenge

  return {
    encounters,
    wins: row.finn_wins ?? 0,
    seenBeats: row.finn_seen_beats ?? [],
    revealed: row.finn_revealed ?? false,
    fishingLevel,
    at: { x: h.x, y: h.y, bandName: h.bandName },
    challenge: stillRunning(bet) ? viewOf(bet!, fishingLevel) : null,
  }
}

/**
 * Pull alongside and talk to him.
 *
 * `atIndex` is the encounter number the client believes it is meeting — not a
 * secret and not a position claim, just an agreement check. It goes into the
 * WHERE of the update, so two taps on the hail button cannot both advance the
 * story: the second one matches zero rows and returns null.
 */
export async function speakToFinn(atIndex: number): Promise<FinnTalk | null> {
  const user = await me()
  if (!user) return null
  const admin = createAdminClient()

  const { data } = await admin.from('profiles').select(SEL).eq('id', user.id).single()
  const row = data as Row | null
  if (!row) return null

  const encounters = row.finn_encounters ?? 0
  if (encounters !== atIndex) return null

  const seen = row.finn_seen_beats ?? []
  const revealed = row.finn_revealed ?? false
  const fishingLevel = getLevelFromXP(row.fishing_xp ?? 0)
  const hasTrophy = (row.ancient_catches ?? []).length > 0

  // ── THE MASK SLIPS ──────────────────────────────────────────────────
  // Supersedes every other beat once an Ancient Deep trophy is landed. It does
  // NOT advance the encounter count or move him — the reveal is a thing that
  // happens at a meeting, not instead of one, and rolling him to a new haunt
  // here would leave the player watching him vanish mid-confession.
  if (hasTrophy && !revealed) {
    const newSeen = seen.includes('reveal') ? seen : [...seen, 'reveal']
    await admin.from('profiles')
      .update({ finn_revealed: true, finn_seen_beats: newSeen, finn_last_outcome: null })
      .eq('id', user.id)
    const h = finnHaunt(encounters, fishingLevel)
    return {
      lines: FINN_REVEAL_BEAT.lines, mode: 'reveal', offer: null,
      encounters, seenBeats: newSeen, revealed: true,
      at: { x: h.x, y: h.y, bandName: h.bandName },
    }
  }

  const beat = findNextEncounterBeat(seen)
  const newSeen = beat && !seen.includes(beat.id) ? [...seen, beat.id] : seen
  const newEncounters = encounters + 1

  // ── WHAT HE SAYS ────────────────────────────────────────────────────
  // A callback to how the last bet went, then the story beat if one is due,
  // then something to close on. Post-reveal the closing line occasionally
  // becomes a lore drop instead.
  const offerPool = revealed ? FINN_EPILOGUE_OFFER_LINES : FINN_OFFER_LINES
  const callback = (() => {
    switch (row.finn_last_outcome) {
      case 'won': return pickRandomLine(FINN_RETURN_AFTER_WIN)
      case 'lost': return pickRandomLine(FINN_RETURN_AFTER_LOSS)
      case 'passed': return pickRandomLine(FINN_RETURN_AFTER_PASS)
      default: return null
    }
  })()

  let lines: (string | FinnSceneLine)[]
  if (beat) lines = [...beat.lines]
  else if (revealed && Math.random() < FINN_EPILOGUE_LORE_CHANCE) lines = [pickRandomLine(FINN_EPILOGUE_LORE_LINES)]
  else lines = [pickRandomLine(offerPool)]
  if (callback) lines = [callback, ...lines]

  // ── AND WHETHER HE WANTS A BET ──────────────────────────────────────
  // Never on top of a bet already running, and never in the Ancient Deep for
  // speed bets — its boss-style multi-stage catches cannot be raced, which is
  // what the zone's 0 sentinel in FINN_SPEED_ZONE_MULT has always meant.
  const running = stillRunning(row.finn_challenge)
  let bet: StoredBet | null = null
  if (!running && Math.random() < OFFER_CHANCE) {
    const h0 = finnHaunt(newEncounters, fishingLevel)
    const zoneMult = FINN_SPEED_ZONE_MULT[h0.bandId] ?? 1
    const tier = pickFinnTier()
    let type = pickChallengeType()
    if (type === 'speed_catch' && zoneMult === 0) type = 'perfect_streak'

    if (type === 'perfect_streak') {
      const t = FINN_PERFECT_TIERS.find(x => x.tier === tier)!
      bet = { state: 'offered', type, tier, mult: t.multiplier, perfects: t.perfects }
    } else {
      const t = FINN_SPEED_TIERS.find(x => x.tier === tier)!
      bet = {
        state: 'offered', type, tier, mult: t.multiplier,
        fish: t.fish,
        // A DURATION, not a deadline. The clock starts when the bet is TAKEN,
        // so reading his dialogue can never cost you the bet.
        durMs: Math.round(t.timeMs * zoneMult),
      }
    }
    lines = [...lines, pickRandomLine(offerPool)]
  }

  // GUARDED. If two hails race, only one moves the counter.
  const { data: won } = await admin.from('profiles')
    .update({
      finn_encounters: newEncounters,
      finn_seen_beats: newSeen,
      finn_last_outcome: null,
      // A new offer replaces whatever was there; otherwise the running bet is
      // preserved and an expired one is swept.
      finn_challenge: bet ?? (running ? row.finn_challenge : null),
    })
    .eq('id', user.id)
    .eq('finn_encounters', encounters)
    .select('id')
  if (!won || won.length === 0) return null

  const h = finnHaunt(newEncounters, fishingLevel)
  return {
    lines, mode: 'offer',
    offer: bet
      ? {
          type: bet.type, tier: bet.tier,
          targetText: bet.type === 'perfect_streak'
            ? (bet.perfects === 1 ? 'Land a perfect catch' : `Land ${bet.perfects} perfects in a row`)
            : `Land ${bet.fish} fish in ${Math.round((bet.durMs ?? 0) / 1000)}s`,
          rewardText: `+${Math.max(0, Math.floor(fishingLevel * bet.mult)).toLocaleString()} ⟡`,
        }
      : null,
    encounters: newEncounters, seenBeats: newSeen, revealed,
    at: { x: h.x, y: h.y, bandName: h.bandName },
  }
}

/** Take the bet. The clock — if there is one — starts here. */
export async function acceptFinnChallenge(): Promise<FinnChallenge | null> {
  const user = await me()
  if (!user) return null
  const admin = createAdminClient()

  const { data } = await admin.from('profiles').select(SEL).eq('id', user.id).single()
  const row = data as Row | null
  const offered = row?.finn_challenge
  if (!offered || offered.state !== 'offered') return null

  const fishingLevel = getLevelFromXP(row!.fishing_xp ?? 0)
  const durationMs = offered.durMs ?? 0

  const live: StoredBet = {
    ...offered,
    state: 'active',
    endsAt: offered.type === 'speed_catch' ? Date.now() + durationMs : undefined,
    // THE BASELINE. Everything the settlement measures is a delta from here, so
    // nothing landed before the bet was taken can pay for it.
    caught0: await lifetimeCatches(admin, user.id),
    perf0: row!.total_perfects ?? 0,
  }

  await admin.from('profiles').update({ finn_challenge: live }).eq('id', user.id)
  return viewOf(live, fishingLevel, Math.round(durationMs / 1000))
}

/** Walk away from the offer. Remembered, so he can call it out next time. */
export async function declineFinnChallenge(): Promise<void> {
  const user = await me()
  if (!user) return
  await createAdminClient().from('profiles')
    .update({ finn_challenge: null, finn_last_outcome: 'passed' })
    .eq('id', user.id)
}

export type FinnSettle = {
  won: boolean
  lines: (string | FinnSceneLine)[]
  rewardText?: string
  doubloons: number
  wins: number
  seenBeats: string[]
}

/**
 * Settle the outstanding bet.
 *
 * THE CLIENT PASSES NOTHING. Whether it was won and what it is worth are both
 * worked out here, from counters the cast path maintains. A client that calls
 * this early simply loses the bet, which is the correct answer to "I claim I
 * won" when the numbers say otherwise.
 */
export async function claimFinnChallenge(): Promise<FinnSettle | null> {
  const user = await me()
  if (!user) return null
  const admin = createAdminClient()

  const { data } = await admin.from('profiles').select(SEL).eq('id', user.id).single()
  const row = data as Row | null
  const bet = row?.finn_challenge
  if (!row || !bet || bet.state !== 'active') return null

  // ── DID THEY DO IT? ─────────────────────────────────────────────────
  let won = false
  if (bet.type === 'perfect_streak') {
    // TWO TESTS, AND IT NEEDS BOTH.
    //
    // The streak alone is not enough. It is a RUNNING total that survives
    // taking the bet, so a captain sitting on a streak of nine who accepts
    // "land three perfects in a row" has already satisfied it without casting —
    // the first reel of any kind would have paid out. That is a doubloon
    // faucet for anyone who noticed, and the whole point of moving the
    // settlement server-side was to close faucets.
    //
    // So the run also has to have been EARNED since the bet was taken, which
    // `total_perfects` answers: it only ever goes up, one per perfect, so the
    // delta is exactly how many perfects this bet has seen. Landing the target
    // off the back of an existing run still wins, which is correct — the bet
    // asked for N in a row and N in a row is what happened. Landing NONE
    // cannot.
    const target = bet.perfects ?? Infinity
    const sinceBet = (row.total_perfects ?? 0) - (bet.perf0 ?? 0)
    won = (row.current_perfect_streak ?? 0) >= target && sinceBet >= target
  } else {
    const inTime = Date.now() <= (bet.endsAt ?? 0)
    const landed = (await lifetimeCatches(admin, user.id)) - (bet.caught0 ?? 0)
    won = inTime && landed >= (bet.fish ?? Infinity)
  }

  const fishingLevel = getLevelFromXP(row.fishing_xp ?? 0)
  const reward = won ? Math.max(0, Math.floor(fishingLevel * bet.mult)) : 0

  const seen = row.finn_seen_beats ?? []
  const winBeat = won ? findNextWinBeat(seen) : null
  const newSeen = winBeat && !seen.includes(winBeat.id) ? [...seen, winBeat.id] : seen
  const newWins = (row.finn_wins ?? 0) + (won ? 1 : 0)
  const revealed = row.finn_revealed ?? false

  // GUARDED ON THE BET STILL BEING THERE. Two taps on "Collect" would otherwise
  // both read an active bet and both pay it. `is('finn_challenge', ...)` cannot
  // express "unchanged", so the guard is that the column is still non-null and
  // the update nulls it — the loser of the race updates zero rows.
  const { data: settled } = await admin.from('profiles')
    .update({
      finn_challenge: null,
      finn_wins: newWins,
      finn_seen_beats: newSeen,
      finn_last_outcome: won ? 'won' : 'lost',
    })
    .eq('id', user.id)
    .not('finn_challenge', 'is', null)
    .select('id')
  if (!settled || settled.length === 0) return null

  // PAID SEPARATELY, and only after the bet is provably ours to settle. Uses
  // the same add-to-balance shape the rest of the game does; the amount is the
  // server's own number, never the client's.
  let doubloons = row.doubloons ?? 0
  if (reward > 0) {
    doubloons += reward
    await admin.from('profiles').update({ doubloons }).eq('id', user.id)
    await admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: reward, reason: `Finn's bet (tier ${bet.tier})`,
    })
  }

  let lines: (string | FinnSceneLine)[]
  if (won) {
    lines = winBeat
      ? [...winBeat.lines]
      : [pickRandomLine(revealed ? FINN_EPILOGUE_WIN_LINES : FINN_WIN_LINES)]
  } else {
    lines = [pickRandomLine(revealed ? FINN_EPILOGUE_LOSS_LINES : FINN_LOSS_LINES)]
  }

  return {
    won, lines,
    rewardText: won ? `+${reward.toLocaleString()} ⟡` : undefined,
    doubloons, wins: newWins, seenBeats: newSeen,
  }
}
