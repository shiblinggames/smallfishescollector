'use client'

import { useState } from 'react'
import { claimBountyReward } from '@/app/packs/bountyActions'
import type { WeeklyBountiesResult } from '@/app/packs/bountyActions'

type Tier = 'shallows' | 'open_waters' | 'deep' | 'abyss'

const TIER_META: Record<Tier, { label: string; color: string; rewardLabel: string }> = {
  shallows:    { label: 'Shallows',    color: '#60a5fa', rewardLabel: '50 ⟡'           },
  open_waters: { label: 'Open Waters', color: '#34d399', rewardLabel: '150 ⟡'          },
  deep:        { label: 'Deep',        color: '#a78bfa', rewardLabel: '300 ⟡'          },
  abyss:       { label: 'Abyss',       color: '#f87171', rewardLabel: '500 ⟡ + 1 Pack' },
}

const TIER_ORDER: Tier[] = ['shallows', 'open_waters', 'deep', 'abyss']

const PROGRESS_KEY: Record<Tier, keyof WeeklyBountiesResult['progress']> = {
  shallows:    'shallows',
  open_waters: 'openWaters',
  deep:        'deep',
  abyss:       'abyss',
}
const CLAIMED_KEY: Record<Tier, keyof WeeklyBountiesResult['claimed']> = {
  shallows:    'shallows',
  open_waters: 'openWaters',
  deep:        'deep',
  abyss:       'abyss',
}

interface BountyState {
  completed: boolean
  claimed: boolean
}

export default function BountyClaimClient({
  bounties,
  doubloons: initialDoubloons,
}: {
  bounties: WeeklyBountiesResult
  doubloons: number
}) {
  const [states, setStates] = useState<Record<Tier, BountyState>>({
    shallows:    { completed: bounties.progress[PROGRESS_KEY.shallows],    claimed: bounties.claimed[CLAIMED_KEY.shallows]    },
    open_waters: { completed: bounties.progress[PROGRESS_KEY.open_waters], claimed: bounties.claimed[CLAIMED_KEY.open_waters] },
    deep:        { completed: bounties.progress[PROGRESS_KEY.deep],        claimed: bounties.claimed[CLAIMED_KEY.deep]        },
    abyss:       { completed: bounties.progress[PROGRESS_KEY.abyss],       claimed: bounties.claimed[CLAIMED_KEY.abyss]       },
  })
  const [claiming, setClaiming] = useState<Tier | null>(null)
  const [doubloons, setDoubloons] = useState(initialDoubloons)

  const fishByTier = {
    shallows:    bounties.shallows,
    open_waters: bounties.openWaters,
    deep:        bounties.deep,
    abyss:       bounties.abyss,
  }

  async function handleClaim(tier: Tier) {
    if (claiming) return
    setClaiming(tier)
    const result = await claimBountyReward(tier)
    setClaiming(null)
    if ('error' in result) return
    setStates(prev => ({ ...prev, [tier]: { ...prev[tier], claimed: true } }))
    setDoubloons(result.doubloons)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.doubloons }))
  }

  const readyToClaim = TIER_ORDER.filter(t => states[t].completed && !states[t].claimed)

  return (
    <div className="flex flex-col gap-3">
      {readyToClaim.length > 0 && (
        <div className="px-4 py-3 rounded-xl mb-1" style={{
          background: 'rgba(240,192,64,0.07)',
          border: '1px solid rgba(240,192,64,0.2)',
        }}>
          <p className="font-karla font-600 text-[#f0c040]" style={{ fontSize: '0.78rem' }}>
            {readyToClaim.length} bounty reward{readyToClaim.length > 1 ? 's' : ''} ready to claim
          </p>
        </div>
      )}

      {TIER_ORDER.map(tier => {
        const meta = TIER_META[tier]
        const state = states[tier]
        const fish = fishByTier[tier]
        const isClaiming = claiming === tier

        return (
          <div
            key={tier}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${state.completed && !state.claimed ? `${meta.color}40` : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 16,
              padding: '1.25rem',
              opacity: state.claimed ? 0.55 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: `${meta.color}12`,
                border: `1px solid ${meta.color}${state.completed ? '35' : '18'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: state.completed ? meta.color : '#3a3835',
              }}>
                {state.claimed ? <CheckIcon /> : state.completed ? <FishIcon /> : <LockIcon />}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p
                  className="font-karla font-700 uppercase tracking-[0.12em] mb-0.5"
                  style={{ fontSize: '0.52rem', color: meta.color }}
                >
                  {meta.label}
                </p>
                <p
                  className="font-cinzel font-700"
                  style={{ fontSize: '1rem', color: state.completed ? '#f0ede8' : '#4a4845' }}
                >
                  {fish.name}
                </p>
                <p className="font-karla font-600 mt-0.5" style={{ fontSize: '0.72rem', color: '#6a6764' }}>
                  {meta.rewardLabel}
                </p>
              </div>
            </div>

            {/* Claimed confirmation */}
            {state.claimed && (
              <div className="flex items-center gap-1.5 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#4ade80' }}>Claimed</p>
              </div>
            )}

            {/* Claim button */}
            {!state.claimed && state.completed && (
              <>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '1rem 0 0.75rem' }} />
                <button
                  onClick={() => handleClaim(tier)}
                  disabled={!!claiming}
                  className="w-full py-2.5 rounded-xl font-karla font-700 uppercase tracking-[0.12em]"
                  style={{
                    background: `${meta.color}1a`,
                    border: `1px solid ${meta.color}45`,
                    color: meta.color,
                    fontSize: '0.65rem',
                    opacity: claiming ? 0.6 : 1,
                    cursor: claiming ? 'default' : 'pointer',
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  {isClaiming ? 'Claiming…' : `Claim ${meta.rewardLabel}`}
                </button>
              </>
            )}

            {/* Not caught yet */}
            {!state.completed && (
              <p className="font-karla font-600 mt-3 pt-3"
                style={{ fontSize: '0.65rem', color: '#3a3835', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                Catch this fish while fishing to unlock
              </p>
            )}
          </div>
        )
      })}

      {doubloons !== initialDoubloons && (
        <p className="font-karla font-600 text-center mt-1" style={{ fontSize: '0.75rem', color: '#f0c040' }}>
          Balance: {doubloons.toLocaleString()} ⟡
        </p>
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5"/>
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

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}
