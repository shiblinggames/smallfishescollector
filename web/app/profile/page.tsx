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
import { isPremiumActive } from '@/lib/premium'
import type { CareerStats, CareerAggregates } from '@/lib/careerStats'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [
    { data: profile },
    { data: ownedRows },
    { data: rarestFishRows },
    { data: allFishSpecies },
    { data: careerAgg },
  ] = await Promise.all([
    supabase.from('profiles')
      .select('packs_available, doubloons, gems, username, username_changed, showcase_variant_ids, is_premium, premium_expires_at, fishing_xp, expedition_xp, ship_tier, ship_name, rod_tier, reel_tier, hook_tier, equipped_ship_skin, equipped_special, character_color, unlocked_character_colors, unlocked_badges, equipped_badges, trophy_catches, equipped_boat, equipped_hat, avatar_bg_color, avatar_border_color, unlocked_avatar_specials, profile_bg, fishing_casts, total_perfects')
      .eq('id', user.id)
      .single(),
    admin.from('user_collection')
      .select('card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(name, filename))')
      .eq('user_id', user.id),
    admin.from('fish_collection')
      .select('fish_species(id, name, bite_rarity, habitat)')
      .eq('user_id', user.id)
      .order('fish_species(bite_rarity)', { ascending: false })
      .limit(3),
    // fish_species has ~140 rows — pulling id+name for the whole table is
    // cheaper than a second round-trip just to map trophy names by id.
    admin.from('fish_species').select('id, name'),
    // Career aggregates (fish sold, voyage loot, raids, fastest raid) in one
    // SQL round-trip via the career_stats() function.
    admin.rpc('career_stats', { uid: user.id }),
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

  const trophyIds = ((profile?.trophy_catches as number[] | null) ?? [])
  const trophyIdSet = new Set(trophyIds)
  const ancientTrophies = ((allFishSpecies ?? []) as { id: number; name: string }[])
    .filter(f => trophyIdSet.has(f.id))

  const agg = (careerAgg ?? {}) as Partial<CareerAggregates>
  const career: CareerStats = {
    fishingCasts: profile?.fishing_casts ?? 0,
    perfects: profile?.total_perfects ?? 0,
    fishSold: agg.fishSold ?? 0,
    raidsCompleted: agg.raidsCompleted ?? 0,
    voyageLoot: agg.voyageLoot ?? 0,
    fastestRaidMs: agg.fastestRaidMs ?? null,
  }

  const ship = getShip(profile?.ship_tier ?? 0)
  const level = getLevelFromXP(profile?.fishing_xp ?? 0)
  const unlockedColors = [
    ...CHARACTER_COLORS.filter(c => c.free).map(c => c.id),
    ...((profile?.unlocked_character_colors as string[] | null) ?? []),
  ]
  const expeditionLevel = getExpeditionLevel(profile?.expedition_xp ?? 0)
  const navigatorTitle = getNavigatorTitle(expeditionLevel)
  const isPremium = isPremiumActive(profile)

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
          career={career}
          shipTier={profile?.ship_tier ?? 0}
          shipName={ship.name}
          shipColor={ship.color}
          customShipName={(profile?.ship_name as string | null) ?? null}
          equippedShipSkin={(profile?.equipped_ship_skin as string | null) ?? null}
          rodTier={profile?.rod_tier ?? 0}
          reelTier={profile?.reel_tier ?? 0}
          hookTier={profile?.hook_tier ?? 0}
          equippedSpecialId={(profile?.equipped_special as string | null) ?? null}
          rarestFish={rarestFish}
          ancientTrophies={ancientTrophies}
          characterColor={profile?.character_color ?? 'default'}
          unlockedColors={unlockedColors}
          doubloons={profile?.doubloons ?? 0}
          gems={profile?.gems ?? 0}
          equippedBadges={(profile?.equipped_badges as string[] | null) ?? []}
          equippedBoat={(profile?.equipped_boat as string | null) ?? null}
          equippedHat={(profile?.equipped_hat as string | null) ?? null}
          unlockedBadges={(profile?.unlocked_badges as string[] | null) ?? []}
          avatarBgColor={(profile?.avatar_bg_color as string | null) ?? null}
          avatarBorderColor={(profile?.avatar_border_color as string | null) ?? null}
          unlockedAvatarSpecials={(profile?.unlocked_avatar_specials as string[] | null) ?? []}
          initialProfileBg={(profile?.profile_bg as string | null) ?? null}
        />
      </main>
    </>
  )
}
