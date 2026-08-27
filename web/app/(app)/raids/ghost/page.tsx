// The Quartermaster's Ghost — Chapter IV's FARM node. A boss-only duel that can be
// run as often as you like, and the only source of the six either/or Cache items
// once the campaign has moved on. He is what stops the forge from stranding you:
// fusing is destructive, so a Cache pick burned into a cannon is gone from
// raid_items for good, and the Cache itself only ever let you choose once.
//
// ADMIN-ONLY until the Last Fathom launches (drop this guard with the map's
// adminOnly flags together, per the Ch3 playbook).

import { redirect } from 'next/navigation'
import RaidGame from '../RaidGame'
import { getRaidPlayerStats } from '../actions'
import { THE_QUARTERMASTERS_GHOST } from '@/lib/bossRaids'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function QuartermastersGhostRaidPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [profile, stats] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
  ])

  if ((profile?.raid_repair_owed ?? 0) > 0) redirect('/expeditions')

  // The ghost's own gate, enforced here and not only in the map: he will not deal
  // until you have put him down ALIVE, in his challenge run. The node carries the
  // same requiresClearedNode, but the route is reachable by typing the URL.
  //
  // .limit(1) IS LOAD-BEARING. raid_completions is an append-only log with a row
  // per clear, and maybeSingle() ERRORS when more than one row comes back rather
  // than returning the first. So beating the challenge a SECOND time turned this
  // gate against the player: data came back null, and the boss they had already
  // farmed started bouncing them to /expeditions. Two captains hit it, and both
  // stopped dead on the exact day of their second challenge clear.
  const admin = createAdminClient()
  const { data: beatenAlive } = await admin
    .from('raid_completions')
    .select('id')
    .eq('user_id', user.id)
    .eq('raid_id', 'the_quartermaster_challenge')
    .limit(1)
    .maybeSingle()
  if (!beatenAlive) redirect('/expeditions')

  return (
    <>
      <main className="min-h-screen pt-6">
        <div className="page-col pb-12">
          <RaidGame
            config={THE_QUARTERMASTERS_GHOST}
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
