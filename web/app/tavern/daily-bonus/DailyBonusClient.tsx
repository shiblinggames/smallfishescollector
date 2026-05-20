'use client'

import { useState } from 'react'
import { claimDailyBonus, claimDailyWorms } from '@/app/actions/dailyBonus'
import { claimDailyPack } from '@/app/actions/dailyPack'

interface Props {
  dailyClaimed: boolean
  packClaimed: boolean
  wormClaimed: boolean
  baseAmount: number
  isPremium: boolean
}

export default function DailyBonusClient({
  dailyClaimed: initialDailyClaimed,
  packClaimed: initialPackClaimed,
  wormClaimed: initialWormClaimed,
  baseAmount,
  isPremium,
}: Props) {
  const [dailyClaimed, setDailyClaimed] = useState(initialDailyClaimed)
  const [packClaimed, setPackClaimed] = useState(initialPackClaimed)
  const [wormClaimed, setWormClaimed] = useState(initialWormClaimed)
  const [loadingDaily, setLoadingDaily] = useState(false)
  const [loadingPack, setLoadingPack] = useState(false)
  const [loadingWorms, setLoadingWorms] = useState(false)

  async function handleClaimDaily() {
    if (dailyClaimed || loadingDaily) return
    setLoadingDaily(true)
    const result = await claimDailyBonus()
    if (result.claimed) {
      setDailyClaimed(true)
      if (result.gems !== undefined) window.dispatchEvent(new CustomEvent('gems-changed', { detail: result.gems }))
    }
    setLoadingDaily(false)
  }

  async function handleClaimPack() {
    if (packClaimed || loadingPack || !isPremium) return
    setLoadingPack(true)
    const result = await claimDailyPack()
    if (result.claimed) setPackClaimed(true)
    setLoadingPack(false)
  }

  async function handleClaimWorms() {
    if (wormClaimed || loadingWorms) return
    setLoadingWorms(true)
    const result = await claimDailyWorms()
    if (result.claimed) setWormClaimed(true)
    setLoadingWorms(false)
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Base daily gems — violet accent to match the gem currency
          colour used in the Nav and elsewhere. */}
      <ClaimCard
        eyebrow="Daily Bonus"
        title={`+${baseAmount} ◆`}
        description={isPremium ? 'Your daily gem bonus as a Member.' : 'Your daily gem bonus.'}
        claimed={dailyClaimed}
        loading={loadingDaily}
        onClaim={handleClaimDaily}
        image="/diamondcrateopen.png"
        accent="#a78bfa"
        badge={isPremium ? 'Member' : undefined}
      />

      {/* Daily worms — green earthy accent. */}
      <ClaimCard
        eyebrow="Daily Bait"
        title="+20 Worms"
        description="A fresh batch of worms to keep you fishing."
        claimed={wormClaimed}
        loading={loadingWorms}
        onClaim={handleClaimWorms}
        image="/worms.png"
        accent="#4ade80"
      />

      {/* Daily pack — gold/tan accent matching the pack identity in
          the Nav currency strip. Cardback image, not an SVG box. */}
      <ClaimCard
        eyebrow="Daily Pack"
        title="+1 Pack"
        description={isPremium ? 'Your daily free pack as a Member.' : 'Upgrade to a Membership to claim a free pack every day.'}
        claimed={packClaimed}
        loading={loadingPack}
        onClaim={handleClaimPack}
        image="/cardbacknew.png"
        accent="#c8a870"
        locked={!isPremium}
        badge={isPremium ? 'Member' : undefined}
      />

    </div>
  )
}

function ClaimCard({
  eyebrow, title, description, claimed, loading, onClaim, image, accent, badge, locked,
}: {
  eyebrow: string
  title: string
  description: string
  claimed: boolean
  loading: boolean
  onClaim: () => void
  image: string
  accent: string
  badge?: string
  locked?: boolean
}) {
  const dim = claimed || locked

  return (
    <div style={{
      background: dim
        ? 'rgba(8,8,6,0.78)'
        : `linear-gradient(180deg, rgba(12,14,18,0.92) 0%, rgba(6,8,10,0.96) 100%)`,
      border: `1px solid ${claimed ? 'rgba(255,255,255,0.10)' : locked ? 'rgba(255,255,255,0.10)' : `${accent}55`}`,
      borderRadius: 16,
      padding: '1rem 1.1rem',
      opacity: dim ? 0.6 : 1,
      transition: 'opacity 0.2s ease',
      boxShadow: dim ? 'none' : `0 4px 18px rgba(0,0,0,0.35), inset 0 0 0 1px ${accent}10`,
    }}>
      <div className="flex items-start gap-3.5">
        {/* Icon tile — bigger so the PNG can breathe. Accent-tinted
            background + hairline border match the current design
            language (see RaidsSection detail sheet, ShopCard, etc.). */}
        <div style={{
          width: 56, height: 56,
          background: dim ? 'rgba(255,255,255,0.04)' : `${accent}1a`,
          border: `1px solid ${dim ? 'rgba(255,255,255,0.10)' : `${accent}40`}`,
          borderRadius: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {claimed ? (
            <CheckIcon color={accent} />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image}
              alt=""
              aria-hidden
              style={{
                width: 42, height: 42,
                objectFit: 'contain',
                filter: locked ? 'grayscale(1) brightness(0.55)' : 'none',
              }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="sg-eyebrow" style={{ color: dim ? '#7a7674' : `${accent}cc` }}>{eyebrow}</p>
            {badge && !locked && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: `${accent}1a`, border: `1px solid ${accent}40` }}>
                <svg width="7" height="7" viewBox="0 0 24 24" fill={accent} stroke="none">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: accent }}>{badge}</span>
              </div>
            )}
            {locked && (
              <span className="font-karla font-600 uppercase tracking-[0.10em]" style={{ fontSize: '0.5rem', color: '#6a6764' }}>Members Only</span>
            )}
          </div>
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: dim ? '#8a8884' : '#f0ede8', lineHeight: 1.15 }}>
            {claimed ? `${title} Claimed` : title}
          </p>
          <p className="font-karla mt-1" style={{ fontSize: '0.78rem', lineHeight: 1.5, color: dim ? '#6a6764' : '#a8a4a0' }}>
            {claimed ? 'Come back tomorrow.' : description}
          </p>
        </div>
      </div>

      {!claimed && !locked && (
        <button
          onClick={onClaim}
          disabled={loading}
          className="btn-gold w-full"
          style={{
            marginTop: '0.85rem',
            padding: '0.6rem',
            fontSize: '0.78rem',
            letterSpacing: '0.1em',
            opacity: loading ? 0.65 : 1,
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading ? 'Claiming…' : 'Claim'}
        </button>
      )}
    </div>
  )
}

function CheckIcon({ color }: { color: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  )
}
