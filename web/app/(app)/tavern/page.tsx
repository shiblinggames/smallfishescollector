import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isPremiumActive } from '@/lib/premium'
import TideRunCard from './TideRunCard'
import DailyBonusCard from './DailyBonusCard'
import TriviaHubCard from './TriviaHubCard'
import ChartRoomHubCard from './ChartRoomHubCard'
import ContestsHubCard from './ContestsHubCard'
import CasinoHubCard from './CasinoHubCard'
import TavernLeaderboardsCard from './TavernLeaderboardsCard'
import WelcomeModal from './WelcomeModal'
import SetupModal from './SetupModal'
import SupportStudioCard from '@/components/SupportStudioCard'
import { CHARACTER_COLORS } from '@/lib/characters'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { SkeletonBox } from '@/components/Skeleton'
import { kingWeekStr } from './trivia/constants'
import { getCasinoState } from './casino/actions'

// Same streaming pattern as /expeditions: shell + Nav paint as soon as
// profile arrives, then each card-group section streams in via its own
// Suspense boundary. Charting moved off the home into The Chart Room
// (2026-06-13), so the old conditional Charting section is gone.

// ── Sections ────────────────────────────────────────────────────────────────

function GamesSection() {
  // The Den + Tide Run share this row (layout reshuffle 2026-06-18: Tide Run
  // took the Parlor's old slot; the Parlor moved down to the Charting row).
  // The Den's daily-cap state streams in (DenCard) so the card paints
  // immediately and the reset timer pops in once the buy-in total resolves.
  return (
    <div className="grid grid-cols-2 gap-3">
      <Suspense fallback={<CasinoHubCard />}>
        <DenCard />
      </Suspense>
      <TideRunCard />
    </div>
  )
}

// Async: reads today's buy-in total vs the cap so the card can show a reset
// timer once the player has hit the Den's daily limit.
async function DenCard() {
  const state = await getCasinoState()
  return <CasinoHubCard capped={state.dailyRemaining <= 0} />
}

// Top-of-page features grid: Login Bonus + Contests (Contests took Tide Run's
// old slot here on 2026-06-18).
function FeaturesSection({ dailyClaimed, contestsUnseen }: { dailyClaimed: boolean; contestsUnseen: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DailyBonusCard claimed={dailyClaimed} />
      <ContestsHubCard hasNew={contestsUnseen} />
    </div>
  )
}

export default async function TavernPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()

  const freeColorIds = CHARACTER_COLORS.filter(c => c.free).map(c => c.id)
  const unlockedColors = [...freeColorIds, ...((profile?.unlocked_character_colors as string[] | null) ?? [])]

  // Login Bonus card shows a reset timer once the player has claimed everything
  // available right now: today's gems + bait AND this week's crate. The soonest
  // thing to return is the daily gems/bait (UTC midnight), so it's a daily timer.
  const today = new Date().toISOString().split('T')[0]
  const dailyClaimed =
    profile?.last_daily_claim === today &&
    profile?.last_worm_claim === today &&
    profile?.last_crate_claim_week === kingWeekStr()

  return (
    <>
      {!profile?.has_seen_setup
        ? <SetupModal
            currentColor={profile?.character_color ?? 'default'}
            unlockedColors={unlockedColors}
            showWelcomeAfter={!profile?.has_seen_welcome}
            // New accounts get an auto-assigned default username, so `username`
            // is always set — gate the setup step on whether they've actually
            // CHOSEN one (username_changed), matching updateUsername's one-time lock.
            hasUsername={!!profile?.username_changed}
            isPremium={isPremiumActive(profile)}
          />
        : !profile?.has_seen_welcome
          ? <WelcomeModal />
          : null
      }
      <main className="min-h-screen">
        {/* max-w-2xl, not lg. This page is two-column tile GRIDS, and lg
            (512px) crammed each tile to ~240px — phone size, centered in a
            desert of margin on any monitor. At 2xl the tiles sit around 320px,
            which is what their art was made for. List-shaped pages keep the
            narrower column; grids are the pages that can actually use width. */}
        <div className="px-4 max-w-lg sm:max-w-2xl mx-auto pt-6 pb-16 flex flex-col gap-6" style={{ position: 'relative', zIndex: 1 }}>

          {/* Thin Leaderboards bar — sits at the very top as a slim
              one-line ticker rotating through the top holder of each
              board. No icon, fixed 44px height, doesn't flex with
              content. Lightweight social proof without stealing
              attention from the cards below. */}
          <Suspense fallback={<SkeletonBox height={44} radius={14} />}>
            <TavernLeaderboardsCard />
          </Suspense>

          {/* The fish-price ticker used to sit here. It moved to the top of
              the fishing hub: prices decide what a haul is worth and when to
              sell it, which is a fishing concern, and the Tavern is where you
              come to gamble rather than to check the board. */}

          {/* Featured — Daily Bonus + Tide Run as standard compact
              cards. Daily Bonus took Recruit Crew's slot here on
              2026-06-11. */}
          <div>
            <FeaturesSection dailyClaimed={dailyClaimed} contestsUnseen={profile?.has_seen_contests !== true} />
          </div>

          {/* Games — the Den + the Parlor, one door each into their
              multi-game rooms. Header dropped 2026-06-13 (it was the last
              section label left and the cards read fine unlabeled). */}
          <div>
            <GamesSection />
          </div>

          {/* The Chart Room + Contests share a row — both are destination
              doors. Bottom row = Charting (puzzles) + the Parlor (trivia games)
              after the 2026-06-18 reshuffle. */}
          <div className="grid grid-cols-2 gap-3">
            <ChartRoomHubCard />
            <TriviaHubCard />
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
    </>
  )
}


