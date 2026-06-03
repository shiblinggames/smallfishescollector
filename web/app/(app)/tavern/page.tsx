import { Suspense, cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDailyWagered, getSlotsDailyWagered } from './actions'
import { DAILY_CAP, SLOTS_DAILY_CAP } from './constants'
import { getChartState } from '@/app/(app)/charting/chartActions'
import { isPremiumActive } from '@/lib/premium'
import GameCard from './GameCard'
import TavernLeaderboardsCard from './TavernLeaderboardsCard'
import WelcomeModal from './WelcomeModal'
import SetupModal from './SetupModal'
import { CHARACTER_COLORS } from '@/lib/characters'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { SkeletonBox } from '@/components/Skeleton'

// Same streaming pattern as /expeditions: shell + Nav paint as soon as profile
// arrives, then each card-group section streams in via its own Suspense
// boundary. Shared deps go through cache() so each section fetches what it
// needs without duplicate Supabase calls.

const cachedFotdAttempt = cache(async () => {
  const user = await getCurrentUser()
  if (!user) return null
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await admin
    .from('daily_fish_attempts')
    .select('solved, guesses')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()
  return data
})

const cachedDailyWagered = cache(() => getDailyWagered())
const cachedSlotsDailyWagered = cache(() => getSlotsDailyWagered())
const cachedChartState = cache(() => getChartState())

// ── Sections ────────────────────────────────────────────────────────────────

async function DailySection() {
  const [profile, fotdAttempt, chartState] = await Promise.all([
    getCurrentProfile(),
    cachedFotdAttempt(),
    cachedChartState(),
  ])
  const today = new Date().toISOString().split('T')[0]
  const isPremium = isPremiumActive(profile)
  const allClaimed =
    profile?.last_daily_claim === today &&
    (!isPremium || profile?.last_pack_claim === today)
  const fotdDone = !!fotdAttempt && (fotdAttempt.solved || (fotdAttempt.guesses?.length ?? 0) >= 6)

  // Chart the Course folded into Daily on 2026-05-26 — used to live in its
  // own "Contest" section. The daily-grant model (1 move per day, no stacking)
  // makes it a daily login ritual like the others, not a sprint race.
  const hasChart = chartState && !('error' in chartState)
  const chartCompleted = hasChart && !!chartState.progress.completed_at
  const chartMovesLeft = hasChart ? chartState.movesAvailable : 0

  // No statusText on cards by design — the eyebrow + title + ✓ Done badge
  // carry enough meaning, and dropping subtext makes the grid more compact.
  return (
    <div className="grid grid-cols-2 gap-3">
      <GameCard
        href="/tavern/daily-bonus"
        eyebrow="Daily"
        title="Daily Bonus"
        completed={allClaimed}
        variant="compact"
        art="/dailybonus.png"
        accent="#f0c040"
      />
      <GameCard
        href="/tavern/fish-of-the-day"
        eyebrow="Daily"
        title="Fish of the Day"
        completed={fotdDone}
        variant="compact"
        accent="#60a5fa"
        customArt={
          // FOTD teaser — a fish silhouette (real species sprite blacked
          // out) with a big red question mark over it. Reads as "what
          // fish is it today?" much better than the old generic icon.
          // Largemouth bass picked for its instantly-readable silhouette.
          <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/fish/largemouth-bass.png"
              alt=""
              style={{
                maxWidth: '92%', maxHeight: 78, objectFit: 'contain',
                filter: 'brightness(0) opacity(0.78)',
              }}
            />
            <span
              aria-hidden
              className="font-cinzel font-700"
              style={{
                position: 'absolute',
                fontSize: '3.4rem',
                lineHeight: 1,
                color: '#ef4444',
                textShadow: '0 2px 10px rgba(0,0,0,0.6), 0 0 18px rgba(239,68,68,0.45)',
                pointerEvents: 'none',
                marginTop: 4,
              }}
            >?</span>
          </div>
        }
      />
      {hasChart && (() => {
        const dailyDone = chartCompleted || chartMovesLeft === 0
        return (
          <GameCard
            href="/charting"
            eyebrow="Daily"
            title="Chart the Course"
            completed={dailyDone}
            variant="compact"
            art="/chartthecourse.png"
            accent="#f0c040"
          />
        )
      })()}
    </div>
  )
}

// Top-of-page features grid: Recruit Crew + Tide Run sit alongside each
// other as standard compact cards. Used to be hero banners; demoted to
// regular cards on 2026-05-27 to free vertical space — the thin
// Leaderboards bar above does the social-proof heavy lifting now.
function FeaturesSection() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <GameCard
        href="/packs"
        eyebrow="Crew"
        title="Recruit Crew"
        variant="compact"
        art="/recruitcrew.png"
        accent="#c8a870"
      />
      <GameCard
        href="/tavern/tide-run"
        eyebrow="Featured"
        title="Tide Run"
        variant="compact"
        art="/boatrun.png"
        artMaxHeight={68}
        accent="#5da7d4"
      />
    </div>
  )
}

async function ArcadeSection() {
  const [dailyWagered, slotsDailyWagered] = await Promise.all([
    cachedDailyWagered(),
    cachedSlotsDailyWagered(),
  ])
  const crownCapReached = dailyWagered >= DAILY_CAP
  const slotsCapReached = slotsDailyWagered >= SLOTS_DAILY_CAP
  return (
    <div className="grid grid-cols-2 gap-3">
      <GameCard
        href="/tavern/crown-and-anchor"
        eyebrow="Arcade"
        title="Crown & Anchor"
        completed={crownCapReached}
        variant="compact"
        art="/crownandanchor.png"
        accent="#fb923c"
      />
      <GameCard
        href="/tavern/slots"
        eyebrow="Arcade"
        title="Fish Slots"
        completed={slotsCapReached}
        variant="compact"
        art="/fishslots.png"
        accent="#a78bfa"
      />
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

          {/* Arcade — anytime-play, hiscore-driven games. */}
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#8a8784] mb-3" style={{ fontSize: '0.72rem' }}>Arcade</p>
            <Suspense fallback={<ArcadeCardsSkeleton />}>
              <ArcadeSection />
            </Suspense>
          </div>

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
  // 2 cards minimum (Daily Bonus, FotD); Chart the Course shows as a
  // third card when an active chart exists. Reserve 2 cells so the
  // shell doesn't jump on warm renders.
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

