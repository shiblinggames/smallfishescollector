import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import ProfileClient from './ProfileClient'
import { getShip } from '@/lib/ships'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel, getNavigatorTitle } from '@/lib/expeditionLevel'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { CHARACTER_COLORS } from '@/lib/characters'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [
    { data: profile },
    { count: uniqueSpecies },
    { data: ownedRows },
    { data: rarestFishRows },
  ] = await Promise.all([
    supabase.from('profiles')
      .select('packs_available, doubloons, gems, username, username_changed, showcase_variant_ids, is_premium, premium_expires_at, fishing_xp, expedition_xp, ship_tier, ship_name, rod_tier, hook_tier, equipped_ship_skin, equipped_special, character_color, unlocked_character_colors, prestige_levels')
      .eq('id', user.id)
      .single(),
    admin.from('fish_collection')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    admin.from('user_collection')
      .select('card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(name, filename))')
      .eq('user_id', user.id),
    admin.from('fish_collection')
      .select('fish_species(id, name, bite_rarity, habitat)')
      .eq('user_id', user.id)
      .order('fish_species(bite_rarity)', { ascending: false })
      .limit(3),
  ])

  const seen = new Set<number>()
  const pickerCards: { variantId: number; variantName: string; borderStyle: BorderStyle; artEffect: ArtEffect; dropWeight: number; name: string; filename: string }[] = []
  for (const row of (ownedRows ?? []).sort((a: any, b: any) => {
    const aw = (a.card_variants as any)?.drop_weight ?? 999
    const bw = (b.card_variants as any)?.drop_weight ?? 999
    return aw - bw
  })) {
    const cv = (row as any).card_variants as any
    if (!cv || seen.has(cv.id)) continue
    seen.add(cv.id)
    pickerCards.push({
      variantId:   cv.id,
      variantName: cv.variant_name,
      borderStyle: cv.border_style as BorderStyle,
      artEffect:   cv.art_effect as ArtEffect,
      dropWeight:  cv.drop_weight,
      name:        cv.cards?.name ?? '',
      filename:    cv.cards?.filename ?? '',
    })
  }

  const rarestFish = ((rarestFishRows ?? []) as any[])
    .map(r => r.fish_species)
    .filter(Boolean) as { id: number; name: string; bite_rarity: number; habitat?: string }[]

  const ship = getShip(profile?.ship_tier ?? 0)
  const level = getLevelFromXP(profile?.fishing_xp ?? 0)
  const unlockedColors = [
    ...CHARACTER_COLORS.filter(c => c.free).map(c => c.id),
    ...((profile?.unlocked_character_colors as string[] | null) ?? []),
  ]
  const expeditionLevel = getExpeditionLevel(profile?.expedition_xp ?? 0)
  const navigatorTitle = getNavigatorTitle(expeditionLevel)
  const isPremium =
    !!profile?.is_premium &&
    !!profile?.premium_expires_at &&
    new Date(profile.premium_expires_at) > new Date()

  return (
    <>
      <Nav
        packsAvailable={profile?.packs_available ?? 0}
        doubloons={profile?.doubloons ?? 0}
        gems={profile?.gems ?? 0}
      />
      <main className="min-h-screen pt-8">
        <ProfileClient
          email={user.email ?? ''}
          username={profile?.username ?? ''}
          usernameChanged={profile?.username_changed ?? false}
          showcaseVariantIds={(profile?.showcase_variant_ids as number[] | null) ?? []}
          pickerCards={pickerCards}
          isPremium={isPremium}
          level={level}
          expeditionLevel={expeditionLevel}
          navigatorTitle={navigatorTitle}
          uniqueSpecies={uniqueSpecies ?? 0}
          shipTier={profile?.ship_tier ?? 0}
          shipName={ship.name}
          shipColor={ship.color}
          customShipName={(profile?.ship_name as string | null) ?? null}
          equippedShipSkin={(profile?.equipped_ship_skin as string | null) ?? null}
          rodTier={profile?.rod_tier ?? 0}
          hookTier={profile?.hook_tier ?? 0}
          equippedSpecialId={(profile?.equipped_special as string | null) ?? null}
          rarestFish={rarestFish}
          characterColor={profile?.character_color ?? 'default'}
          unlockedColors={unlockedColors}
          prestigeLevels={(profile?.prestige_levels as Record<string, number> | null) ?? {}}
        />
      </main>
    </>
  )
}
