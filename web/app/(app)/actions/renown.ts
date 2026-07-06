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

/** Reset all allocations for a skill (free respec) — the points return to the bank. */
export async function respecRenown(skill: RenownSkill): Promise<RenownState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const admin = createAdminClient()
  const { xp } = await readRow(admin, user.id, skill)
  await writeAlloc(admin, user.id, skill, {})
  return stateFrom(skill, xp, {})
}
