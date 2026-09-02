// THE SUNKEN HAND — the finale. Finn, at the end of the line he has been
// reeling since the first cast.
//
// This is the only raid fought on the DIAL rather than the aim bar, and the
// only one that reads the FISHING track twice over: the six Ancient Deep giants
// gate entry, and the player's equipped rod + hook widen the dial's bands. The
// campaign and the fishing loop settle up here.

import { redirect } from 'next/navigation'
import RaidGame from '../RaidGame'
import { getRaidPlayerStats } from '../actions'
import { THE_SUNKEN_HAND } from '@/lib/bossRaids'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'

export default async function SunkenHandRaidPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, stats] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
  ])

  // The gate the map advertises, enforced server-side too: all six giants.
  const ancientsCaught = ((profile?.ancient_catches as number[] | null) ?? []).length
  if (ancientsCaught < 6) redirect('/expeditions')

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
            config={THE_SUNKEN_HAND}
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
            dialAim={stats.dialAim}
          />
        </div>
      </main>
    </>
  )
}
