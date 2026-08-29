import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { isPremiumActive } from '@/lib/premium'
import TideRunCard from './TideRunCard'
import DailyBonusCard from './DailyBonusCard'
import ContestsHubCard from './ContestsHubCard'
import TavernLeaderboardsCard from './TavernLeaderboardsCard'
import WelcomeModal from './WelcomeModal'
import SetupModal from './SetupModal'
import SupportStudioCard from '@/components/SupportStudioCard'
import { CHARACTER_COLORS } from '@/lib/characters'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { SkeletonBox } from '@/components/Skeleton'
import { kingWeekStr } from './trivia/constants'

// Same streaming pattern as /expeditions: shell + Nav paint as soon as
// profile arrives, then each card-group section streams in via its own
// Suspense boundary. Charting moved off the home into The Chart Room
// (2026-06-13), so the old conditional Charting section is gone.

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
        <div className="page-col pt-6 pb-16 flex flex-col gap-6" style={{ position: 'relative', zIndex: 1 }}>

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

          {/* WHAT THE TAVERN IS NOW. The day's tot and whatever race is
              running: the two things that are about turning up rather than
              about a room you go into. Everything else that used to be listed
              here is a building on the island. */}
          <div>
            <FeaturesSection dailyClaimed={dailyClaimed} contestsUnseen={profile?.has_seen_contests !== true} />
          </div>

          {/* See GamesSection: Tide Run alone, because this is the only door
              it has. */}
          <div>
            <GamesSection />
          </div>

          {/* The Chart Room and the Parlor were here. Both are their own
              buildings in the Mainland town now and open off the water like
              every other door, so listing them again would put them two deep
              behind a tavern nobody has to walk through. */}

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


