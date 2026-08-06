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

export type BountyTier = 'standard' | 'hard' | 'elite'

/** How a bounty is counted. Each of these maps to something the game ALREADY
 *  records, which is why almost none of this needed new tracking code. */
export type BountyMeter =
  /** Clears of one specific raid since the board was handed out. */
  | { kind: 'raid_clear'; raidId: string }
  /** Clears of any raid at all. */
  | { kind: 'raid_any' }
  /** Clears of any raid whose id ends in _challenge. */
  | { kind: 'raid_challenge_any' }
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
}

// ── The gem budget ───────────────────────────────────────────────────────────
//
// Four bounties a day, 100 gems for a clean sweep. That is ten times what the
// fishing dailies pay for a full sweep (DAILY_SWEEP_GEMS = 10), which is the
// point: this is meant to be the best gem source in the game and the reason an
// endgame captain opens the app.
//
// Priced by tier rather than per bounty so the daily total cannot drift as the
// catalogue grows. Two standards, one hard, one elite = 15 + 15 + 30 + 40.
export const BOUNTY_GEMS: Record<BountyTier, number> = {
  standard: 15,
  hard:     30,
  elite:    40,
}

/** How many of each tier are on the board each day. Sum is the daily ceiling. */
export const BOUNTY_SLOTS: BountyTier[] = ['standard', 'standard', 'hard', 'elite']

export const BOUNTY_DAILY_MAX = BOUNTY_SLOTS.reduce((n, t) => n + BOUNTY_GEMS[t], 0)

/** Clearing the campaign is the key. Same raid the finale badge keys off. */
export const BOUNTY_UNLOCK_RAID = 'the_sunken_hand'

// ── The catalogue ────────────────────────────────────────────────────────────
//
// Time targets are set against REAL clear times off raid_completions rather
// than guessed: the median clear of Corsair's Reckoning is a little over five
// minutes and the fastest on record is 42 seconds, so "under four minutes" is a
// push for most captains and routine for a sharp one. Every timed bounty below
// sits between the median and the record for that raid.

export const ALL_BOUNTIES: Bounty[] = [
  // ── Standard: one sitting, no special preparation ──────────────────────────
  { id: 'pete_down',        name: 'Sink Barnacle Pete',      desc: "Corsair's Reckoning, start to finish.",            meter: { kind: 'raid_clear', raidId: 'corsairs_reckoning' },   target: 1, tier: 'standard' },
  { id: 'krust_down',       name: 'Sink Captain Krust',      desc: 'Take the Tollmaster off the water.',               meter: { kind: 'raid_clear', raidId: 'captain_krust' },        target: 1, tier: 'standard' },
  { id: 'toll_down',        name: "Run the Tollmaster's Cut", desc: 'Nobody is paying the toll today.',                meter: { kind: 'raid_clear', raidId: 'tollmasters_cut' },      target: 1, tier: 'standard' },
  { id: 'carto_down',       name: 'Sink the Cartographer',   desc: 'Take his survey and his ship with it.',            meter: { kind: 'raid_clear', raidId: 'cartographer' },         target: 1, tier: 'standard' },
  { id: 'raids_two',        name: 'Clear two raids',         desc: 'Any two. Pick the ones you like.',                 meter: { kind: 'raid_any' },                                   target: 2, tier: 'standard' },
  { id: 'voyage_two',       name: 'Send out two voyages',    desc: 'See both of them home again.',                     meter: { kind: 'voyages' },                                    target: 2, tier: 'standard' },
  { id: 'gauntlet_one',     name: 'Run the Gauntlet',        desc: 'One run, however deep you get.',                   meter: { kind: 'counter', column: 'gauntlet_runs_completed' }, target: 1, tier: 'standard' },
  { id: 'depth_five',       name: 'Reach depth 5',           desc: 'Davy Jones is only getting started down there.',   meter: { kind: 'event', eventKind: 'gauntlet_depth', atLeast: 5 },  target: 1, tier: 'standard' },
  // Spread, not repetition. Clearing the softest boss three times is not the
  // same day's work as clearing three different ones, and the old catalogue
  // could not tell those apart.
  { id: 'raids_two_kinds',  name: 'Clear two different raids', desc: 'Two names, not the same one twice.',              meter: { kind: 'raid_distinct' },                              target: 2, tier: 'standard' },
  // Tuned off real hauls: the Shrouded Reach averages 2,300 and the best on
  // record is 10,734, so 3,000 is a good run and the Coastal Run cannot get
  // there at all. The bounty picks your route for you without naming it.
  { id: 'haul_three_k',     name: 'A 3,000 ⟡ voyage',        desc: 'One voyage, that much in the hold when it lands.',  meter: { kind: 'voyage_haul', atLeast: 3000 },                 target: 1, tier: 'standard' },
  { id: 'route_shroud',     name: 'Sail the Shrouded Reach', desc: 'Nine hours out. Set it before bed.',                meter: { kind: 'voyage_route', route: 'shroud' },              target: 1, tier: 'standard' },

  // ── Hard: a real sitting, or a specific bit of skill ───────────────────────
  { id: 'challenge_any',    name: 'Clear a challenge raid',  desc: 'Any of them, on the harder setting.',              meter: { kind: 'raid_challenge_any' },                         target: 1, tier: 'hard' },
  { id: 'pete_fast',        name: 'Pete in under 4 minutes', desc: 'The record stands at 42 seconds. No pressure.',    meter: { kind: 'raid_fast', raidId: 'corsairs_reckoning', underS: 240 }, target: 1, tier: 'hard' },
  { id: 'krust_fast',       name: 'Krust in under 8 minutes', desc: 'Most captains take twelve. Beat them.',           meter: { kind: 'raid_fast', raidId: 'captain_krust', underS: 480 },      target: 1, tier: 'hard' },
  { id: 'carto_fast',       name: 'Cartographer in under 6', desc: 'Six minutes, mist and all.',                       meter: { kind: 'raid_fast', raidId: 'cartographer', underS: 360 },       target: 1, tier: 'hard' },
  { id: 'depth_ten',        name: 'Reach depth 10',          desc: 'Ten floors down and back out with it.',            meter: { kind: 'event', eventKind: 'gauntlet_depth', atLeast: 10 }, target: 1, tier: 'hard' },
  { id: 'raids_four',       name: 'Clear four raids',        desc: 'A full day of it.',                                meter: { kind: 'raid_any' },                                   target: 4, tier: 'hard' },
  { id: 'raids_three_kinds', name: 'Clear three different raids', desc: 'Three names off the chart in one day.',        meter: { kind: 'raid_distinct' },                              target: 3, tier: 'hard' },
  // Your three fastest clears have to fit inside the budget together, so one
  // disastrous run does not sink the order the way a single timed raid does.
  { id: 'budget_fifteen',   name: 'Three raids in 15 minutes', desc: 'Added together, not each. Pick your water.',      meter: { kind: 'raid_budget', raids: 3, totalS: 900 },         target: 1, tier: 'hard' },
  { id: 'haul_six_k',       name: 'Bring home 6,000 ⟡',      desc: 'Across every voyage you land today.',               meter: { kind: 'voyage_haul_total', atLeast: 6000 },           target: 1, tier: 'hard' },
  { id: 'quarter_down',     name: 'Sink the Quartermaster',  desc: 'The Coffers can find another one.',                meter: { kind: 'raid_clear', raidId: 'the_quartermaster' },    target: 1, tier: 'hard' },
  { id: 'fleet_down',       name: 'Break the Coffers Fleet', desc: 'All of it, in one sitting.',                       meter: { kind: 'raid_clear', raidId: 'coffers_fleet' },        target: 1, tier: 'hard' },

  // ── Elite: the endgame proper ──────────────────────────────────────────────
  { id: 'blockade_down',    name: 'Break the Blockade',      desc: 'The hardest water on the chart.',                  meter: { kind: 'raid_clear', raidId: 'the_blockade' },         target: 1, tier: 'elite' },
  { id: 'throne_down',      name: 'Take the Throne',         desc: 'Sit in it a while. You earned that.',              meter: { kind: 'raid_clear', raidId: 'the_throne' },           target: 1, tier: 'elite' },
  { id: 'finn_challenge',   name: 'Beat Finn on challenge',  desc: 'One last ride, the hard way.',                     meter: { kind: 'raid_clear', raidId: 'the_sunken_hand_challenge' }, target: 1, tier: 'elite' },
  { id: 'depth_fifteen',    name: 'Reach depth 15',          desc: 'Very few captains have seen fifteen.',             meter: { kind: 'event', eventKind: 'gauntlet_depth', atLeast: 15 }, target: 1, tier: 'elite' },
  { id: 'depth_twenty',     name: 'Reach depth 20',          desc: 'Nothing down there wants you to.',                 meter: { kind: 'event', eventKind: 'gauntlet_depth', atLeast: 20 }, target: 1, tier: 'elite' },
  { id: 'challenge_two',    name: 'Clear two challenge raids', desc: 'Back to back, on the harder setting.',           meter: { kind: 'raid_challenge_any' },                         target: 2, tier: 'elite' },
  { id: 'raids_five_kinds', name: 'Clear five different raids', desc: 'Most of the chart, in one day.',                 meter: { kind: 'raid_distinct' },                              target: 5, tier: 'elite' },
  { id: 'budget_twenty',    name: 'Five raids in 25 minutes', desc: 'Five clears, twenty five minutes of clock total.',  meter: { kind: 'raid_budget', raids: 5, totalS: 1500 },        target: 1, tier: 'elite' },
  { id: 'haul_ten_k',       name: 'A 10,000 ⟡ voyage',       desc: 'The record haul is 10,734. Go and beat it.',        meter: { kind: 'voyage_haul', atLeast: 10000 },                target: 1, tier: 'elite' },
  { id: 'hc_depth_five',    name: 'Hardcore, depth 5',       desc: 'Permadeath. Five floors. One squad.',              meter: { kind: 'event', eventKind: 'gauntlet_hc_depth', atLeast: 5 }, target: 1, tier: 'elite' },
  { id: 'ghost_down',       name: "Sink the Quartermaster's Ghost", desc: 'He did not stay down the first time.',      meter: { kind: 'raid_clear', raidId: 'the_quartermasters_ghost' }, target: 1, tier: 'elite' },
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

/** One bounty per slot, never the same one twice on a board.
 *  `skip` drops a bounty the captain rerolled away from. */
export function rollBounties(userId: string, date: string, skip: string[] = []): Bounty[] {
  const rand = seeded(`${userId}:${date}:${skip.join(',')}`)
  const banned = new Set(skip)
  const out: Bounty[] = []
  for (const tier of BOUNTY_SLOTS) {
    const pool = ALL_BOUNTIES.filter(b =>
      b.tier === tier && !banned.has(b.id) && !out.some(o => o.id === b.id))
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
