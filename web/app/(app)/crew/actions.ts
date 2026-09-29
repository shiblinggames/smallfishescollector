'use server'

// The Crew Hall's actions. The rules, the guards and the claim-first writes run
// in lib/core/crew; these check the session, hand the core the Supabase store,
// and tell Next when a change reaches the cached chart.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/userData'
import { createAdminClient } from '@/lib/supabase/admin'
import { crewData } from '@/lib/data/crewData'
import * as core from '@/lib/core/crew'

// Types only: a 'use server' file must not export anything that is not an
// async function, and a type is erased, so these are safe.
export type BoardCandidate = import('@/lib/core/crew').BoardCandidate
export type CrewMember = import('@/lib/core/crew').CrewMember
export type CrewState = import('@/lib/core/crew').CrewState
export type CrewActionResult = import('@/lib/core/crew').CrewActionResult
export type RecruitFace = import('@/lib/core/crew').RecruitFace
export type FallenCrew = import('@/lib/core/crew').FallenCrew

// NOTE: helper crewAssignment + type CrewAssignment USED to live here, but
// 'use server' files in Next.js strip every non-async export. They moved
// to web/lib/crewAssignment.ts so both server (this file's callers) and
// client (CrewClient) can import them.

const db = () => crewData(createAdminClient())

async function me(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** The faces on today's board, for the day board's Recruits card. */
export async function todaysRecruits(): Promise<{ faces: RecruitFace[] } | null> {
  const uid = await me()
  return uid ? core.todaysRecruits(db(), uid) : null
}

/** The whole hall (also lazily fills the once-a-day free board). */
export async function getCrewState(): Promise<CrewState | null> {
  const uid = await me()
  return uid ? core.getCrewState(db(), uid) : null
}

/** Just the owned LIVE roster, for the expeditions crew screen. */
export async function getCrewRoster(): Promise<CrewMember[]> {
  // The request-cached check (lib/userData): on a page that already asked,
  // this costs nothing, where auth.getUser() was a trip to the auth server.
  const user = await getCurrentUser()
  return user ? core.getCrewRoster(db(), user.id) : []
}

/** Reroll the board for gems, optionally blood-charged. */
export async function rerollBoard(bloodTierId?: string | null): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.rerollBoard(db(), uid, bloodTierId) : { error: 'Not signed in' }
}

/** Spend Blood Gems on one non-legendary skin not yet owned. */
export async function gambleBloodSkin(): Promise<{ skinId: string; state: CrewState } | { error: string }> {
  const uid = await me()
  return uid ? core.gambleBloodSkin(db(), uid) : { error: 'Not signed in' }
}

export async function recruitCrew(recruitId: number): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.recruitCrew(db(), uid, recruitId) : { error: 'Not signed in' }
}

export async function upgradeCrewHall(): Promise<CrewActionResult> {
  const uid = await me()
  if (!uid) return { error: 'Not signed in' }
  const r = await core.upgradeCrewHall(db(), uid)
  // The chart draws the hall's building and counts its berths from the page's
  // copy of these tiers; it hears a purchase here or not until a reload.
  if ('state' in r) revalidatePath('/sea')
  return r
}

export async function dismissCrew(crewId: number): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.dismissCrew(db(), uid, crewId) : { error: 'Not signed in' }
}

/** Assign a crew to a voyage slot. Pass `null` to bench the crew. */
export async function assignToVoyage(crewId: number, slot: number | null): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.assignToVoyage(db(), uid, crewId, slot) : { error: 'Not signed in' }
}

/** Assign a crew to a raid loadout slot. Pass `null` to bench the crew. */
export async function assignToRaid(crewId: number, slot: number | null): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.assignToRaid(db(), uid, crewId, slot) : { error: 'Not signed in' }
}

/** Clear a whole party in one go (refused while it is at sea or in a run). */
export async function clearParty(track: 'voyage' | 'raid'): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.clearParty(db(), uid, track) : { error: 'Not signed in' }
}

/** Bench a crew (clear both voyage_slot and raid_slot). */
export async function benchCrew(crewId: number): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.benchCrew(db(), uid, crewId) : { error: 'Not signed in' }
}

/** One-shot crew rename. */
export async function renameCrew(crewId: number, nickname: string): Promise<CrewActionResult | { error: string }> {
  const uid = await me()
  return uid ? core.renameCrew(db(), uid, crewId, nickname) : { error: 'Not signed in' }
}

/** Promote a seated crew to captain (slot 0) on their track. */
export async function promoteToCaptain(crewId: number): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.promoteToCaptain(db(), uid, crewId) : { error: 'Not signed in' }
}

/** Buy a legendary crew skin with gems. */
export async function buyCrewSkin(skinId: string): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.buyCrewSkin(db(), uid, skinId) : { error: 'Not signed in' }
}

/** Equip a crew skin for its species (null reverts to the base art). */
export async function equipCrewSkin(slug: string, skinId: string | null): Promise<CrewActionResult> {
  const uid = await me()
  return uid ? core.equipCrewSkin(db(), uid, slug, skinId) : { error: 'Not signed in' }
}

/** The fallen, most recent first, with the voyage they fell on. */
export async function getCrewGraveyard(): Promise<FallenCrew[]> {
  const uid = await me()
  return uid ? core.getCrewGraveyard(db(), uid) : []
}

/** Fill every empty raid seat with the best crew available. */
export async function crewTheDeck(pullFromVoyages = false): Promise<
  { assigned: number; stillEmpty: number; onVoyages: number; state: CrewState } | { error: string }
> {
  const uid = await me()
  return uid ? core.crewTheDeck(db(), uid, pullFromVoyages) : { error: 'Not signed in' }
}

/** Mark the first-time Crew Hall guide as seen (tour-persistence convention). */
export async function markCrewGuideSeen(): Promise<void> {
  const uid = await me()
  if (uid) await core.markCrewGuideSeen(db(), uid)
}
