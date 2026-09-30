'use server'

// BOTTLES, BEARINGS, AND WHAT IS BURIED UNDER THEM.
//
// The server re-derives the world itself (the client sends a bottle KEY, not a
// bottle), decides what you found, and writes the row BEFORE it grants
// anything. The rules live in lib/core/sea; each action checks the session and
// hands the core the Supabase store.

import { verifiedSession } from '@/lib/verifiedSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import * as core from '@/lib/core/sea'
import type { BottleResult, DigResult, DigState } from '@/lib/core/sea'

export type { BottleResult, DigResult, DigState } from '@/lib/core/sea'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => seaData(createAdminClient())

export async function getDigState(): Promise<DigState> {
  // getSession, not getUser: own-rows read on a hot page load.
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  if (!session?.user) return { bearings: [], dug: [] }
  return core.getDigState(db(), session.user.id)
}

/** Fish a bottle out and read it. Pays no currency, ever. */
export async function openBottle(key: string): Promise<BottleResult> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.openBottle(db(), uid, key)
}

/** Dig. Claimed once; a bearing is not required. */
export async function digHere(siteId: string): Promise<DigResult> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.digHere(db(), uid, siteId)
}
