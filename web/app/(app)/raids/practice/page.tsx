import { redirect } from 'next/navigation'
import PracticeRaidGame from './PracticeRaidGame'
import { getRaidPlayerStats } from '../actions'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'

export default async function PracticeRaidPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // Profile via the request-scoped cached loader (lib/userData.ts).
  const [profile, stats] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
  ])

  // A sunk ship can't sail anywhere, not even to practice, until repaired.
  if ((profile?.raid_repair_owed ?? 0) > 0) redirect('/expeditions')

  return (
    <>
      <main className="min-h-screen pt-6" style={{ width: '100%' }}>
        {/* NO page-col. A fight is a scene, not a document: boxing it in the
          app's reading column put the battle in a strip down the middle of
          its own sea on anything wider than a phone. RaidCombat caps its
          own control deck; the scene takes the screen. */}
        <div className="pb-12" style={{ width: '100%' }}>
          <PracticeRaidGame
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
            crewMembers={stats.crewMembers}
            equippedShipSkin={stats.equippedShipSkin}
            equippedRaidItems={stats.equippedRaidItems}
            equippedRepairKit={stats.equippedRepairKit}
            hasSeenTutorial={stats.hasSeenRaidTutorial}
            hasCompletedPractice={!!(profile?.has_completed_practice_raid)}
            initialExpeditionXP={profile?.expedition_xp ?? 0}
          />
        </div>
      </main>
    </>
  )
}
