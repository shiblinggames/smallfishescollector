'use server'

// ── EVERYTHING YOUR CREW IS DOING, IN ONE READ ──────────────────────────────
//
// The crew is spread across four surfaces — the hall assigns them, the trawl
// docks send them fishing, the voyage board sails them, and the sea gate takes
// them into a raid — and there has never been one place that answers "where is
// everybody". You had to visit all four and hold the answer in your head.
//
// WHY IT IS ITS OWN READ AND NOT `getCrewState`. That one is the crew SCREEN's
// loader: it fills the daily recruit board as a side effect, loads every card,
// resolves skins and computes reroll odds. This is a glance from the deck. It
// reads who is on the roster and what they are busy with, and it writes
// nothing.
//
// AND THE RECRUIT COUNT IS DELIBERATELY NOT A BOARD FILL. If today's board has
// not been rolled the rows do not exist, and rolling them from here would mean
// a glance at the chart quietly spending a guaranteed-legendary token the
// player never chose to use — see the note on `crew_next_roll_legendary_slug`
// in getCrewState. So an unrolled day reports the size of the board it WOULD
// roll, and the crew screen still owns the roll itself.

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { seaCrewData } from '@/lib/data/voyageData'
import * as core from '@/lib/core/voyages'

export type HubCrew = import('@/lib/core/voyages').HubCrew
export type CrewHubState = import('@/lib/core/voyages').CrewHubState

export async function crewHub(): Promise<CrewHubState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  return core.crewHub(seaCrewData(createAdminClient()), user.id)
}
