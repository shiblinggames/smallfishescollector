'use client'

/**
 * The Small Fishes implementation of TideRunAdapter — the game as it lives
 * inside the main app: a signed-in captain, doubloons for beacons, the shared
 * leaderboard, and a server-issued token guarding the settle.
 *
 * Kept in its own file so the standalone build never imports it, and therefore
 * never pulls Supabase, auth or the server actions into a bundle that has no
 * business containing them.
 */

import { startTideRun, settleTideRun, setTideRunBoat, setTideRunSea } from './actions'
import { markTideRunTourSeen } from './tideRunTourAction'
import type { TideRunAdapter } from './adapter'

export const serverAdapter: TideRunAdapter = {
  async startRun() {
    try { return (await startTideRun()).token } catch { return null }
  },

  async settleRun({ distance, beacons, token }) {
    try {
      const res = await settleTideRun({ distance, beacons, token })
      if ('error' in res) return null
      return {
        best: res.best,
        isNewBest: res.isNewBest,
        doubloons: res.doubloons,
        newDoubloonTotal: res.newDoubloonTotal,
        wonTideChampion: res.wonTideChampion,
      }
    } catch { return null }
  },

  async setBoat(id) {
    try { return 'ok' in (await setTideRunBoat(id)) } catch { return false }
  },

  async setSea(id) {
    try { return 'ok' in (await setTideRunSea(id)) } catch { return false }
  },

  async markTourSeen() {
    try { await markTideRunTourSeen() } catch { /* best effort */ }
  },

  showsLeaderboard: true,
  hasEconomy: true,
}
