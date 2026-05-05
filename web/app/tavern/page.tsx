import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { getDailyWagered, getSlotsDailyWagered } from './actions'
import { DAILY_CAP, SLOTS_DAILY_CAP } from './constants'
import { getChartState } from '@/app/charting/chartActions'
import GameCard from './GameCard'
import RecruitCard from './RecruitCard'
import WelcomeModal from './WelcomeModal'

export default async function TavernPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: profile }, { data: fotdAttempt }, dailyWagered, slotsDailyWagered, chartState] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, fotd_streak, last_daily_claim, last_pack_claim, is_premium, premium_expires_at, ship_tier, hook_tier, fishing_date, fishing_casts, has_seen_welcome, gems').eq('id', user.id).single(),
    admin.from('daily_fish_attempts').select('solved, guesses').eq('user_id', user.id).eq('date', today).single(),
    getDailyWagered(),
    getSlotsDailyWagered(),
    getChartState(),
  ])

  const isPremium =
    !!profile?.is_premium &&
    !!profile?.premium_expires_at &&
    new Date(profile.premium_expires_at) > new Date()

  const baseAmount = isPremium ? 100 : 50
  const allClaimed =
    profile?.last_daily_claim === today &&
    (!isPremium || profile?.last_pack_claim === today)

  const fotdDone = !!fotdAttempt && (fotdAttempt.solved || (fotdAttempt.guesses?.length ?? 0) >= 4)
  const crownCapReached = dailyWagered >= DAILY_CAP
  const slotsCapReached = slotsDailyWagered >= SLOTS_DAILY_CAP
  const hasContest = chartState && !('error' in chartState)
  const chartCompleted = hasContest && !!chartState.progress.completed_at
  const chartTilesCharted = hasContest ? chartState.progress.path_index : 0
  const chartPathLength = hasContest ? chartState.pathLength : 0


  const bartenderLines = [
    // Fish of the Day
    "Heard the fish today is a tricky one. Three sailors guessed wrong on the first clue.",
    "Someone cracked the fish of the day on the very first guess this morning. Haven't seen that in weeks.",
    "Don't even look at today's fish without your first clue. Trust me on that one.",
    "The fish of the day's been stumping everyone. Clue by clue, they're getting closer.",
    // Fishing
    "Slow morning on the water. Fish aren't biting much today.",
    "Dropped a line myself before my shift. Came up empty. The deep ones are hiding.",
    "Those enchanted hooks — never believed in 'em myself. Then I saw what came up on one.",
    "Best hook wins. Simple as that. The rusty one'll catch something, sure — just not the good stuff.",
    "Hit the gold zone on either edge and you might just keep your bait. Timing's everything.",
    "Perfect catch means a shot at your bait back. Good sailors barely burn through a worm.",
    "Blobfish. Ugliest thing in the sea. Fetches nearly a thousand doubloons at market though. Go figure.",
    "The abyss doesn't keep you waiting as long as it used to. Still just as likely to eat you alive.",
    "Don't sell your abyss catch at the dock price. Wait for the market to swing — it's worth it.",
    "Vampire squid, firefly squid — sounds like a nightmare. Pays like one too, in the good way.",
    "Rowboat fills up fast if you're fishing the abyss. You'll be running to market every five minutes.",
    "Man-o-War holds three hundred and fifty fish. Sailors have been known to disappear for days on one of those.",
    "Running low on hold space? Head to market before your next cast. Learned that the hard way.",
    // Crown & Anchor
    "Careful with the dice today. Saw a sailor lose four rounds straight on the anchor. Bad luck going around.",
    "Crown and Anchor's been running hot this week. Or maybe it's just the dice. Who knows.",
    "Five thousand doubloons is the limit at the tables. House rules. Don't bother arguing — I made the rules.",
    // General tavern
    "What'll it be? Oh — you're just browsing. Fair enough.",
    "Stay for a round. The Tentacle-Tonic's fresh today.",
    "Another one asking about the abyss. I'll say what I always say — go prepared, or don't go at all.",
    "Fortified XX just came in from the southern ports. Good batch this time.",
    "Quieter than usual today. Most of the regulars are out on the water.",
    // Ships
    "Saw a Galleon come into port this morning. Now that's a ship.",
    "Bigger ship, better haul. That's how it works. Always has been.",
  ]
  const bartenderLine = bartenderLines[Math.floor(Math.random() * bartenderLines.length)]

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      {!profile?.has_seen_welcome && <WelcomeModal />}
      <main className="min-h-screen">

        {/* Recruit Crew — top feature card */}
        <div className="px-6 max-w-4xl mx-auto pt-8 pb-4" style={{ position: 'relative', zIndex: 1 }}>
          <RecruitCard packsAvailable={profile?.packs_available ?? 0} />
        </div>

        <div className="px-6 max-w-4xl mx-auto mb-2" style={{ position: 'relative', zIndex: 1 }}>
          <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764]" style={{ fontSize: '0.6rem' }}>Today</p>
        </div>
        <div className="px-6 flex flex-col gap-3 pb-6 max-w-4xl mx-auto" style={{ position: 'relative', zIndex: 1 }}>
          <GameCard
            href="/tavern/daily-bonus"
            eyebrow="Daily"
            title="Daily Bonus"
            statusText={allClaimed ? 'Come back tomorrow' : `${baseAmount} ⟡ available`}
            info={[]}
            icon={<CoinIcon />}
            completed={allClaimed}
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
            art={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/Hammerhead_Shark.png`}
            accent="#60a5fa"
          />
        </div>

        {hasContest && (
          <div className="px-6 max-w-4xl mx-auto mb-6" style={{ position: 'relative', zIndex: 1 }}>
            <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-2" style={{ fontSize: '0.6rem' }}>Contest</p>
            <GameCard
              href="/charting"
              eyebrow="Contest"
              title="Chart the Course"
              statusText={
                chartCompleted ? 'Voyage complete ✓' :
                chartTilesCharted > 0 ? `${chartTilesCharted} / ${chartPathLength} tiles charted` :
                'Chart a path from sea to shore'
              }
              info={[]}
              icon={<ChartIcon />}
              completed={chartCompleted}
              variant="featured"
              art="/voyagemap.png"
              accent="#f0c040"
            />
          </div>
        )}

        <div className="px-6 max-w-4xl mx-auto mb-2 mt-4" style={{ position: 'relative', zIndex: 1 }}>
          <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764]" style={{ fontSize: '0.6rem' }}>Games</p>
        </div>
        <div className="px-6 flex flex-col gap-3 pb-6 max-w-4xl mx-auto" style={{ position: 'relative', zIndex: 1 }}>
          <GameCard
            href="/tavern/crown-and-anchor"
            eyebrow="Game"
            title="Crown & Anchor"
            statusText={crownCapReached ? 'Daily limit reached' : 'Roll dice, match your symbol'}
            info={[]}
            icon={<AnchorIcon />}
            completed={crownCapReached}
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
            art="/fishslots.png"
            accent="#a78bfa"
          />
        </div>

        <div className="px-6 pb-16 text-center" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
      </main>
    </>
  )
}


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

function HookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v9"/>
      <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
      <circle cx="12" cy="3" r="1.2" fill="currentColor" stroke="none"/>
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
