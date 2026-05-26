'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type FinnOutcome = 'won' | 'lost' | 'passed'

/** Records a Finn encounter — bumps the counter and optionally marks a story
 *  beat as seen so it never fires twice. Also clears the previous-encounter
 *  outcome (won/lost/passed) since the player has now seen Finn react to it;
 *  next encounter starts with a clean slate. Returns the new state. */
export async function recordFinnEncounter(beatId: string | null): Promise<{
  encounters: number
  wins: number
  seenBeats: string[]
  revealed: boolean
} | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  const { data: cur } = await admin
    .from('profiles')
    .select('finn_encounters, finn_wins, finn_seen_beats, finn_revealed')
    .eq('id', user.id)
    .single()

  const newEncounters = (cur?.finn_encounters ?? 0) + 1
  const seen = ((cur?.finn_seen_beats as string[] | null) ?? [])
  const newSeen = beatId && !seen.includes(beatId) ? [...seen, beatId] : seen

  await admin.from('profiles')
    .update({
      finn_encounters: newEncounters,
      finn_seen_beats: newSeen,
      finn_last_outcome: null,
    })
    .eq('id', user.id)

  return {
    encounters: newEncounters,
    wins: cur?.finn_wins ?? 0,
    seenBeats: newSeen,
    revealed: cur?.finn_revealed ?? false,
  }
}

/** Settles a Finn challenge — pays out the reward and bumps the win counter
 *  if the player won; marks the win-track beat seen if one fired with it.
 *  Stamps finn_last_outcome so the NEXT encounter can open with a callback
 *  line ("Last bet went my way..." etc). */
export async function settleFinnChallenge(
  won: boolean,
  rewardDoubloons: number,
  winBeatId: string | null,
): Promise<{
  encounters: number
  wins: number
  seenBeats: string[]
  doubloons: number
} | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  const { data: cur } = await admin
    .from('profiles')
    .select('finn_encounters, finn_wins, finn_seen_beats, doubloons')
    .eq('id', user.id)
    .single()

  const newWins  = (cur?.finn_wins ?? 0) + (won ? 1 : 0)
  const newGold  = (cur?.doubloons ?? 0) + (won ? Math.max(0, Math.floor(rewardDoubloons)) : 0)
  const seen     = ((cur?.finn_seen_beats as string[] | null) ?? [])
  const newSeen  = winBeatId && !seen.includes(winBeatId) ? [...seen, winBeatId] : seen

  await admin.from('profiles')
    .update({
      finn_wins: newWins,
      doubloons: newGold,
      finn_seen_beats: newSeen,
      finn_last_outcome: won ? 'won' : 'lost',
    })
    .eq('id', user.id)

  return {
    encounters: cur?.finn_encounters ?? 0,
    wins: newWins,
    seenBeats: newSeen,
    doubloons: newGold,
  }
}

/** Records that the player declined the offer (tapped Pass). Doesn't change
 *  counters or wins — just stamps finn_last_outcome='passed' so the next
 *  encounter can open with a "you walked away last time" callback line. */
export async function recordFinnPass(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient()
    .from('profiles')
    .update({ finn_last_outcome: 'passed' })
    .eq('id', user.id)
}

/** Marks the climax reveal as seen — flips finn_revealed so future encounters
 *  draw from the epilogue line pool and the reveal beat never fires twice. */
export async function markFinnRevealSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = createAdminClient()

  const { data: cur } = await admin
    .from('profiles')
    .select('finn_seen_beats')
    .eq('id', user.id)
    .single()

  const seen = ((cur?.finn_seen_beats as string[] | null) ?? [])
  const newSeen = seen.includes('reveal') ? seen : [...seen, 'reveal']

  await admin.from('profiles')
    .update({ finn_revealed: true, finn_seen_beats: newSeen })
    .eq('id', user.id)
}
