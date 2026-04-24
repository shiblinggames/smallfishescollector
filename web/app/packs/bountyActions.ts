import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWeekStart } from '@/lib/weekStart'

const ABYSS_SLUGS = ['Catfish', 'Doby_Mick']

export interface BountyFish {
  cardId: number
  name: string
  slug: string
  filename: string
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
}

type AdminClient = ReturnType<typeof createAdminClient>

interface BountyRow {
  shallows_card_id: number
  open_waters_card_id: number
  deep_card_id: number
  abyss_card_id: number
}

async function ensureBounties(weekStart: string, admin: AdminClient): Promise<BountyRow | null> {
  const { data: existing } = await admin
    .from('weekly_bounties')
    .select('shallows_card_id, open_waters_card_id, deep_card_id, abyss_card_id')
    .eq('week_start', weekStart)
    .single()

  if (existing) return existing as BountyRow

  const { data: allCards } = await admin.from('cards').select('id, tier, slug')
  if (!allCards) return null

  const tier1 = allCards.filter((c: any) => c.tier === 1 && !ABYSS_SLUGS.includes(c.slug))
  const tier2 = allCards.filter((c: any) => c.tier === 2 && !ABYSS_SLUGS.includes(c.slug))
  const tier3 = allCards.filter((c: any) => c.tier === 3 && !ABYSS_SLUGS.includes(c.slug))
  const abyssFish = allCards.filter((c: any) => ABYSS_SLUGS.includes(c.slug))

  if (!tier1.length || !tier2.length || !tier3.length || !abyssFish.length) return null

  const pick = (arr: { id: number }[]) => arr[Math.floor(Math.random() * arr.length)].id

  await admin.from('weekly_bounties').upsert({
    week_start: weekStart,
    shallows_card_id: pick(tier1),
    open_waters_card_id: pick(tier2),
    deep_card_id: pick(tier3),
    abyss_card_id: pick(abyssFish),
  }, { onConflict: 'week_start', ignoreDuplicates: true })

  const { data: row } = await admin
    .from('weekly_bounties')
    .select('shallows_card_id, open_waters_card_id, deep_card_id, abyss_card_id')
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

  const cardIds = [
    bountyRow.shallows_card_id,
    bountyRow.open_waters_card_id,
    bountyRow.deep_card_id,
    bountyRow.abyss_card_id,
  ]

  const [{ data: cards }, { data: progress }] = await Promise.all([
    admin.from('cards').select('id, name, slug, filename').in('id', cardIds),
    admin
      .from('weekly_bounty_progress')
      .select('shallows_completed, open_waters_completed, deep_completed, abyss_completed')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .maybeSingle(),
  ])

  if (!cards) return null

  const cardMap = new Map((cards as any[]).map((c) => [c.id, c]))
  const toFish = (id: number): BountyFish => {
    const c = cardMap.get(id)
    return { cardId: id, name: c?.name ?? '', slug: c?.slug ?? '', filename: c?.filename ?? '' }
  }

  return {
    weekStart,
    shallows: toFish(bountyRow.shallows_card_id),
    openWaters: toFish(bountyRow.open_waters_card_id),
    deep: toFish(bountyRow.deep_card_id),
    abyss: toFish(bountyRow.abyss_card_id),
    progress: {
      shallows: progress?.shallows_completed ?? false,
      openWaters: progress?.open_waters_completed ?? false,
      deep: progress?.deep_completed ?? false,
      abyss: progress?.abyss_completed ?? false,
    },
  }
}
