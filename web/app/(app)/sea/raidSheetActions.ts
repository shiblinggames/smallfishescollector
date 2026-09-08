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

  // NOTHING REFUSES A FIGHT HERE ANY MORE. A sunk ship used to owe a repair
  // fee and this returned an error until it was paid. Going down costs the sail
  // back from the Gunwharf now — see the note in raids/actions.
  return { ...stats, expeditionXP: profile?.expedition_xp ?? 0 }
}
