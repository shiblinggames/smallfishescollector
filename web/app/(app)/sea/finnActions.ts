'use server'

// FINN, OUT ON THE CHART.
//
// The fishing screen's version of this lived in app/(app)/fishing/finnActions.ts
// and was built around a man who ambushed you. This one is built around a man
// you have to go and find — see lib/seaFinn.ts for where he stands.
//
// ── WHAT THE CLIENT IS ALLOWED TO SAY ───────────────────────────────────────
//
// Nothing that costs anything. The rule was written for the wagers, which are
// retired (2026-09-17, see lib/finn.ts), and it governs the jobs unchanged:
// the client names no target, no reward and no verdict. Every job is measured
// here against counters `reelIn` already maintains and the client cannot
// touch, as a DELTA from the snapshot taken when the job was set, and the
// payout is read off the job's own row in lib/finnQuests.
//
// The rule exists because the old settlement was
// `settleFinnChallenge(won, rewardDoubloons, ...)` — the verdict AND the size
// of the payout both arguments, mintable from a console. That shipped when the
// sea was two admins on an allowlist. Nothing here takes a number from the
// client again.
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
  FINN_REVEAL_BEAT, FINN_IDLE_LINES, FINN_EPILOGUE_IDLE_LINES,
  FINN_EPILOGUE_LORE_LINES, FINN_EPILOGUE_LORE_CHANCE,
  findNextBeat, pickRandomLine,
  type FinnSceneLine,
} from '@/lib/finn'

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
  /** Clean catches in the job's own water, when it has one. */
  zperf0: number
}

export type FinnQuestView = {
  id: string
  label: string
  reward: number
  /** Fishing XP on turn-in. See FinnQuest.xp. */
  xp: number
  /** How far along, in the job's own units. */
  have: number
  target: number
  done: boolean
  progressText: string
}

export type FinnSeaState = {
  encounters: number
  seenBeats: string[]
  revealed: boolean
  fishingLevel: number
  /** Where he is right now, for the marker and the compass. */
  at: { x: number; y: number; bandName: string }
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
  encounters: number
  seenBeats: string[]
  revealed: boolean
  /** Where he has moved to. */
  at: { x: number; y: number; bandName: string }
}

const SEL = 'finn_encounters, finn_seen_beats, finn_revealed, finn_quest, finn_quests_done, fishing_xp, doubloons, ancient_catches, current_perfect_streak, total_perfects, zone_perfects'

type Row = {
  finn_encounters: number | null
  finn_seen_beats: string[] | null
  finn_revealed: boolean | null
  finn_quest: StoredQuest | null
  finn_quests_done: string[] | null
  fishing_xp: number | null
  doubloons: number | null
  ancient_catches: number[] | null
  zone_perfects: Record<string, number> | null
  current_perfect_streak: number | null
  total_perfects: number | null
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
  quest: FinnQuest, perfNow: number, zonePerfects: Record<string, number>,
): Promise<StoredQuest> {
  return {
    id: quest.id,
    at: new Date().toISOString(),
    catch0: await lifetimeCatches(admin, uid),
    perf0: perfNow,
    zone0: quest.zone ? await catchesWhere(admin, uid, { zone: quest.zone }) : 0,
    rare0: quest.minRarity ? await catchesWhere(admin, uid, { zone: quest.zone, minRarity: quest.minRarity }) : 0,
    zperf0: quest.zone ? (zonePerfects[quest.zone] ?? 0) : 0,
  }
}

/** How far along a stored job is, in its own units. */
async function questProgress(
  admin: ReturnType<typeof createAdminClient>, uid: string,
  quest: FinnQuest, stored: StoredQuest, row: Row,
): Promise<number> {
  const zp = row.zone_perfects ?? {}
  /**
   * EVERY SNAPSHOT READ IS COALESCED, and that is not defensive noise.
   *
   * A stored job is a jsonb blob written when it was accepted, so a job taken
   * before a new field existed simply does not have it — and `0 - undefined` is
   * NaN, which sails straight through the arithmetic and into the panel as
   * "NaN of 4". Exactly that shipped: `zperf0` arrived with the zoned jobs and
   * every job already in flight was missing it.
   *
   * Reading a missing baseline as zero measures that job from the moment the
   * field appeared rather than from when it was accepted: generous by a few
   * catches, and impossible to farm. Any field added here later must be read
   * the same way.
   */
  const base = {
    catch0: stored.catch0 ?? 0,
    perf0: stored.perf0 ?? 0,
    zone0: stored.zone0 ?? 0,
    rare0: stored.rare0 ?? 0,
    zperf0: stored.zperf0 ?? 0,
  }
  switch (quest.type) {
    case 'catch_zone':
      // Fish landed in the job's own water since he asked.
      return (await catchesWhere(admin, uid, { zone: quest.zone })) - base.zone0

    case 'zone_perfects':
      // Clean catches in that water. `zone_perfects` is bumped in reelIn off
      // fish.habitat, so this is the same delta rule as everything else.
      return (zp[quest.zone ?? ''] ?? 0) - base.zperf0

    case 'zone_streak': {
      // BOTH TESTS, for the reason the old bet needed both, plus the water.
      // `current_perfect_streak` is a running total that survives being handed
      // the job, so the run has to have been EARNED since; and the perfects
      // have to have happened in the job's own band, or a streak run in the
      // Shallows would clear a job set in the Abyss. The smaller of the two is
      // the honest answer to "how close am I".
      const streak = row.current_perfect_streak ?? 0
      const sinceHere = (zp[quest.zone ?? ''] ?? 0) - base.zperf0
      return Math.min(streak, sinceHere)
    }

    case 'catch_rarity':
      // Rarity AND water together, so a rare fish from somewhere else does not
      // count toward an act set here.
      return (await catchesWhere(admin, uid, { zone: quest.zone, minRarity: quest.minRarity })) - base.rare0

    case 'catch_ancient': {
      // ONE NAMED GIANT, AND DELIBERATELY THE EXCEPTION TO THE DELTA RULE.
      // A giant is a unique lifetime trophy on an append-only list, not a
      // counter, so "is the Dunkleosteus on your wall" has exactly one honest
      // answer whenever it is asked.
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
    xp: quest.xp,
    have,
    target: quest.target,
    done: have >= quest.target,
    progressText: questProgressLabel(quest, have),
  }
}

/** Everything the chart needs to draw him and the job he has set. */
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

  const quest = await viewQuest(admin, user.id, row)

  return {
    encounters,
    seenBeats: row.finn_seen_beats ?? [],
    revealed: row.finn_revealed ?? false,
    fishingLevel,
    at: { x: h.x, y: h.y, bandName: h.bandName },
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
  const beat = findNextBeat(seen)
  const lines: string[] = []
  if (beat) lines.push(...beat.lines.map(l => (typeof l === 'string' ? l : l.text)))

  const quest = nextFinnQuest(row.finn_quests_done ?? [], getLevelFromXP(row.fishing_xp ?? 0))
  let stored: StoredQuest | null = null
  if (quest) {
    stored = await snapshotFor(admin, uid, quest, row.total_perfects ?? 0, row.zone_perfects ?? {})
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
  /** The purse after the pay, so the nav can show the right number now. */
  newDoubloons: number
  /** Fishing XP paid, and the total after it, so the chart's live XP can
   *  take it on the same frame. A level crossed here shows the same card a
   *  level crossed on a catch does: the chart derives that from the total. */
  xp: number
  newFishingXP: number
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
  // AND THE XP, flat, no multiplier: prestige and renown multiply CATCH XP,
  // and this is not a catch. Past the cap it still counts, because renown is
  // derived from the total.
  if (quest.xp > 0) {
    await admin.rpc('bump_profile_stat', { uid: user.id, col: 'fishing_xp', n: quest.xp })
  }

  // The purse and the XP as they stand. The chart used to fire the nav's
  // event with no value here and the nav, rightly, ignored it -- so a job
  // paid and the number did not move until the next page.
  const { data: after } = await admin.from('profiles').select('doubloons, fishing_xp').eq('id', user.id).single()
  return {
    reward: quest.reward,
    lines: [quest.done, ...rung.lines],
    questsDone: newDone,
    newDoubloons: Number(after?.doubloons ?? 0),
    xp: quest.xp,
    newFishingXP: Number(after?.fishing_xp ?? 0),
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
      .update({ finn_revealed: true, finn_seen_beats: newSeen })
      .eq('id', user.id)
    const h = finnHaunt(encounters, fishingLevel)
    return {
      lines: FINN_REVEAL_BEAT.lines, mode: 'reveal',
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
  const beat = openQuest ? null : findNextBeat(seen)
  const newSeen = rung ? rung.seen : seen
  const newEncounters = encounters + 1

  // ── WHAT HE SAYS ────────────────────────────────────────────────────
  // The story beat if one is due, else something to close on. Post-reveal the
  // closing line occasionally becomes a lore drop instead. It used to open
  // with a callback to how your last bet went; there are no bets.
  const idlePool = revealed ? FINN_EPILOGUE_IDLE_LINES : FINN_IDLE_LINES

  let lines: (string | FinnSceneLine)[]
  if (openQuest) {
    // MID-JOB. He says where you are with it, in his own words, and the panel
    // shows the count underneath. Never a scold: there is no clock on any of
    // these and he is the one setting the work, not a foreman.
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
    lines = [pickRandomLine(idlePool)]
  }

  // GUARDED. If two hails race, only one moves the counter.
  const { data: won } = await admin.from('profiles')
    .update({
      finn_encounters: newEncounters,
      finn_seen_beats: newSeen,
      // The job he just set, if he set one. An open job is left exactly as it
      // was: only turnInFinnQuest may clear one.
      finn_quest: rung?.quest ?? row.finn_quest,
    })
    .eq('id', user.id)
    .eq('finn_encounters', encounters)
    .select('id')
  if (!won || won.length === 0) return null

  const h = finnHaunt(newEncounters, fishingLevel)
  return {
    lines, mode: 'offer',
    encounters: newEncounters, seenBeats: newSeen, revealed,
    at: { x: h.x, y: h.y, bandName: h.bandName },
  }
}
