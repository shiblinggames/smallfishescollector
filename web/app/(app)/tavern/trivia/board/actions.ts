'use server'

// The Captain's Board: server-authoritative play. The full board (with
// answers) only ever lives server-side; clients get a stripped payload and
// every answer is judged in lib/core/parlor. Each action checks the session and
// hands the core the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triviaData } from '@/lib/data/triviaData'
import * as core from '@/lib/core/parlor'
import type { CaptainsBoardState, AnswerTileResult } from '../constants'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => triviaData(createAdminClient())

export async function getCaptainsBoardState(): Promise<CaptainsBoardState | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not authenticated' }
  return core.getCaptainsBoardState(db(), uid)
}

/** Commit the player's card for the day: reveals its question and locks the board. */
export async function playCaptainsCard(key: string): Promise<CaptainsBoardState | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not authenticated' }
  return core.playCaptainsCard(db(), uid, key)
}

export async function answerCaptainsTile(
  key: string,
  chosenIndex: number,
): Promise<AnswerTileResult | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Not authenticated' }
  return core.answerCaptainsTile(db(), uid, key, chosenIndex)
}
