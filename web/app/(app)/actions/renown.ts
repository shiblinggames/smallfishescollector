'use server'

// Server-authoritative Renown point state: read the derived level (from XP) +
// the persisted allocations, spend a banked point on a stat, or spend a respec
// token to clear one board back to banked.
// Effects themselves are applied at the fishing / raid / gauntlet reward paths.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type RenownSkill, type RenownAlloc,
  renownLevel, spentPoints, availablePoints, isRenownStat, RENOWN_RESPEC_GEM_COST,
} from '@/lib/renown'

export interface RenownState {
  skill: RenownSkill
  level: number
  spent: number
  available: number
  alloc: RenownAlloc
  /** Respec tokens in hand. Shared across both boards: a token is spent on
   *  whichever one you use it on. */
  respecs: number
  /** Gems in hand, so the panel can price the buy button without a second read. */
  gems: number
}

const XP_COL = (skill: RenownSkill) => (skill === 'fishing' ? 'fishing_xp' : 'expedition_xp')
const ALLOC_COL = (skill: RenownSkill) => (skill === 'fishing' ? 'fishing_renown_alloc' : 'nav_renown_alloc')

type Admin = ReturnType<typeof createAdminClient>
async function readRow(admin: Admin, userId: string, skill: RenownSkill): Promise<{ xp: number; alloc: RenownAlloc; respecs: number; gems: number }> {
  const { data } = await admin.from('profiles').select(`${XP_COL(skill)}, ${ALLOC_COL(skill)}, renown_respecs, gems`).eq('id', userId).single()
  const row = (data ?? {}) as Record<string, unknown>
  return {
    xp: Number(row[XP_COL(skill)] ?? 0),
    alloc: (row[ALLOC_COL(skill)] as RenownAlloc | null) ?? {},
    respecs: Math.max(0, Number(row.renown_respecs ?? 0)),
    gems: Math.max(0, Number(row.gems ?? 0)),
  }
}

async function writeAlloc(admin: Admin, userId: string, skill: RenownSkill, alloc: RenownAlloc): Promise<void> {
  if (skill === 'fishing') await admin.from('profiles').update({ fishing_renown_alloc: alloc }).eq('id', userId)
  else                     await admin.from('profiles').update({ nav_renown_alloc: alloc }).eq('id', userId)
}

function stateFrom(skill: RenownSkill, xp: number, alloc: RenownAlloc, respecs = 0, gems = 0): RenownState {
  return { skill, level: renownLevel(skill, xp), spent: spentPoints(skill, alloc), available: availablePoints(skill, xp, alloc), alloc, respecs, gems }
}

export async function getRenownState(skill: RenownSkill): Promise<RenownState | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { xp, alloc, respecs, gems } = await readRow(admin, user.id, skill)
  return stateFrom(skill, xp, alloc, respecs, gems)
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
  const { xp, alloc, respecs, gems } = await readRow(admin, user.id, skill)
  if (availablePoints(skill, xp, alloc) <= 0) return { error: 'No Renown points to spend.' }

  const next: RenownAlloc = { ...alloc, [statId]: Math.max(0, Math.floor(alloc[statId] ?? 0)) + 1 }
  await writeAlloc(admin, user.id, skill, next)
  return stateFrom(skill, xp, next, respecs, gems)
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
  const { xp, alloc, respecs, gems } = await readRow(admin, user.id, skill)
  if (total === 0) return stateFrom(skill, xp, alloc, respecs, gems)
  if (total > availablePoints(skill, xp, alloc)) return { error: 'Not enough Renown points.' }

  const next: RenownAlloc = { ...alloc }
  for (const [id, p] of Object.entries(clean)) next[id] = Math.max(0, Math.floor(alloc[id] ?? 0)) + p
  await writeAlloc(admin, user.id, skill, next)
  return stateFrom(skill, xp, next, respecs, gems)
}

/**
 * Spend one respec token to clear ONE board. Every point on it returns to
 * banked; the other board is untouched.
 *
 * The token is consumed FIRST, by a conditional update that only lands while
 * the count is still above zero. Two taps racing therefore produce one respec
 * and one refusal rather than two clears off one token. The alloc is wiped
 * after, because the order that can strand a player is the one that clears a
 * board and then fails to charge for it.
 */
export async function respecRenown(skill: RenownSkill): Promise<RenownState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const admin = createAdminClient()
  const { xp, alloc, respecs, gems } = await readRow(admin, user.id, skill)
  if (respecs <= 0) return { error: 'No respec tokens. You can buy one with gems.' }
  if (spentPoints(skill, alloc) === 0) return { error: 'Nothing to undo on this board yet.' }

  const { data: charged } = await admin
    .from('profiles')
    .update({ renown_respecs: respecs - 1 })
    .eq('id', user.id)
    .gte('renown_respecs', 1)
    .select('renown_respecs')
    .maybeSingle()
  if (!charged) return { error: 'No respec tokens. You can buy one with gems.' }

  await writeAlloc(admin, user.id, skill, {})
  return stateFrom(skill, xp, {}, Math.max(0, Number(charged.renown_respecs ?? 0)), gems)
}

/** Buy one respec token for gems. Guarded the same way every gem purchase in
 *  the game is: the deduction only lands while the balance still covers it. */
export async function buyRenownRespec(skill: RenownSkill): Promise<RenownState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const admin = createAdminClient()
  const { xp, alloc, respecs, gems } = await readRow(admin, user.id, skill)
  if (gems < RENOWN_RESPEC_GEM_COST) return { error: `You need ${RENOWN_RESPEC_GEM_COST.toLocaleString()} gems.` }

  const { data: bought } = await admin
    .from('profiles')
    .update({ gems: gems - RENOWN_RESPEC_GEM_COST, renown_respecs: respecs + 1 })
    .eq('id', user.id)
    .gte('gems', RENOWN_RESPEC_GEM_COST)
    .select('gems, renown_respecs')
    .maybeSingle()
  if (!bought) return { error: `You need ${RENOWN_RESPEC_GEM_COST.toLocaleString()} gems.` }

  return stateFrom(skill, xp, alloc, Math.max(0, Number(bought.renown_respecs ?? 0)), Math.max(0, Number(bought.gems ?? 0)))
}
