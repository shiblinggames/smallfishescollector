// The Davy Jones Gauntlet — Chapter 2.5 push-your-luck roguelike.
// 1-hour cooldown between runs; depth-scaled enemies from Raids 1-4; pot banked
// only on cash-out. The cooldown gate + payout are server-authoritative (see
// actions.ts); the fight engine is the shared RaidCombat, hosted by GauntletGame.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import GauntletGame from './GauntletGame'
import { getRaidPlayerStats } from '../actions'
import { getGauntletDailyState, getGauntletLeaderboard } from './actions'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { gauntletUnlocked, donsGauntletUnlocked } from '@/lib/gauntlet'

export default async function GauntletPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [profile, stats, daily, leaderboard, throneRes] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
    getGauntletDailyState(),
    getGauntletLeaderboard(),
    admin.from('raid_completions').select('id').eq('user_id', user.id).eq('raid_id', 'the_throne').limit(1).maybeSingle(),
  ])

  // Locked until GAUNTLET_LIVE flips (then: cleared Chapter 2). Admins always.
  const clearedNodes = (profile?.raid_node_progress as { cleared?: string[] } | null)?.cleared ?? []
  if (!gauntletUnlocked({ isAdmin: profile?.is_admin, clearedNodes })) redirect('/expeditions')

  // Show the switcher only if Don's Gauntlet is ALSO unlocked for this player.
  const donsUnlocked = donsGauntletUnlocked({ isAdmin: profile?.is_admin, throneCleared: !!throneRes.data })

  if ((profile?.raid_repair_owed ?? 0) > 0) redirect('/expeditions')

  return (
    <main className="min-h-screen pt-6">
      {/* No pb here. GauntletGame pads its OWN bottom on every screen it
          renders: pb-10 on the three lobby views, and an explicit safe-area
          plus tab-bar clearance on the in-run ones. The shell's pb-12 stacked
          48px on top of that and left a dead strip under the home page. */}
      <div className="px-3 max-w-xl mx-auto">
        <GauntletGame
          otherGauntletUnlocked={donsUnlocked}
          shipImageUrl={stats.shipImageUrl}
          shipName={stats.shipName}
          username={stats.username}
          playerHPMax={stats.playerHPMax}
          shipMinDamage={stats.shipMinDamage}
          shipSpeed={stats.shipSpeed}
          totalPower={stats.totalPower}
          totalDodge={stats.totalDodge}
          totalFortune={stats.totalFortune}
          crewMembers={stats.crewMembers}
          equippedShipSkin={stats.equippedShipSkin}
          equippedItems={stats.equippedRaidItems}
          ownedRaidItems={stats.ownedRaidItems}
          ownedShipSkins={stats.shipSkins}
          classDamageMult={stats.classDamageMult}
          classDoubloonMult={stats.classDoubloonMult}
          shipClasses={stats.shipClasses}
          equippedRepairKit={stats.equippedRepairKit}
          playerCharacterColor={stats.characterColor}
          playerEquippedHat={stats.equippedHat}
          playerAvatarBg={stats.avatarBgColor}
          playerAvatarBorder={stats.avatarBorderColor}
          raidMods={stats.raidMods}
          bonusChargeSlots={stats.bonusChargeSlots}
            manowarAugment={stats.manowarAugment}
          gauntletUpgrades={(profile?.gauntlet_upgrades as string[] | null) ?? []}
          gauntletUpgradesOff={(profile?.gauntlet_upgrades_off as string[] | null) ?? []}
          confluencesSeen={(profile?.gauntlet_confluences_seen as string[] | null) ?? []}
          deepest={daily.deepest}
          deepestRun={daily.deepestRun}
          hcDeepestRun={daily.hcDeepestRun}
          lastRun={daily.lastRun}
          hcLastRun={daily.hcLastRun}
          fathoms={daily.fathoms}
          available={daily.available}
          nextAt={daily.nextAt}
          resumeState={daily.resumeState}
          resumePaused={daily.resumePaused}
          hasSeenIntro={profile?.has_seen_gauntlet_intro === true}
          topDescender={leaderboard.top}
          hardcoreUnlocked={daily.hardcoreUnlocked}
          hardcoreLive={daily.hardcoreLive}
          hcDeepest={daily.hcDeepest}
          hcRunsLeft={daily.hcRunsLeft}
          hardcoreTop={leaderboard.hardcoreTop}
          runHardcore={daily.runHardcore}
          runTerms={daily.runTerms}
          bloodGems={(profile?.blood_gems as number | null) ?? 0}
        />
      </div>
    </main>
  )
}
