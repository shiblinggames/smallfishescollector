'use server'

// ── WHAT THE LOADOUT SHEET CAN CHANGE, OUT ON THE WATER ─────────────────────
//
// The Shipyard's preview lets you tap a label and swap the thing it points at.
// The sea's loadout draws the same preview with the same callouts and now does
// the same, so the two screens are one screen in two places.
//
// ── FETCHED WHEN THE SHEET OPENS, NOT WITH THE CHART ────────────────────────
//
// Every hat, boat, pet and colour you own is a lot of rows to put on the
// critical path of the most-loaded page in the game, for a panel most sessions
// never open. So the chart ships without it and this fills the sheet in on the
// tap that opens it — which is also why the picker shows a quiet "…" for a
// beat rather than pretending to be instant.
//
// ── SWAPPING, NOT SHOPPING ──────────────────────────────────────────────────
//
// Equip only. Nothing here buys, sells or forges anything, and that is a line
// worth holding rather than an omission: the shops are BUILDINGS, on an island,
// and reaching them is a sail with a decision in it. That is the same argument
// that retired quick-sell, and putting a till in the middle of the ocean would
// undo it from the other end. You can wear anything you own out here; you buy
// it ashore.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserAchievementPoints } from '@/lib/achievementPoints'
import { unlockedCosmetics } from '@/lib/cosmeticUnlocks'
import { ownedRodTiers } from '@/lib/rods'

export type LoadoutGear = {
  rods: number[]
  colors: string[]
  boats: string[]
  hats: string[]
  pets: string[]
  equipped: {
    rod: number
    color: string
    boat: string | null
    hat: string | null
    pet: string | null
  }
}

/** Everything the loadout's pickers offer. Read-only. */
export async function loadoutGear(): Promise<LoadoutGear | null> {
  const supabase = await createClient()
  // getSession, not getUser: this reads the caller's own rows and the session
  // names them. See the note in lib/supabase.
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return null

  const admin = createAdminClient()
  const [{ data: profile }, { data: rodRows }, achievementPoints] = await Promise.all([
    admin.from('profiles')
      .select('rod_tier, character_color, equipped_boat, equipped_hat, equipped_pet, fishing_xp, expedition_xp, prestige_levels, unlocked_character_colors, unlocked_boats, unlocked_hats, unlocked_pets')
      .eq('id', uid).single(),
    admin.from('rod_inventory').select('rod_tier').eq('user_id', uid),
    getUserAchievementPoints(uid),
  ])
  if (!profile) return null

  const rodTier = Number(profile.rod_tier ?? 0)
  const unlocked = unlockedCosmetics(profile as never, achievementPoints)

  return {
    // The same rule the sea already uses for what sails with you: free tiers
    // are not in rod_inventory and have to be added back. See lib/rods.
    rods: ownedRodTiers((rodRows ?? []).map(r => Number(r.rod_tier)), rodTier),
    colors: [...new Set(unlocked.colors)],
    boats: [...new Set(unlocked.boats)],
    hats: [...new Set(unlocked.hats)],
    pets: [...new Set(unlocked.pets)],
    equipped: {
      rod: rodTier,
      color: (profile.character_color as string | null) ?? 'default',
      boat: (profile.equipped_boat as string | null) ?? null,
      hat: (profile.equipped_hat as string | null) ?? null,
      pet: (profile.equipped_pet as string | null) ?? null,
    },
  }
}
