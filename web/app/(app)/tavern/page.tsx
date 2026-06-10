import { Suspense, cache } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getChartState } from '@/app/(app)/charting/chartActions'
import { getSlotsJackpot } from './actions'
import { isPremiumActive } from '@/lib/premium'
import TideRunCard from './TideRunCard'
import DailyBonusCard from './DailyBonusCard'
import FishOfTheDayCard from './FishOfTheDayCard'
import ChartTheCourseCard from './ChartTheCourseCard'
import RecruitCrewCard from './RecruitCrewCard'
import BlackjackHubCard from './BlackjackHubCard'
import FishSlotsCard from './FishSlotsCard'
import RouletteHubCard from './RouletteHubCard'
import TavernLeaderboardsCard from './TavernLeaderboardsCard'
import WelcomeModal from './WelcomeModal'
import SetupModal from './SetupModal'
import { CHARACTER_COLORS } from '@/lib/characters'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { SkeletonBox } from '@/components/Skeleton'

// Same streaming pattern as /expeditions: shell + Nav paint as soon as
// profile arrives, then each card-group section streams in via its own
// Suspense boundary. chartState gates whether the Charting card mounts
// at all — it sits in its own bottom-row section now, not folded into
// Daily, since it's a rare conditional surface and the player's eye
// shouldn't have to learn 'Daily has 3 cards sometimes / 2 cards
// other times'.
const cachedChartState = cache(() => getChartState())

// ── Sections ────────────────────────────────────────────────────────────────

function DailySection() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <DailyBonusCard />
      <FishOfTheDayCard />
    </div>
  )
}

async function ChartingSection() {
  const chartState = await cachedChartState()
  const hasChart = chartState && !('error' in chartState)
  if (!hasChart) return null
  // Single full-width hero card on its own row — no section heading
  // since the card's own 'Charting' title carries the label.
  return <ChartTheCourseCard />
}

// Top-of-page features grid: Recruit Crew + Tide Run sit alongside each
// other as standard compact cards. Used to be hero banners; demoted to
// regular cards on 2026-05-27 to free vertical space — the thin
// Leaderboards bar above does the social-proof heavy lifting now.
function FeaturesSection() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <RecruitCrewCard />
      <TideRunCard />
    </div>
  )
}

async function ArcadeSection({ isAdmin }: { isAdmin: boolean }) {
  // Fish Roulette is admin-only for now — the game is functional but we
  // want a final balance pass + tap-test on the smallest split tap zones
  // before it goes live to all players. Non-admins see the original
  // 2-card row (Blackjack + Slots) so the section looks intentional.
  // The slots card shows the live Catfish Jackpot pot as a pull.
  const jackpot = await getSlotsJackpot()
  if (isAdmin) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <BlackjackHubCard />
        <FishSlotsCard jackpotPot={jackpot.pot} />
        <RouletteHubCard />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <BlackjackHubCard />
      <FishSlotsCard jackpotPot={jackpot.pot} />
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
            hasUsername={!!profile?.username}
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

          {/* Featured — Recruit Crew + Tide Run as standard compact
              cards (same size as Daily/Arcade rows). Used to be
              hero banners; demoted on 2026-05-27 in favor of more
              compact pulls. */}
          <div>
            <FeaturesSection />
          </div>

          {/* Daily — true daily rituals only (login claims). */}
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#8a8784] mb-3" style={{ fontSize: '0.72rem' }}>Daily</p>
            <Suspense fallback={<DailyCardsSkeleton />}>
              <DailySection />
            </Suspense>
          </div>

          {/* Arcade — anytime-play, hiscore-driven games. ArcadeSection
              receives is_admin so Fish Roulette only shows up to admins
              while it's being tap-tested in prod. */}
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#8a8784] mb-3" style={{ fontSize: '0.72rem' }}>Arcade</p>
            <Suspense fallback={<ArcadeCardsSkeleton />}>
              <ArcadeSection isAdmin={!!profile?.is_admin} />
            </Suspense>
          </div>

          {/* Charting — single full-width hero card, only renders when
              the player has an active chart in progress. Sits at the
              bottom of the hub (above the footer) because it's a rare
              conditional and shouldn't crowd the primary rows above. */}
          <Suspense fallback={null}>
            <ChartingSection />
          </Suspense>

          <div className="text-center" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.75rem' }}>
              Enjoying the game?{' '}
              <Link href="/marketplace" className="text-[#f0c040] hover:text-[#f5d060] transition-colors">
                Support our indie studio with a membership →
              </Link>
            </p>
            <p className="font-karla text-[#4a4845]" style={{ fontSize: '0.72rem' }}>
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

// ── Skeletons matching each section's card grid shape ──────────────────────

function DailyCardsSkeleton() {
  // Always 2 cards (Daily Bonus + Fish of the Day). Charting moved
  // to its own bottom-row section on 2026-06-07.
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1].map(i => <SkeletonBox key={i} height={132} radius={14} />)}
    </div>
  )
}

function ArcadeCardsSkeleton() {
  // 2 cards (Crown & Anchor + Fish Slots).
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1].map(i => <SkeletonBox key={i} height={132} radius={14} />)}
    </div>
  )
}

