'use server'

// The Gauntlets' server actions. The gate, the checkpoints, the cash-out, the
// death and the Locker run in lib/core/gauntlet (see its header for the trust
// model); these check the session and hand the core the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SignedTerms } from '@/lib/gauntletTerms'
import type { DepthSplit, GauntletRunSnapshot, GauntletRunState, GauntletVariant } from '@/lib/gauntlet'
import type { DavyOffer } from '@/lib/gauntletOffer'
import { gauntletData } from '@/lib/data/gauntletData'
import * as core from '@/lib/core/gauntlet'

const db = () => gauntletData(createAdminClient())

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Record a single gauntlet hit (the Biggest Hit board, held to the loadout). */
export async function recordGauntletHit(dmg: number): Promise<void> {
  if (!Number.isFinite(dmg) || dmg <= 0) return
  const uid = await me()
  if (uid) await core.recordGauntletHit(db(), uid, dmg)
}

/** State for the Locker Upgrades panel. */
export async function getGauntletUpgradeState(variant: GauntletVariant = 'davy'): Promise<core.GauntletUpgradeState> {
  const uid = await me()
  return uid ? core.getGauntletUpgradeState(db(), uid, variant) : core.NO_UPGRADE_STATE
}

/** Claim The Don's Tribute, once per UTC day. */
export async function claimDailyTribute(): Promise<{ ok: true; fathoms: number } | { error: string }> {
  const uid = await me()
  return uid ? core.claimDailyTribute(db(), uid) : { error: 'Not signed in.' }
}

/** Switch an owned Run Upgrade on or off. */
export async function setGauntletUpgradeActive(id: string, active: boolean, variant: GauntletVariant = 'davy'): Promise<
  { ok: true; off: string[] } | { error: string }
> {
  const uid = await me()
  return uid ? core.setGauntletUpgradeActive(db(), uid, id, active, variant) : { error: 'Not signed in.' }
}

/** Claim a Locker Upgrade (depth gate, Fathoms, once). */
export async function claimGauntletUpgrade(id: string, variant: GauntletVariant = 'davy'): Promise<
  { ok: true; fathoms: number; owned: string[] } | { error: string }
> {
  const uid = await me()
  return uid ? core.claimGauntletUpgrade(db(), uid, id, variant) : { error: 'Not signed in.' }
}

/** The Drowned Shrine's coin: double or nothing on banked Fathoms. */
export async function wagerGauntletFathoms(stake: number): Promise<
  { ok: true; won: boolean; stake: number; fathoms: number } | { error: string }
> {
  const uid = await me()
  return uid ? core.wagerGauntletFathoms(db(), uid, stake) : { error: 'Not signed in.' }
}

/** The Fence (Don's mid-run shop): validates the run and the item. */
export async function buyMerchantItem(itemId: string): Promise<{ ok: true } | { error: string }> {
  const uid = await me()
  return uid ? core.buyMerchantItem(db(), uid, itemId) : { error: 'Not signed in.' }
}

/** Record confluences discovered, for the Synergies codex. */
export async function markConfluencesSeen(ids: string[]): Promise<{ ok: boolean }> {
  const uid = await me()
  return uid ? core.markConfluencesSeen(db(), uid, ids) : { ok: false }
}

/** The deepest runs, for the map node (a visitor sees the tops only). */
export async function getGauntletLeaderboard(variant: GauntletVariant = 'davy'): Promise<core.GauntletLeaderboard> {
  return core.getGauntletLeaderboard(db(), await me(), variant)
}

/** The lobby: can a run start, the records, and any run to resume. */
export async function getGauntletDailyState(variant: GauntletVariant = 'davy'): Promise<core.GauntletDailyState> {
  const uid = await me()
  return uid ? core.getGauntletDailyState(db(), uid, variant) : core.NO_DAILY_STATE
}

/** Checkpoint an in-progress run between fights. */
export async function checkpointGauntletRun(state: GauntletRunState): Promise<{ ok: boolean; split?: DepthSplit }> {
  const uid = await me()
  return uid ? core.checkpointGauntletRun(db(), uid, state) : { ok: false }
}

/** Pause & step away (unlimited resumes). */
export async function pauseGauntletRun(state: GauntletRunState): Promise<{ ok: boolean }> {
  const uid = await me()
  return uid ? core.pauseGauntletRun(db(), uid, state) : { ok: false }
}

/** Pick a run back up (a crash resume is once per run). */
export async function resumeGauntletRun(): Promise<{ ok: false } | { ok: true; state: GauntletRunState; offer: DavyOffer | null }> {
  const uid = await me()
  return uid ? core.resumeGauntletRun(db(), uid) : { ok: false }
}

/** Spend the day's attempt and open a run (hardcore snapshots the squad). */
export async function startGauntletRun(hardcore = false, terms?: SignedTerms, variant: GauntletVariant = 'davy'): Promise<core.GauntletStart> {
  const uid = await me()
  return uid ? core.startGauntletRun(db(), uid, hardcore, terms, variant) : { started: false, reason: 'cooldown', deepest: 0 }
}

/** Davy's Offer at a breather: the server decides, the client is told. */
export async function rollDavyOffer(hpPct: number): Promise<{ offer: DavyOffer | null }> {
  const uid = await me()
  return uid ? core.rollDavyOffer(db(), uid, hpPct) : { offer: null }
}

/** Cash out an open run, once. */
export async function cashOutGauntlet(rewardDepth: number, combatDepth: number, pot: number, runSnapshot?: GauntletRunSnapshot, takeOffer = false): Promise<core.GauntletCashOut> {
  const uid = await me()
  return uid ? core.cashOutGauntlet(db(), uid, rewardDepth, combatDepth, pot, runSnapshot, takeOffer) : { ok: false }
}

/** Close an open run after a wipe (Fathoms only; a hardcore squad drowns). */
export async function resolveGauntletDeath(rewardDepth: number, combatDepth: number = rewardDepth, runSnapshot?: GauntletRunSnapshot): Promise<core.GauntletDeath> {
  const uid = await me()
  return uid
    ? core.resolveGauntletDeath(db(), uid, rewardDepth, combatDepth, runSnapshot)
    : { ok: false, deepest: 0, earnedFathoms: 0, newFathoms: 0, hardcore: false, fallenCount: 0 }
}

/** Buy a bundle of a Fathoms lure. */
export async function buyBaitWithFathoms(baitType: string): Promise<
  { ok: true; fathoms: number; added: number; baitType: string } | { error: string }
> {
  const uid = await me()
  return uid ? core.buyBaitWithFathoms(db(), uid, baitType) : { error: 'Not signed in.' }
}

/** Mark the first-time explainer as seen (per descent). */
export async function markGauntletIntroSeen(variant: GauntletVariant = 'davy'): Promise<void> {
  const uid = await me()
  if (uid) await core.markGauntletIntroSeen(db(), uid, variant)
}
