// THE OCEAN HUB — admin only.
//
// The ocean IS the hub: a painted chart you sail across, with the Mainland
// (tavern, market, shops) as one stop on it rather than the front door. Ports
// you go ashore at, waters you fish. See chart.ts for the layout and SeaMap.tsx
// for why it is painted 2D rather than an engine.
//
// ADMIN ONLY while it finds its feet, the same way Chapter 4 shipped. It is not
// the landing page yet and should not become one until it has been lived with.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { buildClearedSet } from '@/lib/raidProgress'
import { canSail } from '@/lib/seaAccess'
import { loadDeployedParty } from '@/lib/crewData'
import { seaMapProps, raidSeatsFor, isFirstRun } from '@/lib/core/seaPage'
import SeaMap from './SeaMap'
import { dealtToday } from './traderActions'
import { getDiscoveries } from './isleActions'
import { getDigState } from './digActions'
import { hasAcceptedPact } from './pactActions'
import { getHomestead } from '../home/actions'
import { getCachedFishSpecies } from '@/lib/fishSpecies'
import { getTrawlState } from '../fishing/trawls/actions'
import { getRenownState } from '../actions/renown'

export const metadata = { title: 'The Sea' }

export default async function SeaPage({ searchParams }: {
  /** `?open=crew&card=…` — the retired /crew route's landing, so a link that
   *  used to be a page still opens the room it named. See
   *  app/(app)/crew/page.tsx. */
  searchParams: Promise<{ open?: string; card?: string; boss?: string }>
}) {
  const { open: openDoor, card: openCard, boss: openBoss } = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  // ONE RULE FOR ALL FOUR SEA ROUTES. See lib/seaAccess: this used to be a
  // copy of `is_admin !== true` in each of them, which is four chances to
  // open three and forget the fourth.
  if (!canSail(profile)) redirect('/tavern')

  const admin = createAdminClient()
  // The campaign's progress, for the straits out in the raid water.
  const clearedNodes = await buildClearedSet(admin, user.id, profile ?? {})

  // ── EVERYTHING, AT ONCE ───────────────────────────────────────────────
  //
  // These were ten separate awaits, one under the other, each a full roundtrip
  // to the database — the page could not start rendering until the last of a
  // chain of eight-to-ten serial queries came home, none of which needed any
  // other's answer. At 20-50ms a hop that was 200-500ms of TTFB spent on
  // nothing but waiting in single file.
  //
  // Every read here is independent per-user state. Species come from the
  // long-TTL cross-request cache, not a per-view query — this page is as hot as
  // the fishing screen.
  const [
    allSpecies, { data: collectionRows }, { data: pbRows }, raidPartyRows,
    { data: baitRows }, dealt, discovered, digs, homestead, renown, renownNav, trawlState,
    { data: finaleRow }, { data: holdRows }, hasPact, { data: rodRows },
  ] = await Promise.all([
    getCachedFishSpecies(),
    admin.from('fish_collection').select('fish_id, is_golden').eq('user_id', user.id),
    admin.from('fish_personal_bests').select('fish_id, best_length_in').eq('user_id', user.id),
    // WHO WOULD ACTUALLY SAIL. The dock is where the crew is CONFIRMED, so it
    // gets the party itself — faces and names, not a count. Same loader every
    // raid uses, so what the dock shows is exactly what would board.
    loadDeployedParty(admin, user.id, raidSeatsFor(profile), 'raid'),
    admin.from('bait_inventory').select('bait_type, quantity').eq('user_id', user.id),
    dealtToday(),
    getDiscoveries(),
    getDigState(),
    getHomestead(),
    getRenownState('fishing'),
    // AND THE OTHER SPINE'S. The expedition side has its own panel and its own
    // points, and a captain out there should not have to sail home to spend
    // them. Read together, one round trip.
    getRenownState('nav'),
    getTrawlState(),
    // THE LONG VIGIL's gate, for the collection log's Ancient Deep block.
    admin.from('raid_completions').select('id').eq('user_id', user.id).eq('raid_id', 'the_sunken_hand').limit(1).maybeSingle(),
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id),
    // ONE ROW, AND IT DECIDES A HUNDRED AND EIGHTY SERVER ACTIONS AN HOUR.
    // Whether anybody could be on the water for you at all — see the poll
    // in SeaMap, which was asking that question every twenty seconds for the
    // life of the tab regardless of the answer. Free here: this batch is
    // already in flight and waits on its slowest member.
    hasAcceptedPact(),
    // EVERY ROD YOU OWN SAILS WITH YOU (see lib/shipyard for why the rack went).
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id),
  ])

  /**
   * ── NO SEA UNTIL THERE IS A CAPTAIN ────────────────────────────────────
   *
   * Setup and the welcome hang off the app shell, so they open OVER whatever
   * page the session lands on -- and the session lands here. The chart used
   * to mount underneath them, which was three bugs at once: Doby spoke to a
   * captain who had not picked a name, the heartbeat wrote a position for a
   * boat nobody had launched, and the character on the water was drawn in the
   * default colour because the one they were choosing did not exist yet.
   *
   * So there is no chart. A dark field holds the screen behind the modals and
   * the sea is not built at all until they are through; the welcome finishes
   * with a full reload of this route, which reads the profile fresh -- name,
   * colour, avatar, all of it -- and mounts the chart once, correctly.
   */
  if (isFirstRun(profile)) return <div aria-hidden style={{ position: 'fixed', inset: 0, background: '#0b1a24' }} />

  /**
   * ── AND A CAPTAIN WHO HAS NEVER SAILED STARTS AT HOME ──────────────────
   *
   * Not `has_seen_setup`: that closes the moment the welcome does, and the
   * very next read of this row is the one that places the boat. A second
   * session on the same account -- an old tab, another device -- writing its
   * own position every few seconds wins that read every time, which is how a
   * freshly reset account came up in its warship beside the Crew Hall, twice,
   * after two resets that had both put the row right.
   *
   * The first voyage's own step is the honest signal. It is written by the
   * tour and by nothing else, so until the captain has taken beat one they
   * have never been anywhere, and a position on their row is not theirs to
   * resume. Past beat one, the row is trusted. (Applied in lib/core/seaPage,
   * with every other prop; the props are shaped there so the desktop build
   * shapes them the same way.)
   */
  const props = seaMapProps({
    uid: user.id,
    profile,
    clearedNodes,
    species: allSpecies ?? [],
    collection: (collectionRows ?? []) as { fish_id: number; is_golden: boolean | null }[],
    bests: (pbRows ?? []) as { fish_id: number; best_length_in: number }[],
    party: raidPartyRows,
    bait: (baitRows ?? []) as { bait_type: string; quantity: number }[],
    dealt, discovered, digs, homestead, renown, renownNav, trawlState,
    finaleCleared: !!finaleRow,
    holdCount: ((holdRows ?? []) as { quantity: number }[]).reduce((n, r) => n + (r.quantity ?? 0), 0),
    hasPact,
    rodTiers: (rodRows ?? []).map(r => Number(r.rod_tier)),
  }, { open: openDoor, card: openCard, boss: openBoss })

  return <SeaMap {...props} />
}
