'use server'

// ── EVERYTHING THAT RESETS, IN ONE READ ─────────────────────────────────────
//
// Kong: the dailies are hidden. Voyages live at the Charterhouse, trawls at the
// fleet, bounties at the Posting House, the puzzles and the trivia inside the
// Tavern, and every one of them only tells you its state once you have gone to
// look. One server action, one round trip from the chart, fanning out to each
// system's OWN reader so nothing here can disagree with the sheet it opens. The
// board is built in lib/core/seaSheets from the readers handed to it here.
//
// ONE TOKEN CHECK FOR THE WHOLE BOARD: every reader takes the request-cached
// `getCurrentUser` (lib/userData), so the first caller pays and the rest are free.

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentProfile, getCurrentUser } from '@/lib/userData'
import { getDailyChallenge } from '@/app/(app)/fishing/dailyChallengeActions'
import { getDailyVoyageState } from '@/app/(app)/expeditions/voyageActions'
import { getTrawlState } from '@/app/(app)/fishing/trawls/actions'
import { getBountyBoard } from '@/app/(app)/expeditions/bountyActions'
import { getHoldState } from '@/app/(app)/tavern/chart-room/hold/actions'
import { getMatchState } from '@/app/(app)/charting/actions'
import { getMinefieldState } from '@/app/(app)/charting/minefieldActions'
import { getRiggingState } from '@/app/(app)/tavern/chart-room/rigging/actions'
import { kingWeekStr } from '@/app/(app)/tavern/trivia/constants'
import { bonusState } from '@/app/actions/dailyBonus'
import { todaysRecruits } from '@/app/(app)/crew/actions'
import { seaData } from '@/lib/data/seaData'
import { dayState as dayCore, type DayState, type DaySources } from '@/lib/core/seaSheets'

export type { DayState } from '@/lib/core/seaSheets'

export async function dayState(): Promise<DayState | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const admin = createAdminClient()
  const week = kingWeekStr()
  const src: DaySources = {
    profile: () => getCurrentProfile() as Promise<Record<string, unknown> | null>,
    orders: getDailyChallenge,
    voyage: getDailyVoyageState as DaySources['voyage'],
    trawls: getTrawlState as DaySources['trawls'],
    bounties: getBountyBoard,
    hold: getHoldState,
    match: getMatchState,
    minefield: getMinefieldState,
    rigging: getRiggingState,
    async parlorWeek() {
      const [b, l] = await Promise.all([
        admin.from('trivia_board_attempts').select('answers').eq('user_id', user.id).eq('date', week).maybeSingle(),
        admin.from('trivia_ladder_attempts').select('status').eq('user_id', user.id).eq('date', week).maybeSingle(),
      ])
      return { answers: (b.data?.answers as Record<string, { day?: string }> | null) ?? {}, ladderStatus: l.data?.status as string | undefined }
    },
    haul: bonusState,
    recruits: todaysRecruits,
  }
  return dayCore(seaData(admin), user.id, src)
}
