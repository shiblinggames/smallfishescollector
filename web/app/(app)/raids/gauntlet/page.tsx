// The Davy Jones Gauntlet — Chapter 2.5 push-your-luck roguelike.
// 1-hour cooldown between runs; depth-scaled enemies from Raids 1-4; pot banked
// only on cash-out. The cooldown gate + payout are server-authoritative (see
// actions.ts); the fight engine is the shared RaidCombat, hosted by GauntletGame.

import { redirect } from 'next/navigation'
import GauntletGame from './GauntletGame'
import { getRaidPlayerStats } from '../actions'
import { getGauntletDailyState } from './actions'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { gauntletUnlocked } from '@/lib/gauntlet'

export default async function GauntletPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, stats, daily] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
    getGauntletDailyState(),
  ])

  // Locked until GAUNTLET_LIVE flips (then: cleared Chapter 2). Admins always.
  const clearedNodes = (profile?.raid_node_progress as { cleared?: string[] } | null)?.cleared ?? []
  if (!gauntletUnlocked({ isAdmin: profile?.is_admin, clearedNodes })) redirect('/expeditions')

  if ((profile?.raid_repair_owed ?? 0) > 0) redirect('/expeditions')

  return (
    <main className="min-h-screen pt-6">
      <div className="px-3 pb-12 max-w-xl mx-auto">
        <GauntletGame
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
          deepest={daily.deepest}
          available={daily.available}
          nextAt={daily.nextAt}
          hasSeenIntro={profile?.has_seen_gauntlet_intro === true}
        />
      </div>
    </main>
  )
}
