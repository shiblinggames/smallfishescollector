'use client'

/**
 * THE SEAM BETWEEN TIDE RUN AND WHATEVER IS HOSTING IT.
 *
 * Everything the game needs from the outside world goes through this one
 * interface. The game loop, the physics, the hazards, the boats, the seas, the
 * locker and the audio have no idea whether they are inside Small Fishes or
 * running standalone on somebody's phone.
 *
 * Two implementations:
 *
 *   serverAdapter — the version inside Small Fishes. Supabase, a signed-in
 *                   captain, doubloons for beacons, the shared leaderboard.
 *   localAdapter  — the standalone build. localStorage, no account, no network,
 *                   no doubloons (they do not exist in a game that has no
 *                   economy), and the leaderboard handed to Game Center.
 *
 * WHY AN INTERFACE RATHER THAN A FORK: a copy of the game would drift the day
 * it was made, and every tuning change after that would have to be applied
 * twice or silently apply to one. This way the standalone is a different
 * ADAPTER, never a different game.
 *
 * Beacons are the clearest example of the split. In Small Fishes they pay
 * doubloons and the payout has to be guarded server-side. Standalone there is
 * nothing to pay, so awardBeacons is free to be a no-op and the whole exploit
 * surface goes with it.
 */

export type TideRunProfile = {
  bestDistance: number
  boatId: string
  seaId: string
  hasSeenTour: boolean
}

export type TideRunSettle = {
  best: number
  isNewBest: boolean
  /** Zero in any host without an economy. */
  doubloons: number
  newDoubloonTotal: number
  wonTideChampion: boolean
}

export interface TideRunAdapter {
  /** Open a run. Returns a token the settle is validated against, or null in a
   *  host that does not need one (nothing to forge when nothing is at stake). */
  startRun(): Promise<string | null>

  /** End a run: distance, beacons and the token, settled together. */
  settleRun(input: { distance: number; beacons: number; token: string | null }): Promise<TideRunSettle | null>

  setBoat(id: string): Promise<boolean>
  setSea(id: string): Promise<boolean>
  markTourSeen(): Promise<void>

  /** Does this host have a leaderboard worth showing, and an economy worth
   *  reporting? The standalone answers false to both, and the game hides those
   *  surfaces rather than rendering empty ones. */
  readonly showsLeaderboard: boolean
  readonly hasEconomy: boolean
}

// ── The standalone adapter ──────────────────────────────────────────────────
// No auth, no network, no server. Everything lives on the device, which is what
// makes the standalone build possible at all: it can be wrapped, flown on a
// plane, and played by somebody who has never heard of Small Fishes.

const KEY = 'tiderun:profile'

function readLocal(): TideRunProfile {
  const fallback: TideRunProfile = { bestDistance: 0, boatId: 'original', seaId: 'home', hasSeenTour: false }
  if (typeof localStorage === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) as Partial<TideRunProfile> }
  } catch { return fallback }
}

function writeLocal(patch: Partial<TideRunProfile>) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(KEY, JSON.stringify({ ...readLocal(), ...patch })) } catch { /* no-op */ }
}

export function loadLocalProfile(): TideRunProfile {
  return readLocal()
}

export const localAdapter: TideRunAdapter = {
  // Nothing to forge when nothing is at stake: no doubloons, and the
  // leaderboard is Game Center's problem rather than a table we own.
  async startRun() { return null },

  async settleRun({ distance }) {
    const prev = readLocal().bestDistance
    const best = Math.max(prev, distance)
    if (best > prev) writeLocal({ bestDistance: best })
    return { best, isNewBest: distance > prev, doubloons: 0, newDoubloonTotal: 0, wonTideChampion: false }
  },

  async setBoat(id) { writeLocal({ boatId: id }); return true },
  async setSea(id) { writeLocal({ seaId: id }); return true },
  async markTourSeen() { writeLocal({ hasSeenTour: true }) },

  showsLeaderboard: false,
  hasEconomy: false,
}
