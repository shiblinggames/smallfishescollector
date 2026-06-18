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

// Same streaming pattern as /expeditions: shell + Nav paint as soon as
// profile arrives, then each card-group section streams in via its own
// Suspense boundary. Charting moved off the home into The Chart Room
// (2026-06-13), so the old conditional Charting section is gone.

// ── Sections ────────────────────────────────────────────────────────────────

function GamesSection() {
  // The Den + Tide Run share this row (layout reshuffle 2026-06-18: Tide Run
  // took the Parlor's old slot; the Parlor moved down to the Charting row).
  return (
    <div className="grid grid-cols-2 gap-3">
      <CasinoHubCard />
      <TideRunCard />
    </div>
  )
}

// Top-of-page features grid: Login Bonus + Contests (Contests took Tide Run's
// old slot here on 2026-06-18).
function FeaturesSection() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DailyBonusCard />
      <ContestsHubCard />
    </div>
  )
}

export default async function TavernPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()

  const freeColorIds = CHARACTER_COLORS.filter(c => c.free).map(c => c.id)
  const unlockedColors = [...freeColorIds, ...((profile?.unlocked_character_colors as string[] | null) ?? [])]

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
        <div className="px-4 max-w-lg mx-auto pt-6 pb-16 flex flex-col gap-6" style={{ position: 'relative', zIndex: 1 }}>

          {/* Thin Leaderboards bar — sits at the very top as a slim
              one-line ticker rotating through the top holder of each
              board. No icon, fixed 44px height, doesn't flex with
              content. Lightweight social proof without stealing
              attention from the cards below. */}
          <Suspense fallback={<SkeletonBox height={44} radius={14} />}>
            <TavernLeaderboardsCard />
          </Suspense>

          {/* Featured — Daily Bonus + Tide Run as standard compact
              cards. Daily Bonus took Recruit Crew's slot here on
              2026-06-11. */}
          <div>
            <FeaturesSection />
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
          </div>

        </div>
      </main>
    </>
  )
}


