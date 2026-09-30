'use server'

// EVERYTHING THAT CHANGES A FRIENDSHIP.
//
// Rapport is a value, so it moves only through lib/core/sea, on the server,
// through the service-role client. The client says who it is talking to and
// nothing else. Each action checks the session and hands the core the Supabase
// store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import * as core from '@/lib/core/sea'
import type { Rapport, FolkTalk, FolkAsk, FolkGift } from '@/lib/core/sea'
import type { FolkId } from '@/lib/seaFolk'

export type { Rapport, FolkTalk, FolkAsk, FolkGift } from '@/lib/core/sea'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => seaData(createAdminClient())

/** Every standing this captain holds. */
export async function folkState(): Promise<Rapport[]> {
  const uid = await me()
  if (!uid) return []
  return core.folkState(db(), uid)
}

/** A visit: one a day per regular. */
export async function talkToFolk(folkId: string): Promise<FolkTalk | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.talkToFolk(db(), uid, folkId)
}

/** Ask what they are after. Free; opens a job. */
export async function askForFavourite(folkId: string): Promise<FolkAsk | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.askForFavourite(db(), uid, folkId)
}

/** Settle the job with a fish landed since they asked. */
export async function deliverToFolk(folkId: string): Promise<FolkGift | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.deliverToFolk(db(), uid, folkId)
}

/** A regular's own rod, once you are as far along as the friendship goes. */
export async function buyFolkRod(folkId: FolkId): Promise<
  { ok: true; rodTier: number; rodName: string; spent: number; doubloons: number } | { error: string }
> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.buyFolkRod(db(), uid, folkId)
}
