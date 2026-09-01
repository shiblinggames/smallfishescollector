'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { claimDailyBonus, claimDailyBait, claimWeeklyCrate } from '@/app/actions/dailyBonus'
import BecomeCaptainButton from '@/components/BecomeCaptainButton'
import CrateOpening, { crateArt, type CrateTierId, type CrateLootView } from '@/components/CrateOpening'
import BackButton from '@/components/BackButton'
import ResetCountdown from '@/components/ResetCountdown'

const GEM = '#a78bfa'
const BAIT = '#4ade80'
const GOLD = '#f0c040'

// Spin timing, tile sizing and the reveal all live in CrateOpening now.
const SPIN_MS = 2300

type CrateClaim = Extract<Awaited<ReturnType<typeof claimWeeklyCrate>>, { claimed: true }>
type Loot = CrateClaim['loot']
type GoodLoot = Exclude<Loot, { error: string }>
type CratePhase = 'idle' | 'rolling' | 'revealed'


export default function DailyBonusClient({ isPremium, gemsClaimed: g0, baitClaimed: b0, crateClaimed: c0 }: {
  isPremium: boolean
  gemsClaimed: boolean
  baitClaimed: boolean
  crateClaimed: boolean
}) {
  const router = useRouter()
  const [gemsClaimed, setGemsClaimed] = useState(g0)
  const [baitClaimed, setBaitClaimed] = useState(b0)
  const [crateClaimed, setCrateClaimed] = useState(c0)
  const [loading, setLoading] = useState<'gems' | 'bait' | 'crate' | null>(null)

  const [cratePhase, setCratePhase] = useState<CratePhase>('idle')
  const [crateLoot, setCrateLoot] = useState<GoodLoot | null>(null)

  const gemAmount = isPremium ? 150 : 50
  const baitName = isPremium ? 'Chum' : 'Worms'
  const baitImg = isPremium ? '/chum.png' : '/worms.png'
  const crateName = isPremium ? 'Gold Crate' : 'Wooden Crate'

  const allDone = gemsClaimed && baitClaimed && crateClaimed

  async function claimGems() {
    if (gemsClaimed || loading) return
    setLoading('gems')
    const r = await claimDailyBonus()
    if (r.claimed) {
      setGemsClaimed(true)
      if (r.gems !== undefined) window.dispatchEvent(new CustomEvent('gems-changed', { detail: r.gems }))
    }
    setLoading(null)
  }

  async function claimBait() {
    if (baitClaimed || loading) return
    setLoading('bait')
    const r = await claimDailyBait()
    if (r.claimed) setBaitClaimed(true)
    setLoading(null)
  }

  async function claimCrate() {
    if (crateClaimed || loading || cratePhase !== 'idle') return
    setLoading('crate')
    const r = await claimWeeklyCrate()
    setLoading(null)
    if (!r.claimed) return
    setCrateClaimed(true)

    const loot = r.loot
    if ('error' in loot) { setCratePhase('revealed'); router.refresh(); return }

    // Build the slot strip — fillers flashing past, the real reward last so
    // the spin visibly lands on it (same trick as the fishing crate).
    setCrateLoot(loot)
    setCratePhase('rolling')

    window.setTimeout(() => {
      // CrateOpening owns the spin and the rare full-screen moment; this just
      // settles the card's own state and refreshes the claimed stamp.
      setCratePhase('revealed')
      router.refresh()
    }, SPIN_MS + 120)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <BackButton href="/tavern" label="Tavern" />
        {isPremium && (
          <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: GOLD, background: `${GOLD}16`, border: `1px solid ${GOLD}44`, borderRadius: 999, padding: '0.2rem 0.5rem' }}>Captain</span>
        )}
      </div>
      <h1 className="font-cinzel font-800" style={{ fontSize: '1.6rem', color: '#f5f0e6', textAlign: 'center', marginBottom: 2 }}>Daily Haul</h1>
      <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9a948a', textAlign: 'center', marginBottom: 20 }}>
        {allDone ? "You've claimed it all. Fair winds tomorrow." : 'Stop by every day. The crate refreshes each Monday.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ClaimCard
          accent={GEM} eyebrow="Daily Gems" title={`+${gemAmount} ◆`}
          sub={isPremium ? 'Your Captain gem stipend, every day.' : 'Captains earn 150 a day.'}
          claimed={gemsClaimed} claimedSub={<ResetCountdown prefix="Resets in" />} loading={loading === 'gems'} onClaim={claimGems}
          glyph={<span className="font-cinzel font-800" style={{ fontSize: '2rem', color: GEM, lineHeight: 1 }}>◆</span>}
        />

        <ClaimCard
          accent={BAIT} eyebrow="Daily Bait" title={`+20 ${baitName}`}
          sub={isPremium ? 'Premium chum to draw the big ones.' : 'Captains get chum instead.'}
          claimed={baitClaimed} claimedSub={<ResetCountdown prefix="Resets in" />} loading={loading === 'bait'} onClaim={claimBait}
          img={baitImg}
        />

        <CrateCard
          isPremium={isPremium} crateName={crateName}
          phase={cratePhase} loot={crateLoot}
          claimed={crateClaimed} loading={loading === 'crate'} onClaim={claimCrate}
        />
      </div>

      {!isPremium && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <BecomeCaptainButton full />
          <p className="font-karla" style={{ fontSize: '0.68rem', color: '#8a8270', textAlign: 'center' }}>
            150 gems, premium chum, and a gold crate every week.
          </p>
        </div>
      )}

      {/* Full-screen reveal for rare pulls (cosmetics / pets) */}
    </div>
  )
}

function ClaimCard({ accent, eyebrow, title, sub, claimed, claimedSub, loading, onClaim, img, glyph }: {
  accent: string; eyebrow: string; title: string; sub: string
  claimed: boolean; claimedSub: React.ReactNode; loading: boolean; onClaim: () => void
  img?: string; glyph?: React.ReactNode
}) {
  return (
    <div style={{
      background: claimed ? 'rgba(8,8,6,0.7)' : 'linear-gradient(180deg, rgba(14,16,22,0.94) 0%, rgba(7,9,12,0.97) 100%)',
      border: `1px solid ${claimed ? 'rgba(255,255,255,0.08)' : `${accent}44`}`,
      borderRadius: 16, padding: '0.95rem 1rem',
      boxShadow: claimed ? 'none' : `0 6px 22px rgba(0,0,0,0.4), 0 0 20px ${accent}12`,
      opacity: claimed ? 0.62 : 1, transition: 'opacity 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ position: 'relative', width: 58, height: 58, flexShrink: 0, borderRadius: 13, background: claimed ? 'rgba(255,255,255,0.04)' : `${accent}18`, border: `1px solid ${claimed ? 'rgba(255,255,255,0.1)' : `${accent}40`}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {claimed ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          ) : img ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={img} alt="" aria-hidden style={{ width: 42, height: 42, objectFit: 'contain' }} />
          ) : glyph}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.54rem', color: claimed ? '#7a7674' : `${accent}cc` }}>{eyebrow}</p>
          <p className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: claimed ? '#8a8884' : '#f3efe6', lineHeight: 1.15, margin: '2px 0' }}>{title}</p>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#8a857c', lineHeight: 1.4 }}>{claimed ? claimedSub : sub}</p>
        </div>
        {!claimed && (
          <motion.button whileTap={{ scale: 0.93 }} onClick={onClaim} disabled={loading}
            className="font-cinzel font-700 uppercase tracking-[0.06em]"
            style={{ flexShrink: 0, padding: '0.6rem 1rem', borderRadius: 11, background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, fontSize: '0.74rem', cursor: loading ? 'wait' : 'pointer' }}>
            {loading ? '…' : 'Claim'}
          </motion.button>
        )}
      </div>
    </div>
  )
}

function CrateCard({ isPremium, crateName, phase, loot, claimed, loading, onClaim }: {
  isPremium: boolean; crateName: string
  phase: CratePhase; loot: GoodLoot | null
  claimed: boolean; loading: boolean; onClaim: () => void
}) {
  const accent = isPremium ? GOLD : '#c8a06a'
  const dim = claimed && phase === 'idle'   // already opened on a prior visit
  const tier: CrateTierId = isPremium ? 'gold' : 'wooden'

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(28,22,10,0.95) 0%, rgba(12,9,5,0.97) 100%)',
      border: `1px solid ${dim ? 'rgba(255,255,255,0.08)' : `${accent}55`}`,
      borderRadius: 18, padding: '1.1rem 1.05rem',
      opacity: dim ? 0.62 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.54rem', color: `${accent}cc` }}>Weekly Crate</p>
        <ResetCountdown kind="weekly" prefix="Resets in" className="font-karla font-600" style={{ fontSize: '0.56rem', color: '#8a857c' }} />
      </div>

      {/* Once the server has rolled it, the shared crate moment takes over.
          Same component the reel-in crate and the Master daily challenge crate
          use. This card used to carry its own 96x82 strip, its own filler
          pool, its own tile renderer and its own reveal, all hand-copied from
          the fishing one and drifting from it. autoOpenMs is 250 because the
          player has ALREADY pressed Open Crate to get here, so asking them to
          press a second button would be a step backwards. */}
      {loot && phase !== 'idle' ? (
        <div style={{ marginTop: 8 }}>
          {/* Bare: this is already inside the Weekly Crate panel, so the
              crate's own card surface would be a card in a card. */}
          <CrateOpening tier={tier} loot={loot as CrateLootView} autoOpenMs={250} framed={false} />
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <motion.div
            animate={dim ? {} : { y: [0, -4, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: 76, height: 76, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={crateArt(tier, false)} alt={crateName} width={70} height={70}
              style={{ width: 70, height: 70, objectFit: 'contain', filter: dim ? 'grayscale(0.5) brightness(0.7)' : `drop-shadow(0 4px 12px ${accent}66)` }} />
          </motion.div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: dim ? '#8a8884' : '#f5ecd6', lineHeight: 1.1 }}>{crateName}</p>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a89e86', lineHeight: 1.45, marginTop: 3 }}>
              {isPremium ? 'A free gold crate every week, full loot inside.' : 'A free crate weekly. Captains open a gold one.'}
            </p>
          </div>
        </div>
      )}

      {phase === 'idle' && !claimed && (
        <motion.button whileTap={{ scale: 0.96 }} onClick={onClaim} disabled={loading}
          className="font-cinzel font-700 uppercase tracking-[0.08em] w-full"
          style={{ marginTop: 12, padding: '0.8rem', borderRadius: 12, background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, fontSize: '0.82rem', cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? 'Cracking the lid…' : 'Open Crate'}
        </motion.button>
      )}
      {dim && (
        <p className="font-karla" style={{ fontSize: '0.7rem', color: '#7a7674', textAlign: 'center', marginTop: 10 }}>
          Opened this week · <ResetCountdown kind="weekly" prefix="resets in" />
        </p>
      )}
    </div>
  )
}


