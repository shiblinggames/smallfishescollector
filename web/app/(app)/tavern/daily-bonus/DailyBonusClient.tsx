'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { claimDailyBonus, claimDailyBait, claimWeeklyCrate } from '@/app/actions/dailyBonus'

const GEM = '#a78bfa'
const BAIT = '#4ade80'
const GOLD = '#f0c040'

type CrateLoot = Awaited<ReturnType<typeof claimWeeklyCrate>>

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
  const [crateLoot, setCrateLoot] = useState<Extract<CrateLoot, { claimed: true }> | null>(null)

  const gemAmount = isPremium ? 150 : 50
  const baitName = isPremium ? 'Chum' : 'Worms'
  const baitImg = isPremium ? '/chum.png' : '/worms.png'
  const crateName = isPremium ? 'Gold Crate' : 'Wooden Crate'
  const crateClosed = isPremium ? '/goldcrateclosed.png' : '/crateclosed.png'

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
    if (crateClaimed || loading) return
    setLoading('crate')
    const r = await claimWeeklyCrate()
    if (r.claimed) {
      setCrateClaimed(true)
      setCrateLoot(r)
      // Crate doubloons/cosmetics land server-side; resync the Nav + balances.
      router.refresh()
    }
    setLoading(null)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Link href="/tavern" className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.14em', color: '#a89878', textDecoration: 'none' }}>← Tavern</Link>
        {isPremium && (
          <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: GOLD, background: `${GOLD}16`, border: `1px solid ${GOLD}44`, borderRadius: 999, padding: '0.2rem 0.5rem' }}>Member</span>
        )}
      </div>
      <h1 className="font-cinzel font-800" style={{ fontSize: '1.6rem', color: '#f5f0e6', textAlign: 'center', marginBottom: 2 }}>Daily Haul</h1>
      <p className="font-karla" style={{ fontSize: '0.78rem', color: '#9a948a', textAlign: 'center', marginBottom: 20 }}>
        {allDone ? "You've claimed it all. Fair winds tomorrow." : 'Stop by every day. The crate refreshes each Monday.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Daily Gems */}
        <ClaimCard
          accent={GEM}
          eyebrow="Daily Gems"
          title={`+${gemAmount} ◆`}
          sub={isPremium ? 'Your member gem stipend, every day.' : 'Members earn 150 a day.'}
          claimed={gemsClaimed}
          claimedSub="Back tomorrow."
          loading={loading === 'gems'}
          onClaim={claimGems}
          glyph={<span className="font-cinzel font-800" style={{ fontSize: '2rem', color: GEM, lineHeight: 1 }}>◆</span>}
        />

        {/* Daily Bait */}
        <ClaimCard
          accent={BAIT}
          eyebrow="Daily Bait"
          title={`+20 ${baitName}`}
          sub={isPremium ? 'Premium chum to draw the big ones.' : 'Members get chum instead.'}
          claimed={baitClaimed}
          claimedSub="Back tomorrow."
          loading={loading === 'bait'}
          onClaim={claimBait}
          img={baitImg}
        />

        {/* Weekly Crate — the hero */}
        <CrateCard
          isPremium={isPremium}
          crateName={crateName}
          crateClosed={crateClosed}
          claimed={crateClaimed}
          loading={loading === 'crate'}
          onClaim={claimCrate}
          loot={crateLoot}
        />
      </div>

      {!isPremium && (
        <Link href="/marketplace" className="font-karla" style={{ display: 'block', textAlign: 'center', marginTop: 18, fontSize: '0.74rem', color: GOLD, textDecoration: 'none' }}>
          Become a Member for 150 gems, chum, and a gold crate →
        </Link>
      )}
    </div>
  )
}

function ClaimCard({ accent, eyebrow, title, sub, claimed, claimedSub, loading, onClaim, img, glyph }: {
  accent: string; eyebrow: string; title: string; sub: string
  claimed: boolean; claimedSub: string; loading: boolean; onClaim: () => void
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

function CrateCard({ isPremium, crateName, crateClosed, claimed, loading, onClaim, loot }: {
  isPremium: boolean; crateName: string; crateClosed: string
  claimed: boolean; loading: boolean; onClaim: () => void
  loot: Extract<CrateLoot, { claimed: true }> | null
}) {
  const accent = isPremium ? GOLD : '#c8a06a'
  const reveal = loot && loot.loot && !('error' in loot.loot) ? loot.loot : null
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(28,22,10,0.95) 0%, rgba(12,9,5,0.97) 100%)',
      border: `1px solid ${claimed && !reveal ? 'rgba(255,255,255,0.08)' : `${accent}55`}`,
      borderRadius: 18, padding: '1.1rem 1.05rem',
      boxShadow: claimed && !reveal ? 'none' : `0 8px 28px rgba(0,0,0,0.45), 0 0 26px ${accent}1c`,
      opacity: claimed && !reveal ? 0.62 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.54rem', color: `${accent}cc` }}>Weekly Crate</p>
        <span className="font-karla font-600" style={{ fontSize: '0.56rem', color: '#8a857c' }}>Resets Monday</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <motion.div
          animate={claimed ? {} : { y: [0, -4, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 76, height: 76, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}
        >
          <div aria-hidden style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: `radial-gradient(circle, ${accent}33 0%, transparent 70%)`, opacity: claimed ? 0.3 : 1 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={crateClosed} alt={crateName} style={{ width: 70, height: 70, objectFit: 'contain', filter: claimed ? 'grayscale(0.5) brightness(0.7)' : `drop-shadow(0 4px 10px ${accent}55)` }} />
        </motion.div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: claimed && !reveal ? '#8a8884' : '#f5ecd6', lineHeight: 1.1 }}>{crateName}</p>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#a89e86', lineHeight: 1.45, marginTop: 3 }}>
            {isPremium ? 'A free gold crate every week, full loot inside.' : 'A free crate weekly. Members open a gold one.'}
          </p>
        </div>
      </div>

      {/* Reveal */}
      <AnimatePresence>
        {reveal && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            style={{ marginTop: 12, overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 0.85rem', borderRadius: 12, background: `${accent}14`, border: `1px solid ${accent}40` }}>
              <LootIcon loot={reveal} accent={accent} />
              <div style={{ minWidth: 0 }}>
                <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: `${accent}cc` }}>You hauled up</p>
                <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f3efe6', lineHeight: 1.2 }}>{lootLabel(reveal)}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!claimed && (
        <motion.button whileTap={{ scale: 0.96 }} onClick={onClaim} disabled={loading}
          className="font-cinzel font-700 uppercase tracking-[0.08em] w-full"
          style={{ marginTop: 12, padding: '0.8rem', borderRadius: 12, background: `${accent}26`, border: `1px solid ${accent}66`, color: accent, fontSize: '0.82rem', cursor: loading ? 'wait' : 'pointer' }}>
          {loading ? 'Opening…' : 'Open Crate'}
        </motion.button>
      )}
      {claimed && !reveal && (
        <p className="font-karla" style={{ fontSize: '0.7rem', color: '#7a7674', textAlign: 'center', marginTop: 10 }}>Opened this week. Back Monday.</p>
      )}
    </div>
  )
}

type Loot = NonNullable<Extract<CrateLoot, { claimed: true }>['loot']>
function lootLabel(loot: Loot): string {
  if ('error' in loot) return 'Empty'
  switch (loot.type) {
    case 'doubloons': return `${loot.amount.toLocaleString()} ⟡`
    case 'bait':      return `${loot.quantity} ${loot.baitName}`
    case 'skin':      return `${loot.skinName} color`
    case 'hat':       return `${loot.hatName} bandana`
    case 'boat':      return `${loot.boatName} boat`
    case 'pet':       return `${loot.petName}${loot.isDuplicate ? ' (duplicate)' : '!'}`
  }
}
const BAIT_IMG: Record<string, string> = { worm: '/worms.png', chum: '/chum.png' }
function LootIcon({ loot, accent }: { loot: Loot; accent: string }) {
  const box = { width: 40, height: 40, flexShrink: 0, borderRadius: 9, background: `${accent}1a`, border: `1px solid ${accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } as const
  if ('error' in loot) return <div style={box} />
  let img: string | undefined
  if (loot.type === 'hat') img = loot.hatImageUrl
  else if (loot.type === 'boat') img = loot.boatImageUrl
  else if (loot.type === 'pet') img = loot.petImageUrl
  else if (loot.type === 'bait') img = BAIT_IMG[loot.baitType]
  return (
    <div style={box}>
      {img
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={img} alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
        : <span className="font-cinzel font-800" style={{ fontSize: '1.1rem', color: accent }}>{loot.type === 'doubloons' ? '⟡' : '◆'}</span>}
    </div>
  )
}
