import { Suspense, cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDailyWagered, getSlotsDailyWagered } from './actions'
import { DAILY_CAP, SLOTS_DAILY_CAP } from './constants'
import { getChartState } from '@/app/(app)/charting/chartActions'
import { isPremiumActive } from '@/lib/premium'
import GameCard from './GameCard'
import RecruitCard from './RecruitCard'
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
  const [profile, fotdAttempt] = await Promise.all([
    getCurrentProfile(),
    cachedFotdAttempt(),
  ])
  const today = new Date().toISOString().split('T')[0]
  const isPremium = isPremiumActive(profile)
  const baseAmount = isPremium ? 100 : 50
  const allClaimed =
    profile?.last_daily_claim === today &&
    (!isPremium || profile?.last_pack_claim === today)
  const fotdDone = !!fotdAttempt && (fotdAttempt.solved || (fotdAttempt.guesses?.length ?? 0) >= 6)
  const tideRunCommitted = profile?.tide_run_committed_date === today

  return (
    <div className="grid grid-cols-2 gap-3">
      <GameCard
        href="/tavern/daily-bonus"
        eyebrow="Daily"
        title="Daily Bonus"
        statusText={allClaimed ? 'Come back tomorrow' : `${baseAmount} ⟡ available`}
        info={[]}
        icon={<CoinIcon />}
        completed={allClaimed}
        variant="compact"
        art="/dailybonus.png"
        accent="#f0c040"
      />
      <GameCard
        href="/tavern/fish-of-the-day"
        eyebrow="Daily"
        title="Fish of the Day"
        statusText={fotdDone ? 'Come back tomorrow' : 'Guess the mystery fish'}
        info={[]}
        icon={<FishIcon />}
        completed={fotdDone}
        streak={profile?.fotd_streak ?? 0}
        variant="compact"
        art="/fishoftheday.png"
        accent="#60a5fa"
      />
      <GameCard
        href="/tavern/tide-run"
        eyebrow="Daily"
        title="Tide Run"
        statusText={tideRunCommitted ? 'Today’s run committed — play freely' : 'Outrun pursuit, commit one run a day'}
        info={[]}
        icon={<BoatIcon />}
        variant="compact"
        art="/boatrun.png"
        artMaxHeight={68}
        accent="#5da7d4"
      />
    </div>
  )
}

async function ContestSection() {
  const chartState = await cachedChartState()
  const hasContest = chartState && !('error' in chartState)
  if (!hasContest) return null // no active contest → render nothing
  const chartCompleted = !!chartState.progress.completed_at
  const chartTilesCharted = chartState.progress.path_index
  const chartPathLength = chartState.pathLength
  const chartMovesLeft = chartState.movesAvailable
  return (
    <div>
      <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#8a8784] mb-3" style={{ fontSize: '0.72rem' }}>Contest</p>
      <GameCard
        href="/charting"
        eyebrow="Contest"
        title="Chart the Course"
        statusText={
          chartCompleted ? 'Voyage complete ✓' :
          chartTilesCharted > 0 ? `${chartTilesCharted} / ${chartPathLength} tiles · ${chartMovesLeft} move${chartMovesLeft === 1 ? '' : 's'} left` :
          chartMovesLeft > 0 ? `${chartMovesLeft} move${chartMovesLeft === 1 ? '' : 's'} available` :
          'Chart a path from sea to shore'
        }
        info={[]}
        icon={<ChartIcon />}
        completed={chartCompleted}
        variant="featured"
        art="/chartthecourse.png"
        accent="#f0c040"
      />
    </div>
  )
}

async function GamesSection() {
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
        eyebrow="Game"
        title="Crown & Anchor"
        statusText={crownCapReached ? 'Daily limit reached' : 'Roll dice, match your symbol'}
        info={[]}
        icon={<AnchorIcon />}
        completed={crownCapReached}
        variant="compact"
        art="/crownandanchor.png"
        accent="#fb923c"
      />
      <GameCard
        href="/tavern/slots"
        eyebrow="Game"
        title="Fish Slots"
        statusText={slotsCapReached ? 'Daily limit reached' : 'Match three fish to win'}
        info={[]}
        icon={<SlotsIcon />}
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

          {/* Recruit Crew — self-contained, no page-level data dep */}
          <div>
            <RecruitCard />
          </div>

          {/* Daily — label paints with shell; the 3 cards stream in */}
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#8a8784] mb-3" style={{ fontSize: '0.72rem' }}>Daily</p>
            <Suspense fallback={<DailyCardsSkeleton />}>
              <DailySection />
            </Suspense>
          </div>

          {/* Contest — entire section (incl. label) streams; renders null when
              there's no active contest, so no empty label flicker. */}
          <Suspense fallback={null}>
            <ContestSection />
          </Suspense>

          {/* Games — same pattern as Daily */}
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#8a8784] mb-3" style={{ fontSize: '0.72rem' }}>Games</p>
            <Suspense fallback={<GamesCardsSkeleton />}>
              <GamesSection />
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
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1, 2].map(i => <SkeletonBox key={i} height={132} radius={14} />)}
    </div>
  )
}

function GamesCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1].map(i => <SkeletonBox key={i} height={132} radius={14} />)}
    </div>
  )
}

// ── Icons (unchanged from previous version) ────────────────────────────────

function CoinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 7v1.5M12 15.5V17M9.5 9.5C9.5 8.4 10.6 8 12 8s2.5.6 2.5 1.8c0 2.4-5 2-5 4.4C9.5 15.4 10.6 16 12 16s2.5-.5 2.5-1.7"/>
    </svg>
  )
}

function FishIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-4 6-6 10-6s8 2 10 6c-2 4-6 6-10 6S4 16 2 12z"/>
      <circle cx="16" cy="10" r="1.2" fill="currentColor" stroke="none"/>
      <path d="M2 12c-2-2-2-4 0-4"/>
    </svg>
  )
}

function AnchorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="5" r="2"/>
      <path d="M12 7v10M8 17c0 0 1 2 4 2s4-2 4-2M7 11h10"/>
      <path d="M7 17c-2-1-3-3-3-5h3M17 17c2-1 3-3 3-5h-3"/>
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c2 4 16 4 18 0"/>
      <path d="M4 17L6 11h12l2 6"/>
      <line x1="12" y1="11" x2="12" y2="4"/>
      <path d="M8 4h8"/>
      <line x1="12" y1="4" x2="12" y2="2"/>
    </svg>
  )
}

function SlotsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="13" rx="2"/>
      <path d="M8 6V4M12 6V4M16 6V4"/>
      <path d="M6 12h3M10.5 12h3M15 12h3"/>
      <path d="M7.5 15v0M12 15v0M16.5 15v0"/>
    </svg>
  )
}

function BoatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17c2 2 4 2 6 0s4-2 6 0 4 2 6 0"/>
      <path d="M4 14l1-5h14l1 5"/>
      <path d="M12 9V4"/>
      <path d="M12 4l4 3h-8z" fill="currentColor"/>
    </svg>
  )
}
