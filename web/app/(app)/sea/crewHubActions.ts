'use server'

// ── EVERYTHING YOUR CREW IS DOING, IN ONE READ ──────────────────────────────
//
// The crew is spread across four surfaces — the hall assigns them, the trawl
// docks send them fishing, the voyage board sails them, and the sortie takes
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
import { crewCapacity } from '@/lib/crewCapacity'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { ROUTE_CONFIGS } from '@/lib/voyageRoutes'
import { getCrewRoster } from '@/app/(app)/crew/actions'
import { getTrawlState } from '@/app/(app)/fishing/trawls/actions'
import { getDailyVoyageState } from '@/app/(app)/expeditions/voyageActions'
import { stintDone } from '@/lib/crewBunks'
import { DAILY_RECRUITS } from '@/lib/crewGen'

/** One crew, as the deck needs to see them: who, what they look like, and what
 *  they are busy with. Nothing about stats — this is a roll call, and the hall
 *  is still where you go to compare anybody. */
export type HubCrew = {
  id: number
  name: string
  filename: string
  rarity: number
  level: number
  /** What they are doing right now — the four groups the panel reads as. */
  /**
   * WHAT THEY ARE DOING. `bunk` is training in the Crew Hall and `hall` is
   * nothing at all — they used to be the same word, which made "In the hall"
   * mean both "at work in the building" and "idle", the two states a captain
   * most needs to tell apart.
   */
  doing: 'trawl' | 'voyage' | 'raid' | 'bunk' | 'hall'
  /** Where, for the ones who are out. */
  where: string | null
  /** When they are back, ISO. Null for anyone not on a clock. */
  backAt: string | null
  /** Out, and the clock has run down. */
  ready: boolean
}

export type CrewHubState = {
  crew: HubCrew[]
  capacity: number
  hall: { tier: number; drill: number; stores: number }
  /** How many faces are waiting on the recruit board. */
  recruitsWaiting: number
  /** The voyage that is out, or back and unread. */
  voyage: { route: string; ready: boolean } | null
}

export async function crewHub(): Promise<CrewHubState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }
  const admin = createAdminClient()

  const [{ data: prof }, roster, trawls, voyage, { data: boardRows }, { data: bunkRows }] = await Promise.all([
    admin.from('profiles')
      .select('expedition_xp, crew_hall_tier, crew_drill_level, crew_stores_level, last_free_recruit_date')
      .eq('id', user.id).single(),
    getCrewRoster(),
    getTrawlState(),
    getDailyVoyageState(),
    admin.from('daily_recruits').select('recruited').eq('user_id', user.id),
    // WHO IS TRAINING. The same table the hall's own tiles read, and the same
    // two columns: when the stint began and how long it runs. A roll call that
    // filed a hand in a bunk under "in the hall" was technically true and
    // useless — the hall is where they sleep AND where they work.
    admin.from('crew_hall_bunks').select('crew_id, since, cap_hours').eq('user_id', user.id),
  ])
  if (!prof) return { error: 'No profile.' }

  const p = prof as Record<string, unknown>
  const hall = {
    tier: Number(p.crew_hall_tier ?? 1),
    drill: Number(p.crew_drill_level ?? 1),
    stores: Number(p.crew_stores_level ?? 1),
  }

  // WHO IS ON A TRAWL, keyed by the crew's own id. The trawl state already
  // carries the whole crew row per zone, so this is a lookup rather than a
  // second query — and it means the panel can never say somebody is in the hall
  // while the docks say they are three hours out.
  const onTrawl = new Map<number, { zone: string; endsAt: string; ready: boolean }>()
  if (!('error' in trawls)) {
    for (const z of trawls.zones) {
      const t = z.trawl
      if (t?.endsAt) onTrawl.set(t.crew.id, { zone: z.label, endsAt: t.endsAt, ready: t.ready })
    }
  }

  const live = 'error' in voyage ? null : (voyage.todayVoyage ?? voyage.readyVoyage ?? null)
  const voyageReady = !('error' in voyage) && voyage.readyVoyage != null
  const atSea = new Set<number>(live?.crew_variant_ids ?? [])
  const routeName = live ? (ROUTE_CONFIGS[live.route]?.name ?? 'open water') : null

  // Bunked, with the stint's own terms so the row can carry a clock like a
  // trawl does. Keyed by crew id, same as the trawls.
  const onBunk = new Map<number, { endsAt: string; ready: boolean }>()
  for (const b of (bunkRows ?? []) as { crew_id: number; since: string; cap_hours: number }[]) {
    const cap = Number(b.cap_hours ?? 0)
    const endsAt = new Date(new Date(b.since).getTime() + cap * 3_600_000).toISOString()
    onBunk.set(Number(b.crew_id), { endsAt, ready: stintDone(b.since, Date.now(), cap) })
  }

  const crew: HubCrew[] = roster.map(c => {
    const t = onTrawl.get(c.id)
    const bunk = onBunk.get(c.id)
    // ORDER MATTERS AND IT IS NOT ARBITRARY. A trawl is where somebody
    // physically IS; a voyage slot and a raid slot are where they are BOOKED.
    // Somebody seated in the raid party and currently three hours out on a
    // trawl is, truthfully, out on the trawl, and that is what the deck needs
    // to be told.
    //
    // A BUNK RANKS WITH A TRAWL for the same reason: it is where they ARE, and
    // it holds them for the whole stint. It sits under the trawl only because
    // the two cannot both be true.
    const doing: HubCrew['doing'] = t ? 'trawl'
      : bunk ? 'bunk'
      : atSea.has(c.id) ? 'voyage'
      : c.raidSlot !== null ? 'raid'
      : c.voyageSlot !== null ? 'voyage'
      : 'hall'
    return {
      id: c.id,
      name: c.name,
      filename: c.filename,
      rarity: c.rarity,
      level: crewLevelFromXP(c.xp ?? 0),
      doing,
      where: t ? t.zone : doing === 'voyage' && atSea.has(c.id) ? routeName : null,
      backAt: t ? t.endsAt : bunk ? bunk.endsAt : null,
      ready: t ? t.ready : bunk ? bunk.ready : doing === 'voyage' && atSea.has(c.id) ? voyageReady : false,
    }
  })

  // WHAT IS WAITING TO BE RECRUITED. An unrolled day reports the size of the
  // board it would roll rather than the zero rows currently on it, because
  // "zero rows" and "nobody is available" are different facts and only one of
  // them is true.
  const today = new Date().toISOString().slice(0, 10)
  const rolledToday = String(p.last_free_recruit_date ?? '') === today
  // THREE, WHOEVER YOU ARE. It was three for a Captain and two for everybody
  // else — see the note on DAILY_RECRUITS in crew/actions.
  const recruitsWaiting = rolledToday
    ? ((boardRows ?? []) as { recruited: boolean }[]).filter(r => !r.recruited).length
    : DAILY_RECRUITS

  return {
    crew,
    capacity: crewCapacity(getLevelFromXP(Number(p.expedition_xp ?? 0)), hall.tier),
    hall,
    recruitsWaiting,
    voyage: live && routeName ? { route: routeName, ready: voyageReady } : null,
  }
}
