'use server'

// ── WHO HAS BEEN PROMOTED ───────────────────────────────────────────────────
//
// Kong (2026-09-26): make crew levelling meaningful, above all when a hand
// crosses an ability threshold, without it becoming spam. A crew's Special
// steps up at Lv 10 / 25 / 40 / 75 / 100 (CLASS_MILESTONE_LEVELS past 1), five
// moments in a hand's whole life, and those five are the only thing that gets
// a moment of its own. Ordinary levels never pop.
//
// Checked here rather than at each XP source (raid kills, the gauntlet,
// voyages, trawls, bunk stints) so every source is covered by one read.
// `seen_promotions` holds 'crewId:level' for everything already celebrated. It
// starts NULL and the first check marks everything already reached as seen, so
// an old account is not handed a stack of promotions from last month.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { crewData } from '@/lib/data/crewData'
import { verifiedSession } from '@/lib/verifiedSession'
import { CLASSES, classForSlug, CLASS_MILESTONE_LEVELS } from '@/lib/crewClasses'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { cardArt } from '@/lib/artUrl'

export type Promotion = {
  key: string
  crewId: number
  name: string
  art: string
  className: string
  color: string
  /** Roman tier: Lv 1 is Tier I, so Lv 10 is Tier II and Lv 100 is Tier VI. */
  tier: string
  level: number
  /** What the Special did before, and what it does now. */
  from: string | null
  to: string
}

const TIER = ['I', 'II', 'III', 'IV', 'V', 'VI']
/** The promotions: every milestone past the Lv 1 unlock. */
const STEPS = CLASS_MILESTONE_LEVELS.filter(l => l > 1)

let _cards: Map<number, { name: string; filename: string; slug: string }> | null = null

export async function checkPromotions(): Promise<Promotion[]> {
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  if (!session) return []
  const uid = session.user.id
  const admin = createAdminClient()

  const db = crewData(admin)
  const [prof, crew] = await Promise.all([
    db.profile(uid, 'seen_promotions'),
    db.roster(uid),
  ])
  if (!prof) return []
  if (!_cards) {
    const data = await db.cardCatalog()
    _cards = new Map(data.map(c => [c.id as number, { name: c.name as string, filename: c.filename as string, slug: c.slug as string }]))
  }

  const seenCol = prof.seen_promotions as string[] | null
  const seen = new Set(seenCol ?? [])
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const out: Promotion[] = []
  const reachedAll: string[] = []

  for (const c of crew ?? []) {
    const card = _cards.get(c.card_id as number)
    const cls = card ? classForSlug(card.slug) : null
    if (!card || !cls) continue
    const def = CLASSES[cls]
    const level = crewLevelFromXP(Number(c.xp) || 0)
    const reached = STEPS.filter(l => level >= l)
    if (reached.length === 0) continue
    const keys = reached.map(l => `${c.id}:${l}`)
    reachedAll.push(...keys)
    if (seenCol === null) continue
    const fresh = reached.filter(l => !seen.has(`${c.id}:${l}`))
    if (fresh.length === 0) continue
    // Two tiers crossed in one go (a long bunk stint, a big gauntlet) is ONE
    // card at the top one, with the ability it had before the jump.
    const top = fresh[fresh.length - 1]
    const idx = CLASS_MILESTONE_LEVELS.indexOf(top)
    const now = def.milestones.find(m => m.unlockLevel === top) ?? def.milestones[Math.min(idx, def.milestones.length - 1)]
    // The tier just below the lowest one crossed: what the card says it WAS.
    const beforeLevel = CLASS_MILESTONE_LEVELS[Math.max(0, CLASS_MILESTONE_LEVELS.indexOf(fresh[0]) - 1)]
    const before = def.milestones.find(m => m.unlockLevel === beforeLevel) ?? null
    out.push({
      key: `${c.id}:${top}`,
      crewId: c.id as number,
      name: (c.nickname as string | null) || card.name,
      art: cardArt(card.filename),
      className: def.name,
      color: def.color,
      tier: TIER[idx] ?? String(idx + 1),
      level: top,
      from: before && before.desc !== now.desc ? before.desc : null,
      to: now.desc,
    })
  }

  const next = new Set([...seen, ...reachedAll])
  if (seenCol === null || next.size > seen.size) {
    await db.updateProfile(uid, { seen_promotions: [...next] })
  }
  return out
}
