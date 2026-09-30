// ── THE GAUNTLETS' PAGES, SHAPED (Steam prep, 2026-09-30) ──
//
// What /raids/gauntlet and /raids/dons-gauntlet hand GauntletGame, built from
// pieces like the sea chart (lib/core/seaPage): the web pages read them from
// Supabase, the desktop from the save. One function for both gauntlets, since
// the two pages differed only in which Locker, which intro and which door
// they checked. Moved out of the two page.tsx files.

import { inCaptainsWater } from '@/lib/captainWater'
import { gauntletUnlocked, donsGauntletUnlocked } from '@/lib/gauntlet'
import type { RaidPlayerStats } from '@/lib/raidLoadout'
import type { GauntletDailyState, GauntletLeaderboard } from '@/lib/core/gauntlet'
import type { Row } from '@/lib/data/common'

export type GauntletPagePieces = {
  variant: 'davy' | 'don'
  profile: Row | null
  stats: RaidPlayerStats
  daily: GauntletDailyState
  leaderboard: GauntletLeaderboard
  /** The Don's door: the Throne cleared. */
  throneCleared: boolean
}

/** GauntletGame's props, or where to send a captain whose door is shut. */
export function gauntletPageProps(p: GauntletPagePieces) {
  const { profile, stats, daily, leaderboard } = p
  const clearedNodes = (profile?.raid_node_progress as { cleared?: string[] } | null)?.cleared ?? []
  const davyOpen = gauntletUnlocked({ isAdmin: profile?.is_admin as boolean | undefined, clearedNodes })
  const donsOpen = donsGauntletUnlocked({
    isAdmin: profile?.is_admin as boolean | undefined, throneCleared: p.throneCleared,
    captain: inCaptainsWater(profile), donsDeepest: Number(profile?.dons_gauntlet_deepest ?? 0),
  })
  const don = p.variant === 'don'
  if (!(don ? donsOpen : davyOpen)) return { redirect: '/sea' as const, props: null }

  return {
    redirect: null,
    props: {
      ...(don ? { variant: 'don' as const } : {}),
      otherGauntletUnlocked: don ? davyOpen : donsOpen,
      shipImageUrl: stats.shipImageUrl,
      shipName: stats.shipName,
      username: stats.username,
      playerHPMax: stats.playerHPMax,
      shipMinDamage: stats.shipMinDamage,
      shipSpeed: stats.shipSpeed,
      totalPower: stats.totalPower,
      totalDodge: stats.totalDodge,
      totalFortune: stats.totalFortune,
      crewMembers: stats.crewMembers,
      equippedShipSkin: stats.equippedShipSkin,
      equippedItems: stats.equippedRaidItems,
      ownedRaidItems: stats.ownedRaidItems,
      ownedShipSkins: stats.shipSkins,
      classDamageMult: stats.classDamageMult,
      classDoubloonMult: stats.classDoubloonMult,
      shipClasses: stats.shipClasses,
      equippedRepairKit: stats.equippedRepairKit,
      playerCharacterColor: stats.characterColor,
      playerEquippedHat: stats.equippedHat,
      playerAvatarBg: stats.avatarBgColor,
      playerAvatarBorder: stats.avatarBorderColor,
      raidMods: stats.raidMods,
      bonusChargeSlots: stats.bonusChargeSlots,
      manowarAugment: stats.manowarAugment,
      // Don's has its OWN upgrade tree; the synergy-discovery codex and the
      // Fathoms purse stay shared.
      gauntletUpgrades: ((don ? profile?.dons_gauntlet_upgrades : profile?.gauntlet_upgrades) as string[] | null) ?? [],
      gauntletUpgradesOff: ((don ? profile?.dons_gauntlet_upgrades_off : profile?.gauntlet_upgrades_off) as string[] | null) ?? [],
      confluencesSeen: (profile?.gauntlet_confluences_seen as string[] | null) ?? [],
      deepest: daily.deepest,
      deepestRun: daily.deepestRun,
      hcDeepestRun: daily.hcDeepestRun,
      lastRun: daily.lastRun,
      hcLastRun: daily.hcLastRun,
      fathoms: daily.fathoms,
      available: daily.available,
      nextAt: daily.nextAt,
      resumeState: daily.resumeState,
      resumePaused: daily.resumePaused,
      // Each gauntlet has its own how-it-works, tracked by its own flag.
      hasSeenIntro: (don ? profile?.has_seen_dons_gauntlet_intro : profile?.has_seen_gauntlet_intro) === true,
      topDescender: leaderboard.top,
      hardcoreUnlocked: daily.hardcoreUnlocked,
      hardcoreCaptainLocked: daily.hardcoreCaptainLocked,
      hardcoreLive: daily.hardcoreLive,
      hcDeepest: daily.hcDeepest,
      hcRunsLeft: daily.hcRunsLeft,
      hardcoreTop: leaderboard.hardcoreTop,
      runHardcore: daily.runHardcore,
      runTerms: daily.runTerms,
      bloodGems: (profile?.blood_gems as number | null) ?? 0,
    },
  }
}
