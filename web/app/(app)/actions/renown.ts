'use server'

// Server-authoritative Renown point state: read the derived level (from XP) +
// the persisted allocations, spend a banked point on a stat, or respec (free).
// Effects themselves are applied at the fishing / raid / gauntlet reward paths.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type RenownSkill, type RenownAlloc,
  renownLevel, spentPoints, availablePoints, isRenownStat,
} from '@/lib/renown'

export interface RenownState {
  skill: RenownSkill
  level: number
  spent: number
  available: number
  alloc: RenownAlloc
}

const XP_COL = (skill: RenownSkill) => (skill === 'fishing' ? 'fishing_xp' : 'expedition_xp')
const ALLOC_COL = (skill: RenownSkill) => (skill === 'fishing' ? 'fishing_renown_alloc' : 'nav_renown_alloc')

type Admin = ReturnType<typeof createAdminClient>
async function readRow(admin: Admin, userId: string, skill: RenownSkill): Promise<{ xp: number; alloc: RenownAlloc }> {
  const { data } = await admin.from('profiles').select(`${XP_COL(skill)}, ${ALLOC_COL(skill)}`).eq('id', userId).single()
  const row = (data ?? {}) as Record<string, unknown>
  return {
    xp: Number(row[XP_COL(skill)] ?? 0),
    alloc: (row[ALLOC_COL(skill)] as RenownAlloc | null) ?? {},
  }
}

async function writeAlloc(admin: Admin, userId: string, skill: RenownSkill, alloc: RenownAlloc): Promise<void> {
  if (skill === 'fishing') await admin.from('profiles').update({ fishing_renown_alloc: alloc }).eq('id', userId)
  else                     await admin.from('profiles').update({ nav_renown_alloc: alloc }).eq('id', userId)
}

function stateFrom(skill: RenownSkill, xp: number, alloc: RenownAlloc): RenownState {
  return { skill, level: renownLevel(skill, xp), spent: spentPoints(skill, alloc), available: availablePoints(skill, xp, alloc), alloc }
}

export async function getRenownState(skill: RenownSkill): Promise<RenownState | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { xp, alloc } = await readRow(admin, user.id, skill)
  return stateFrom(skill, xp, alloc)
}

/** Mark the one-time "you hit level 100, meet Renown" intro celebration as seen
 *  for a skill so it never replays. Persisted per-skill (tour convention). */
export async function markRenownIntroSeen(skill: RenownSkill): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  if (skill === 'fishing') await admin.from('profiles').update({ seen_fishing_renown_intro: true }).eq('id', user.id)
  else                     await admin.from('profiles').update({ seen_nav_renown_intro: true }).eq('id', user.id)
}

/** Spend one banked Renown point on a stat. Server-validated: can't over-spend
 *  or target an unknown stat. */
export async function allocateRenown(skill: RenownSkill, statId: string): Promise<RenownState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  if (!isRenownStat(skill, statId)) return { error: 'Unknown stat.' }

  const admin = createAdminClient()
  const { xp, alloc } = await readRow(admin, user.id, skill)
  if (availablePoints(skill, xp, alloc) <= 0) return { error: 'No Renown points to spend.' }

  const next: RenownAlloc = { ...alloc, [statId]: Math.max(0, Math.floor(alloc[statId] ?? 0)) + 1 }
  await writeAlloc(admin, user.id, skill, next)
  return stateFrom(skill, xp, next)
}

/** Commit a whole batch of pending allocations at once (the panel stages a draft
 *  and only persists on Confirm). Server-validated: only known stats accept
 *  points, and the total can't exceed the player's banked points. */
export async function commitRenown(skill: RenownSkill, delta: RenownAlloc): Promise<RenownState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  // Sanitize the incoming draft: known stats only, non-negative whole points.
  const clean: RenownAlloc = {}
  let total = 0
  for (const [id, n] of Object.entries(delta ?? {})) {
    if (!isRenownStat(skill, id)) continue
    const p = Math.max(0, Math.floor(Number(n) || 0))
    if (p > 0) { clean[id] = p; total += p }
  }

  const admin = createAdminClient()
  const { xp, alloc } = await readRow(admin, user.id, skill)
  if (total === 0) return stateFrom(skill, xp, alloc)
  if (total > availablePoints(skill, xp, alloc)) return { error: 'Not enough Renown points.' }

  const next: RenownAlloc = { ...alloc }
  for (const [id, p] of Object.entries(clean)) next[id] = Math.max(0, Math.floor(alloc[id] ?? 0)) + p
  await writeAlloc(admin, user.id, skill, next)
  return stateFrom(skill, xp, next)
}
