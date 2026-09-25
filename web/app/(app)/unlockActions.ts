'use server'

// ── WHAT THE UNLOCK BANNER ASKS ─────────────────────────────────────────────
//
// "Has this captain EARNED a cosmetic I have not told them about?" Earned means
// a gate (lib/cosmeticGates): a Fishing or Navigation level step, or a share of
// the achievement pool. Bought and crate cosmetics announce themselves where
// they happen, so they are not in here.
//
// `seen_unlocks` holds what has been announced ('skin:forest'). It starts NULL,
// and the first check seeds it with what the captain already had under the
// rules BEFORE the 2026-09-25 standard, so an old account gets a banner only
// for what the new rules genuinely gave it, not for everything it owns.
//
// It also stores each earned id into the owned column it belongs to, which is
// the same self-heal the equip paths already do on demand.

import { verifiedSession } from '@/lib/verifiedSession'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CHARACTER_COLORS } from '@/lib/characters'
import { BOATS } from '@/lib/boats'
import { AVATAR_SPECIALS } from '@/lib/avatarColors'
import { gateMet, gateReason, type CosmeticGate } from '@/lib/cosmeticGates'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { getUserAchievementPoints } from '@/lib/achievementPoints'

export type UnlockNews = {
  key: string
  cat: 'skin' | 'boat' | 'border'
  id: string
  name: string
  /** A picture for a boat; a skin or a border is drawn as an avatar (`ring`
   *  is the border's value for CharacterAvatar). */
  image?: string
  ring?: string
  reason: string
}

type Earnable = { key: string; cat: UnlockNews['cat']; id: string; name: string; gate: CosmeticGate; image?: string; ring?: string }

const EARNABLE: Earnable[] = [
  ...CHARACTER_COLORS.filter(c => c.gate).map(c => ({
    key: `skin:${c.id}`, cat: 'skin' as const, id: c.id, name: `${c.name} skin`, gate: c.gate!,
  })),
  ...BOATS.filter(b => b.gate).map(b => ({
    key: `boat:${b.id}`, cat: 'boat' as const, id: b.id, name: `${b.name} boat`, gate: b.gate!,
    image: b.restImageUrl,
  })),
  ...AVATAR_SPECIALS.filter(s => s.gate).map(s => ({
    key: `border:${s.id}`, cat: 'border' as const, id: s.id, name: `${s.label} border`, gate: s.gate!,
    ring: s.hex,
  })),
]

/** Everything the OLD rules could give by state. On the first check these are
 *  seen AND stored: a captain who qualified for Galaxy at 390 points, or the
 *  Ethereal skin at 450, before either moved (to Navigation 100 and to 500k ⟡)
 *  keeps it, whether or not they had ever put it on. */
const LEGACY_KEYS = ['skin:forest', 'skin:ice', 'skin:sky', 'skin:sand', 'skin:crystal', 'skin:galaxy', 'skin:ethereal', 'boat:abyssal', 'boat:celestial']

/** What the OLD rules had already given, for seeding only. */
function hadUnderOldRules(key: string, s: { fishing: number; nav: number; prestige: number; ap: number | null }): boolean {
  const ap = s.ap ?? 0
  switch (key) {
    case 'skin:forest': return s.fishing >= 50
    case 'skin:ice': return s.fishing >= 75
    case 'skin:sky': return s.nav >= 50
    case 'skin:sand': return s.prestige >= 3
    case 'skin:crystal': return s.fishing >= 100 && s.nav >= 100
    case 'skin:galaxy': return ap >= 390
    case 'skin:ethereal': return ap >= 450
    case 'boat:abyssal': return ap >= 350
    case 'boat:celestial': return ap >= 420
    default: return false
  }
}

export async function checkUnlocks(): Promise<UnlockNews[]> {
  const supabase = await createClient()
  const session = await verifiedSession(supabase)
  const user = session?.user
  if (!user) return []

  const admin = createAdminClient()
  const { data: p } = await admin.from('profiles')
    .select('fishing_xp, expedition_xp, prestige_levels, unlocked_character_colors, unlocked_boats, unlocked_avatar_specials, seen_unlocks')
    .eq('id', user.id).single()
  if (!p) return []

  const seenCol = p.seen_unlocks as string[] | null
  const seen = new Set(seenCol ?? [])
  const fishing = getLevelFromXP(Number(p.fishing_xp ?? 0))
  const nav = navLevelFromXP(Number(p.expedition_xp ?? 0))
  const prestige = Math.max(0, ...Object.values((p.prestige_levels as Record<string, number> | null) ?? {}))

  // The score costs queries (cached a minute), so only when an unseen
  // achievement gate is left, or when seeding (the old rules need it too).
  const needAp = seenCol === null || EARNABLE.some(e => e.gate.kind === 'ap' && !seen.has(e.key))
  const ap = needAp ? await getUserAchievementPoints(user.id) : null

  const earned = EARNABLE.filter(e => gateMet(e.gate, { fishingLevel: fishing, navLevel: nav, ap }))

  const stored = {
    skin: (p.unlocked_character_colors as string[] | null) ?? [],
    boat: (p.unlocked_boats as string[] | null) ?? [],
    border: (p.unlocked_avatar_specials as string[] | null) ?? [],
  }
  const owned = { skin: new Set(stored.skin), boat: new Set(stored.boat), border: new Set(stored.border) }
  const had = { skin: owned.skin.size, boat: owned.boat.size, border: owned.border.size }

  if (seenCol === null) {
    for (const key of LEGACY_KEYS) {
      if (!hadUnderOldRules(key, { fishing, nav, prestige, ap })) continue
      const [cat, id] = key.split(':') as ['skin' | 'boat', string]
      seen.add(key)
      owned[cat].add(id)
    }
    for (const e of earned) if (owned[e.cat].has(e.id)) seen.add(e.key)
  }
  const news = earned.filter(e => !seen.has(e.key))

  // Store every earned id where it belongs, and mark the news seen.
  for (const e of earned) owned[e.cat].add(e.id)
  const update: Record<string, unknown> = {}
  if (owned.skin.size > had.skin) update.unlocked_character_colors = [...owned.skin]
  if (owned.boat.size > had.boat) update.unlocked_boats = [...owned.boat]
  if (owned.border.size > had.border) update.unlocked_avatar_specials = [...owned.border]
  if (news.length || seenCol === null) update.seen_unlocks = [...seen, ...news.map(e => e.key)]
  if (Object.keys(update).length) await admin.from('profiles').update(update).eq('id', user.id)

  return news.map(e => ({
    key: e.key, cat: e.cat, id: e.id, name: e.name, image: e.image, ring: e.ring,
    reason: gateReason(e.gate),
  }))
}
