'use client'

import { useEffect, useState } from 'react'
import type { WeeklyBountiesResult, BountyFish } from './bountyActions'
import { daysUntilReset } from '@/lib/weekStart'

const TIERS = [
  { key: 'shallows',   label: 'Shallows',    color: '#4ade80', reward: '50 ⟡' },
  { key: 'openWaters', label: 'Open Waters',  color: '#60a5fa', reward: '150 ⟡' },
  { key: 'deep',       label: 'Deep',         color: '#a78bfa', reward: '300 ⟡' },
  { key: 'abyss',      label: 'Abyss',        color: '#f0c040', reward: '500 ⟡ + 1 Pack' },
] as const

type TierKey = 'shallows' | 'openWaters' | 'deep' | 'abyss'

function fishImageUrl(filename: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/${filename}`
}

function BountyRow({ fish, label, color, reward, completed }: {
  fish: BountyFish
  label: string
  color: string
  reward: string
  completed: boolean
}) {
  return (
    <div
      className="flex items-center gap-3 py-2.5"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        opacity: completed ? 0.5 : 1,
        transition: 'opacity 0.3s ease',
      }}
    >
      {/* Zone dot */}
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        border: `1px solid ${completed ? 'rgba(255,255,255,0.1)' : color}40`,
      }} />

      {/* Labels */}
      <div className="flex-1 min-w-0">
        <p
          className="font-karla font-700 uppercase tracking-[0.1em]"
          style={{ fontSize: '0.52rem', color, marginBottom: 1 }}
        >
          {label}
        </p>
        <p
          className="font-karla font-500 truncate"
          style={{ fontSize: '0.82rem', color: completed ? '#4a4845' : '#f0ede8' }}
        >
          {fish.name}
        </p>
      </div>

      {/* Reward / checkmark */}
      <div className="flex items-center gap-2 shrink-0">
        {completed ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        ) : (
          <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#a0a09a' }}>
            {reward}
          </p>
        )}
      </div>
    </div>
  )
}

interface Props {
  initialData: WeeklyBountiesResult
}

export default function WeeklyBounties({ initialData }: Props) {
  const [progress, setProgress] = useState(initialData.progress)
  const days = daysUntilReset()

  useEffect(() => {
    function handleCompletion(e: Event) {
      const tier = (e as CustomEvent<{ tier: string }>).detail.tier
      const keyMap: Record<string, TierKey> = {
        shallows: 'shallows',
        open_waters: 'openWaters',
        deep: 'deep',
        abyss: 'abyss',
      }
      const key = keyMap[tier]
      if (key) setProgress((prev) => ({ ...prev, [key]: true }))
    }
    window.addEventListener('bounty-completed', handleCompletion)
    return () => window.removeEventListener('bounty-completed', handleCompletion)
  }, [])

  const fishByKey: Record<TierKey, BountyFish> = {
    shallows: initialData.shallows,
    openWaters: initialData.openWaters,
    deep: initialData.deep,
    abyss: initialData.abyss,
  }

  const allDone = Object.values(progress).every(Boolean)

  return (
    <div
      className="w-full max-w-sm mx-auto mt-8"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        padding: '1rem 1.25rem',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: '#f0c040' }}>
          Weekly Bounties
        </p>
        <p className="font-karla font-500" style={{ fontSize: '0.58rem', color: '#4a4845' }}>
          {allDone ? 'All complete' : `Resets in ${days}d`}
        </p>
      </div>

      {/* Rows */}
      <div>
        {TIERS.map((tier, i) => (
          <div key={tier.key} style={i === TIERS.length - 1 ? { borderBottom: 'none' } : {}}>
            <BountyRow
              fish={fishByKey[tier.key]}
              label={tier.label}
              color={tier.color}
              reward={tier.reward}
              completed={progress[tier.key]}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
