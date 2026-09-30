'use server'

// Pirate King: server-authoritative play. The full ladder (with answers) only
// ever lives server-side; clients get the current question stripped and every
// answer is judged in lib/core/parlor. One run per WEEK; pays doubloons. Each
// action checks the session and hands the core the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triviaData } from '@/lib/data/triviaData'
import * as core from '@/lib/core/parlor'
import type { PirateKingState, KingRevealResult, AnswerKingResult } from '../constants'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => triviaData(createAdminClient())
const NOT_SIGNED_IN = { error: 'Not authenticated' }

export async function getPirateKingState(): Promise<PirateKingState | { error: string }> {
  const uid = await me()
  if (!uid) return NOT_SIGNED_IN
  return core.getPirateKingState(db(), uid)
}

/** Reveal the current rung's question and start its answer clock (idempotent). */
export async function startKingRung(): Promise<KingRevealResult | { error: string }> {
  const uid = await me()
  if (!uid) return NOT_SIGNED_IN
  return core.startKingRung(db(), uid)
}

export async function answerKingRung(
  rung: number,
  chosenIndex: number
): Promise<AnswerKingResult | { error: string }> {
  const uid = await me()
  if (!uid) return NOT_SIGNED_IN
  return core.answerKingRung(db(), uid, rung, chosenIndex)
}

// Named spend*, not use*: a use-prefixed export trips the React
// rules-of-hooks lint when called inside a transition callback.
export async function spendKingFiftyFifty(): Promise<{ removed: number[] } | { error: string }> {
  const uid = await me()
  if (!uid) return NOT_SIGNED_IN
  return core.spendKingFiftyFifty(db(), uid)
}

export async function walkKingAway(): Promise<{ status: 'walked'; doubloonsAwarded: number; newDoubloons: number | null } | { error: string }> {
  const uid = await me()
  if (!uid) return NOT_SIGNED_IN
  return core.walkKingAway(db(), uid)
}
