'use client'

import { useState, useTransition } from 'react'
import { HOOKS } from '@/lib/hooks'
import { buyHook } from './actions'

export default function HookShop({ hookTier: initialTier, doubloons: initialDoubloons }: { hookTier: number; doubloons: number }) {
  const [hookTier, setHookTier] = useState(initialTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleBuy() {
    setError(null)
    startTransition(async () => {
      const result = await buyHook()
      if ('error' in result) {
        setError(result.error)
      } else {
        setHookTier(result.hookTier)
        setDoubloons(result.doubloons)
      }
    })
  }

  const nextHook = hookTier < HOOKS.length - 1 ? HOOKS[hookTier + 1] : null
  const canAfford = nextHook ? doubloons >= nextHook.cost : false

  return (
    <div className="px-6 max-w-sm mx-auto">
      <div className="flex flex-col gap-3 mb-8">
        {HOOKS.map((hook) => {
          const owned = hook.tier <= hookTier
          const isActive = hook.tier === hookTier
          const isNext = hook.tier === hookTier + 1
          const locked = hook.tier > hookTier + 1

          return (
            <div
              key={hook.tier}
              style={{
                background: isActive
                  ? 'rgba(240,192,64,0.06)'
                  : owned
                  ? 'rgba(255,255,255,0.06)'
                  : 'rgba(255,255,255,0.05)',
                border: isActive
                  ? '1px solid rgba(240,192,64,0.35)'
                  : owned
                  ? '1px solid rgba(255,255,255,0.15)'
                  : '1px solid rgba(255,255,255,0.09)',
                borderRadius: 12,
                padding: '0.875rem 1rem',
                opacity: locked ? 0.4 : 1,
              }}
            >
              <div className="flex items-center gap-3">
                <HookIcon tier={hook.tier} active={isActive} owned={owned} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.9rem' }}>
                      {hook.name}
                    </p>
                    {isActive && (
                      <span className="font-karla font-600 uppercase tracking-[0.12em] text-[#f0c040]" style={{ fontSize: '0.55rem' }}>
                        Active
                      </span>
                    )}
                    {owned && !isActive && (
                      <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80]" style={{ fontSize: '0.55rem' }}>
                        Owned
                      </span>
                    )}
                  </div>
                  <p className="font-karla font-300 text-[#6a6764] mt-0.5" style={{ fontSize: '0.75rem' }}>
                    {hook.description}
                  </p>
                </div>
                {!owned && (
                  <p className="font-cinzel font-700 text-[#f0c040] shrink-0" style={{ fontSize: '0.85rem' }}>
                    {hook.cost.toLocaleString()} ⟡
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {nextHook && (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleBuy}
            disabled={isPending || !canAfford}
            className="btn-ghost w-full disabled:opacity-40"
            style={{ cursor: canAfford ? 'pointer' : 'default' }}
          >
            {isPending
              ? 'Buying…'
              : `Upgrade to ${nextHook.name} · ${nextHook.cost.toLocaleString()} ⟡`}
          </button>
          {!canAfford && (
            <p className="font-karla font-300 text-[#6a6764] text-xs text-center">
              You need {(nextHook.cost - doubloons).toLocaleString()} more ⟡
            </p>
          )}
          {error && (
            <p className="font-karla font-300 text-red-400 text-xs text-center">{error}</p>
          )}
        </div>
      )}

      {!nextHook && (
        <p className="font-karla font-300 text-[#a0a09a] text-sm text-center">
          You have the best hook in the sea.
        </p>
      )}
    </div>
  )
}

function HookIcon({ tier, active, owned }: { tier: number; active: boolean; owned: boolean }) {
  const color = active ? '#f0c040' : owned ? '#a0a09a' : '#4a4845'
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
      background: active ? 'rgba(240,192,64,0.08)' : 'rgba(255,255,255,0.08)',
      border: `1px solid ${active ? 'rgba(240,192,64,0.2)' : 'rgba(255,255,255,0.11)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v10"/>
        <path d="M12 12c0 4-3 6-5 4s-1-5 2-5"/>
        <circle cx="12" cy="3" r="1.5" fill={color} stroke="none"/>
        {tier >= 4 && <path d="M16 6c2 1 3 3 3 5" opacity="0.6"/>}
        {tier >= 6 && <path d="M16 6c2 1 3 3 3 5M18 4c2 2 3 5 2 8" opacity="0.4"/>}
      </svg>
    </div>
  )
}
