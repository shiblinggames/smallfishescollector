// Challenge variant of /raids/krust. See ../../challenge/page.tsx for the
// design notes — same shape, just loads CAPTAIN_KRUST_CHALLENGE.

import { redirect } from 'next/navigation'
import RaidGame from '../../RaidGame'
import { getRaidPlayerStats } from '../../actions'
import { CAPTAIN_KRUST_CHALLENGE } from '@/lib/raidChallenge'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'

export default async function KrustChallengeRaidPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, stats] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
  ])

  if ((profile?.raid_repair_owed ?? 0) > 0) redirect('/expeditions')

  return (
    <>
      <main className="min-h-screen pt-6">
        <div className="px-3 pb-12 max-w-xl mx-auto">
          <RaidGame
            config={CAPTAIN_KRUST_CHALLENGE}
            shipImageUrl={stats.shipImageUrl}
            shipName={stats.shipName}
            username={stats.username}
            playerCharacterColor={stats.characterColor}
            playerEquippedHat={stats.equippedHat}
            playerAvatarBg={stats.avatarBgColor}
            playerAvatarBorder={stats.avatarBorderColor}
            playerHPMax={stats.playerHPMax}
            shipMinDamage={stats.shipMinDamage}
            shipSpeed={stats.shipSpeed}
            totalPower={stats.totalPower}
            totalDodge={stats.totalDodge}
            totalFortune={stats.totalFortune}
            crewCount={stats.crewCount}
            crewMembers={stats.crewMembers}
            equippedShipSkin={stats.equippedShipSkin}
            shipSkins={stats.shipSkins}
            equippedItems={stats.equippedRaidItems}
            ownedRaidItems={stats.ownedRaidItems}
            ownedSpecialItems={stats.ownedSpecialItems}
            classDamageMult={stats.classDamageMult}
            legendaryLootMult={stats.legendaryLootMult}
            classDoubloonMult={stats.classDoubloonMult}
            shipClasses={stats.shipClasses}
            equippedRepairKit={stats.equippedRepairKit}
            initialExpeditionXP={profile?.expedition_xp ?? 0}
            raidMods={stats.raidMods}
            bonusChargeSlots={stats.bonusChargeSlots}
            manowarAugment={stats.manowarAugment}
          />
        </div>
      </main>
    </>
  )
}
