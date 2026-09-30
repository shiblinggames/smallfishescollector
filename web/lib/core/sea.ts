// ── THE SEA, CORE (Steam prep, 2026-09-29) ──
//
// The things on the chart that are not fishing, selling or raids, with nothing
// of the web in them: the nine regulars (a visit, a job, a delivery, a rod),
// Finn (his jobs and his story), bottles and digs, going ashore, the portal's
// ladder, the free recall home, and Kip's one question. Each takes the store
// (SeaData) and the captain's id. On the web the server actions (sea/folk,
// finn, dig, isle, portal, recall and smuggler actions) check the session and
// hand these the Supabase store; offline, the local save's.
//
// THE CLIENT NAMES A THING AND NOTHING ELSE. Who you are talking to, which
// bottle, which isle: what it is worth, whether it counts and whether it has
// already happened are all decided here against the store.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; every table read and guarded write became a store operation; the
// clock is the game's.

import { clockNow } from '@/lib/clock'
import { rngNext } from '@/lib/rng'
import { isPremiumActive } from '@/lib/premium'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { RODS } from '@/lib/rods'
import {
  FOLK, folkById, tierFor, nextLine, favouriteFor, favouriteById, wantKey,
  CHAT_POINTS, GIFT_FAVOURITE_POINTS,
  type FolkId, type FolkTier,
} from '@/lib/seaFolk'
import { finnHaunt } from '@/lib/seaFinn'
import { finnQuestById, nextFinnQuest, pendingFinnQuest, questProgressLabel, type FinnQuest } from '@/lib/finnQuests'
import {
  FINN_REVEAL_BEAT, FINN_IDLE_LINES, FINN_EPILOGUE_IDLE_LINES,
  FINN_EPILOGUE_LORE_LINES, FINN_EPILOGUE_LORE_CHANCE,
  findNextBeat, pickRandomLine,
  type FinnSceneLine,
} from '@/lib/finn'
import { bottleFromKey, bottlePos, fragmentFor, carriesBearing, BOTTLE_REACH } from '@/lib/seaBottles'
import { DIG_BY_ID, DIG_SITES, DIG_RANGE, bearingText, type DigSite } from '@/lib/seaDigs'
import { ISLE_BY_ID, ISLES, ISLE_FURNISHING, type IsleNote } from '@/lib/seaIsles'
import { PORTAL_TIERS, hasStoneFor } from '@/lib/seaPortal'
import { FURNISHING_BY_ID } from '@/lib/homestead'
import { RECALL_MS, type RecallSide } from '@/lib/seaRecall'
import { PLACES } from '@/app/(app)/sea/chart'
import type { SeaData } from '@/lib/data/seaData'

const nowIso = () => new Date(clockNow()).toISOString()
/** UTC date string, the convention every daily thing in the game turns over on. */
const today = () => nowIso().slice(0, 10)

// ══ THE REGULARS ══════════════════════════════════════════════════════════════
//
// Rapport is a value, so it moves only here. Rows exist once somebody has been
// spoken to, so a missing row IS tier zero.

export type Rapport = {
  folkId: string
  points: number
  tier: FolkTier
  seenLines: string[]
  chattedToday: boolean
  giftsGiven: number
  /** The job they have given you, or null if you have not asked. */
  want: { fishId: number; name: string } | null
  /** And whether you can settle it right now: holding one, landed since they asked. */
  wantReady: boolean
}

export type FolkTalk = {
  line: string
  points: number
  tier: FolkTier
  /** Set only on the visit that crossed into a new tier. */
  tierUp: string | null
}

/** What they say when you ask what they are after. Costs nothing, moves nothing. */
export type FolkAsk = { line: string; fishId: number; fishName: string }

export type FolkGift = { line: string; points: number; tier: FolkTier; tierUp: string | null; fishName: string }

/** Every standing this captain holds. */
export async function folkState(db: SeaData, uid: string): Promise<Rapport[]> {
  const rows = await db.rapportRows(uid)
  const d = today()

  // WHICH OPEN REQUESTS CAN BE SETTLED RIGHT NOW. Two conditions, and the
  // second is the point: you have to be holding one, and the catch log has to
  // say you landed one AFTER they asked. One pair of reads for all nine.
  const open = rows.filter(r => r.want_fish_id != null && r.want_asked_at)
  const ready = new Set<string>()
  if (open.length) {
    const ids = [...new Set(open.map(r => r.want_fish_id as number))]
    const [held, last] = await Promise.all([db.heldQty(uid, ids), db.lastCaught(uid, ids)])
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
    // A stored id that is no longer one of their three reads as no request.
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
 * A VISIT. One a day per regular. THE DAY IS CLAIMED BY THE WRITE ITSELF, a
 * conditional write that only lands where the last chat was not today, so two
 * taps cannot both be the first. Missing a day costs nothing.
 */
export async function talkToFolk(db: SeaData, uid: string, folkId: string): Promise<FolkTalk | { error: string }> {
  const folk = folkById(folkId)
  if (!folk) return { error: 'There is nobody by that name out here.' }
  const d = today()

  // The row has to exist before it can be claimed conditionally.
  await db.ensureRapport(uid, folk.id)
  const before = await db.rapportRow(uid, folk.id)
  if (!before) return { error: 'That did not take.' }
  if (before.last_chat_on === d) return { error: `You have already had a word with ${folk.name} today.` }

  const wasTier = tierFor(before.points ?? 0)
  const seen = (before.seen_lines ?? []) as string[]
  const { line, key } = nextLine(folk, wasTier, seen)
  const points = (before.points ?? 0) + CHAT_POINTS
  const tier = tierFor(points)

  if (!(await db.claimChat(uid, folk.id, d, { points, seen_lines: seen.includes(key) ? seen : [...seen, key] }))) {
    return { error: `You have already had a word with ${folk.name} today.` }
  }

  return { line, points, tier, tierUp: tier > wasTier ? folk.tierUp[(tier - 1) as 0 | 1 | 2 | 3] : null }
}

/** One line out of a pool. Never empty: every pool ships with at least one. */
function pickLine(pool: string[]): string {
  return pool[Math.floor(rngNext() * pool.length)] ?? pool[0] ?? ''
}

/**
 * ASKING SOMEBODY WHAT THEY WANT. Free: it opens a job and writes down which
 * fish, so the delivery has something to be checked against. ONE AT A TIME:
 * asking again re-states the open one rather than rolling a new one. WHICH ONE
 * is favourites[gifts_given % 3], so it advances on delivery.
 */
export async function askForFavourite(db: SeaData, uid: string, folkId: string): Promise<FolkAsk | { error: string }> {
  const folk = folkById(folkId)
  if (!folk) return { error: 'There is nobody by that name out here.' }

  await db.ensureRapport(uid, folk.id)
  const row = await db.rapportRow(uid, folk.id)
  if (!row) return { error: 'That did not take.' }

  // Already asked. Say the same thing again rather than picking a new fish.
  const open = row.want_fish_id != null ? favouriteById(folk, row.want_fish_id) : null
  if (open) return { line: open.ask, fishId: open.id, fishName: open.name }

  const fav = favouriteFor(folk, row.gifts_given ?? 0)
  const seen = (row.seen_lines ?? []) as string[]
  const key = wantKey(folk, fav.id)

  // The timestamp is the freshness line the delivery is measured against, so it
  // is written HERE and never sent by a client.
  if (!(await db.setWant(uid, folk.id, { want_fish_id: fav.id, want_asked_at: nowIso(), seen_lines: seen.includes(key) ? seen : [...seen, key] }))) {
    return { error: 'That did not take.' }
  }
  return { line: fav.ask, fishId: fav.id, fishName: fav.name }
}

/**
 * SETTLING THE JOB. Three points, repeatable, no clock. The fish has to be the
 * one they asked for AND landed since they asked ("caught since" is the catch
 * log's last-caught stamp). CLAIM FIRST, TAKE THE FISH SECOND: the settle only
 * lands while the want is still this fish, and if the hold turns out empty the
 * whole claim is handed back.
 */
export async function deliverToFolk(db: SeaData, uid: string, folkId: string): Promise<FolkGift | { error: string }> {
  const folk = folkById(folkId)
  if (!folk) return { error: 'There is nobody by that name out here.' }

  const before = await db.rapportRow(uid, folk.id)
  if (!before?.want_fish_id || !before.want_asked_at) return { error: `${folk.short} has not asked you for anything.` }
  const fav = favouriteById(folk, before.want_fish_id)
  if (!fav) return { error: `${folk.short} has not asked you for anything.` }

  // ── IS IT A FRESH ONE ──
  const caught = (await db.lastCaught(uid, [fav.id])).get(fav.id)
  const landedAfter = !!caught && Date.parse(caught) > Date.parse(String(before.want_asked_at))
  if (!landedAfter) return { error: `You have not landed a ${fav.name} since they asked. One out of the hold does not count.` }

  // ── CLAIM THE JOB ──
  const points = (before.points ?? 0) + GIFT_FAVOURITE_POINTS
  const wasTier = tierFor(before.points ?? 0)
  const tier = tierFor(points)
  if (!(await db.settleWant(uid, folk.id, fav.id, { points, gifts_given: (before.gifts_given ?? 0) + 1 }))) {
    return { error: 'You have already handed that over.' }
  }

  // ── THEN TAKE THE FISH ──
  if (!(await db.takeOneFish(uid, fav.id))) {
    // Give the job back exactly as it was: they never got the fish.
    await db.restoreRapport(uid, folk.id, {
      points: before.points ?? 0, gifts_given: before.gifts_given ?? 0,
      want_fish_id: fav.id, want_asked_at: before.want_asked_at,
    })
    return { error: `There is no ${fav.name} in your hold.` }
  }

  // YOU REMEMBERED: the one badge on the Salt Road that cannot be derived
  // (nothing records WHICH fish each delivery was), so it is granted at the
  // moment it happens, after the fish is confirmed taken. Best-effort.
  try { await db.grantBadge(uid, 'you_remembered') } catch { /* best-effort */ }

  return {
    line: pickLine(fav.brought), points, tier,
    tierUp: tier > wasTier ? folk.tierUp[(tier - 1) as 0 | 1 | 2 | 3] : null,
    fishName: fav.name,
  }
}

/**
 * THE LAST THING A FRIEND DOES FOR YOU: a rod no shop stocks, offered once you
 * are as far along with them as the friendship goes. THE GATE IS THE ROW.
 * CLAIM THE ROD, THEN CHARGE FOR IT: the rod's row is the lock (owned once), and
 * a charge that does not go through takes the rod back.
 */
export async function buyFolkRod(db: SeaData, uid: string, folkId: FolkId): Promise<
  { ok: true; rodTier: number; rodName: string; spent: number; doubloons: number } | { error: string }
> {
  const folk = folkById(folkId)
  if (!folk?.rodTier) return { error: 'They have nothing like that to sell.' }
  const rod = RODS.find(r => r.tier === folk.rodTier)
  if (!rod) return { error: 'The deal fell through.' }

  // Are you actually that far along with them? Read, never taken on trust.
  const standing = await db.rapportRow(uid, folk.id)
  if (tierFor(standing?.points ?? 0) < 4) return { error: `${folk.short} is not going to part with that for you yet.` }

  // Say so BEFORE taking the money. A regular parts with their rod once: it is
  // a friend's rod, not stock, so a second copy is not theirs to sell.
  if ((await db.held(uid, 'rod', rod.id)) > 0) return { error: `You already carry the ${rod.name}.` }

  // The RESULT is the guard: null when the purse will not cover it.
  const newBalance = await db.deductDoubloons(uid, rod.cost)
  if (newBalance == null) return { error: `They want ${rod.cost.toLocaleString()} and you have not got it.` }
  await db.give(uid, 'rod', rod.id)

  await db.ledger(uid, -rod.cost, `Bought the ${rod.name} from ${folk.short} at sea`)
  return { ok: true, rodTier: folk.rodTier, rodName: rod.name, spent: rod.cost, doubloons: Number(newBalance) }
}

// ══ FINN ══════════════════════════════════════════════════════════════════════
//
// A man you have to go and find. The client names no target, no reward and no
// verdict: every job is measured here against counters the catch path keeps,
// as a DELTA from the snapshot taken when the job was set, and the payout is
// read off the job's own definition.

/** The job as stored, with the counters it will be judged against. */
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
  /** Fishing XP on turn-in. */
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
  /** Is a job finished and waiting to be handed back? */
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

const FINN_SEL = 'finn_encounters, finn_seen_beats, finn_revealed, finn_quest, finn_quests_done, fishing_xp, doubloons, ancient_catches, current_perfect_streak, total_perfects, zone_perfects'

type FinnRow = {
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

/** Snapshot every counter a job could be measured against, whole rather than
 *  per-type, so changing a job's type later cannot read a snapshot never taken. */
async function snapshotFor(db: SeaData, uid: string, quest: FinnQuest, perfNow: number, zonePerfects: Record<string, number>): Promise<StoredQuest> {
  return {
    id: quest.id,
    at: nowIso(),
    catch0: await db.lifetimeCatches(uid),
    perf0: perfNow,
    zone0: quest.zone ? await db.catchesWhere(uid, { zone: quest.zone }) : 0,
    rare0: quest.minRarity ? await db.catchesWhere(uid, { zone: quest.zone, minRarity: quest.minRarity }) : 0,
    zperf0: quest.zone ? (zonePerfects[quest.zone] ?? 0) : 0,
  }
}

/** How far along a stored job is, in its own units. Every snapshot read is
 *  coalesced: a job accepted before a field existed does not have it, and
 *  `0 - undefined` is NaN ("NaN of 4" shipped once). */
async function questProgress(db: SeaData, uid: string, quest: FinnQuest, stored: StoredQuest, row: FinnRow): Promise<number> {
  const zp = row.zone_perfects ?? {}
  const base = {
    catch0: stored.catch0 ?? 0, perf0: stored.perf0 ?? 0, zone0: stored.zone0 ?? 0,
    rare0: stored.rare0 ?? 0, zperf0: stored.zperf0 ?? 0,
  }
  switch (quest.type) {
    case 'catch_zone':
      // Fish landed in the job's own water since he asked.
      return (await db.catchesWhere(uid, { zone: quest.zone })) - base.zone0
    case 'zone_perfects':
      // Clean catches in that water, the same delta rule.
      return (zp[quest.zone ?? ''] ?? 0) - base.zperf0
    case 'zone_streak': {
      // BOTH TESTS: the run has to have been earned since, and in the job's own
      // band. The smaller is the honest answer to "how close am I".
      const streak = row.current_perfect_streak ?? 0
      const sinceHere = (zp[quest.zone ?? ''] ?? 0) - base.zperf0
      return Math.min(streak, sinceHere)
    }
    case 'catch_rarity':
      // Rarity AND water together.
      return (await db.catchesWhere(uid, { zone: quest.zone, minRarity: quest.minRarity })) - base.rare0
    case 'catch_ancient': {
      // One named giant, the exception to the delta rule: a lifetime trophy on
      // an append-only list has one honest answer whenever it is asked.
      const wall = (row.ancient_catches as number[] | null) ?? []
      return quest.ancientId && wall.includes(quest.ancientId) ? 1 : 0
    }
  }
}

async function viewQuest(db: SeaData, uid: string, row: FinnRow): Promise<FinnQuestView | null> {
  const stored = row.finn_quest
  const quest = finnQuestById(stored?.id)
  if (!stored || !quest) return null
  const have = Math.max(0, await questProgress(db, uid, quest, stored, row))
  return {
    id: quest.id, label: quest.label, reward: quest.reward, xp: quest.xp,
    have, target: quest.target, done: have >= quest.target,
    progressText: questProgressLabel(quest, have),
  }
}

/** Everything the chart needs to draw him and the job he has set. */
export async function finnState(db: SeaData, uid: string): Promise<FinnSeaState | null> {
  const row = (await db.profile(uid, FINN_SEL)) as FinnRow | null
  if (!row) return null
  const encounters = row.finn_encounters ?? 0
  const fishingLevel = getLevelFromXP(row.fishing_xp ?? 0)
  const h = finnHaunt(encounters, fishingLevel)
  const quest = await viewQuest(db, uid, row)
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

/** ONE RUNG OF THE LADDER: the next unheard beat and the next unset job,
 *  together. Returns both so the caller can put them in its own guarded write. */
async function nextRung(db: SeaData, uid: string, row: FinnRow): Promise<{ lines: string[]; seen: string[]; quest: StoredQuest | null }> {
  const seen = row.finn_seen_beats ?? []
  const beat = findNextBeat(seen)
  const lines: string[] = []
  if (beat) lines.push(...beat.lines.map(l => (typeof l === 'string' ? l : l.text)))
  const quest = nextFinnQuest(row.finn_quests_done ?? [], getLevelFromXP(row.fishing_xp ?? 0))
  let stored: StoredQuest | null = null
  if (quest) {
    stored = await snapshotFor(db, uid, quest, row.total_perfects ?? 0, row.zone_perfects ?? {})
    lines.push(quest.give)
  }
  return { lines, seen: beat && !seen.includes(beat.id) ? [...seen, beat.id] : seen, quest: stored }
}

/**
 * HAND THE JOB BACK. Pays, records it, and hands out the next beat and job.
 * GUARDED BY THE JOB STILL BEING THERE: the write clears it and lands only
 * while it is set, so two taps cannot both pay.
 */
export async function turnInFinnQuest(db: SeaData, uid: string): Promise<{
  reward: number; lines: string[]; questsDone: string[]
  newDoubloons: number; xp: number; newFishingXP: number
} | { error: string } | null> {
  const row = (await db.profile(uid, FINN_SEL)) as FinnRow | null
  if (!row) return null
  const stored = row.finn_quest
  const quest = finnQuestById(stored?.id)
  if (!stored || !quest) return { error: 'He has not set you anything.' }

  const have = Math.max(0, await questProgress(db, uid, quest, stored, row))
  if (have < quest.target) return { error: quest.waiting }

  const doneIds = row.finn_quests_done ?? []
  const newDone = doneIds.includes(quest.id) ? doneIds : [...doneIds, quest.id]
  const rung = await nextRung(db, uid, { ...row, finn_quests_done: newDone })

  const settled = await db.updateProfileIf(uid, {
    finn_quest: rung.quest, finn_quests_done: newDone, finn_seen_beats: rung.seen, finn_last_outcome: null,
  }, [{ col: 'finn_quest', notNull: true }])
  if (!settled) return { error: 'That one is already handed in.' }

  // PAID AFTER the job is provably ours to settle, never before.
  if (quest.reward > 0) {
    await db.bumpStat(uid, 'doubloons', quest.reward)
    await db.ledger(uid, quest.reward, `Finn's job: ${quest.label}`)
  }
  // And the XP, flat: prestige and renown multiply CATCH XP, and this is not a catch.
  if (quest.xp > 0) await db.bumpStat(uid, 'fishing_xp', quest.xp)

  const after = await db.profile(uid, 'doubloons, fishing_xp')
  return {
    reward: quest.reward, lines: [quest.done, ...rung.lines], questsDone: newDone,
    newDoubloons: Number(after?.doubloons ?? 0), xp: quest.xp, newFishingXP: Number(after?.fishing_xp ?? 0),
  }
}

/**
 * Pull alongside and talk to him. `atIndex` is the encounter number the client
 * believes it is meeting: an agreement check that goes into the guard, so two
 * taps on the hail cannot both advance the story.
 */
export async function speakToFinn(db: SeaData, uid: string, atIndex: number): Promise<FinnTalk | null> {
  const row = (await db.profile(uid, FINN_SEL)) as FinnRow | null
  if (!row) return null

  const encounters = row.finn_encounters ?? 0
  if (encounters !== atIndex) return null

  const seen = row.finn_seen_beats ?? []
  const revealed = row.finn_revealed ?? false
  const fishingLevel = getLevelFromXP(row.fishing_xp ?? 0)
  const hasTrophy = (row.ancient_catches ?? []).length > 0

  // ── THE MASK SLIPS ── once an Ancient Deep trophy is landed. It does not
  // advance the meeting or move him: the reveal happens at a meeting.
  if (hasTrophy && !revealed) {
    const newSeen = seen.includes('reveal') ? seen : [...seen, 'reveal']
    await db.updateProfile(uid, { finn_revealed: true, finn_seen_beats: newSeen })
    const h = finnHaunt(encounters, fishingLevel)
    return {
      lines: FINN_REVEAL_BEAT.lines, mode: 'reveal',
      encounters, seenBeats: newSeen, revealed: true,
      at: { x: h.x, y: h.y, bandName: h.bandName },
    }
  }

  // A JOB BLOCKS THE STORY, ON PURPOSE: beat, job, hand it back, next beat.
  const openStored = row.finn_quest
  const openQuest = finnQuestById(openStored?.id)
  const rung = openQuest ? null : await nextRung(db, uid, row)
  const newSeen = rung ? rung.seen : seen
  const newEncounters = encounters + 1

  const idlePool = revealed ? FINN_EPILOGUE_IDLE_LINES : FINN_IDLE_LINES
  let lines: (string | FinnSceneLine)[]
  if (openQuest) {
    // Mid-job: where you are with it, never a scold.
    const have = Math.max(0, await questProgress(db, uid, openQuest, openStored!, row))
    lines = have >= openQuest.target ? ['You have got it. Go on then, hand it over.'] : [openQuest.waiting]
  } else if (rung && rung.lines.length > 0) {
    lines = rung.lines
  } else if (pendingFinnQuest(row.finn_quests_done ?? [])) {
    // WAITING ON YOUR LEVEL: there is a next job, in water you cannot work yet.
    lines = [pendingFinnQuest(row.finn_quests_done ?? [])!.gated]
  } else if (revealed && rngNext() < FINN_EPILOGUE_LORE_CHANCE) {
    lines = [pickRandomLine(FINN_EPILOGUE_LORE_LINES)]
  } else {
    lines = [pickRandomLine(idlePool)]
  }

  // GUARDED. If two hails race, only one moves the counter.
  const won = await db.updateProfileIf(uid, {
    finn_encounters: newEncounters,
    finn_seen_beats: newSeen,
    // An open job is left exactly as it was: only turnInFinnQuest may clear one.
    finn_quest: rung?.quest ?? row.finn_quest,
  }, [{ col: 'finn_encounters', eq: row.finn_encounters ?? 0 }])
  if (!won) return null

  const h = finnHaunt(newEncounters, fishingLevel)
  return { lines, mode: 'offer', encounters: newEncounters, seenBeats: newSeen, revealed, at: { x: h.x, y: h.y, bandName: h.bandName } }
}

/** Marks the climax reveal as seen, at the moment an Ancient trophy lands and
 *  the mask comes off: future meetings draw from the epilogue pool and the
 *  reveal never fires twice. */
export async function markFinnRevealSeen(db: SeaData, uid: string): Promise<void> {
  const cur = await db.profile(uid, 'finn_seen_beats')
  const seen = ((cur?.finn_seen_beats as string[] | null) ?? [])
  const newSeen = seen.includes('reveal') ? seen : [...seen, 'reveal']
  await db.updateProfile(uid, { finn_revealed: true, finn_seen_beats: newSeen })
}

// ══ BOTTLES AND DIGS ══════════════════════════════════════════════════════════
//
// The client sends a bottle KEY, not a bottle: the key resolves through the
// same hash the map drew it with, so a forged one is a bottle that is really
// there or nothing. A bottle pays no currency, ever; the most it hands over is
// a bearing.

export type BottleResult =
  | { ok: true; kind: 'fragment'; text: string }
  | { ok: true; kind: 'bearing'; name: string; band: string; text: string; bearing: string }
  | { ok: false; error: string }

export type DigResult =
  | { ok: true; name: string; gems: number; doubloons: number; found: string; newDoubloons: number; newGems: number }
  | { ok: false; error: string }

/** Bearings held, and which of those are already dug. */
export type DigState = { bearings: string[]; dug: string[] }

export async function getDigState(db: SeaData, uid: string): Promise<DigState> {
  const rows = await db.digRows(uid)
  return { bearings: rows.map(r => r.site_id), dug: rows.filter(r => r.dug_at).map(r => r.site_id) }
}

/** Fish a bottle out and read it. */
export async function openBottle(db: SeaData, uid: string, key: string): Promise<BottleResult> {
  const bottle = bottleFromKey(key)
  if (!bottle) return { ok: false, error: 'The tide took it.' }

  const profile = await db.profile(uid, 'fishing_xp, sea_x, sea_y')
  if (!profile) return { ok: false, error: 'No captain found.' }

  // Were you actually alongside it. Generous: the bottle drifts while you reach.
  const sx = Number(profile.sea_x ?? NaN), sy = Number(profile.sea_y ?? NaN)
  if (Number.isFinite(sx) && Number.isFinite(sy)) {
    const at = bottlePos(bottle, clockNow() / 1000)
    if (Math.hypot(at.x - sx, at.y - sy) > BOTTLE_REACH * 3) return { ok: false, error: 'It is out of reach.' }
  }

  const fragment = fragmentFor(bottle)
  if (!carriesBearing(bottle)) return { ok: true, kind: 'fragment', text: fragment }

  // THE BEARING: chosen here, because which site is worth pointing at depends
  // on the captain (not one they hold, not water they cannot sail).
  const have = new Set((await db.digRows(uid)).map(r => r.site_id))
  const fishing = getLevelFromXP(Number(profile.fishing_xp ?? 0))
  const open = DIG_SITES.filter(d => {
    if (have.has(d.id)) return false
    const band = PLACES.find(p => p.id === d.band)
    return !band || fishing >= band.minLevel
  })
  if (!open.length) return { ok: true, kind: 'fragment', text: fragment }

  // Nearest first; ties broken by the site's own order, so never random.
  const pick = open.reduce<DigSite>((best, d) =>
    Math.hypot(d.x - bottle.x, d.y - bottle.y) < Math.hypot(best.x - bottle.x, best.y - bottle.y) ? d : best,
    open[0])

  // A duplicate is already-held, not an error: two bottles can land on one site.
  if ((await db.addDigBearing(uid, pick.id)) === 'error') {
    return { ok: false, error: 'The paper came apart in your hands. Try another.' }
  }
  return { ok: true, kind: 'bearing', name: pick.name, band: pick.band, text: fragment, bearing: bearingText(pick) }
}

/** DIG. Claimed with a conditional write (not yet dug); the grant runs only for
 *  the claim that landed. A bearing is not required: sailing across the spot
 *  by accident is rewarded. */
export async function digHere(db: SeaData, uid: string, siteId: string): Promise<DigResult> {
  const site = DIG_BY_ID[siteId]
  if (!site) return { ok: false, error: 'There is nothing here.' }

  const profile = await db.profile(uid, 'fishing_xp, sea_x, sea_y')
  if (!profile) return { ok: false, error: 'No captain found.' }

  const band = PLACES.find(p => p.id === site.band)
  const level = getLevelFromXP(Number(profile.fishing_xp ?? 0))
  if (band && level < band.minLevel) return { ok: false, error: `${band.name} is shut until Fishing ${band.minLevel}.` }

  const sx = Number(profile.sea_x ?? NaN), sy = Number(profile.sea_y ?? NaN)
  if (Number.isFinite(sx) && Number.isFinite(sy)) {
    if (Math.hypot(site.x - sx, site.y - sy) > DIG_RANGE * 2) return { ok: false, error: 'You are not over it.' }
  }

  // Make sure there is a row to claim (a duplicate is fine and expected).
  await db.addDigBearing(uid, site.id)
  if (!(await db.claimDig(uid, site.id, nowIso()))) return { ok: false, error: 'This one is already up. The hole is still here.' }

  // The grant, then the ledger (the ledger is a record, not the grant).
  await db.grant(uid, 'doubloons', site.doubloons)
  await db.grant(uid, 'gems', site.gems)
  await db.ledger(uid, site.doubloons, `Dug up: ${site.name}`)
  const purse = await db.profile(uid, 'doubloons, gems')
  return {
    ok: true, name: site.name, gems: site.gems, doubloons: site.doubloons, found: site.found,
    newDoubloons: Number(purse?.doubloons ?? 0), newGems: Number(purse?.gems ?? 0),
  }
}

// ══ THE ISLES ═════════════════════════════════════════════════════════════════
//
// One isle pays one captain once, ever: insert first, grant second, and the
// unique row is the guard.

export type AshoreResult =
  | { ok: true; already: false; name: string; gems: number; doubloons: number; note: IsleNote | null
      newDoubloons: number; newGems: number
      /** A furnishing that was in the chest. The only way to own one. */
      salvage: { id: string; name: string } | null
      /** A portal stone, only on the landing that wins one (the first cache
       *  opened in a band the portal reaches). */
      stone: { tier: number; name: string } | null }
  | { ok: true; already: true; name: string; note: IsleNote | null }
  | { ok: false; error: string }

/** Every isle this captain has been ashore at. */
export async function getDiscoveries(db: SeaData, uid: string): Promise<string[]> {
  return db.discoveries(uid)
}

/**
 * GO ASHORE. The FISHING LEVEL gate is the real guard (the band's own minimum);
 * the position check is best-effort and says so.
 */
export async function goAshore(db: SeaData, uid: string, isleId: string): Promise<AshoreResult> {
  const isle = ISLE_BY_ID[isleId]
  if (!isle) return { ok: false, error: 'No such island.' }

  const profile = await db.profile(uid, 'fishing_xp, sea_x, sea_y')
  if (!profile) return { ok: false, error: 'No captain found.' }

  const band = PLACES.find(p => p.id === isle.band)
  const level = getLevelFromXP(Number(profile.fishing_xp ?? 0))
  if (band && level < band.minLevel) return { ok: false, error: `${band.name} is shut until Fishing ${band.minLevel}.` }

  const sx = Number(profile.sea_x ?? NaN), sy = Number(profile.sea_y ?? NaN)
  if (Number.isFinite(sx) && Number.isFinite(sy)) {
    if (Math.hypot(isle.x - sx, isle.y - sy) > (isle.r + 260) * 3) return { ok: false, error: 'You are not close enough to land.' }
  }

  // ── THE CLAIM ──
  const claim = await db.addDiscovery(uid, isle.id)
  if (claim === 'dup') return { ok: true, already: true, name: isle.name, note: isle.note ?? null }
  if (claim === 'error') return { ok: false, error: 'The landing did not take. Try again.' }

  // ── THE PAYOUT ── at most once per isle per captain.
  const gems = isle.gems ?? 0
  const doubloons = isle.doubloons ?? 0
  if (gems > 0) await db.grant(uid, 'gems', gems)
  if (doubloons > 0) {
    await db.grant(uid, 'doubloons', doubloons)
    await db.ledger(uid, doubloons, `Ashore: ${isle.name}`)
  }
  const purse = await db.profile(uid, 'doubloons, gems')

  // ── AND WHAT WAS IN THE CHEST ── six isles hold the only copy of a furnishing.
  let salvage: { id: string; name: string } | null = null
  const fid = ISLE_FURNISHING[isle.id]
  if (fid) {
    const item = FURNISHING_BY_ID[fid]
    const owned = (await db.homesteadOwned(uid)) ?? []
    if (!owned.includes(fid)) await db.setHomesteadOwned(uid, [...owned, fid])
    salvage = item ? { id: fid, name: item.item.name } : null
  }

  // ── DID THIS CHEST HOLD A STONE? ── only the first cache opened in the band.
  let stone: { tier: number; name: string } | null = null
  const rung = PORTAL_TIERS.find(t => t.band === isle.band)
  if (rung && isle.kind === 'cache') {
    const here = new Set(ISLES.filter(i => i.kind === 'cache' && i.band === isle.band).map(i => i.id))
    const opened = (await db.discoveries(uid)).filter(id => here.has(id))
    if (opened.length === 1) stone = { tier: rung.tier, name: rung.name }
  }

  return {
    ok: true, already: false, name: isle.name, gems, doubloons, note: isle.note ?? null, salvage, stone,
    newDoubloons: Number(purse?.doubloons ?? 0), newGems: Number(purse?.gems ?? 0),
  }
}

// ══ THE PORTAL, THE RECALL, KIP ═══════════════════════════════════════════════

/** The portal's next rung. The stone is the cache chest already opened in the
 *  band the rung reaches. CLAIM THE TIER FIRST (only from the current one), then
 *  take the money, and put the claim back if the charge fails. */
export async function buyPortalTier(db: SeaData, uid: string): Promise<{ ok: true; tier: number; doubloons: number } | { error: string }> {
  const [profile, discovered] = await Promise.all([db.profile(uid, 'portal_tier, portal_components_spent, doubloons'), db.discoveries(uid)])
  if (!profile) return { error: 'Profile not found' }

  const current = Number(profile.portal_tier ?? 1)
  const next = PORTAL_TIERS.find(t => t.tier === current + 1)
  if (!next) return { error: 'The portal already reaches the Ancient Deep.' }

  if (!hasStoneFor(next.tier, discovered)) {
    return {
      error: `No stone for ${next.name} yet. There is one in a chest out in ${next.name} — `
        + 'sail it the long way first, then the portal will remember the road.',
    }
  }
  if (Number(profile.doubloons ?? 0) < next.cost) return { error: `That stage costs ${next.cost.toLocaleString()} ⟡.` }

  if (!(await db.updateProfileIf(uid, { portal_tier: next.tier }, [{ col: 'portal_tier', eq: current }]))) {
    return { error: 'The portal is already being worked on. Look again.' }
  }

  const newDoubloons = await db.deductDoubloons(uid, next.cost)
  if (newDoubloons == null) {
    await db.updateProfile(uid, { portal_tier: current })
    return { error: 'The payment did not go through.' }
  }

  await db.ledger(uid, -next.cost, `Homestead Portal: ${next.name}`)
  return { ok: true, tier: next.tier, doubloons: Number(newDoubloons) }
}

const RECALL_COL: Record<RecallSide, 'last_recall_fish_at' | 'last_recall_exp_at'> = {
  fishing: 'last_recall_fish_at',
  expedition: 'last_recall_exp_at',
}

/** The free recall home: once per sea day/night cycle, per side. The stamp is
 *  one conditional write that lands only when the last use is older than the
 *  cycle, so two presses cannot both go through. */
export async function spendRecall(db: SeaData, uid: string, side: RecallSide): Promise<{ ok: true; at: string } | { ok: false; readyAt: string | null }> {
  const col = RECALL_COL[side]
  if (!col) return { ok: false, readyAt: null }
  const now = clockNow()
  const at = new Date(now).toISOString()
  const cutoff = new Date(now - RECALL_MS).toISOString()
  if (await db.stampRecall(uid, col, at, cutoff)) return { ok: true, at }

  const prof = await db.profile(uid, col)
  const last = (prof?.[col] as string | null) ?? null
  return { ok: false, readyAt: last ? new Date(new Date(last).getTime() + RECALL_MS).toISOString() : null }
}

/** Is the caller a Captain? Kip chooses which of two speeches to give. Never
 *  throws: a failed read gives the pitch, the harmless side of the mistake. */
export async function smugglerStanding(db: SeaData, uid: string): Promise<{ isCaptain: boolean }> {
  const data = await db.profile(uid, 'is_premium, premium_expires_at')
  return { isCaptain: isPremiumActive(data as Parameters<typeof isPremiumActive>[0]) }
}
