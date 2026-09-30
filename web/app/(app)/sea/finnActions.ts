'use server'

// FINN, OUT ON THE CHART.
//
// A man you have to go and find (lib/seaFinn for where he stands). The client
// names no target, no reward and no verdict: every job is measured in
// lib/core/sea against counters the catch path keeps, as a delta from when the
// job was set. Each action checks the session and hands the core the Supabase
// store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { seaData } from '@/lib/data/seaData'
import * as core from '@/lib/core/sea'
import type { FinnSeaState, FinnTalk } from '@/lib/core/sea'

export type { FinnSeaState, FinnTalk, FinnQuestView } from '@/lib/core/sea'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => seaData(createAdminClient())

/** Everything the chart needs to draw him and the job he has set. */
export async function finnState(): Promise<FinnSeaState | null> {
  const uid = await me()
  if (!uid) return null
  return core.finnState(db(), uid)
}

/** Hand the job back: pays, and he tells you the next piece of it. */
export async function turnInFinnQuest(): Promise<{
  reward: number; lines: string[]; questsDone: string[]
  newDoubloons: number; xp: number; newFishingXP: number
} | { error: string } | null> {
  const uid = await me()
  if (!uid) return null
  return core.turnInFinnQuest(db(), uid)
}

/** Pull alongside and talk to him (`atIndex` is the meeting the client believes it is). */
export async function speakToFinn(atIndex: number): Promise<FinnTalk | null> {
  const uid = await me()
  if (!uid) return null
  return core.speakToFinn(db(), uid, atIndex)
}
