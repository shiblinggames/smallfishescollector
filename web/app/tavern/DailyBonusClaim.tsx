'use client'

import { useState } from 'react'
import { claimDailyBonus } from '@/app/actions/dailyBonus'
import AchievementToast from '@/components/AchievementToast'

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
  const [achievementKeys, setAchievementKeys] = useState<string[]>([])

  async function handleClaim() {
    if (claimed || loading) return
    setLoading(true)
    const result = await claimDailyBonus()
    if (result.claimed) {
      setClaimed(true)
      setJustClaimed(true)
      if (result.newAchievements?.length) setAchievementKeys(result.newAchievements)
    }
    setLoading(false)
  }

  return (
    <>
    <AchievementToast keys={achievementKeys} onDone={() => setAchievementKeys([])} />
    <div style={{
      background: 'rgba(255,255,255,0.08)',
      border: `1px solid ${claimed ? 'rgba(255,255,255,0.15)' : 'rgba(240,192,64,0.22)'}`,
      borderRadius: '16px',
      padding: '1.25rem',
      opacity: claimed ? 0.7 : 1,
    }}>
      <div className="flex items-start gap-4">
        <div style={{
          width: 48, height: 48,
          background: claimed ? 'rgba(255,255,255,0.06)' : 'rgba(240,192,64,0.08)',
          border: `1px solid ${claimed ? 'rgba(255,255,255,0.13)' : 'rgba(240,192,64,0.18)'}`,
          borderRadius: '12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          color: claimed ? '#4a4845' : '#f0c040',
        }}>
          {claimed ? <CheckIcon /> : <CoinIcon />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="sg-eyebrow" style={{ color: '#9a9488' }}>Daily Bonus</p>
            {isPremium && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.3)' }}>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: '#f0c040' }}>Member</span>
              </div>
            )}
          </div>
          <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1rem' }}>
            {justClaimed ? `+${bonusAmount} ⟡ Claimed` : claimed ? 'Claimed' : `+${bonusAmount} ⟡`}
          </p>
          <p className="font-karla text-[#a0a09a] mt-1" style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>
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
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.11)', margin: '1rem 0 0.75rem' }} />
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
    </>
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
