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
  FINN_QUESTS, finnQuestById, nextFinnQuest, pendingFinnQuest, questProgressLabel,
  type FinnQuest,
} from '@/lib/finnQuests'
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

/**
 * THE JOB AS STORED, with the counters it will be judged against.
 *
 * Every one of these snapshots is taken at the moment he sets the job, which is
 * what makes a job impossible to finish retroactively: the measurement is
 * always a DELTA. A captain who takes "eight in a row" while sitting on a run
 * of nine has done nothing yet.
 */
type StoredQuest = {
  id: string
  at: string
  /** Lifetime catches when he set it. */
  catch0: number
  /** Lifetime perfects when he set it. */
  perf0: number
  /** Catches in the job's band, when it has one. */
  zone0: number
  /** Catches at or above the job's rarity, when it has one. */
  rare0: number
}

export type FinnQuestView = {
  id: string
  label: string
  reward: number
  /** How far along, in the job's own units. */
  have: number
  target: number
  done: boolean
  progressText: string
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
  /** The job he has set, if any, with live progress. */
  quest: FinnQuestView | null
  /** Is a job finished and waiting to be handed back? Drives every indicator
   *  that points a captain at him, so it is derived once here rather than in
   *  four places that could disagree. */
  questReady: boolean
  /** Jobs already handed in, for the ladder. */
  questsDone: string[]
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

const SEL = 'finn_encounters, finn_wins, finn_seen_beats, finn_revealed, finn_last_outcome, finn_challenge, finn_quest, finn_quests_done, fishing_xp, doubloons, ancient_catches, current_perfect_streak, total_perfects'

type Row = {
  finn_encounters: number | null
  finn_wins: number | null
  finn_seen_beats: string[] | null
  finn_revealed: boolean | null
  finn_last_outcome: string | null
  finn_challenge: StoredBet | null
  finn_quest: StoredQuest | null
  finn_quests_done: string[] | null
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

/**
 * CATCHES IN ONE BAND, and catches at or above one rarity.
 *
 * Both join `fish_lifetime` against the species table server-side. They are the
 * only two measurements a job needs that the profile does not already hold as a
 * single number, and they are read at accept and again at turn-in so the job is
 * always a delta.
 */
async function catchesWhere(
  admin: ReturnType<typeof createAdminClient>, uid: string,
  opts: { zone?: string; minRarity?: number },
): Promise<number> {
  if (!opts.zone && !opts.minRarity) return 0
  let q = admin.from('fish_species').select('id')
  if (opts.zone) q = q.eq('habitat', opts.zone)
  if (opts.minRarity) q = q.gte('bite_rarity', opts.minRarity)
  const { data: species } = await q
  const ids = (species ?? []).map(r => (r as { id: number }).id)
  if (!ids.length) return 0
  const { data } = await admin.from('fish_lifetime')
    .select('catches, fish_id').eq('user_id', uid).in('fish_id', ids)
  return (data ?? []).reduce((a, r) => a + ((r as { catches: number | null }).catches ?? 0), 0)
}

/** Snapshot every counter a job could be measured against. Taken whole rather
 *  than per-type: it is two extra reads once, at the moment he sets the job,
 *  and it means changing a job's type later cannot silently read a snapshot
 *  that was never captured. */
async function snapshotFor(
  admin: ReturnType<typeof createAdminClient>, uid: string,
  quest: FinnQuest, perfNow: number,
): Promise<StoredQuest> {
  return {
    id: quest.id,
    at: new Date().toISOString(),
    catch0: await lifetimeCatches(admin, uid),
    perf0: perfNow,
    zone0: quest.zone ? await catchesWhere(admin, uid, { zone: quest.zone }) : 0,
    rare0: quest.minRarity ? await catchesWhere(admin, uid, { minRarity: quest.minRarity }) : 0,
  }
}

/** How far along a stored job is, in its own units. */
async function questProgress(
  admin: ReturnType<typeof createAdminClient>, uid: string,
  quest: FinnQuest, stored: StoredQuest, row: Row,
): Promise<number> {
  switch (quest.type) {
    case 'catch_any':
      return (await lifetimeCatches(admin, uid)) - stored.catch0
    case 'land_perfects':
      return (row.total_perfects ?? 0) - stored.perf0
    case 'perfect_streak': {
      // BOTH TESTS, for the reason the old bet needed both: the streak is a
      // running total that survives being handed the job, so it also has to
      // have been EARNED since. The progress shown is whichever is smaller,
      // which is the honest answer to "how close am I".
      const streak = row.current_perfect_streak ?? 0
      const since = (row.total_perfects ?? 0) - stored.perf0
      return Math.min(streak, since)
    }
    case 'catch_zone':
      return (await catchesWhere(admin, uid, { zone: quest.zone })) - stored.zone0
    case 'catch_rarity':
      return (await catchesWhere(admin, uid, { minRarity: quest.minRarity })) - stored.rare0
    case 'catch_ancient': {
      // ONE NAMED GIANT, AND DELIBERATELY THE EXCEPTION TO THE DELTA RULE.
      //
      // Everything else here is measured since he asked, so a job cannot be
      // finished retroactively off a counter that was already high. A giant is
      // not a counter: it is a unique trophy landed once in a lifetime, and
      // `ancient_catches` is append-only. "Raise the Dunkleosteus" is a
      // question about whether that specific creature is on your wall, which
      // has exactly one honest answer whenever it is asked.
      const wall = (row.ancient_catches as number[] | null) ?? []
      return quest.ancientId && wall.includes(quest.ancientId) ? 1 : 0
    }
  }
}

async function viewQuest(
  admin: ReturnType<typeof createAdminClient>, uid: string, row: Row,
): Promise<FinnQuestView | null> {
  const stored = row.finn_quest
  const quest = finnQuestById(stored?.id)
  if (!stored || !quest) return null
  const have = Math.max(0, await questProgress(admin, uid, quest, stored, row))
  return {
    id: quest.id,
    label: quest.label,
    reward: quest.reward,
    have,
    target: quest.target,
    done: have >= quest.target,
    progressText: questProgressLabel(quest, have),
  }
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

  const quest = await viewQuest(admin, user.id, row)

  return {
    encounters,
    wins: row.finn_wins ?? 0,
    seenBeats: row.finn_seen_beats ?? [],
    revealed: row.finn_revealed ?? false,
    fishingLevel,
    at: { x: h.x, y: h.y, bandName: h.bandName },
    challenge: stillRunning(bet) ? viewOf(bet!, fishingLevel) : null,
    quest,
    questReady: !!quest?.done,
    questsDone: row.finn_quests_done ?? [],
  }
}

/**
 * ── ONE RUNG OF THE LADDER ──────────────────────────────────────────────────
 *
 * The next unheard beat, and the next unset job, delivered together. This is
 * the alternation in one place: he tells you the next piece of it and then asks
 * you for the next thing, so a captain always leaves him carrying both a story
 * and a task. Nothing else in this file is allowed to hand out either.
 *
 * Returns the lines to say and the job to write, so the caller can put both
 * inside its own guarded update rather than this doing a second write that
 * could land without the first.
 */
async function nextRung(
  admin: ReturnType<typeof createAdminClient>, uid: string, row: Row,
): Promise<{ lines: string[]; seen: string[]; quest: StoredQuest | null }> {
  const seen = row.finn_seen_beats ?? []
  const beat = findNextEncounterBeat(seen)
  const lines: string[] = []
  if (beat) lines.push(...beat.lines.map(l => (typeof l === 'string' ? l : l.text)))

  const quest = nextFinnQuest(row.finn_quests_done ?? [], getLevelFromXP(row.fishing_xp ?? 0))
  let stored: StoredQuest | null = null
  if (quest) {
    stored = await snapshotFor(admin, uid, quest, row.total_perfects ?? 0)
    lines.push(quest.give)
  }
  return {
    lines,
    seen: beat && !seen.includes(beat.id) ? [...seen, beat.id] : seen,
    quest: stored,
  }
}

/**
 * ── HAND THE JOB BACK ───────────────────────────────────────────────────────
 *
 * Pays, records it, and clears the way for the next beat. Everything a captain
 * gets for the work happens here rather than the moment the counter filled,
 * which is the point of the whole change: the job ends by going and telling
 * him, not by a number quietly reaching its target somewhere.
 *
 * GUARDED BY THE JOB STILL BEING THERE. Two taps on Hand it over would
 * otherwise both read a finished job and both pay it; the update nulls the
 * column and matches only while it is non-null, so the loser writes nothing.
 * Same shape as the old bet settlement, and for the same reason.
 */
export async function turnInFinnQuest(): Promise<{
  reward: number; lines: string[]; questsDone: string[]
} | { error: string } | null> {
  const user = await me()
  if (!user) return null
  const admin = createAdminClient()

  const { data } = await admin.from('profiles').select(SEL).eq('id', user.id).single()
  const row = data as Row | null
  if (!row) return null
  const stored = row.finn_quest
  const quest = finnQuestById(stored?.id)
  if (!stored || !quest) return { error: 'He has not set you anything.' }

  const have = Math.max(0, await questProgress(admin, user.id, quest, stored, row))
  if (have < quest.target) return { error: quest.waiting }

  const doneIds = row.finn_quests_done ?? []
  const newDone = doneIds.includes(quest.id) ? doneIds : [...doneIds, quest.id]

  // HANDING IT BACK IS WHAT ADVANCES THE STORY. He takes the work, pays for it,
  // and tells you the next piece of it on the spot, then asks for the next
  // thing. One moment rather than three, and it is the only place a beat is
  // handed out other than the very first meeting.
  const rung = await nextRung(admin, user.id, { ...row, finn_quests_done: newDone })

  const { data: settled } = await admin.from('profiles')
    .update({
      finn_quest: rung.quest,
      finn_quests_done: newDone,
      finn_seen_beats: rung.seen,
      finn_last_outcome: null,
    })
    .eq('id', user.id)
    .not('finn_quest', 'is', null)
    .select('id')
  if (!settled || settled.length === 0) return { error: 'That one is already handed in.' }

  // PAID AFTER the job is provably ours to settle, never before.
  if (quest.reward > 0) {
    await admin.rpc('bump_profile_stat', { uid: user.id, col: 'doubloons', n: quest.reward })
    await admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: quest.reward, reason: `Finn's job: ${quest.label}`,
    })
  }

  return {
    reward: quest.reward,
    lines: [quest.done, ...rung.lines],
    questsDone: newDone,
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

  /**
   * ── A JOB BLOCKS THE STORY, ON PURPOSE ──────────────────────────────
   *
   * While he has something outstanding with you he has nothing new to say,
   * and this is the whole shape of the campaign rather than a restriction on
   * it: beat, job, hand it back, next beat. A captain who could keep talking
   * past an unfinished job would collect the entire story without ever doing
   * any of the work, which is what the old wagers allowed.
   *
   * Turning up mid-job is never wasted. It still counts as a meeting for
   * standing, and he tells you where you are with it.
   */
  const openStored = row.finn_quest
  const openQuest = finnQuestById(openStored?.id)
  const rung = openQuest ? null : await nextRung(admin, user.id, row)
  const beat = openQuest ? null : findNextEncounterBeat(seen)
  const newSeen = rung ? rung.seen : seen
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
  if (openQuest) {
    // MID-JOB. He says where you are with it, in his own words, and the panel
    // shows the count underneath. Never a scold: there is no clock on any of
    // these and he is a rival, not a foreman.
    const have = Math.max(0, await questProgress(admin, user.id, openQuest, openStored!, row))
    lines = have >= openQuest.target
      ? ["You have got it. Go on then, hand it over."]
      : [openQuest.waiting]
  } else if (rung && rung.lines.length > 0) {
    // The beat, then the job he sets off the back of it.
    lines = rung.lines
  } else if (pendingFinnQuest(row.finn_quests_done ?? [])) {
    // ── WAITING ON YOUR LEVEL ───────────────────────────────────────
    //
    // There IS a next job, and it is in water you cannot work yet. He says so
    // rather than going quiet, because a campaign that stops with no
    // explanation is indistinguishable from a campaign that has ended, and
    // this one has eighteen rungs and a finale on the far side of it.
    lines = [pendingFinnQuest(row.finn_quests_done ?? [])!.gated]
  } else if (revealed && Math.random() < FINN_EPILOGUE_LORE_CHANCE) {
    lines = [pickRandomLine(FINN_EPILOGUE_LORE_LINES)]
  } else {
    lines = [pickRandomLine(offerPool)]
  }
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
      // The job he just set, if he set one. An open job is left exactly as it
      // was: only turnInFinnQuest may clear one.
      finn_quest: rung?.quest ?? row.finn_quest,
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
