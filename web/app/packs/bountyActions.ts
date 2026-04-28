'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekStart } from '@/lib/weekStart'
import { revalidatePath } from 'next/cache'

export interface BountyFish {
  fishId: number
  name: string
  zone: 'shallows' | 'open_waters' | 'deep' | 'abyss'
}

export interface WeeklyBountiesResult {
  weekStart: string
  shallows: BountyFish
  openWaters: BountyFish
  deep: BountyFish
  abyss: BountyFish
  progress: {
    shallows: boolean
    openWaters: boolean
    deep: boolean
    abyss: boolean
  }
  claimed: {
    shallows: boolean
    openWaters: boolean
    deep: boolean
    abyss: boolean
  }
}

type AdminClient = ReturnType<typeof createAdminClient>

interface BountyRow {
  shallows_fish_id: number
  open_waters_fish_id: number
  deep_fish_id: number
  abyss_fish_id: number
}

async function ensureBounties(weekStart: string, admin: AdminClient): Promise<BountyRow | null> {
  const { data: existing } = await admin
    .from('weekly_bounties')
    .select('shallows_fish_id, open_waters_fish_id, deep_fish_id, abyss_fish_id')
    .eq('week_start', weekStart)
    .single()

  if (existing) return existing as BountyRow

  const { data: allFish } = await admin.from('fish_species').select('id, habitat')
  if (!allFish) return null

  const byZone: Record<string, number[]> = { shallows: [], open_waters: [], deep: [], abyss: [] }
  for (const fish of allFish as { id: number; habitat: string }[]) {
    if (byZone[fish.habitat]) byZone[fish.habitat].push(fish.id)
  }

  for (const zone of ['shallows', 'open_waters', 'deep', 'abyss']) {
    if (!byZone[zone].length) return null
  }

  const pick = (ids: number[]) => ids[Math.floor(Math.random() * ids.length)]

  await admin.from('weekly_bounties').upsert({
    week_start: weekStart,
    shallows_fish_id:    pick(byZone.shallows),
    open_waters_fish_id: pick(byZone.open_waters),
    deep_fish_id:        pick(byZone.deep),
    abyss_fish_id:       pick(byZone.abyss),
  }, { onConflict: 'week_start', ignoreDuplicates: true })

  const { data: row } = await admin
    .from('weekly_bounties')
    .select('shallows_fish_id, open_waters_fish_id, deep_fish_id, abyss_fish_id')
    .eq('week_start', weekStart)
    .single()

  return row as BountyRow | null
}

export async function getWeeklyBounties(): Promise<WeeklyBountiesResult | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const weekStart = getWeekStart()
  const admin = createAdminClient()

  const bountyRow = await ensureBounties(weekStart, admin)
  if (!bountyRow) return null

  const fishIds = [
    bountyRow.shallows_fish_id,
    bountyRow.open_waters_fish_id,
    bountyRow.deep_fish_id,
    bountyRow.abyss_fish_id,
  ]

  const [{ data: fishList }, { data: progress }] = await Promise.all([
    admin.from('fish_species').select('id, name, habitat').in('id', fishIds),
    admin
      .from('weekly_bounty_progress')
      .select('shallows_completed, open_waters_completed, deep_completed, abyss_completed, shallows_claimed_at, open_waters_claimed_at, deep_claimed_at, abyss_claimed_at')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .maybeSingle(),
  ])

  if (!fishList) return null

  const fishMap = new Map((fishList as { id: number; name: string; habitat: string }[]).map(f => [f.id, f]))

  const toFish = (id: number, zone: BountyFish['zone']): BountyFish => {
    const f = fishMap.get(id)
    return { fishId: id, name: f?.name ?? '', zone }
  }

  return {
    weekStart,
    shallows:   toFish(bountyRow.shallows_fish_id,    'shallows'),
    openWaters: toFish(bountyRow.open_waters_fish_id, 'open_waters'),
    deep:       toFish(bountyRow.deep_fish_id,        'deep'),
    abyss:      toFish(bountyRow.abyss_fish_id,       'abyss'),
    progress: {
      shallows:   progress?.shallows_completed    ?? false,
      openWaters: progress?.open_waters_completed ?? false,
      deep:       progress?.deep_completed        ?? false,
      abyss:      progress?.abyss_completed       ?? false,
    },
    claimed: {
      shallows:   !!progress?.shallows_claimed_at,
      openWaters: !!progress?.open_waters_claimed_at,
      deep:       !!progress?.deep_claimed_at,
      abyss:      !!progress?.abyss_claimed_at,
    },
  }
}

const TIER_INFO = {
  shallows:    { completedKey: 'shallows_completed',    claimedKey: 'shallows_claimed_at',    reward: 50,  packAwarded: false, label: 'Shallows'    },
  open_waters: { completedKey: 'open_waters_completed', claimedKey: 'open_waters_claimed_at', reward: 150, packAwarded: false, label: 'Open Waters' },
  deep:        { completedKey: 'deep_completed',        claimedKey: 'deep_claimed_at',         reward: 300, packAwarded: false, label: 'Deep'        },
  abyss:       { completedKey: 'abyss_completed',       claimedKey: 'abyss_claimed_at',        reward: 500, packAwarded: true,  label: 'Abyss'       },
} as const

export async function claimBountyReward(
  tier: 'shallows' | 'open_waters' | 'deep' | 'abyss'
): Promise<{ claimed: boolean; doubloons: number; packAwarded: boolean } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const weekStart = getWeekStart()
  const admin = createAdminClient()

  const { data: progress } = await admin
    .from('weekly_bounty_progress')
    .select('shallows_completed, open_waters_completed, deep_completed, abyss_completed, shallows_claimed_at, open_waters_claimed_at, deep_claimed_at, abyss_claimed_at')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .maybeSingle()

  const info = TIER_INFO[tier]
  const p = progress as Record<string, unknown> | null

  if (!p?.[info.completedKey]) return { error: 'Bounty not yet completed' }
  if (p?.[info.claimedKey]) return { error: 'Already claimed' }

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, packs_available')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const newDoubloons = (profile.doubloons ?? 0) + info.reward
  const profileUpdate: Record<string, unknown> = { doubloons: newDoubloons }
  if (info.packAwarded) profileUpdate.packs_available = profile.packs_available + 1

  await Promise.all([
    admin.from('weekly_bounty_progress')
      .update({ [info.claimedKey]: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('week_start', weekStart),
    admin.from('profiles').update(profileUpdate).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: info.reward,
      reason: `Weekly bounty (${info.label})`,
    }),
  ])

  revalidatePath('/tavern/bounties')
  if (info.packAwarded) revalidatePath('/packs')
  return { claimed: true, doubloons: newDoubloons, packAwarded: info.packAwarded }
}
