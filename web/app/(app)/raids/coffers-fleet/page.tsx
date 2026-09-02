// The Harbor Fleet — Chapter III's first raid (the Coffers' escort fleet +
// Admiral Ruse). SIGNATURE: "Decoys" (false crit bands on the aim bar). The
// admiral runs a phase 2.

import { redirect } from 'next/navigation'
import RaidGame from '../RaidGame'
import { getRaidPlayerStats } from '../actions'
import { THE_COFFERS_FLEET } from '@/lib/bossRaids'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'

export default async function CoffersFleetRaidPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, stats] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
  ])

  if ((profile?.raid_repair_owed ?? 0) > 0) redirect('/expeditions')

  return (
    <>
      <main className="min-h-screen pt-6" style={{ width: '100%' }}>
        {/* NO page-col. A fight is a scene, not a document: boxing it in the
          app's reading column put the battle in a strip down the middle of
          its own sea on anything wider than a phone. RaidCombat caps its
          own control deck; the scene takes the screen. */}
        <div className="pb-12" style={{ width: '100%' }}>
          <RaidGame
            config={THE_COFFERS_FLEET}
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
