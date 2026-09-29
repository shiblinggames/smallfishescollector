'use server'

// Fish Roulette server actions. Bet → spin → settle is one atomic action in
// lib/core/casino; these check the session and hand the core the Supabase
// store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Bet } from '@/lib/roulette'
import { casinoData } from '@/lib/data/casinoData'
import * as core from '@/lib/core/casino'
import type { RouletteState, SpinResult } from './types'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** What the page server-renders. */
export async function getRouletteState(): Promise<RouletteState> {
  const uid = await me()
  return uid ? core.getRouletteState(casinoData(createAdminClient()), uid) : core.NO_ROULETTE
}

/** Atomic bet → spin → settle against the shared purse. */
export async function placeBetsAndSpin(bets: Bet[]): Promise<SpinResult | { error: string }> {
  const uid = await me()
  return uid ? core.placeBetsAndSpin(casinoData(createAdminClient()), uid, bets) : { error: 'Unauthorized' }
}
