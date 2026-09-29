'use server'

// THE SHIP SCREEN's actions. Each checks the session and hands lib/core/ship
// the Supabase store; the rules (and every purchase's spend-first guard) live
// there, so the desktop build runs the same code against its local save.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { shipData } from '@/lib/data/shipData'
import * as core from '@/lib/core/ship'
import type { CollectionCrewCard } from '@/lib/core/ship'
import type { AbyssalConversion } from '@/lib/abyssalAccelerator'
import type { ShipAugmentBuild } from '@/lib/shipAugments'

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}
const db = () => shipData(createAdminClient())

// ── Crew picker (the legacy card collection) ──────────────────────────────────

export async function getCollectionForCrew(): Promise<CollectionCrewCard[]> {
  const uid = await me()
  if (!uid) return []
  return core.getCollectionForCrew(db(), uid)
}

export async function saveCrew(variantIds: number[]): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.saveCrew(db(), uid, variantIds)
}

// ── Raid items, the Forge, the Accelerator, hull skins ────────────────────────

export async function saveEquippedRaidItems(itemIds: string[]): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.saveEquippedRaidItems(db(), uid, itemIds)
}

export async function forgeRaidItem(resultId: string): Promise<{ ok: true; raidItems: string[] } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.forgeRaidItem(db(), uid, resultId)
}

export async function learnForgeRecipe(resultId: string): Promise<{ ok: true; fathoms: number; learned: string[] } | { error: string }> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.learnForgeRecipe(db(), uid, resultId)
}

export async function startAbyssalConversion(epicId: string): Promise<
  { ok: true; conversion: AbyssalConversion; gems: number; raidItems: string[] } | { error: string }
> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.startAbyssalConversion(db(), uid, epicId)
}

export async function claimAbyssalConversion(): Promise<
  { ok: true; legendaryId: string; raidItems: string[] } | { error: string }
> {
  const uid = await me()
  if (!uid) return { error: 'Unauthorized' }
  return core.claimAbyssalConversion(db(), uid)
}

export async function markForgeIntroSeen(): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.markForgeIntroSeen(db(), uid)
}

export async function equipShipSkin(skinId: string | null): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.equipShipSkin(db(), uid, skinId)
}

// ── The ultimate ──────────────────────────────────────────────────────────────

export async function getUltimateState(): Promise<{ active: string | null; build: ShipAugmentBuild | null; schematics: boolean }> {
  const uid = await me()
  if (!uid) return { active: null, build: null, schematics: false }
  return core.getUltimateState(db(), uid)
}

export async function startUltimateBuild(id: string): Promise<{ ok: boolean; error?: string; doubloons?: number; completesAt?: string }> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.startUltimateBuild(db(), uid, id)
}

export async function swapUltimateBuild(id: string): Promise<{ ok: boolean; error?: string }> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.swapUltimateBuild(db(), uid, id)
}

export async function startUltimateRetool(id: string): Promise<{ ok: boolean; error?: string; doubloons?: number; completesAt?: string }> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.startUltimateRetool(db(), uid, id)
}

export async function buyUltimateSchematics(): Promise<{ ok: boolean; error?: string; doubloons?: number; active?: string | null }> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.buyUltimateSchematics(db(), uid)
}

export async function switchUltimate(id: string): Promise<{ ok: boolean; error?: string; active?: string }> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.switchUltimate(db(), uid, id)
}

// ── The berth and the armory ──────────────────────────────────────────────────

export async function buySixthBerth(): Promise<{ ok: boolean; error?: string; doubloons?: number }> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.buySixthBerth(db(), uid)
}

export async function buyArmoryExpansion(): Promise<{ ok: boolean; error?: string; doubloons?: number }> {
  const uid = await me()
  if (!uid) return { ok: false, error: 'Not signed in.' }
  return core.buyArmoryExpansion(db(), uid)
}

export async function markUltimateUnlockSeen(): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.markUltimateUnlockSeen(db(), uid)
}

export async function markShipGuideSeen(): Promise<void> {
  const uid = await me()
  if (!uid) return
  await core.markShipGuideSeen(db(), uid)
}
