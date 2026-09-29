'use server'

// The campaign map's server actions. Every node's gates, its one-shot clear and
// its payout run in lib/core/raidMap; these check the session and hand the core
// the Supabase store.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { raidData } from '@/lib/data/raidData'
import * as core from '@/lib/core/raidMap'
import type { UnlockedLegendary } from '@/lib/legendaryUnlocks'

export type RaidRecords = import('@/lib/core/raidMap').RaidRecords

const db = () => raidData(createAdminClient())

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function getRaidMapView(): Promise<core.RaidMapView> {
  const uid = await me()
  return uid ? core.getRaidMapView(db(), uid) : core.NO_MAP_VIEW
}

/** First-time chapter celebration dismissed (idempotent). */
export async function markChapterUnlockSeen(chapterId: string): Promise<{ ok: true } | { error: string }> {
  const uid = await me()
  return uid ? core.markChapterUnlockSeen(db(), uid, chapterId) : { error: 'Unauthorized' }
}

export async function claimMilestoneNode(nodeId: string): Promise<{ doubloons: number } | { error: string }> {
  const uid = await me()
  return uid ? core.claimMilestoneNode(db(), uid, nodeId) : { error: 'Unauthorized' }
}

/** Read a story node (and open its legendary gate, if it has one). */
export async function markStoryNodeRead(nodeId: string): Promise<{ ok: true; unlockedLegendary?: UnlockedLegendary } | { error: string }> {
  const uid = await me()
  return uid ? core.markStoryNodeRead(db(), uid, nodeId) : { error: 'Unauthorized' }
}

export async function solvePuzzleNode(nodeId: string): Promise<{ expeditionXp: number } | { error: string }> {
  const uid = await me()
  return uid ? core.solvePuzzleNode(db(), uid, nodeId) : { error: 'Unauthorized' }
}

/** The Quartermaster's Cache: one pick, for good. */
export async function claimQuartermasterChoice(nodeId: string, itemId: string): Promise<{ ok: true } | { error: string }> {
  const uid = await me()
  return uid ? core.claimQuartermasterChoice(db(), uid, nodeId, itemId) : { error: 'Unauthorized' }
}

/** Stand for the muster: the clerk counts the raid crew. */
export async function standForMuster(nodeId: string): Promise<{ ok: true } | { error: string }> {
  const uid = await me()
  return uid ? core.standForMuster(db(), uid, nodeId) : { error: 'Unauthorized' }
}

export async function pickRaidEventChoice(nodeId: string, choiceId: string): Promise<{ ok: true; newDoubloons?: number; newExpeditionXp?: number } | { error: string }> {
  const uid = await me()
  return uid ? core.pickRaidEventChoice(db(), uid, nodeId, choiceId) : { error: 'Unauthorized' }
}

export async function pickForkRoute(nodeId: string, routeId: string): Promise<{ ok: true; newExpeditionXp: number } | { error: string }> {
  const uid = await me()
  return uid ? core.pickForkRoute(db(), uid, nodeId, routeId) : { error: 'Unauthorized' }
}

/** The d20, rolled here. */
export async function rollDiceNode(nodeId: string, optionId: string): Promise<core.DiceThrow | { error: string }> {
  const uid = await me()
  return uid ? core.rollDiceNode(db(), uid, nodeId, optionId) : { error: 'Unauthorized' }
}

export async function getDpsCheckPreview(nodeId: string): Promise<core.DpsPreview | { error: string }> {
  const uid = await me()
  return uid ? core.getDpsCheckPreview(db(), uid, nodeId) : { error: 'Unauthorized' }
}

export async function resolveDpsCheck(nodeId: string, action: 'pay' | 'shot'): Promise<core.DpsResolution> {
  const uid = await me()
  return uid ? core.resolveDpsCheck(db(), uid, nodeId, action) : { error: 'Unauthorized' }
}

/** The freed scout's debt: paid if the earlier choice freed him. */
export async function claimScoutDebt(nodeId: string): Promise<core.ScoutDebt | { error: string }> {
  const uid = await me()
  return uid ? core.claimScoutDebt(db(), uid, nodeId) : { error: 'Unauthorized' }
}

/** The chapter-end class pick, once per chapter. */
export async function pickShipClass(nodeId: string, classId: string): Promise<{ ok: true } | { error: string }> {
  const uid = await me()
  return uid ? core.pickShipClass(db(), uid, nodeId, classId) : { error: 'Unauthorized' }
}

/** The refit: re-choose the class picks after the don is down. */
export async function refitShipClasses(next: Record<string, string>): Promise<{ ok: true; doubloons: number | null } | { error: string }> {
  const uid = await me()
  return uid ? core.refitShipClasses(db(), uid, next) : { error: 'Unauthorized' }
}
