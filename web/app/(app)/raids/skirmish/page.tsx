// ── THE REEF SKIRMISH ───────────────────────────────────────────────────────
//
// The campaign's first fight, on the same screen as every other fight. It used
// to run on /raids/practice -- the raid TUTORIAL, with its own enemy table and
// its own chrome -- so the first real battle in the game was the one that
// looked like nothing else in it.
//
// One enemy and no crate; both of those live in the config rather than here,
// which is the point: this page is the ordinary raid page, unchanged.
import { redirect } from 'next/navigation'
import RaidGame from '../RaidGame'
import { getRaidPlayerStats } from '../actions'
import { REEF_SKIRMISH } from '@/lib/bossRaids'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'

export default async function ReefSkirmishPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Profile via the request-scoped cached loader (lib/userData.ts).
  const [profile, stats] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
  ])

  // Ship sunk and unrepaired: no raiding until it's patched up at port.

  return (
    <>
      <main className="min-h-screen pt-6">
        <div className="page-col pb-12">
          <RaidGame
            config={REEF_SKIRMISH}
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
