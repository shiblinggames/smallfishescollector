import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { getDailyWagered } from './actions'
import { DAILY_CAP } from './constants'
import { getShip } from '@/lib/ships'
import { getWeeklyBounties } from '@/app/packs/bountyActions'
import GameCard from './GameCard'

export default async function TavernPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: profile }, { data: fotdAttempt }, dailyWagered, { data: quizAnswer }, bounties, { data: todayExpedition }] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, fotd_streak, last_daily_claim, last_ship_claim, last_pack_claim, is_premium, premium_expires_at, ship_tier, fishing_date, fishing_casts').eq('id', user.id).single(),
    admin.from('daily_fish_attempts').select('solved, guesses').eq('user_id', user.id).eq('date', today).single(),
    getDailyWagered(),
    admin.from('quiz_answers').select('correct').eq('user_id', user.id).eq('date', today).single(),
    getWeeklyBounties(),
    admin.from('expeditions').select('status, zone, loot').eq('user_id', user.id).eq('expedition_date', today).maybeSingle(),
  ])

  const isPremium =
    !!profile?.is_premium &&
    !!profile?.premium_expires_at &&
    new Date(profile.premium_expires_at) > new Date()

  const ship = getShip(profile?.ship_tier ?? 0)
  const baseAmount = isPremium ? 100 : 50
  const allClaimed =
    profile?.last_daily_claim === today &&
    ((profile?.ship_tier ?? 0) === 0 || profile?.last_ship_claim === today) &&
    (!isPremium || profile?.last_pack_claim === today)

  const fotdDone = !!fotdAttempt && (fotdAttempt.solved || (fotdAttempt.guesses?.length ?? 0) >= 4)
  const crownCapReached = dailyWagered >= DAILY_CAP
  const quizDone = !!quizAnswer
  const bountyProgress = bounties?.progress
  const bountyCount = bountyProgress ? Object.values(bountyProgress).filter(Boolean).length : 0
  const bountyAllDone = bountyCount === 4

  const fishingCastsUsed = profile?.fishing_date === today ? (profile?.fishing_casts ?? 0) : 0
  const fishingCastsLeft = 20 - fishingCastsUsed
  const fishingDone = fishingCastsLeft <= 0

  const expeditionStatus = todayExpedition?.status ?? null
  const expeditionDone = expeditionStatus === 'completed' || expeditionStatus === 'failed'
  const expeditionLoot = (todayExpedition?.loot as { doubloons?: number } | null)?.doubloons ?? 0
  const expeditionStatusText =
    expeditionStatus === 'completed' ? `Complete — ${expeditionLoot.toLocaleString()} ⟡ earned` :
    expeditionStatus === 'failed' ? 'Failed — come back tomorrow' :
    expeditionStatus === 'active' ? 'Expedition in progress' :
    'Choose your zone · 1 per day'

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <div className="px-6 grid grid-cols-2 lg:grid-cols-3 gap-3 pb-12 max-w-4xl mx-auto">
          <GameCard
            href="/tavern/daily-bonus"
            eyebrow="Daily"
            title="Bonus"
            statusText={allClaimed ? 'Come back tomorrow' : `${baseAmount + ship.dailyBonus} ⟡ available`}
            info={[
              `${baseAmount} ⟡ base daily bonus`,
              ...(ship.dailyBonus > 0 ? [`+${ship.dailyBonus} ⟡ from your ${ship.name}`] : []),
              isPremium ? '1 free pack daily (Member)' : 'Upgrade to Member for a free daily pack',
            ]}
            icon={<CoinIcon />}
            completed={allClaimed}
          />
          <GameCard
            href="/tavern/fish-of-the-day"
            eyebrow="Daily"
            title="Fish of the Day"
            statusText={fotdDone ? 'Come back tomorrow' : 'Guess the mystery fish'}
            info={[
              'Four clues, four guesses — one fish',
              'Each wrong guess reveals the next clue',
              '100 ⟡ for 1st guess · 75 · 50 · 25 ⟡',
              'New fish every day',
            ]}
            icon={<FishIcon />}
            completed={fotdDone}
            streak={profile?.fotd_streak ?? 0}
          />
          <GameCard
            href="/tavern/daily-quiz"
            eyebrow="Daily"
            title="Fish Trivia"
            statusText={quizDone ? 'Come back tomorrow' : '50 ⟡ for a correct answer'}
            info={[
              'One question generated fresh every day',
              '50 ⟡ for a correct answer',
            ]}
            icon={<QuizIcon />}
            completed={quizDone}
          />
          <GameCard
            href="/expeditions"
            eyebrow="Daily"
            title="Expedition"
            statusText={expeditionStatusText}
            info={[
              'Choose a zone and send your ship out',
              'Assign crew to boost your stats',
              'Pass events to earn doubloons and cards',
              'One expedition per day',
            ]}
            icon={<ShipIcon />}
            completed={expeditionDone}
          />
          <GameCard
            href="/tavern/fishing"
            eyebrow="Daily"
            title="Drop a Line"
            statusText={fishingDone ? 'Come back tomorrow' : `${fishingCastsLeft} casts remaining`}
            info={[
              '20 casts per day — cast anytime',
              'Time your reel for better catches',
              'Better hooks earn more per cast',
              'Upgrade your hook at the Tackle Shop',
            ]}
            icon={<HookIcon />}
            completed={fishingDone}
          />
          {bounties && (
            <GameCard
              href="/packs"
              eyebrow="Weekly"
              title="Bounty"
              statusText={bountyAllDone ? 'All complete' : bountyCount > 0 ? `${bountyCount} / 4 complete` : 'New targets this week'}
              info={[
                `Shallows — ${bounties.shallows.name} · 50 ⟡`,
                `Open Waters — ${bounties.openWaters.name} · 150 ⟡`,
                `Deep — ${bounties.deep.name} · 300 ⟡`,
                `Abyss — ${bounties.abyss.name} · 500 ⟡ + 1 pack`,
              ]}
              icon={<BountyIcon />}
              completed={bountyAllDone}
            />
          )}
          <GameCard
            href="/tavern/crown-and-anchor"
            eyebrow="Game"
            title="Crown & Anchor"
            statusText={crownCapReached ? 'Daily limit reached' : 'Roll dice, match your symbol'}
            info={[
              'Pick a symbol and place your wager',
              '1 match → 1× · 2 matches → 2× · 3 → 3×',
              '500 ⟡ daily wagering limit',
            ]}
            icon={<AnchorIcon />}
            completed={crownCapReached}
          />
          <GameCard
            href="/tavern/dead-mans-draw"
            eyebrow="Game"
            title="Dead Man's Draw"
            statusText="First game free daily"
            info={[
              'Draw cards one at a time — duplicate species = bust',
              'Power fish trigger special effects',
              'First to 30 points wins',
              'First game free daily · 20 ⟡ after',
            ]}
            icon={<SkullIcon />}
          />
        </div>

        <div className="px-6 pb-16 text-center">
          <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.75rem' }}>
            Enjoying the game?{' '}
            <Link href="/marketplace" className="text-[#f0c040] hover:text-[#f5d060] transition-colors">
              Support our indie studio with a membership →
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

function SkullIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 22h6M12 22v-4"/>
      <path d="M5 12a7 7 0 0 1 14 0c0 3-1.5 5-3.5 6H8.5C6.5 17 5 15 5 12z"/>
      <circle cx="9.5" cy="11.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="14.5" cy="11.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function QuizIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2.5-2.5 4.5"/>
      <circle cx="12" cy="17.5" r="0.8" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function ShipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l1.5 3h15L21 17"/>
      <path d="M3 17c2 1 4.5 1.5 9 1.5S19 18 21 17"/>
      <path d="M12 2v11"/>
      <path d="M5 10l7 4 7-4"/>
      <path d="M8 6l4-4 4 4"/>
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

function BountyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      <path d="M9 8l1.5 1.5L13 7"/>
    </svg>
  )
}
