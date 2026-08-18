// CHALLENGE: THE SUNKEN HAND — the finale again, on worse terms.
//
// Same RaidGame engine, same dial, same player stats loader; the only
// difference is the config fed in. THE_SUNKEN_HAND_CHALLENGE scales his hull
// and damage, pins its own loot table, and carries a suffixed raid_id so clears
// land in their own raid_completions bucket (which is what the Cut Off at the
// Wrist badge reads).
//
// The plate is the point here: his armour ramps 330 → 1,188 across the six
// phases, and the Perfect Streak pierce at 5 is the only sane way through it.
//
// Gating: the six Ancient Deep giants, same as the normal fight, because it is
// the same fight. Whether the CHALLENGE is open at all (needs the normal clear)
// lives on the raid-map node, matching every other challenge route — landing on
// this URL directly is allowed, exactly as it is for /raids/challenge.

import { redirect } from 'next/navigation'
import RaidGame from '../../RaidGame'
import { getRaidPlayerStats } from '../../actions'
import { THE_SUNKEN_HAND_CHALLENGE } from '@/lib/raidChallenge'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'

export default async function SunkenHandChallengeRaidPage() {
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
      <main className="min-h-screen pt-6">
        <div className="px-3 pb-12 max-w-xl mx-auto">
          <RaidGame
            config={THE_SUNKEN_HAND_CHALLENGE}
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
