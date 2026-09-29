'use server'

// THE SALT ROAD, the resident buyers, the blockade runner and the boat's place
// on the chart. The rules and the claim-first locks run in lib/core/selling;
// these check the session and hand the core the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sellData } from '@/lib/data/sellData'
import * as core from '@/lib/core/selling'

export type DealResult = import('@/lib/core/selling').DealResult

/** Read on the page so the cap survives a reload. */
export async function dealtToday(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  // Read through the request's own client (row security), as it always was.
  return core.dealtToday(sellData(supabase), user.id)
}

/** Deal with a wandering trader: the client sends the key, nothing else. */
export async function strikeDeal(traderKey: string): Promise<DealResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return core.strikeDeal(sellData(createAdminClient()), user.id, traderKey)
}

/** Sell the hold to a zone's resident buyer; uncapped (lib/core/selling). */
export async function sellToResident(zoneId: string): Promise<
  { ok: true; earned: number; doubloons: number; rate: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return core.sellToResident(sellData(createAdminClient()), user.id, zoneId)
}

/** Cut the deck with the blockade runner for his rod, once a night. */
export async function wagerForRunnerRod(traderKey: string): Promise<
  { ok: true; won: boolean; rodTier: number; rodName: string; stake: number; doubloons: number }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  return core.wagerForRunnerRod(sellData(createAdminClient()), user.id, traderKey)
}

/** Where the boat is, remembered across a navigation (lib/core/selling). */
export async function saveSeaPosition(
  x: number, y: number,
  /** Fog cells uncovered since the last flush. Merged with OR — see below. */
  seen: number[] = [],
  /** The same, for the CAMPAIGN's grid. Two masks, two columns, because the two
   *  grids have different origins — see lib/seaExploreExp. */
  seenExp: number[] = [],
  /**
   * WHICH SEA THIS POSITION IS IN.
   *
   * This used to be unnecessary because northern positions were never written
   * at all: a coordinate past the reef, restored with no idea which side it
   * belonged to, would put a captain beyond a wall they can only cross at the
   * gate. The chart's answer was to refuse, and the cost was that the anchorage
   * and the sea gate evaporated on every remount — switch tabs, come back, and
   * you are in the fishing grounds on the fishing boat, having been silently
   * taken off your own ship.
   *
   * Storing the side is what makes the northern coordinate safe. The wall, the
   * rim and the hull are all decided by it, so they agree on load.
   *
   * FOUR VALUES, because there are four states: which water, and which hull.
   * They are not independent — no fishing boat in the open sea, no warship in
   * the fishing grounds — so one field still covers it. `moored` is the harbour
   * on the expedition ship, with the fishing boat moored at the Gunwharf.
   */
  side: 'fishing' | 'anchorage' | 'moored' | 'open' = 'fishing',
  /**
   * ── WHICH CHART IS AT THE HELM ────────────────────────────────────────
   *
   * Two open charts on one account (a forgotten desktop tab, then the phone)
   * both wrote this row every few seconds, and whichever wrote last won the
   * next load. `session` is a random id per chart session; `claim` is a
   * chart TAKING the helm (on mount, or the button on the banner). A save
   * that does not claim and finds a DIFFERENT session with a fresh heartbeat
   * writes nothing and is told so, and the chart that sent it stops writing
   * and says why on screen. The newest chart wins by default, which is what
   * a captain who just opened the phone expects; the old one can take it
   * back with one press.
   */
  helm?: { session: string; claim: boolean },
): Promise<{ helm: 'mine' | 'elsewhere' }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { helm: 'mine' }
  return core.saveSeaPosition(sellData(createAdminClient()), user.id, x, y, seen, seenExp, side, helm)
}

/** Does this captain already carry the runner's rod? (KAN-25.) */
export async function runnerRodOwned(rodTier: number): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  return core.runnerRodOwned(sellData(createAdminClient()), user.id, rodTier)
}
