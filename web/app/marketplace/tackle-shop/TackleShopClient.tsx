'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { HOOKS } from '@/lib/hooks'
import { buyHook } from '@/app/hooks/actions'

const HookViewer3D = dynamic(() => import('./HookViewer3D'), { ssr: false })

export default function TackleShopClient({ hookTier: initialTier, doubloons: initialDoubloons }: { hookTier: number; doubloons: number }) {
  const [hookTier, setHookTier] = useState(initialTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [isPending, startTransition] = useTransition()
  const [hookError, setHookError] = useState<string | null>(null)
  const [tooltipTier, setTooltipTier] = useState<number | null>(null)
  const [previewTier, setPreviewTier] = useState(initialTier)

  function handleBuyHook() {
    setHookError(null)
    startTransition(async () => {
      const result = await buyHook()
      if ('error' in result) {
        setHookError(result.error)
      } else {
        setHookTier(result.hookTier)
        setDoubloons(result.doubloons)
      }
    })
  }

  const nextHook = hookTier < HOOKS.length - 1 ? HOOKS[hookTier + 1] : null
  const canAfford = nextHook ? doubloons >= nextHook.cost : false
  const previewHook = HOOKS[previewTier]

  return (
    <div className="px-6 max-w-sm sm:max-w-2xl mx-auto">
      <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-3 text-[0.65rem] sm:text-xs">
        Tackle Shop
      </p>

      <div className="mb-5">
        {previewHook.modelUrl ? (
          <HookViewer3D modelUrl={previewHook.modelUrl} color={previewHook.color} tier={previewTier} />
        ) : (
          <div style={{
            width: '100%', height: 220, borderRadius: 14,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ width: 56, height: 56, opacity: 0.2 }}>
              <HookIcon tier={previewTier} color={previewHook.color} owned={false} isActive={false} />
            </div>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 mt-2.5">
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.85rem', color: previewHook.color }}>
            {previewHook.name}
          </p>
          {previewTier !== hookTier && (
            <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.48rem', color: '#6a6764' }}>
              preview
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 mb-6">
        {HOOKS.map((hook) => {
          const owned = hook.tier <= hookTier
          const isActive = hook.tier === hookTier
          const locked = hook.tier > hookTier + 1
          const showTooltip = tooltipTier === hook.tier
          const c = hook.color

          const isNext = hook.tier === hookTier + 1
          const clickable = isNext && canAfford && !isPending
          const isPreviewing = previewTier === hook.tier && hook.tier !== hookTier
          const luckPct = Math.round((hook.deepChance - HOOKS[0].deepChance) / (HOOKS[HOOKS.length - 1].deepChance - HOOKS[0].deepChance) * 100)

          return (
            <div
              key={hook.tier}
              onClick={() => {
                setPreviewTier(hook.tier)
                if (clickable) handleBuyHook()
              }}
              className="p-3 sm:p-5"
              style={{
                background: owned ? `${c}0d` : isNext && canAfford ? `${c}08` : 'rgba(255,255,255,0.05)',
                border: `1px solid ${owned ? `${c}55` : isPreviewing ? `${c}30` : isNext && canAfford ? `${c}40` : 'rgba(255,255,255,0.09)'}`,
                boxShadow: isActive ? `0 0 16px ${c}18` : isPreviewing ? `0 0 10px ${c}10` : isNext && canAfford ? `0 0 12px ${c}12` : 'none',
                borderRadius: 12,
                opacity: locked ? 0.3 : isPending && isNext ? 0.6 : 1,
                cursor: 'pointer',
                transition: 'box-shadow 0.2s ease, opacity 0.15s ease',
              }}
            >
              <div className="flex items-start gap-3 sm:gap-5">
                <HookIcon tier={hook.tier} color={c} owned={owned} isActive={isActive} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-cinzel font-700 text-sm sm:text-base" style={{ color: owned ? '#f0ede8' : '#6a6764' }}>
                      {hook.name}
                    </p>
                    {isActive && (
                      <span className="font-karla font-600 uppercase tracking-[0.12em] text-[0.52rem] sm:text-[0.6rem]" style={{ color: c }}>Active</span>
                    )}
                    {owned && !isActive && (
                      <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80] text-[0.52rem] sm:text-[0.6rem]">Owned</span>
                    )}
                  </div>
                  <p className="font-karla font-300 text-[#6a6764] text-xs sm:text-sm">{hook.description}</p>

                  {isNext && (
                    <p className="font-karla font-600 mt-1 text-xs sm:text-sm" style={{ color: canAfford ? c : '#6a6764' }}>
                      {isPending ? 'Upgrading…' : canAfford ? '↑ Tap to upgrade' : `${(hook.cost - doubloons).toLocaleString()} ⟡ short`}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {!owned && (
                    <p className="font-cinzel font-700 text-[#f0c040] text-sm sm:text-base">
                      {hook.cost.toLocaleString()} ⟡
                    </p>
                  )}
                  <p className="font-karla font-600 text-xs sm:text-sm" style={{ color: owned ? c : '#4a4845' }}>
                    {luckPct}% luck
                  </p>
                  <button
                    onClick={(e) => { e.stopPropagation(); setTooltipTier(showTooltip ? null : hook.tier) }}
                    onMouseEnter={() => setTooltipTier(hook.tier)}
                    onMouseLeave={() => setTooltipTier(null)}
                    className="transition-colors"
                    style={{ color: showTooltip ? '#a0a09a' : '#4a4845', lineHeight: 1 }}
                    aria-label="Show zone breakdown"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="8.5"/>
                      <line x1="12" y1="12" x2="12" y2="16"/>
                    </svg>
                  </button>
                </div>
              </div>

              {showTooltip && (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:gap-x-8 sm:gap-y-1.5" style={{ paddingLeft: 50 }}>
                  {[
                    { label: 'Shallows', value: hook.weights.shallows, color: '#60a5fa' },
                    { label: 'Open Waters', value: hook.weights.openWaters, color: '#4ade80' },
                    { label: 'Deep', value: hook.weights.deep, color: '#a78bfa' },
                    { label: 'Abyss', value: hook.weights.abyss, color: '#f0c040' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between gap-2">
                      <p className="font-karla font-300 text-[#6a6764] text-[0.65rem] sm:text-xs">{label}</p>
                      <p className="font-karla font-600 text-[0.65rem] sm:text-xs" style={{ color }}>{(value * 100).toFixed(1)}%</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {hookError && <p className="font-karla font-300 text-red-400 text-xs text-center mb-2">{hookError}</p>}
      {!nextHook && (
        <p className="font-karla font-300 text-[#a0a09a] text-sm text-center">
          You have the best hook in the sea.
        </p>
      )}
    </div>
  )
}

function HookIcon({ tier, color, owned, isActive }: { tier: number; color: string; owned: boolean; isActive: boolean }) {
  const stroke = owned ? color : '#4a4845'
  const fill = owned ? color : '#4a4845'
  const bg = owned ? `${color}12` : 'rgba(255,255,255,0.06)'
  const border = owned ? `${color}35` : 'rgba(255,255,255,0.11)'

  const icons: Record<number, React.ReactNode> = {
    0: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <circle cx="12" cy="3" r="1.2" fill={fill} stroke="none"/>
        <circle cx="9" cy="7" r="0.5" fill={stroke} stroke="none" opacity="0.5"/>
        <circle cx="13" cy="10" r="0.4" fill={stroke} stroke="none" opacity="0.4"/>
      </svg>
    ),
    1: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 3 L13 8 L11 12"/>
        <path d="M11 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <circle cx="13" cy="3" r="1.3" fill={fill} stroke="none"/>
      </svg>
    ),
    2: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <path d="M9.5 15.5 L7.5 13.5"/>
        <circle cx="12" cy="3" r="1.3" fill={fill} stroke="none"/>
      </svg>
    ),
    3: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <ellipse cx="12" cy="7" rx="2.5" ry="1" strokeWidth="1.4"/>
        <circle cx="12" cy="3" r="1.3" fill={fill} stroke="none"/>
      </svg>
    ),
    4: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v7"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <path d="M9 3 C9 1.5 15 1.5 15 3 C15 4.5 12 5 12 5"/>
        <path d="M9.5 15.5 L7.5 13.5"/>
      </svg>
    ),
    5: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v9"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <circle cx="12" cy="3" r="1.3" fill={fill} stroke="none"/>
        <circle cx="17" cy="5" r="0.8" fill={fill} stroke="none" opacity="0.7"/>
        <circle cx="15" cy="9" r="0.6" fill={fill} stroke="none" opacity="0.5"/>
        <circle cx="7" cy="7" r="0.7" fill={fill} stroke="none" opacity="0.6"/>
      </svg>
    ),
    6: (
      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 5v7"/>
        <path d="M12 12c0 4-3 5.5-4.5 3.5s-.5-4.5 2-4.5"/>
        <path d="M9 2 L12 5 L15 2"/>
        <path d="M9 2 L9 4M15 2 L15 4"/>
        <path d="M9.5 15.5 L7.5 13.5"/>
      </svg>
    ),
  }

  return (
    <div
      className="w-[38px] h-[38px] sm:w-12 sm:h-12 shrink-0 flex items-center justify-center p-2 sm:p-2.5"
      style={{
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: isActive ? `0 0 10px ${color}25` : 'none',
      }}
    >
      {icons[tier]}
    </div>
  )
}
