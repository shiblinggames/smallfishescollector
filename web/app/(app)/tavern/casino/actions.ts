'use server'

// Shared casino wallet actions. ONE chip purse backs all three tavern casino
// games; buy-in, the shared daily cap and cash-out run in lib/core/casino.
// These check the session, hand the core the Supabase store, and tell Next the
// tavern changed.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { casinoData } from '@/lib/data/casinoData'
import * as core from '@/lib/core/casino'
import type { CasinoWallet, CasinoBuyInResult, CasinoCashOutResult } from './types'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function getCasinoState(): Promise<CasinoWallet> {
  const uid = await me()
  return uid ? core.getCasinoState(casinoData(createAdminClient()), uid) : core.NO_WALLET
}

/** Doubloons to chips, against the shared daily cap. */
export async function buyInCasino(amount: number): Promise<CasinoBuyInResult | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const r = await core.buyInCasino(casinoData(createAdminClient()), uid, amount)
  if (!('error' in r)) revalidatePath('/tavern')
  return r
}

/** All chips to doubloons; the session ends. */
export async function cashOutCasino(): Promise<CasinoCashOutResult | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const r = await core.cashOutCasino(casinoData(createAdminClient()), uid)
  if (!('error' in r)) revalidatePath('/tavern')
  return r
}

// First-visit Den guide dismissal (see components/LobbyGuide).
export async function markDenGuideSeen(): Promise<void> {
  const uid = await me()
  if (uid) await core.markDenGuideSeen(casinoData(createAdminClient()), uid)
}
