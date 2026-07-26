// Contests — limited-time community races with a bespoke cosmetic prize for
// the winner. The `contests` table (contest_id PK, winner_user_id, won_at,
// prize_code, notes) records the single winner atomically: the first INSERT
// for a given contest_id wins, every later one fails the PK and reads back as
// "not first." Winners get a targeted mail + an in-game celebration, same as
// the first-ancient-catch milestone.
//
// This module is the display registry (plain module so both server actions and
// client components can import it). Live data (winner, standings) is resolved
// by getContestsView in tavern/contests/actions.ts.

export type ContestStatus = 'active' | 'completed'

export interface ContestBoard {
  /** profiles column the race is run on (live top-3 standings). */
  statColumn: string
  /** tiebreak column — first to reach the score ranks higher. */
  tiebreakColumn: string
  /** Target to win, for "first to X" races. Omitted for deadline/leaderboard
   *  contests (`endsAt`), where the highest score when the clock runs out wins. */
  goal?: number
  /** Render a raw score for display (e.g. 470.9 -> "470.9m"). */
  unit: string
}

export interface ContestDef {
  /** Matches contests.contest_id. */
  id: string
  name: string
  tagline: string
  /** One-line "how you win it." */
  goalLabel: string
  /** What the winner receives. */
  prize: string
  /** Stamped on the contests row for the record. */
  prizeCode: string
  status: ContestStatus
  accent: string
  /** Live standings source. Omitted for contests that are already decided
   *  and need no live leaderboard (just the winner card). */
  board?: ContestBoard
  /** ISO deadline. When set, this is a "highest score by the deadline" contest
   *  (not "first to X") — the UI shows a countdown + a ranked board, and the
   *  winner is resolved by the dev at the deadline (bespoke prize). */
  endsAt?: string
}

export const CONTESTS: ContestDef[] = [
  {
    id: 'gauntlet_deepest_30d',
    name: 'The Deepest Descent',
    tagline: "Davy's Gauntlet drags the bold ever downward. For the next thirty days, haul the Locker deeper than any captain alive — the furthest descent on the board when the clock runs out takes the prize.",
    goalLabel: 'Deepest Gauntlet run by July 25',
    prize: 'A free custom item — your own one-of-a-kind cosmetic',
    prizeCode: 'GAUNTLET-DEEPEST-30D',
    status: 'completed',   // resolved 2026-07-26 — shortbus_vip, depth 96
    accent: '#2dd4bf',
    endsAt: '2026-07-25T23:59:00.000Z',
    board: {
      statColumn: 'gauntlet_contest_depth',
      tiebreakColumn: 'gauntlet_contest_depth_at',
      unit: '',
    },
  },
  {
    id: 'tide_champion',
    name: 'Tide Champion',
    tagline: 'A sprint into the deep current. Push your run further than any captain before you.',
    goalLabel: 'First to 500m in Tide Run',
    prize: 'A special customization reward',
    prizeCode: 'TIDE-CHAMPION-500',
    status: 'active',
    accent: '#38bdf8',
    board: {
      statColumn: 'tide_run_best_distance',
      tiebreakColumn: 'tide_run_best_distance_set_at',
      goal: 500,
      unit: 'm',
    },
  },
  {
    id: 'first_fishing_75',
    name: 'Deep Angler',
    tagline: 'The long climb to Fishing Level 75. The first captain to the top earned a one-of-a-kind hull.',
    goalLabel: 'First to Fishing Level 75',
    prize: 'A custom boat',
    prizeCode: 'FISHING-75-BOAT',
    status: 'completed',
    accent: '#f0c040',
  },
]

/** The Tide Champion goal — referenced by the win hook in tide-run/actions. */
export const TIDE_CHAMPION_CONTEST_ID = 'tide_champion'
export const TIDE_CHAMPION_GOAL_M = 500
export const TIDE_CHAMPION_PRIZE_CODE = 'TIDE-CHAMPION-500'

/** The Deepest Descent contest — referenced by the standings hook in
 *  raids/gauntlet/actions (cashOutGauntlet updates gauntlet_contest_depth while
 *  the clock is running). No atomic winner; the dev resolves it at the deadline. */
export const GAUNTLET_DEEPEST_CONTEST_ID = 'gauntlet_deepest_30d'
export const GAUNTLET_DEEPEST_CONTEST_ENDS_AT = '2026-07-25T23:59:00.000Z'

export function formatContestScore(board: ContestBoard, raw: number): string {
  const n = board.unit === 'm' ? (Math.round(raw * 10) / 10) : Math.floor(raw)
  return `${n.toLocaleString()}${board.unit}`
}

// ── Resolved view types (live data from getContestsView) ──────────────────────
// Defined here in the plain module, not the 'use server' actions file, because
// 'use server' files silently drop non-async exports at build. See
// [[use-server-strips-non-async-exports]].

export interface ContestPerson {
  username: string
  characterColor: string | null
  equippedHat: string | null
  avatarBg: string | null
  avatarBorder: string | null
}

export interface ContestStanding extends ContestPerson {
  score: number
  rank: number
}

export interface ContestView {
  winner: (ContestPerson & { wonAt: string }) | null
  standings: ContestStanding[]
}
