// Challenge variant of /raids/cartographer. Same shape as the Krust +
// Pete challenge pages — loads THE_CARTOGRAPHER_CHALLENGE instead of
// the base config. No phase 2 (Riposte already adds a second mechanic
// layer on top of crew-wide Mist Veil).

import { redirect } from 'next/navigation'
import RaidGame from '../../RaidGame'
import { getRaidPlayerStats } from '@/lib/raidPlayerStats'
import { THE_CARTOGRAPHER_CHALLENGE } from '@/lib/raidChallenge'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'

export default async function CartographerChallengeRaidPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, stats] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
  ])


  return (
    <>
      <main className="min-h-screen pt-6" style={{ width: '100%' }}>
        {/* NO page-col. A fight is a scene, not a document: the reading column
          put the battle in a strip down the middle of its own sea on anything
          wider than a phone. The other fight pages went full-bleed first;
          this one is the same fight. RaidCombat caps its own control deck. */}
        <div className="pb-12" style={{ width: '100%' }}>
          <RaidGame
            config={THE_CARTOGRAPHER_CHALLENGE}
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
