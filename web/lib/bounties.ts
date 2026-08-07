// BOUNTIES — the expedition side's daily board, and the best gem source in the
// game.
//
// The fishing dailies ask you to fish. Bounties ask you to go and DO something
// out there: sink a named captain, clear a raid under the clock, take a
// gauntlet run deep, come home from a voyage with the hold full. They unlock
// when the campaign is done, so the audience is captains who have run out of
// story and want a reason to sail tomorrow.
//
// WHY THIS FILE HAS NO DATABASE CALLS. Everything here is a pure description of
// what a bounty IS and how it is measured. The measuring happens in
// bountyActions, against data the game already writes down. Keeping the
// catalogue pure means the UI can price and describe a bounty without a round
// trip, and means adding one is a single entry here rather than a migration.
//
// Not 'use server': a 'use server' module silently drops every non-async
// export, which would take the entire catalogue with it.

export type BountyTier = 'easy' | 'medium' | 'hard' | 'elite'

/** How a bounty is counted. Each of these maps to something the game ALREADY
 *  records, which is why almost none of this needed new tracking code. */
export type BountyMeter =
  /** Clears of one specific raid since the board was handed out. */
  | { kind: 'raid_clear'; raidId: string }
  /** Clears of any raid at all. */
  | { kind: 'raid_any' }
  /** Clears of any raid drawn from a named set.
   *
   *  "Any challenge raid" was the mistake this replaces: a bounty whose target
   *  is a whole category is only ever as hard as the EASIEST thing in it, and a
   *  capped captain clears Chapter I on Challenge without noticing. Naming the
   *  set is what lets a hard bounty actually be hard. */
  | { kind: 'raid_any_of'; raidIds: string[] }
  /** One specific raid, cleared inside a time. raid_completions.elapsed_ms. */
  | { kind: 'raid_fast'; raidId: string; underS: number }
  /** Voyages resolved since the board was handed out. */
  | { kind: 'voyages' }
  /** A monotonic counter on profiles. Delta against its baseline. */
  | { kind: 'counter'; column: string }
  /** A moment that is not written down anywhere durable, logged to
   *  bounty_events at the time it happens. `atLeast` filters the value, so one
   *  event kind serves every depth target. */
  | { kind: 'event'; eventKind: string; atLeast: number }
  /** DIFFERENT raids, not repeats of the easiest one. count(distinct raid_id). */
  | { kind: 'raid_distinct' }
  /** N clears whose summed time fits a budget. A different skill from one fast
   *  kill: it asks for a consistent afternoon rather than a single hot run. */
  | { kind: 'raid_budget'; raids: number; totalS: number }
  /** One voyage that came home worth at least this much. */
  | { kind: 'voyage_haul'; atLeast: number }
  /** Everything every voyage brought back today, added up. */
  | { kind: 'voyage_haul_total'; atLeast: number }
  /** A voyage sailed on one named route. */
  | { kind: 'voyage_route'; route: string }

export interface Bounty {
  id: string
  /** The order. Short, and it says the target. */
  name: string
  /** One line under it. Never restates the name. */
  desc: string
  meter: BountyMeter
  /** How many times. 1 for most; a few ask for repetition. */
  target: number
  tier: BountyTier
  /** What a captain must already have done for this to be OFFERABLE.
   *
   *  A bounty board that hands out work you cannot reach is worse than a small
   *  one. Unlocking the elite rung by beating the Don would otherwise let it
   *  offer "Beat Finn on challenge" to someone who has not sailed the coda yet,
   *  and the only way out would be the one daily swap. A raid bounty is offered
   *  only once you have cleared that raid at least once, which proves you can
   *  get to it. */
  /** Bounties that the same act of play completes together.
   *
   *  One board must never carry two of a family. "Reach depth 5" beside "Reach
   *  depth 15" is a free order: the deep run pays both, so the smaller one is
   *  15 gems for nothing. Same for two haul targets, or two raid counts. */
  family?: string
  requires?: {
    raid?: string
    /** Offerable once ANY of these has been cleared once. */
    anyRaid?: string[]
    gauntlet?: boolean
  }
}

// ── The gem budget ───────────────────────────────────────────────────────────
//
// Four tiers, priced to climb steeply rather than evenly. An elite order is
// worth five easy ones, not two, because the point of the top tier is that
// finishing it is the day's work and it should pay like it.
//
// Priced by tier rather than per bounty so the daily total cannot drift as the
// catalogue grows: the ceiling is always the sum of the rung's slots.
export const BOUNTY_GEMS: Record<BountyTier, number> = {
  easy:   15,
  medium: 20,
  hard:   40,
  elite:  75,
}

// ── The rungs ────────────────────────────────────────────────────────────────
//
// The board grows with the campaign instead of arriving whole at the end.
// Gating everything behind the finale meant two captains in the entire game
// could see it; opening the first rung at the end of Chapter I means eight can,
// and each chapter after that is a visible raise rather than another wall.
//
// The ELITE rung is the Don's. Nothing on the board pays 40 until Don Finleone
// is off his throne, which is the point: the hardest tier should belong to the
// hardest thing you have beaten.
//
// Keyed on the last RAID of each chapter rather than the class-pick node that
// formally closes it, because raid_completions is a durable log and node
// progress is not.
export type BountyRung = {
  chapter: number
  /** The raid that proves this chapter is behind you. */
  raid: string
  /** Chapter title, for the "next rung" line. */
  title: string
  /** Who you had to beat. Named in the UI, because a rung earned off a boss
   *  reads as a trophy and a rung earned off a number reads as admin. */
  boss: string
  slots: BountyTier[]
}

// Every chapter adds exactly one order AND one tier, so the board reaches four
// and stops. The ceiling doubles at each rung (15 / 35 / 75 / 150), which makes
// the next chapter worth clearing for the board alone.
export const BOUNTY_RUNGS: BountyRung[] = [
  { chapter: 1, raid: 'captain_krust',     title: 'The Loose Thread', boss: 'Captain Krust',     slots: ['easy'] },
  { chapter: 2, raid: 'tollmasters_cut',   title: 'A Bigger Fish',    boss: 'Tollmaster Spet',   slots: ['easy', 'medium'] },
  { chapter: 3, raid: 'the_quartermaster', title: 'The Coffers',      boss: 'the Quartermaster', slots: ['easy', 'medium', 'hard'] },
  { chapter: 4, raid: 'the_throne',        title: 'The Last Fathom',  boss: 'Don Finleone',      slots: ['easy', 'medium', 'hard', 'elite'] },
]

export function rungGems(slots: BountyTier[]): number {
  return slots.reduce((n, t) => n + BOUNTY_GEMS[t], 0)
}

/** The deepest rung a captain has earned, or null if the board is still shut. */
export function rungFor(clearedRaids: Set<string>): BountyRung | null {
  let best: BountyRung | null = null
  for (const r of BOUNTY_RUNGS) if (clearedRaids.has(r.raid)) best = r
  return best
}

/** The next rung up, for the line that tells you what it is worth. */
export function nextRung(current: BountyRung | null): BountyRung | null {
  const i = current ? BOUNTY_RUNGS.findIndex(r => r.chapter === current.chapter) : -1
  return BOUNTY_RUNGS[i + 1] ?? null
}

/** The board at full stretch. */
export const BOUNTY_DAILY_MAX = rungGems(BOUNTY_RUNGS[BOUNTY_RUNGS.length - 1].slots)

// ── Points ───────────────────────────────────────────────────────────────────
//
// The gems are why you open the board today. The points are why you open it in
// three months: a slow ladder that never resets and cannot go backwards.
//
// Paid by tier, plus a bonus for clearing the whole board, so the daily ceiling
// climbs with the rung exactly the way the gems do:
//
//   Ch I    easy                        1 + 3  =  4
//   Ch II   easy + medium               3 + 3  =  6
//   Ch III  + hard                      6 + 3  =  9
//   Ch IV   + elite                    11 + 3  = 14
export const BOUNTY_POINTS: Record<BountyTier, number> = {
  easy: 1, medium: 2, hard: 3, elite: 5,
}

/** For clearing every order posted that day, whatever the rung. */
export const BOUNTY_SWEEP_POINTS = 3

export function bountyPoints(b: Bounty): number {
  return BOUNTY_POINTS[b.tier]
}

export type BountyMilestone = {
  points: number
  doubloons?: number
  gems?: number
  /** A ship skin granted at the top of the ladder. Expeditions content earns
   *  an expeditions cosmetic. */
  shipSkinId?: string
  label: string
}

// A FINITE ladder with an ending worth reaching. At the Chapter IV ceiling of
// 14 a day the capstone is about three months out; at Chapter III it is nearer
// five, which is part of what the rungs are for.
//
// Doubloons and gems alternate on the way up so neither economy carries the
// whole ladder, and so a reward never feels like the one before it.
export const BOUNTY_MILESTONES: BountyMilestone[] = [
  { points:   25, doubloons:   5_000, label: '5,000 ⟡' },
  { points:   60, gems:          100, label: '100 ◆' },
  { points:  120, doubloons:  15_000, label: '15,000 ⟡' },
  { points:  200, gems:          250, label: '250 ◆' },
  { points:  320, doubloons:  40_000, label: '40,000 ⟡' },
  { points:  450, gems:          400, label: '400 ◆' },
  { points:  650, doubloons: 100_000, label: '100,000 ⟡' },
  { points:  900, gems:          750, label: '750 ◆' },
  { points: 1200, gems:        1_500, shipSkinId: 'corsair_hull', label: '1,500 ◆ and the Corsair Hull' },
]

/** The next rung of the ladder, or null once every one is collected. */
export function nextMilestone(claimed: number): BountyMilestone | null {
  return BOUNTY_MILESTONES[claimed] ?? null
}

/** How many milestones this many points has earned, claimed or not. */
export function milestonesEarned(points: number): number {
  return BOUNTY_MILESTONES.filter(m => points >= m.points).length
}

/** Clearing Chapter I opens the board at all. */
export const BOUNTY_UNLOCK_RAID = BOUNTY_RUNGS[0].raid

// ── The catalogue ────────────────────────────────────────────────────────────
//
// Time targets are set against REAL clear times off raid_completions rather
// than guessed: the median clear of Corsair's Reckoning is a little over five
// minutes and the fastest on record is 42 seconds, so "under four minutes" is a
// push for most captains and routine for a sharp one. Every timed bounty below
// sits between the median and the record for that raid.

// Challenge raids grouped by the chapter they belong to. "Clear a challenge
// raid" was a hard-tier bounty and a capped captain answers it with Pete in
// four minutes, so the tier now depends on WHICH challenge.
const CH12_CHALLENGE = ['corsairs_reckoning_challenge', 'captain_krust_challenge', 'cartographer_challenge', 'tollmasters_cut_challenge']
const CH3_CHALLENGE  = ['coffers_fleet_challenge', 'the_quartermaster_challenge']
const CH4_CHALLENGE  = ['the_blockade_challenge', 'the_throne_challenge']

// EVERY DESCRIPTION NAMES THE THING. The line under a bounty is the only place
// it can say WHERE the work is, so it says that and stops. Flavour that did not
// explain the task has gone: "Davy Jones is only getting started down there"
// told a player nothing about where to go or what counts, and one description
// ("Take the Tollmaster off the water", under Sink Captain Krust) named the
// wrong boss entirely.
export const ALL_BOUNTIES: Bounty[] = [
  // ── EASY ── one sitting, no preparation, Chapter I and II water ────────────
  { id: 'pete_down',        name: 'Sink Barnacle Pete',        desc: "Clear The Corsair's Reckoning.",                                     meter: { kind: 'raid_clear', raidId: 'corsairs_reckoning' },   target: 1, tier: 'easy',   requires: { raid: 'corsairs_reckoning' } },
  { id: 'krust_down',       name: 'Sink Captain Krust',        desc: "Clear Krust's Consignment.",                                          meter: { kind: 'raid_clear', raidId: 'captain_krust' },        target: 1, tier: 'easy',   requires: { raid: 'captain_krust' } },
  { id: 'carto_down',       name: 'Sink the Cartographer',     desc: "Clear The Cartographer's Survey.",                                    meter: { kind: 'raid_clear', raidId: 'cartographer' },         target: 1, tier: 'easy',   requires: { raid: 'cartographer' } },
  { id: 'toll_down',        name: 'Sink Tollmaster Spet',      desc: "Clear The Tollmaster's Cut.",                                         meter: { kind: 'raid_clear', raidId: 'tollmasters_cut' },      target: 1, tier: 'easy',   requires: { raid: 'tollmasters_cut' } },
  { id: 'raids_two',        name: 'Clear two raids',           desc: 'Any two raids. Clearing the same one twice counts.',                  meter: { kind: 'raid_any' },                                   target: 2, tier: 'easy', family: 'raidcount'   },
  { id: 'voyage_two',       name: 'Land two voyages',          desc: 'Send two voyages out and collect both when they come back.',          meter: { kind: 'voyages' },                                    target: 2, tier: 'easy'   },
  { id: 'gauntlet_one',     name: 'Run the Gauntlet',          desc: "Finish one run of Davy Jones' Gauntlet. Dying ends a run and counts.", meter: { kind: 'counter', column: 'gauntlet_runs_completed' }, target: 1, tier: 'easy',   requires: { gauntlet: true } },
  { id: 'route_shroud',     name: 'Sail the Shrouded Reach',   desc: 'Send a voyage on the Shrouded Reach route. It takes nine hours.',     meter: { kind: 'voyage_route', route: 'shroud' },              target: 1, tier: 'easy'   },

  // ── MEDIUM ── a real sitting, or Chapter III water ─────────────────────────
  { id: 'challenge_early',  name: 'Beat an early Challenge',   desc: 'Clear any Chapter I or II raid on Challenge.',                        meter: { kind: 'raid_any_of', raidIds: CH12_CHALLENGE },       target: 1, tier: 'medium', requires: { anyRaid: CH12_CHALLENGE } },
  { id: 'fleet_down',       name: 'Break the Harbor Fleet',    desc: 'Clear The Harbor Fleet.',                                             meter: { kind: 'raid_clear', raidId: 'coffers_fleet' },        target: 1, tier: 'medium', requires: { raid: 'coffers_fleet' } },
  { id: 'quarter_down',     name: 'Sink the Quartermaster',    desc: 'Clear The Quartermaster.',                                            meter: { kind: 'raid_clear', raidId: 'the_quartermaster' },    target: 1, tier: 'medium', requires: { raid: 'the_quartermaster' } },
  { id: 'raids_two_kinds',  name: 'Clear two different raids', desc: 'Two different raids. The same one twice does not count.',             meter: { kind: 'raid_distinct' },                              target: 2, tier: 'medium', family: 'distinct' },
  { id: 'raids_four',       name: 'Clear four raids',          desc: 'Any four raids. Repeats count.',                                      meter: { kind: 'raid_any' },                                   target: 4, tier: 'medium', family: 'raidcount' },
  { id: 'depth_five',       name: 'Reach depth 5',             desc: "Get to floor 5 of Davy Jones' Gauntlet. Dying there still counts.",   meter: { kind: 'event', eventKind: 'gauntlet_depth', atLeast: 5 },  target: 1, tier: 'medium', family: 'depth', requires: { gauntlet: true } },
  { id: 'haul_three_k',     name: 'Land a 3,000 ⟡ voyage',     desc: 'Collect one voyage worth 3,000 doubloons or more.',                   meter: { kind: 'voyage_haul', atLeast: 3000 },                 target: 1, tier: 'medium', family: 'haul' },

  // ── HARD ── Chapter IV water, Chapter III on Challenge, or the clock ───────
  { id: 'challenge_ch3',    name: 'Beat a Chapter III Challenge', desc: 'Clear The Harbor Fleet or The Quartermaster on Challenge.',        meter: { kind: 'raid_any_of', raidIds: CH3_CHALLENGE },        target: 1, tier: 'hard',   requires: { anyRaid: CH3_CHALLENGE } },
  { id: 'blockade_down',    name: 'Break the Blockade',        desc: 'Clear The Blockade.',                                                 meter: { kind: 'raid_clear', raidId: 'the_blockade' },         target: 1, tier: 'hard',   requires: { raid: 'the_blockade' } },
  { id: 'throne_down',      name: 'Sink Don Finleone',         desc: 'Clear Don Finleone, the last raid of Chapter IV.',                    meter: { kind: 'raid_clear', raidId: 'the_throne' },           target: 1, tier: 'hard',   requires: { raid: 'the_throne' } },
  { id: 'pete_fast',        name: 'Pete in under 4 minutes',   desc: "Clear The Corsair's Reckoning in under four minutes.",                meter: { kind: 'raid_fast', raidId: 'corsairs_reckoning', underS: 240 }, target: 1, tier: 'hard', requires: { raid: 'corsairs_reckoning' } },
  { id: 'krust_fast',       name: 'Krust in under 8 minutes',  desc: "Clear Krust's Consignment in under eight minutes.",                    meter: { kind: 'raid_fast', raidId: 'captain_krust', underS: 480 },      target: 1, tier: 'hard', requires: { raid: 'captain_krust' } },
  { id: 'carto_fast',       name: 'Cartographer in under 6',   desc: "Clear The Cartographer's Survey in under six minutes.",                meter: { kind: 'raid_fast', raidId: 'cartographer', underS: 360 },       target: 1, tier: 'hard', requires: { raid: 'cartographer' } },
  { id: 'raids_three_kinds', name: 'Clear three different raids', desc: 'Three different raids in one day.',                                meter: { kind: 'raid_distinct' },                              target: 3, tier: 'hard', family: 'distinct'   },
  { id: 'budget_fifteen',   name: 'Three raids in 15 minutes', desc: 'Your three fastest clears today must add up to under 15 minutes.',    meter: { kind: 'raid_budget', raids: 3, totalS: 900 },         target: 1, tier: 'hard', family: 'budget'   },
  { id: 'haul_six_k',       name: 'Bring home 6,000 ⟡',        desc: 'Collect 6,000 doubloons across every voyage you land today.',         meter: { kind: 'voyage_haul_total', atLeast: 6000 },           target: 1, tier: 'hard', family: 'haul'   },
  { id: 'depth_ten',        name: 'Reach depth 10',            desc: "Get to floor 10 of Davy Jones' Gauntlet. Dying there still counts.",  meter: { kind: 'event', eventKind: 'gauntlet_depth', atLeast: 10 }, target: 1, tier: 'hard', family: 'depth',  requires: { gauntlet: true } },

  // ── ELITE ── Chapter IV on Challenge, the coda, or the deep floors ─────────
  { id: 'challenge_ch4',    name: 'Beat a Chapter IV Challenge', desc: 'Clear The Blockade or The Throne on Challenge.',                    meter: { kind: 'raid_any_of', raidIds: CH4_CHALLENGE },        target: 1, tier: 'elite',  requires: { anyRaid: CH4_CHALLENGE } },
  { id: 'finn_challenge',   name: 'Beat Finn on Challenge',    desc: 'Clear One Last Ride on Challenge.',                                   meter: { kind: 'raid_clear', raidId: 'the_sunken_hand_challenge' }, target: 1, tier: 'elite', requires: { raid: 'the_sunken_hand_challenge' } },
  { id: 'ghost_down',       name: "Sink the Quartermaster's Ghost", desc: "Clear The Quartermaster's Ghost.",                               meter: { kind: 'raid_clear', raidId: 'the_quartermasters_ghost' }, target: 1, tier: 'elite', requires: { raid: 'the_quartermasters_ghost' } },
  { id: 'depth_fifteen',    name: 'Reach depth 15',            desc: "Get to floor 15 of Davy Jones' Gauntlet. Dying there still counts.",  meter: { kind: 'event', eventKind: 'gauntlet_depth', atLeast: 15 }, target: 1, tier: 'elite', family: 'depth', requires: { gauntlet: true } },
  { id: 'depth_twenty',     name: 'Reach depth 20',            desc: "Get to floor 20 of Davy Jones' Gauntlet. Dying there still counts.",  meter: { kind: 'event', eventKind: 'gauntlet_depth', atLeast: 20 }, target: 1, tier: 'elite', family: 'depth', requires: { gauntlet: true } },
  { id: 'hc_depth_five',    name: 'Hardcore, depth 5',         desc: 'Get to floor 5 of the Hardcore Gauntlet. Your squad dies for good.',  meter: { kind: 'event', eventKind: 'gauntlet_hc_depth', atLeast: 5 }, target: 1, tier: 'elite', family: 'depth', requires: { gauntlet: true } },
  { id: 'raids_five_kinds', name: 'Clear five different raids', desc: 'Five different raids in one day.',                                   meter: { kind: 'raid_distinct' },                              target: 5, tier: 'elite', family: 'distinct'  },
  { id: 'budget_twenty',    name: 'Five raids in 25 minutes',  desc: 'Your five fastest clears today must add up to under 25 minutes.',     meter: { kind: 'raid_budget', raids: 5, totalS: 1500 },        target: 1, tier: 'elite', family: 'budget'  },
  { id: 'haul_ten_k',       name: 'Land a 10,000 ⟡ voyage',    desc: 'Collect one voyage worth 10,000 doubloons or more.',                  meter: { kind: 'voyage_haul', atLeast: 10000 },                target: 1, tier: 'elite', family: 'haul'  },
]

export const BOUNTY_BY_ID = new Map(ALL_BOUNTIES.map(b => [b.id, b]))

export function bountyGems(b: Bounty): number {
  return BOUNTY_GEMS[b.tier]
}

/** Deterministic per player per day, so the board cannot be rerolled by
 *  refreshing and two captains see different orders on the same morning.
 *  Same trick the fishing dailies use. */
function seeded(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Can this captain actually be asked to do this? */
export function canOffer(b: Bounty, clearedRaids: Set<string>, hasRunGauntlet: boolean): boolean {
  if (b.requires?.raid && !clearedRaids.has(b.requires.raid)) return false
  if (b.requires?.anyRaid && !b.requires.anyRaid.some(r => clearedRaids.has(r))) return false
  if (b.requires?.gauntlet && !hasRunGauntlet) return false
  return true
}

/** One bounty per slot on the rung, never the same one twice on a board, and
 *  never one the captain has no way to attempt.
 *  `skip` drops a bounty the captain rerolled away from. */
export function rollBounties(
  userId: string,
  date: string,
  slots: BountyTier[],
  clearedRaids: Set<string>,
  hasRunGauntlet: boolean,
  skip: string[] = [],
): Bounty[] {
  const rand = seeded(`${userId}:${date}:${skip.join(',')}`)
  const banned = new Set(skip)
  const out: Bounty[] = []
  for (const tier of slots) {
    const pool = ALL_BOUNTIES.filter(b =>
      b.tier === tier
      && !banned.has(b.id)
      && !out.some(o => o.id === b.id)
      // Never two of a family on one board: the harder one would pay the
      // easier one for free.
      && !(b.family && out.some(o => o.family === b.family))
      && canOffer(b, clearedRaids, hasRunGauntlet))
    if (pool.length === 0) continue
    out.push(pool[Math.floor(rand() * pool.length)])
  }
  return out
}

/** UTC day, matching the fishing dailies exactly so both boards turn over on
 *  the same tick and nobody sees one reset without the other. */
export function bountyToday(): string {
  return new Date().toISOString().slice(0, 10)
}
