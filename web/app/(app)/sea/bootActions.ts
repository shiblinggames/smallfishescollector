'use server'

// ── EVERYTHING THE SEA READS ON ARRIVAL, IN ONE ROUND TRIP ──────────────────
//
// The client dispatches server actions ONE AT A TIME (Next's own docs:
// "The client currently dispatches and awaits them one at a time"). The chart
// fired its arrival reads as separate actions (the held golden fish, Finn,
// the regulars, today's orders, pending pacts, the homesteads you can visit,
// the Day board, and the Salt Road panel's own copy of the regulars), so they
// queued in single file, each a full POST, each paying the proxy's session
// check, each waiting for the one before it (the 2026-09-23 audit).
//
// This is one action that runs them all at once on the server, where they
// really are parallel. Each reader is the same function the chart called
// before, so nothing it returns is different; the chart simply asks once and
// hands each piece to the state that wanted it. The refreshes that happen
// later (a panel closing, a catch) still call their own readers.
//
// A reader that fails leaves its piece null rather than failing the rest,
// and every consumer already treats a missing answer as "stay quiet".
import { heldGolden } from '../fishing/actions'
import { finnState, type FinnSeaState } from './finnActions'
import { folkState, type Rapport } from './folkActions'
import { getDailyChallenge } from '../fishing/dailyChallengeActions'
import { pendingPacts } from './pactActions'
import { visitableHomesteads, type Visitable } from '../home/visitActions'
import { dayState, type DayState } from './dayActions'
import type { DailyChallengeState } from '@/lib/dailyChallenges'

export type SeaBoot = {
  golden: Awaited<ReturnType<typeof heldGolden>> | null
  finn: FinnSeaState | null
  folk: Rapport[] | null
  orders: DailyChallengeState | null
  pacts: number | null
  guests: Visitable[] | null
  day: DayState | null
}

const safe = async <T,>(p: PromiseLike<T>): Promise<T | null> => {
  try { return await p } catch { return null }
}

export async function seaBoot(): Promise<SeaBoot> {
  const [golden, finn, folk, orders, pacts, guests, day] = await Promise.all([
    safe(heldGolden()),
    safe(finnState()),
    safe(folkState()),
    safe(getDailyChallenge()),
    safe(pendingPacts()),
    safe(visitableHomesteads()),
    safe(dayState()),
  ])
  return { golden, finn, folk, orders, pacts, guests, day }
}
