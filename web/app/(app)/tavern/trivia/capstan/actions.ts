'use server'

// Spin the Capstan: server-authoritative play. The phrases (with answers) only
// ever live server-side; clients get a MASKED length pattern and every spin,
// letter and solve is judged in lib/core/parlor. A weekly set, Captain-only.
// Each action checks the session and hands the core the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { triviaData } from '@/lib/data/triviaData'
import * as core from '@/lib/core/parlor'
import type { CapstanState, CapstanSpinResult, CapstanLetterResult, CapstanSolveResult } from '../constants'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => triviaData(createAdminClient())
const NOT_SIGNED_IN = { error: 'Not signed in.' }

export async function getCapstanState(): Promise<CapstanState | { error: string }> {
  const uid = await me()
  if (!uid) return NOT_SIGNED_IN
  return core.getCapstanState(db(), uid)
}

/** Spin the capstan: the wedge is rolled server-side. */
export async function spinCapstan(index: number): Promise<CapstanSpinResult | { error: string }> {
  const uid = await me()
  if (!uid) return NOT_SIGNED_IN
  return core.spinCapstan(db(), uid, index)
}

/** Call a consonant against the armed spin value. */
export async function callConsonant(index: number, letterRaw: string): Promise<CapstanLetterResult | { error: string }> {
  const uid = await me()
  if (!uid) return NOT_SIGNED_IN
  return core.callConsonant(db(), uid, index, letterRaw)
}

/** Buy a vowel from the round bank. */
export async function buyVowel(index: number, letterRaw: string): Promise<CapstanLetterResult | { error: string }> {
  const uid = await me()
  if (!uid) return NOT_SIGNED_IN
  return core.buyVowel(db(), uid, index, letterRaw)
}

/** Solve attempt: right banks the round, wrong costs a strike. */
export async function solveCapstan(index: number, guessRaw: string): Promise<CapstanSolveResult | { error: string }> {
  const uid = await me()
  if (!uid) return NOT_SIGNED_IN
  return core.solveCapstan(db(), uid, index, guessRaw)
}
