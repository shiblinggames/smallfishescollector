// Don's Gauntlet (Gauntlet 2) — the endgame variant, led by the ghost of Don
// Finleone. ADMIN-ONLY until DONS_GAUNTLET_LIVE flips (gate = beating Don =
// the_throne raid clear). Runs the SAME GauntletGame host with variant='don';
// slice 0 uses the classic Davy pool/curve/rewards as a stub — later slices add
// the Ch3+4 enemy pool, the steeper curve, the rewards, boons/curses, and theme.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import GauntletGame from '../gauntlet/GauntletGame'
import { getRaidPlayerStats } from '../actions'
import { getGauntletDailyState } from '../gauntlet/actions'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { donsGauntletUnlocked } from '@/lib/gauntlet'

export default async function DonsGauntletPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [profile, stats, daily, throneRes] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
    getGauntletDailyState('don'),
    admin.from('raid_completions').select('id').eq('user_id', user.id).eq('raid_id', 'the_throne').limit(1).maybeSingle(),
  ])

  // Gated on finishing the campaign (beat Don Finleone). Admins always, everyone
  // else only once DONS_GAUNTLET_LIVE flips.
  if (!donsGauntletUnlocked({ isAdmin: profile?.is_admin, throneCleared: !!throneRes.data })) redirect('/expeditions')
  if ((profile?.raid_repair_owed ?? 0) > 0) redirect('/expeditions')

  return (
    <main className="min-h-screen pt-6">
      <div className="px-3 pb-12 max-w-xl mx-auto">
        <GauntletGame
          variant="don"
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
          // Don's has its OWN upgrade tree (empty until the upgrades slice); the
          // synergy-discovery codex + the Fathoms purse stay shared.
          gauntletUpgrades={(profile?.dons_gauntlet_upgrades as string[] | null) ?? []}
          gauntletUpgradesOff={(profile?.dons_gauntlet_upgrades_off as string[] | null) ?? []}
          confluencesSeen={(profile?.gauntlet_confluences_seen as string[] | null) ?? []}
          deepest={daily.deepest}
          deepestRun={daily.deepestRun}
          hcDeepestRun={daily.hcDeepestRun}
          fathoms={daily.fathoms}
          available={daily.available}
          nextAt={daily.nextAt}
          resumeState={daily.resumeState}
          resumePaused={daily.resumePaused}
          // Slice-0 stub: skip the (Davy-themed) intro on the Don's route; its own
          // intro + hero art come with the theme slice.
          hasSeenIntro={true}
          topDescender={null}
          // Hardcore is a Don's fast-follow — off for now.
          hardcoreUnlocked={false}
          hardcoreLive={false}
          hcDeepest={0}
          hcRunsLeft={0}
          hardcoreTop={null}
          runHardcore={daily.runHardcore}
          runTerms={daily.runTerms}
          bloodGems={(profile?.blood_gems as number | null) ?? 0}
        />
      </div>
    </main>
  )
}
