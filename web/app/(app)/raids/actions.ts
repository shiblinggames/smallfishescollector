'use server'

// A raid run's server actions: the token, the clear, the skirmish, the biggest
// hit, the crate. The rules and the token's one-shot guards run in
// lib/core/raids; these check the session and hand the core the Supabase store.
//
// RaidCrewMember, RaidPlayerStats and the loadout loader live in lib/raidLoadout
// (lib/raidPlayerStats wraps it for the web). As an export of this 'use server'
// file the loader was a public endpoint that read any captain's loadout.
//
// NO REPAIR BILL: sinking in a raid used to owe a tier-scaled fee. The world is
// the penalty now: going down puts you back at the Gunwharf with the whole sail
// to make again, and no paywall stands between a captain and the fight they lost.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { raidData } from '@/lib/data/raidData'
import * as core from '@/lib/core/raids'

export type RaidClearTimes = import('@/lib/core/raids').RaidClearTimes
export type RaidLootResult = import('@/lib/core/raids').RaidLootResult

const db = () => raidData(createAdminClient())

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Mint a run token at raid START; every reward call of the run requires it. */
export async function startRaidRun(raidId: string): Promise<{ token: string | null }> {
  const uid = await me()
  return uid ? core.startRaidRun(db(), uid, raidId) : { token: null }
}

/** Record a clear the moment the boss dies (token-bound, once per run). */
export async function recordRaidClear(raidId: string, elapsedMs: number, token?: string | null): Promise<RaidClearTimes | null> {
  if (!raidId || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return null
  const uid = await me()
  return uid ? core.recordRaidClear(db(), uid, raidId, elapsedMs, token) : null
}

/** Record the Reef Skirmish clear (opens the next node; not a raid clear). */
export async function recordSkirmishClear(): Promise<void> {
  const uid = await me()
  if (uid) await core.recordSkirmishClear(db(), uid)
}

/** Record a hit for Biggest Hit (held to the loadout) and the damage bounties. */
export async function recordRaidHit(dmg: number): Promise<void> {
  if (!Number.isFinite(dmg) || dmg <= 0) return
  const uid = await me()
  if (uid) await core.recordRaidHit(db(), uid, dmg)
}

/** Open the crate of a CLEARED run, once. */
export async function claimRaidLoot(
  baseDoubloons: number,
  token: string | null | undefined,
): Promise<RaidLootResult> {
  const uid = await me()
  return uid ? core.claimRaidLoot(db(), uid, baseDoubloons, token) : core.noLoot()
}
