import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isPremiumActive } from '@/lib/premium'
import TideRunCard from './TideRunCard'
import DailyBonusCard from './DailyBonusCard'
import ContestsHubCard from './ContestsHubCard'
import TavernLeaderboardsCard from './TavernLeaderboardsCard'
import Gossip from './Gossip'
import Group from './Group'
import CrewDigest from './CrewDigest'
import SaltRoadDigest from './SaltRoadDigest'
import SupportStudioCard from '@/components/SupportStudioCard'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { SkeletonBox } from '@/components/Skeleton'
import { kingWeekStr } from './trivia/constants'

/**
 * ── THE TAVERN IS THE SOCIAL ROOM ───────────────────────────────────────────
 *
 * It spent a long while as a lobby and then as a cupboard. The Den, the Chart
 * Room, the Parlor and the Market all became buildings in the Mainland town
 * that open straight off the water, and the sea took the startup slot, so what
 * was left in here was a ticker, a login bonus, a contests card and one arcade
 * game that was only here because it had nowhere else to go. A leftovers page,
 * holding one of four tabs on a phone.
 *
 * The tavern is the only building whose fiction IS a room with other people in
 * it, and social was the most scattered system in the game: the follow list on
 * its own page behind a menu, sailing pacts in a panel on the chart, standing
 * with the regulars in a different panel on the chart, contests a card in here,
 * profiles somewhere else again.
 *
 * ── FOUR GROUPS, AND NONE OF THEM IS A LIST ─────────────────────────────────
 *
 * The first cut of this page was five unlabelled cards stacked at the same
 * visual weight, two of which were full lists — every captain you follow, and
 * the whole pact board. That is not a room, it is a filing cabinet with a
 * fireplace, and nothing on it told you which parts belonged together.
 *
 * So: titled groups, and each one says how things STAND with a way through to
 * where they are managed.
 *
 *   OVERHEARD     the room talking. Half of it is a hint, half is just talk
 *   YOUR CREW     counts, faces, anyone waiting on an answer → /social
 *   THE SALT ROAD where you stand with the nine, read-only
 *   THE DAY       the tot, the races, the free game
 *
 * The order is the argument: the room first, then who you know, then who knows
 * you, and then the things you collect on the way past. Anything that resets is
 * LAST, because it is not the reason to come.
 *
 * OVERHEARD REPLACED A PRESENCE WALL that named the captains currently at sea.
 * It worked and it was thin: on a small roster it was usually empty, and even
 * full it only said that other people existed. Gossip is the same job done
 * properly. It is never empty, it carries most of what this game never gets
 * round to telling anybody, and it is the only thing on the page that makes the
 * tavern sound like it has other people in it. See lib/tavernGossip.
 */

export default async function TavernPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()

  // Login Bonus card shows a reset timer once the player has claimed everything
  // available right now: today's gems + bait AND this week's crate. The soonest
  // thing to return is the daily gems/bait (UTC midnight), so it's a daily timer.
  const today = new Date().toISOString().split('T')[0]
  const dailyClaimed =
    profile?.last_daily_claim === today &&
    profile?.last_worm_claim === today &&
    profile?.last_crate_claim_week === kingWeekStr()

  return (
    <main className="min-h-screen">
      {/* The setup and welcome modals used to be mounted here, on the reasoning
          that this was the page a new captain landed on. It is not any more —
          they hang off the app shell now, so they fire wherever the session
          opens. See app/(app)/layout.tsx. */}
      <div className="page-col pt-6 pb-16 flex flex-col gap-4" style={{ position: 'relative', zIndex: 1 }}>

        {/* Ungrouped ON PURPOSE, and the only thing that is. A one-line ticker
            of who holds each board is the room's background noise rather than
            one of its parts — giving it a heading would make it a fifth thing
            to read. */}
        <Suspense fallback={<SkeletonBox height={44} radius={14} />}>
          <TavernLeaderboardsCard />
        </Suspense>

        {/* ── THE ROOM TALKING ── */}
        <Gossip />

        {/* ── WHO YOU KNOW ── a digest. The list is /social. */}
        <Suspense fallback={<SkeletonBox height={132} radius={16} />}>
          <CrewDigest />
        </Suspense>

        {/* ── WHO KNOWS YOU ── the nine regulars, read-only: talking to them
            happens on the water. */}
        <Suspense fallback={<SkeletonBox height={188} radius={16} />}>
          <SaltRoadDigest />
        </Suspense>

        {/* ── WHAT RESETS ── grouped, and last. Three cards that used to float
            free at the same weight as everything above them; they have one
            thing in common (they come back tomorrow) and now they say so. */}
        <Group title="The day">
          <div className="grid grid-cols-2 gap-3">
            <DailyBonusCard claimed={dailyClaimed} />
            <ContestsHubCard hasNew={profile?.has_seen_contests !== true} />
          </div>
          {/* TIDE RUN, HERE, ON PURPOSE. It is not a chip game — the Den's
              tables are blackjack, roulette and slots, and its wallet and daily
              cap are all about buy-ins — so filing it under the Den would put a
              free arcade run behind a gambling door. This is its only entrance,
              and an orphaned minigame is worse than a slightly wider group. */}
          <div style={{ marginTop: 12 }}>
            <TideRunCard />
          </div>
        </Group>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          <SupportStudioCard isPremium={isPremiumActive(profile)} />
          <p className="font-karla text-[#4a4845] text-center" style={{ fontSize: '0.72rem' }}>
            Questions or feedback?{' '}
            <Link href="/contact" className="text-[#6a6764] hover:text-[#9a9488] transition-colors" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Contact us
            </Link>
          </p>
          <p className="font-karla text-[#4a4845] text-center" style={{ fontSize: '0.72rem', marginTop: -6 }}>
            <a href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game" target="_blank" rel="noopener noreferrer" className="text-[#6a6764] hover:text-[#9a9488] transition-colors" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>
              Get the tabletop card game →
            </a>
          </p>
        </div>

      </div>
    </main>
  )
}
