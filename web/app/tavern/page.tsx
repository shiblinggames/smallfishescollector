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
import WelcomeModal from './WelcomeModal'

export default async function TavernPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: profile }, { data: fotdAttempt }, dailyWagered, bounties, { data: todayExpedition }] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, fotd_streak, last_daily_claim, last_ship_claim, last_pack_claim, is_premium, premium_expires_at, ship_tier, fishing_date, fishing_casts, has_seen_welcome').eq('id', user.id).single(),
    admin.from('daily_fish_attempts').select('solved, guesses').eq('user_id', user.id).eq('date', today).single(),
    getDailyWagered(),
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

  const hour = new Date().getHours()
  const flavorText =
    hour < 6  ? "It's late. The candles are burning low and the last sailor just passed out in the corner." :
    hour < 10 ? "The barkeep is still setting up. You're here early — the good seats are yours." :
    hour < 14 ? "The midday crowd is trickling in. Someone's already bragging about last night's haul." :
    hour < 18 ? "The afternoon lull. Cards slap the table in the back. A gull calls outside." :
    hour < 21 ? "The tavern is alive tonight. Three sailors are arguing over who caught the biggest fish." :
                "Last call's coming. The dice are hot and the stories are getting taller."

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      {!profile?.has_seen_welcome && <WelcomeModal />}
      <main className="min-h-screen pb-24 sm:pb-0">
        {/* Lantern light — warm amber glow from above */}
        <div aria-hidden style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: '60%',
          background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(180,120,30,0.15) 0%, transparent 100%)',
          pointerEvents: 'none', zIndex: 0,
        }} />

        {/* Bartender banner */}
        <div style={{ position: 'relative', width: '100%', height: 200, zIndex: 1, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/bartender.jpeg"
            alt=""
            aria-hidden
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', display: 'block' }}
          />
          {/* Fade to page background */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 30%, #0e0c0a 100%)',
          }} />
        </div>

        <div className="px-6 max-w-4xl mx-auto mb-6" style={{ position: 'relative', zIndex: 1 }}>
          <p className="font-karla" style={{ fontSize: '0.78rem', color: '#4a4845', fontStyle: 'italic', lineHeight: 1.6 }}>
            {flavorText}
          </p>
        </div>

        <div className="px-6 max-w-4xl mx-auto mb-2" style={{ position: 'relative', zIndex: 1 }}>
          <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764]" style={{ fontSize: '0.6rem' }}>Today</p>
        </div>
        <div className="px-6 grid grid-cols-2 lg:grid-cols-3 gap-3 pb-6 max-w-4xl mx-auto" style={{ position: 'relative', zIndex: 1 }}>
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
              'Stop the needle in the Catch zone to earn',
              'Better hooks widen your catch zone',
              'Upgrade your hook at the Tackle Shop',
            ]}
            icon={<HookIcon />}
            completed={fishingDone}
          />
        </div>

        {bounties && (
          <div className="px-6 max-w-4xl mx-auto mb-6" style={{ position: 'relative', zIndex: 1 }}>
            <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-2" style={{ fontSize: '0.6rem' }}>Weekly</p>
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
              variant="featured"
            />
          </div>
        )}

        <div className="px-6 max-w-4xl mx-auto mb-2 mt-4" style={{ position: 'relative', zIndex: 1 }}>
          <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764]" style={{ fontSize: '0.6rem' }}>Games</p>
        </div>
        <div className="px-6 grid grid-cols-2 gap-3 pb-6 max-w-4xl mx-auto" style={{ position: 'relative', zIndex: 1 }}>
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
