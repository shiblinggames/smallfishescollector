'use client'

import { useState } from 'react'
import { claimDailyBonus } from '@/app/actions/dailyBonus'

export default function DailyBonusClaim({
  alreadyClaimed: initialClaimed,
  bonusAmount,
  isPremium,
}: {
  alreadyClaimed: boolean
  bonusAmount: number
  isPremium: boolean
}) {
  const [claimed, setClaimed] = useState(initialClaimed)
  const [loading, setLoading] = useState(false)
  const [justClaimed, setJustClaimed] = useState(false)

  async function handleClaim() {
    if (claimed || loading) return
    setLoading(true)
    const result = await claimDailyBonus()
    if (result.claimed) {
      setClaimed(true)
      setJustClaimed(true)
    }
    setLoading(false)
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${claimed ? 'rgba(255,255,255,0.08)' : 'rgba(240,192,64,0.22)'}`,
      borderRadius: '16px',
      padding: '1.25rem',
    }}>
      <div className="flex items-start gap-4">
        <div style={{
          width: 48, height: 48,
          background: claimed ? 'rgba(255,255,255,0.03)' : 'rgba(240,192,64,0.08)',
          border: `1px solid ${claimed ? 'rgba(255,255,255,0.07)' : 'rgba(240,192,64,0.18)'}`,
          borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          color: claimed ? '#4a4845' : '#f0c040',
        }}>
          {claimed ? <CheckIcon /> : <CoinIcon />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="sg-eyebrow mb-0.5" style={{ color: '#9a9488' }}>Daily Bonus</p>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>
            {justClaimed ? `+${bonusAmount} ⟡ Claimed` : claimed ? 'Claimed' : `+${bonusAmount} ⟡`}
          </p>
          <p className="font-karla text-[#8a8880] mt-1" style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
            {claimed
              ? 'Come back tomorrow for your next bonus.'
              : isPremium
                ? `${bonusAmount} doubloons + 1 free pack, every day.`
                : `${bonusAmount} doubloons to save up for hook upgrades.`
            }
          </p>
        </div>
      </div>

      {!claimed && (
        <>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '1rem 0 0.75rem' }} />
          <button
            onClick={handleClaim}
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
            {loading ? 'Claiming…' : 'Claim Bonus'}
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

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  )
}
