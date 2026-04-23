'use client'

import { useState } from 'react'
import { claimDailyBonus } from '@/app/actions/dailyBonus'
import { claimShipBonus } from '@/app/actions/shipBonus'
import { claimDailyPack } from '@/app/actions/dailyPack'
import AchievementToast from '@/components/AchievementToast'

interface Props {
  dailyClaimed: boolean
  shipClaimed: boolean
  packClaimed: boolean
  baseAmount: number
  shipAmount: number
  shipName: string
  shipTier: number
  isPremium: boolean
}

export default function DailyBonusClient({
  dailyClaimed: initialDailyClaimed,
  shipClaimed: initialShipClaimed,
  packClaimed: initialPackClaimed,
  baseAmount,
  shipAmount,
  shipName,
  shipTier,
  isPremium,
}: Props) {
  const [dailyClaimed, setDailyClaimed] = useState(initialDailyClaimed)
  const [shipClaimed, setShipClaimed] = useState(initialShipClaimed)
  const [packClaimed, setPackClaimed] = useState(initialPackClaimed)
  const [loadingDaily, setLoadingDaily] = useState(false)
  const [loadingShip, setLoadingShip] = useState(false)
  const [loadingPack, setLoadingPack] = useState(false)
  const [achievementKeys, setAchievementKeys] = useState<string[]>([])

  async function handleClaimDaily() {
    if (dailyClaimed || loadingDaily) return
    setLoadingDaily(true)
    const result = await claimDailyBonus()
    if (result.claimed) {
      setDailyClaimed(true)
      if (result.newAchievements?.length) setAchievementKeys(result.newAchievements)
    }
    setLoadingDaily(false)
  }

  async function handleClaimShip() {
    if (shipClaimed || loadingShip) return
    setLoadingShip(true)
    const result = await claimShipBonus()
    if (result.claimed) setShipClaimed(true)
    setLoadingShip(false)
  }

  async function handleClaimPack() {
    if (packClaimed || loadingPack || !isPremium) return
    setLoadingPack(true)
    const result = await claimDailyPack()
    if (result.claimed) setPackClaimed(true)
    setLoadingPack(false)
  }

  return (
    <>
      <AchievementToast keys={achievementKeys} onDone={() => setAchievementKeys([])} />
      <div className="flex flex-col gap-3">

        {/* Base daily doubloons */}
        <ClaimCard
          eyebrow="Daily Bonus"
          title={`+${baseAmount} ⟡`}
          description={isPremium ? 'Your daily doubloon bonus as a Member.' : 'Your daily doubloon bonus.'}
          claimed={dailyClaimed}
          loading={loadingDaily}
          onClaim={handleClaimDaily}
          icon={<CoinIcon />}
          badge={isPremium ? 'Member' : undefined}
        />

        {/* Ship bonus — only show if tier > 0 */}
        {shipTier > 0 && (
          <ClaimCard
            eyebrow="Ship Earnings"
            title={`+${shipAmount} ⟡`}
            description={`Daily income from your ${shipName}.`}
            claimed={shipClaimed}
            loading={loadingShip}
            onClaim={handleClaimShip}
            icon={<ShipIcon />}
          />
        )}

        {/* Daily pack */}
        <ClaimCard
          eyebrow="Daily Pack"
          title="+1 Pack"
          description={isPremium ? 'Your daily free pack as a Member.' : 'Upgrade to a Membership to claim a free pack every day.'}
          claimed={packClaimed}
          loading={loadingPack}
          onClaim={handleClaimPack}
          icon={<PackIcon />}
          locked={!isPremium}
          badge={isPremium ? 'Member' : undefined}
        />

      </div>
    </>
  )
}

function ClaimCard({
  eyebrow, title, description, claimed, loading, onClaim, icon, badge, locked,
}: {
  eyebrow: string
  title: string
  description: string
  claimed: boolean
  loading: boolean
  onClaim: () => void
  icon: React.ReactNode
  badge?: string
  locked?: boolean
}) {
  const dim = claimed || locked

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${claimed ? 'rgba(255,255,255,0.06)' : locked ? 'rgba(255,255,255,0.06)' : 'rgba(240,192,64,0.22)'}`,
      borderRadius: '16px',
      padding: '1.25rem',
      opacity: dim ? 0.6 : 1,
      transition: 'opacity 0.2s ease',
    }}>
      <div className="flex items-start gap-4">
        <div style={{
          width: 48, height: 48,
          background: dim ? 'rgba(255,255,255,0.03)' : 'rgba(240,192,64,0.08)',
          border: `1px solid ${dim ? 'rgba(255,255,255,0.07)' : 'rgba(240,192,64,0.18)'}`,
          borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          color: dim ? '#4a4845' : '#f0c040',
        }}>
          {claimed ? <CheckIcon /> : icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="sg-eyebrow" style={{ color: '#9a9488' }}>{eyebrow}</p>
            {badge && !locked && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.3)' }}>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: '#f0c040' }}>{badge}</span>
              </div>
            )}
            {locked && (
              <span className="font-karla font-600 uppercase tracking-[0.10em] text-[#4a4845]" style={{ fontSize: '0.5rem' }}>Members Only</span>
            )}
          </div>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>
            {claimed ? `${title} Claimed` : title}
          </p>
          <p className="font-karla text-[#8a8880] mt-1" style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
            {claimed ? 'Come back tomorrow.' : description}
          </p>
        </div>
      </div>

      {!claimed && !locked && (
        <>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '1rem 0 0.75rem' }} />
          <button
            onClick={onClaim}
            disabled={loading}
            className="w-full py-2.5 rounded-xl font-karla font-700 uppercase tracking-[0.12em] transition-opacity hover:opacity-80"
            style={{
              background: 'rgba(240,192,64,0.14)',
              border: '1px solid rgba(240,192,64,0.3)',
              color: '#f0c040',
              fontSize: '0.65rem',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Claiming…' : 'Claim'}
          </button>
        </>
      )}
    </div>
  )
}

function CoinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 7v1.5M12 15.5V17M9.5 9.5C9.5 8.4 10.6 8 12 8s2.5.6 2.5 1.8c0 2.4-5 2-5 4.4C9.5 15.4 10.6 16 12 16s2.5-.5 2.5-1.7"/>
    </svg>
  )
}

function ShipIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 17 C4 21 20 21 22 17"/>
      <path d="M3 17 L5 12 L19 12 L21 17"/>
      <line x1="11" y1="12" x2="11" y2="4"/>
      <path d="M11 4 L18 9 L11 12"/>
      <line x1="7" y1="12" x2="7" y2="7"/>
      <path d="M7 7 L11 9 L7 11"/>
    </svg>
  )
}

function PackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2"/>
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
      <line x1="12" y1="12" x2="12" y2="17"/>
      <line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/>
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  )
}
