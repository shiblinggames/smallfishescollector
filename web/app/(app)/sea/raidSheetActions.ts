'use server'

// ── WHAT A FIGHT NEEDS TO KNOW ABOUT ITS CAPTAIN ────────────────────────────
//
// Every raid route already gathers exactly this and hands it to RaidGame. The
// sheet on the chart needs the same, so the gathering lives here and both use
// it — one loadout, however you reached the fight.
//
// `getRaidPlayerStats` is untouched and still does the work; this adds the two
// things the pages fetch alongside it (the expedition XP the bar starts at, and
// the repair debt that refuses the fight) so a caller needs one await.

import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getRaidPlayerStats } from '@/app/(app)/raids/actions'

export type RaidSheetState =
  Awaited<ReturnType<typeof getRaidPlayerStats>> & { expeditionXP: number }

export async function raidSheetState(): Promise<RaidSheetState | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: 'Not signed in.' }

  const [profile, stats] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
  ])

  // SHIP SUNK AND UNREPAIRED: no raiding until it is patched up at port. The
  // routes redirect to /expeditions for this; a sheet cannot redirect the page
  // out from under a captain who is sitting on the water, so it says so and the
  // helm keeps them where they are.
  if ((profile?.raid_repair_owed ?? 0) > 0) {
    return { error: 'She is holed below the line. Get her patched up before you take on anything.' }
  }

  return { ...stats, expeditionXP: profile?.expedition_xp ?? 0 }
}

// `redirect` is imported for parity with the routes' guard shape and is
// deliberately unused: see the note above on why a sheet must not redirect.
void redirect
