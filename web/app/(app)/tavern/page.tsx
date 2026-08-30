import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isPremiumActive } from '@/lib/premium'
import TideRunCard from './TideRunCard'
import DailyBonusCard from './DailyBonusCard'
import ContestsHubCard from './ContestsHubCard'
import TavernLeaderboardsCard from './TavernLeaderboardsCard'
import TheRoom from './TheRoom'
import PactBoard from '@/components/PactBoard'
import SocialClient from '../social/SocialClient'
import { getCrew, getNewFollowers, type CrewMember } from '../social/actions'
import SupportStudioCard from '@/components/SupportStudioCard'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { SkeletonBox } from '@/components/Skeleton'
import { kingWeekStr } from './trivia/constants'

/**
 * ── THE TAVERN IS THE SOCIAL ROOM ───────────────────────────────────────────
 *
 * It spent a long while as a lobby and then as a cupboard. The Den, the Chart
 * Room, the Parlor and the Market all became buildings in the Mainland town
 * that open straight off the water, and the sea took the startup slot, so what
 * was left in here was a leaderboard ticker, a login bonus, a contests card and
 * one arcade game that (by its own comment) was only here because it had
 * nowhere else to go. A leftovers page, holding one of four tabs on a phone.
 *
 * ── WHY THIS AND NOT SOMETHING ELSE ─────────────────────────────────────────
 *
 * The tavern is the only building in the game whose fiction IS "a room with
 * other people in it", and social was the most scattered system in the game:
 * the follow list on its own page behind a menu, sailing pacts in a panel on
 * the chart, standing with the regulars in a different panel on the chart,
 * leaderboards a tab, contests a card in here, profiles somewhere else again.
 * Six surfaces and no room. The tavern had a room and nothing to put in it.
 *
 * It also costs the game nothing: fishing and expeditions are the pillars and
 * neither is touched.
 *
 * ── THE ORDER IS THE ARGUMENT ───────────────────────────────────────────────
 *
 * WHO IS HERE, then WHO YOU KNOW, then WHAT YOU HAVE AGREED — the room, the
 * door, the handshake. The daily tot and the day's races sit under all of it
 * because they are things you collect on the way through, not the reason the
 * room exists.
 */

// ── Sections ────────────────────────────────────────────────────────────────

function GamesSection() {
  // TIDE RUN, ALONE, AND ON PURPOSE.
  //
  // The Den used to share this row. It is its own building on the Mainland now
  // and opens straight off the water, so a second door to it here would be the
  // lobby this page has stopped being.
  //
  // Tide Run stayed because it had nowhere else to go. It is not a chip game —
  // the Den's tables are blackjack, roulette and slots, and its wallet and its
  // daily cap are all about buy-ins — so filing it under the Den would put a
  // free arcade run behind a gambling door. This page is its only entrance,
  // and an orphaned minigame is worse than a slightly wider remit.
  return (
    <div className="grid grid-cols-1 gap-3">
      <TideRunCard />
    </div>
  )
}

// Login Bonus + Contests. Both are things that reset and both are collected on
// the way past; neither is what the page is for any more, so they sit below the
// room rather than at the top of it.
function FeaturesSection({ dailyClaimed, contestsUnseen }: { dailyClaimed: boolean; contestsUnseen: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DailyBonusCard claimed={dailyClaimed} />
      <ContestsHubCard hasNew={contestsUnseen} />
    </div>
  )
}

/** The follow list, which used to be a page of its own at /social. Its own
 *  Suspense boundary because it is four queries deep and the room above it
 *  should paint first. */
async function CrewSection() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return null

  const [{ data: profile }, crew, newFollowers, { count: mySpecies }] = await Promise.all([
    supabase.from('profiles')
      .select('packs_available, gems, username, fishing_xp, expedition_xp, highest_perfect_streak, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
      .eq('id', user.id).single(),
    getCrew(),
    getNewFollowers(),
    supabase.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const me: CrewMember = {
    username:             profile?.username ?? '',
    fishingXP:            profile?.fishing_xp ?? 0,
    expeditionXP:         profile?.expedition_xp ?? 0,
    highestPerfectStreak: profile?.highest_perfect_streak ?? 0,
    species:              mySpecies ?? 0,
    characterColor:       (profile?.character_color as string | null) ?? null,
    equippedHat:          (profile?.equipped_hat as string | null) ?? null,
    avatarBg:             (profile?.avatar_bg_color as string | null) ?? null,
    avatarBorder:         (profile?.avatar_border_color as string | null) ?? null,
  }

  return (
    <SocialClient
      initialCrew={crew}
      me={me}
      username={profile?.username ?? ''}
      newFollowers={newFollowers}
    />
  )
}

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
      <div className="page-col pt-6 pb-16 flex flex-col gap-6" style={{ position: 'relative', zIndex: 1 }}>

        {/* Thin Leaderboards bar — a slim one-line ticker rotating through the
            top holder of each board. It belongs at the top of a social room in
            a way it never quite did at the top of a cupboard: it is the same
            question the rest of this page asks, which is who else is out
            there. */}
        <Suspense fallback={<SkeletonBox height={44} radius={14} />}>
          <TavernLeaderboardsCard />
        </Suspense>

        {/* ── THE ROOM ── who is on the water right now. */}
        <TheRoom />

        {/* ── WHO YOU KNOW ── the follow list, folded in from /social. */}
        <Suspense fallback={<SkeletonBox height={260} radius={16} />}>
          <CrewSection />
        </Suspense>

        {/* ── WHAT YOU HAVE AGREED ── sailing pacts, the same board the chart
            opens from the deck. Following somebody is not consent to be
            tracked, so the pact is its own step and its own section. */}
        <section style={{
          borderRadius: 16, padding: '0.9rem 1rem 1rem',
          background: 'rgba(8,14,22,0.6)',
          border: '1px solid rgba(180,214,232,0.16)',
        }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#e8f2ea', margin: 0 }}>
            Sailing crew
          </p>
          {/* An empty set: this page has no live poll of the water, and a row
              claiming somebody is "on the water" from a page that cannot know
              would be a guess. The room above is where that question is
              answered. */}
          <PactBoard atSea={new Set<string>()} />
        </section>

        <div>
          <FeaturesSection dailyClaimed={dailyClaimed} contestsUnseen={profile?.has_seen_contests !== true} />
        </div>

        {/* See GamesSection: Tide Run alone, because this is the only door
            it has. */}
        <div>
          <GamesSection />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
