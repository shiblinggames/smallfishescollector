import { createAdminClient } from '@/lib/supabase/admin'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { getCurrentProfile } from '@/lib/userData'
import { getXPProgress } from '@/lib/expeditionLevel'
import { settleUltimateBuild } from '@/lib/ultimateBuild'
import { CREW_SKINS } from '@/lib/crewSkins'
import { parseAbyssalConversion } from '@/lib/abyssalAccelerator'
import ShipHero from './ShipHero'
import { cachedCrewRoster, cachedTrawlingCrewIds, cachedReadyBunkCount, cachedBunkLockedCrewIds, cachedChapter3Cleared, cachedBlockadeCleared, cachedThroneCleared } from './hubData'

/** The ship screen. Rendered as a SECTION of the expeditions hub, and as the
 *  whole page on /expeditions/ship, /items and /forge, which pass a focus so
 *  ShipHero drops the hub and shows only that one screen. One fetch either
 *  way, so a route and the hub can never drift apart. */
export default async function ShipHeroSection({ focus }: { focus?: 'ship' | 'items' | 'forge' }) {
  const [profile, roster, trawlingCrewIds, bunkLockedCrewIds, readyBunks, chapter3Cleared, blockadeCleared, throneCleared] = await Promise.all([
    getCurrentProfile(),
    cachedCrewRoster(),
    cachedTrawlingCrewIds(),
    cachedBunkLockedCrewIds(),
    cachedReadyBunkCount(),
    cachedChapter3Cleared(),
    cachedBlockadeCleared(),
    cachedThroneCleared(),
  ])
  const shipTier = profile?.ship_tier ?? 0
  const baseShip = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  // The Sixth Berth widens the crew grid to six — fold it into the stats the
  // roster + every downstream slot display reads.
  const hasSixthBerth = profile?.has_sixth_berth === true
  const shipStats = hasSixthBerth ? { ...baseShip, crewSlots: baseShip.crewSlots + 1 } : baseShip
  // Promote a matured ultimate build into the active slot on load, so a weapon
  // that finished while the player was away shows as live (and fires).
  const { active: activeAugment, build: manowarBuild } = profile
    ? await settleUltimateBuild(createAdminClient(), profile.id as string,
        (profile.manowar_augment as string | null) ?? null, profile.manowar_augment_build ?? null)
    : { active: null, build: null }
  return (
    <ShipHero
      focus={focus}
      shipStats={shipStats}
      shipName={(profile?.ship_name as string | null) ?? null}
      expeditionXP={profile?.expedition_xp ?? 0}
      equippedShipSkin={(profile?.equipped_ship_skin as string | null) ?? null}
      shipSkins={(profile?.ship_skins as string[] | null) ?? []}
      roster={roster}
      trawlingCrewIds={trawlingCrewIds}
      bunkLockedCrewIds={bunkLockedCrewIds}
      readyBunks={readyBunks}
      ownedRaidItems={(profile?.raid_items as string[] | null) ?? []}
      borrowedJawXp={Number(profile?.borrowed_jaw_xp ?? 0)}
      equippedRaidItems={(profile?.equipped_raid_items as string[] | null) ?? []}
      equippedRepairKit={(profile?.equipped_repair_kit as string | null) ?? 'basic_repair_kit'}
      ownedRepairKits={(profile?.owned_repair_kits as string[] | null) ?? ['basic_repair_kit']}
      raidRepairOwed={profile?.raid_repair_owed ?? 0}
      doubloons={profile?.doubloons ?? 0}
      shipClasses={(profile?.ship_classes as Record<string, string> | null) ?? {}}
      gauntletUpgrades={[
        ...((profile?.gauntlet_upgrades as string[] | null) ?? []),
        ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? []),
      ]}
      gauntletFathoms={(profile?.gauntlet_fathoms as number | null) ?? 0}
      gems={(profile?.gems as number | null) ?? 0}
      abyssalConversion={parseAbyssalConversion(profile?.abyssal_conversion)}
      forgeRecipesLearned={(profile?.forge_recipes_learned as string[] | null) ?? []}
      hasSeenForgeIntro={profile?.has_seen_forge_intro === true}
      hasSeenShipGuide={profile?.has_seen_ship_guide === true}
      manowarAugment={activeAugment}
      manowarBuild={manowarBuild}
      manowarSchematics={profile?.manowar_schematics === true}
      chapter3Cleared={chapter3Cleared}
      blockadeCleared={blockadeCleared}
      hasSixthBerth={hasSixthBerth}
      throneCleared={throneCleared}
      shipRefitsUsed={Number(profile?.ship_refits_used ?? 0)}
      hasArmoryExpansion={profile?.has_armory_expansion === true}
      hasSixthMount={profile?.finn_spoil_free === 'nav' || profile?.finn_spoil_paid === 'nav'}
      isAdmin={profile?.is_admin === true}
      navRenownAlloc={(profile?.nav_renown_alloc as Record<string, number> | null) ?? null}
      seenNavRenownIntro={profile?.seen_nav_renown_intro === true}
    />
  )
}