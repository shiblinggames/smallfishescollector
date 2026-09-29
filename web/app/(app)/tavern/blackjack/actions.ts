'use server'

// Blackjack server actions. Every move on the table and the settlement run in
// lib/core/casino (the hand's state lives in its row between actions); these
// check the session, hand the core the Supabase store, and tell Next the
// tavern changed when a hand is dealt.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { casinoData } from '@/lib/data/casinoData'
import * as core from '@/lib/core/casino'

export type { Phase } from '@/lib/casinoRules'
export type CardOrBack = import('@/lib/core/casino').CardOrBack
export type ClientHand = import('@/lib/core/casino').ClientHand
export type ClientState = import('@/lib/core/casino').ClientState
export type SettleResult = import('@/lib/core/casino').SettleResult
export type ActionResult = import('@/lib/core/casino').ActionResult

const db = () => casinoData(createAdminClient())

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function getDailyWagered(): Promise<number> {
  const uid = await me()
  return uid ? core.getDailyWagered(db(), uid) : 0
}

export async function dealBlackjack(wager: number): Promise<ActionResult> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const r = await core.dealBlackjack(db(), uid, wager)
  if (!('error' in r)) revalidatePath('/tavern')
  return r
}

/** Accept insurance: charge half wager, resolve dealer natural check. */
export async function acceptInsurance(): Promise<ActionResult> {
  const uid = await me()
  return uid ? core.acceptInsurance(db(), uid) : { error: 'Unauthorized' }
}

/** Decline insurance: no charge; check dealer natural anyway, resolve if hit. */
export async function declineInsurance(): Promise<ActionResult> {
  const uid = await me()
  return uid ? core.declineInsurance(db(), uid) : { error: 'Unauthorized' }
}

export async function hit(): Promise<ActionResult> {
  const uid = await me()
  return uid ? core.hit(db(), uid) : { error: 'Unauthorized' }
}

export async function stand(): Promise<ActionResult> {
  const uid = await me()
  return uid ? core.stand(db(), uid) : { error: 'Unauthorized' }
}

export async function doubleDown(): Promise<ActionResult> {
  const uid = await me()
  return uid ? core.doubleDown(db(), uid) : { error: 'Unauthorized' }
}

export async function split(): Promise<ActionResult> {
  const uid = await me()
  return uid ? core.split(db(), uid) : { error: 'Unauthorized' }
}

/** Resume the active hand on page load (or return null if none). */
export async function resumeHand(): Promise<ClientState | null> {
  const uid = await me()
  return uid ? core.resumeHand(db(), uid) : null
}
