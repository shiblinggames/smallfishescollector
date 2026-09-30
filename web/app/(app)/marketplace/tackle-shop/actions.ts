'use server'

// THE TACKLE SHOP's actions. Each checks the session and hands lib/core/harbour
// the Supabase store; the prices, the gates and the spend-first guards live
// there. The shop page is revalidated here after anything it shows changes.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { harbourData } from '@/lib/data/harbourData'
import * as core from '@/lib/core/harbour'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => harbourData(createAdminClient())
const shopChanged = () => revalidatePath('/marketplace/tackle-shop')

export async function buyBait(baitType: string, qty: number): Promise<{ doubloons: number; newQty: number } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.buyBait(db(), uid, baitType, qty)
}

export async function purchaseRod(rodTier: number): Promise<{ doubloons: number; ownedRods: number[] } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await core.purchaseRod(db(), uid, rodTier)
  if (!('error' in res)) shopChanged()
  return res
}

export async function sellRod(rodTier: number): Promise<{ doubloons: number; ownedRods: number[]; refund: number; rodTier: number } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await core.sellRod(db(), uid, rodTier)
  if (!('error' in res)) shopChanged()
  return res
}

export async function claimCompletionistRod(): Promise<{ ownedRods: number[] } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await core.claimCompletionistRod(db(), uid)
  if (!('error' in res)) shopChanged()
  return res
}

export async function equipRod(rodTier: number): Promise<{ rodTier: number } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await core.equipTackleRod(db(), uid, rodTier)
  if (!('error' in res)) shopChanged()
  return res
}

export async function buyReel(): Promise<{ reelTier: number; doubloons: number } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await core.buyReel(db(), uid)
  if (!('error' in res)) shopChanged()
  return res
}
