'use server'

// THE SHIPYARD'S HULLS: buying the next one and naming her. Each action checks
// the session and hands lib/core/harbour the Supabase store; the price, the Nav
// gate and the spend-first guard live there.

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

export async function buyShip(): Promise<{ shipTier: number; doubloons: number } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await core.buyShip(harbourData(createAdminClient()), uid)
  if (!('error' in res)) revalidatePath('/marketplace/shipyard')
  return res
}

export async function renameShip(name: string): Promise<{ ok: true } | { error: string }> {
  if (!name.trim()) return { error: 'Name cannot be empty' }
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  const res = await core.renameShip(harbourData(createAdminClient()), uid, name)
  if (!('error' in res)) revalidatePath('/marketplace/shipyard')
  return res
}
