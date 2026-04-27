'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { HOOKS } from '@/lib/hooks'
import { RODS } from '@/lib/rods'
import { REELS } from '@/lib/reels'
import { LINES } from '@/lib/lines'
import { BAITS } from '@/lib/bait'
import { buyHook } from '@/app/hooks/actions'
import { buyBait, buyRod, buyReel } from './actions'

const HookViewer3D = dynamic(() => import('./HookViewer3D'), { ssr: false })

const HABITAT_COLOR: Record<string, string> = {
  shallows:    '#60a5fa',
  open_waters: '#34d399',
  deep:        '#a78bfa',
  abyss:       '#f87171',
}
const HABITAT_LABEL: Record<string, string> = {
  shallows:    'Shallows',
  open_waters: 'Open Waters',
  deep:        'Deep',
  abyss:       'Abyss',
}
const BUNDLE: Record<string, number> = { worm: 10, minnow: 5, squid: 3, chum: 3 }

type BaitInventoryItem = { bait_type: string; quantity: number }
type Section = 'bait' | 'hook' | 'rod' | 'reel' | 'line' | null

export default function TackleShopClient({
  hookTier: initialHookTier,
  rodTier: initialRodTier,
  reelTier: initialReelTier,
  lineTier,
  doubloons: initialDoubloons,
  baitInventory: initialBait,
}: {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  doubloons: number
  baitInventory: BaitInventoryItem[]
}) {
  const [section, setSection] = useState<Section>(null)
  const [hookTier, setHookTier] = useState(initialHookTier)
  const [rodTier, setRodTier] = useState(initialRodTier)
  const [reelTier, setReelTier] = useState(initialReelTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [baitInventory, setBaitInventory] = useState<BaitInventoryItem[]>(initialBait)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [buyingBait, setBuyingBait] = useState<string | null>(null)
  const [previewTier, setPreviewTier] = useState(initialHookTier)

  const baitMap = Object.fromEntries(baitInventory.map(b => [b.bait_type, b.quantity]))
  const totalBait = Object.values(baitMap).reduce((a, b) => a + b, 0)
  const shopBaits = BAITS.filter(b => b.shopCost > 0)

  function broadcastDoubloons(amount: number) {
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: amount }))
  }

  function handleBuyHook() {
    setError(null)
    startTransition(async () => {
      const result = await buyHook()
      if ('error' in result) { setError(result.error) }
      else { setHookTier(result.hookTier); setDoubloons(result.doubloons); broadcastDoubloons(result.doubloons) }
    })
  }

  function handleBuyRod() {
    setError(null)
    startTransition(async () => {
      const result = await buyRod()
      if ('error' in result) { setError(result.error) }
      else { setRodTier(result.rodTier); setDoubloons(result.doubloons); broadcastDoubloons(result.doubloons) }
    })
  }

  function handleBuyReel() {
    setError(null)
    startTransition(async () => {
      const result = await buyReel()
      if ('error' in result) { setError(result.error) }
      else { setReelTier(result.reelTier); setDoubloons(result.doubloons); broadcastDoubloons(result.doubloons) }
    })
  }

  function handleBuyBait(baitType: string) {
    const qty = BUNDLE[baitType] ?? 5
    setError(null)
    setBuyingBait(baitType)
    startTransition(async () => {
      const result = await buyBait(baitType, qty)
      setBuyingBait(null)
      if ('error' in result) { setError(result.error) }
      else {
        setDoubloons(result.doubloons)
        broadcastDoubloons(result.doubloons)
        setBaitInventory(prev => {
          const existing = prev.find(b => b.bait_type === baitType)
          if (existing) return prev.map(b => b.bait_type === baitType ? { ...b, quantity: result.newQty } : b)
          return [...prev, { bait_type: baitType, quantity: result.newQty }]
        })
      }
    })
  }

  const CATEGORIES: { key: Exclude<Section, null>; label: string; desc: string; color: string; active: string }[] = [
    {
      key: 'bait', label: 'Bait', color: '#34d399',
      desc: 'Consumables used per cast. Better bait attracts fish faster and increases your chances of rare catches.',
      active: `${totalBait} in stock`,
    },
    {
      key: 'hook', label: 'Hooks', color: HOOKS[hookTier]?.color ?? '#f0c040',
      desc: 'Widens the catch zone on the reel dial. Higher tiers also add a bonus to your catch roll.',
      active: HOOKS[hookTier]?.name ?? '',
    },
    {
      key: 'rod', label: 'Rods', color: RODS[rodTier]?.color ?? '#a07858',
      desc: 'Unlocks deeper fishing zones. Higher tiers also improve your base roll and shorten bite wait times.',
      active: RODS[rodTier]?.name ?? '',
    },
    {
      key: 'reel', label: 'Reels', color: REELS[reelTier]?.color ?? '#60a5fa',
      desc: 'Slows the needle on the catch dial, giving you more time to land a perfect hit.',
      active: REELS[reelTier]?.name ?? '',
    },
    {
      key: 'line', label: 'Line', color: LINES[lineTier]?.color ?? '#4ade80',
      desc: 'Shrinks snag zones on the catch dial. Earned by catching unique species — no purchase needed.',
      active: LINES[lineTier]?.name ?? '',
    },
  ]

  // ── Landing ────────────────────────────────────────────────────────────
  if (section === null) {
    return (
      <div className="px-6 max-w-sm sm:max-w-2xl mx-auto">
        <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-5 text-[0.65rem] sm:text-xs">
          Tackle Shop
        </p>
        <div className="flex flex-col gap-2.5">
          {CATEGORIES.map(({ key, label, desc, color, active }) => (
            <button
              key={key}
              onClick={() => { setSection(key); setError(null) }}
              className="flex items-start gap-3 px-4 py-3.5 rounded-xl text-left transition-opacity active:opacity-70"
              style={{ background: `${color}0a`, border: `1px solid ${color}28` }}
            >
              <div style={{ width: 4, alignSelf: 'stretch', background: color, borderRadius: 2, flexShrink: 0, marginTop: 2 }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#f0ede8' }}>{label}</p>
                  <span className="font-karla font-600" style={{ fontSize: '0.58rem', color, background: `${color}18`, border: `1px solid ${color}30`, padding: '0.1rem 0.45rem', borderRadius: '2rem' }}>
                    {active}
                  </span>
                </div>
                <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.45 }}>{desc}</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 3 }}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Section shell ──────────────────────────────────────────────────────
  const sectionColor = CATEGORIES.find(c => c.key === section)?.color ?? '#f0ede8'
  const sectionLabel = CATEGORIES.find(c => c.key === section)?.label ?? ''

  return (
    <div className="px-6 max-w-sm sm:max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => { setSection(null); setError(null) }}
          className="font-karla font-600"
          style={{ fontSize: '0.72rem', color: '#6a6764' }}
        >
          ← Tackle Shop
        </button>
        <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: sectionColor }}>{sectionLabel}</p>
      </div>

      {error && <p className="font-karla font-300 text-red-400 text-xs text-center mb-3">{error}</p>}

      {/* ── Bait ── */}
      {section === 'bait' && (
        <div className="flex flex-col gap-2 mb-4">
          {shopBaits.map(bait => {
            const qty = baitMap[bait.type] ?? 0
            const bundleQty = BUNDLE[bait.type] ?? 5
            const bundleCost = bait.shopCost * bundleQty
            const canAffordBait = doubloons >= bundleCost
            const isBuying = buyingBait === bait.type && isPending

            return (
              <div key={bait.type}
                className="flex items-center gap-3 px-3 py-3 rounded-xl"
                style={{ background: `${bait.color}0a`, border: `1px solid ${bait.color}28` }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: `${bait.color}18`, border: `1px solid ${bait.color}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: bait.color }} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>
                    {bait.name}
                  </p>
                  <p className="font-karla font-300" style={{ fontSize: '0.66rem', color: '#6a6764', marginBottom: 3 }}>
                    {bait.description}
                  </p>
                  <div className="flex gap-1 flex-wrap">
                    {bait.habitats.map(h => (
                      <span key={h} className="font-karla font-600"
                        style={{
                          fontSize: '0.5rem', color: HABITAT_COLOR[h],
                          background: `${HABITAT_COLOR[h]}14`,
                          border: `1px solid ${HABITAT_COLOR[h]}30`,
                          padding: '0.1rem 0.4rem', borderRadius: '2rem',
                        }}>
                        {HABITAT_LABEL[h]}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: qty > 0 ? bait.color : '#4a4845' }}>
                    ×{qty} owned
                  </p>
                  <button
                    onClick={() => handleBuyBait(bait.type)}
                    disabled={!canAffordBait || isPending}
                    className="font-karla font-700"
                    style={{
                      fontSize: '0.6rem',
                      padding: '0.3rem 0.65rem',
                      borderRadius: 8,
                      background: canAffordBait ? `${bait.color}16` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${canAffordBait ? bait.color + '44' : 'rgba(255,255,255,0.08)'}`,
                      color: canAffordBait ? bait.color : '#4a4845',
                      cursor: canAffordBait && !isPending ? 'pointer' : 'default',
                      opacity: isBuying ? 0.5 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isBuying ? '…' : `+${bundleQty} · ${bundleCost.toLocaleString()} ⟡`}
                  </button>
                </div>
              </div>
            )
          })}
          <p className="font-karla font-300 text-center" style={{ fontSize: '0.6rem', color: '#3a3835', marginTop: 4 }}>
            Luminous Lure &amp; Golden Lure drop from expeditions and bounties
          </p>
        </div>
      )}

      {/* ── Hooks ── */}
      {section === 'hook' && (
        <>
          <div className="mb-5">
            {HOOKS[previewTier]?.modelUrl ? (
              <HookViewer3D modelUrl={HOOKS[previewTier].modelUrl} color={HOOKS[previewTier].color} tier={previewTier} />
            ) : (
              <div style={{
                width: '100%', height: 220, borderRadius: 14,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 56, height: 56, opacity: 0.2 }}>
                  <HookIcon tier={previewTier} color={HOOKS[previewTier]?.color ?? '#f0c040'} owned={false} isActive={false} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-center gap-2 mt-2.5">
              <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.85rem', color: HOOKS[previewTier]?.color }}>
                {HOOKS[previewTier]?.name}
              </p>
              {previewTier !== hookTier && (
                <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.48rem', color: '#6a6764' }}>
                  preview
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2.5 mb-4">
            {HOOKS.map(hook => {
              const owned = hook.tier <= hookTier
              const isActive = hook.tier === hookTier
              const locked = hook.tier > hookTier + 1
              const c = hook.color
              const isNext = hook.tier === hookTier + 1
              const canAffordHook = isNext && doubloons >= hook.cost
              const clickable = isNext && canAffordHook && !isPending
              const isPreviewing = previewTier === hook.tier && hook.tier !== hookTier

              return (
                <div
                  key={hook.tier}
                  onClick={() => { setPreviewTier(hook.tier); if (clickable) handleBuyHook() }}
                  className="p-3 sm:p-5"
                  style={{
                    background: owned ? `${c}0d` : isNext && canAffordHook ? `${c}08` : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${owned ? `${c}55` : isPreviewing ? `${c}30` : isNext && canAffordHook ? `${c}40` : 'rgba(255,255,255,0.09)'}`,
                    boxShadow: isActive ? `0 0 16px ${c}18` : isPreviewing ? `0 0 10px ${c}10` : isNext && canAffordHook ? `0 0 12px ${c}12` : 'none',
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

                      {owned && (
                        <div className="flex gap-3 mt-1.5 flex-wrap">
                          {hook.rollBonus > 0 && (
                            <span className="font-karla font-600 text-[0.65rem] sm:text-xs" style={{ color: `${c}99` }}>
                              +{hook.rollBonus} roll
                            </span>
                          )}
                          {hook.tier > 0 && (
                            <span className="font-karla font-600 text-[0.65rem] sm:text-xs" style={{ color: `${c}99` }}>
                              +{hook.tier * 3}° catch zone
                            </span>
                          )}
                        </div>
                      )}

                      {isNext && (
                        <p className="font-karla font-600 mt-1 text-xs sm:text-sm" style={{ color: canAffordHook ? c : '#6a6764' }}>
                          {isPending ? 'Upgrading…' : canAffordHook ? '↑ Tap to upgrade' : `${(hook.cost - doubloons).toLocaleString()} ⟡ short`}
                        </p>
                      )}
                    </div>

                    {!owned && (
                      <p className="font-cinzel font-700 text-[#f0c040] shrink-0 text-sm sm:text-base">
                        {hook.cost.toLocaleString()} ⟡
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {hookTier >= HOOKS.length - 1 && (
            <p className="font-karla font-300 text-[#a0a09a] text-sm text-center mb-4">
              You have the best hook in the sea.
            </p>
          )}
        </>
      )}

      {/* ── Rods ── */}
      {section === 'rod' && (
        <div className="flex flex-col gap-2.5 mb-4">
          {RODS.map(rod => {
            const owned = rod.tier <= rodTier
            const isActive = rod.tier === rodTier
            const locked = rod.tier > rodTier + 1
            const isNext = rod.tier === rodTier + 1
            const canAffordRod = isNext && doubloons >= rod.cost
            const c = rod.color

            return (
              <div
                key={rod.tier}
                onClick={() => { if (isNext && canAffordRod && !isPending) handleBuyRod() }}
                className="p-3 sm:p-5"
                style={{
                  background: owned ? `${c}0d` : isNext && canAffordRod ? `${c}08` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${owned ? `${c}55` : isNext && canAffordRod ? `${c}40` : 'rgba(255,255,255,0.09)'}`,
                  boxShadow: isActive ? `0 0 16px ${c}18` : isNext && canAffordRod ? `0 0 12px ${c}12` : 'none',
                  borderRadius: 12,
                  opacity: locked ? 0.3 : isPending && isNext ? 0.6 : 1,
                  cursor: isNext && canAffordRod ? 'pointer' : 'default',
                  transition: 'box-shadow 0.2s ease, opacity 0.15s ease',
                }}
              >
                <div className="flex items-start gap-3">
                  <GearIcon color={c} owned={owned} isActive={isActive} label={`T${rod.tier}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-cinzel font-700 text-sm" style={{ color: owned ? '#f0ede8' : '#6a6764' }}>
                        {rod.name}
                      </p>
                      {isActive && (
                        <span className="font-karla font-600 uppercase tracking-[0.12em] text-[0.52rem]" style={{ color: c }}>Active</span>
                      )}
                      {owned && !isActive && (
                        <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80] text-[0.52rem]">Owned</span>
                      )}
                    </div>
                    <p className="font-karla font-300 text-[#6a6764] text-xs">{rod.description}</p>

                    {owned && (
                      <div className="flex gap-1 flex-wrap mt-1.5">
                        {rod.habitats.map(h => (
                          <span key={h} className="font-karla font-600"
                            style={{
                              fontSize: '0.5rem', color: HABITAT_COLOR[h],
                              background: `${HABITAT_COLOR[h]}14`,
                              border: `1px solid ${HABITAT_COLOR[h]}30`,
                              padding: '0.1rem 0.4rem', borderRadius: '2rem',
                            }}>
                            {HABITAT_LABEL[h]}
                          </span>
                        ))}
                        {rod.rollBonus > 0 && (
                          <span className="font-karla font-600"
                            style={{
                              fontSize: '0.5rem', color: `${c}bb`,
                              background: `${c}14`, border: `1px solid ${c}30`,
                              padding: '0.1rem 0.4rem', borderRadius: '2rem',
                            }}>
                            +{rod.rollBonus} roll
                          </span>
                        )}
                      </div>
                    )}

                    {isNext && (
                      <p className="font-karla font-600 mt-1.5 text-xs" style={{ color: canAffordRod ? c : '#6a6764' }}>
                        {isPending ? 'Upgrading…' : canAffordRod ? '↑ Tap to upgrade' : `${(rod.cost - doubloons).toLocaleString()} ⟡ short`}
                      </p>
                    )}
                  </div>

                  {!owned && (
                    <p className="font-cinzel font-700 text-[#f0c040] text-sm shrink-0">
                      {rod.cost.toLocaleString()} ⟡
                    </p>
                  )}
                </div>
              </div>
            )
          })}
          {rodTier >= RODS.length - 1 && (
            <p className="font-karla font-300 text-[#a0a09a] text-sm text-center">
              You have the best rod money can buy.
            </p>
          )}
        </div>
      )}

      {/* ── Reels ── */}
      {section === 'reel' && (
        <div className="flex flex-col gap-2.5 mb-4">
          {REELS.map(reel => {
            const owned = reel.tier <= reelTier
            const isActive = reel.tier === reelTier
            const locked = reel.tier > reelTier + 1
            const isNext = reel.tier === reelTier + 1
            const canAffordReel = isNext && doubloons >= reel.cost
            const c = reel.color
            const slowerPct = Math.round((1 - reel.needleSpeedMultiplier) * 100)

            return (
              <div
                key={reel.tier}
                onClick={() => { if (isNext && canAffordReel && !isPending) handleBuyReel() }}
                className="p-3 sm:p-5"
                style={{
                  background: owned ? `${c}0d` : isNext && canAffordReel ? `${c}08` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${owned ? `${c}55` : isNext && canAffordReel ? `${c}40` : 'rgba(255,255,255,0.09)'}`,
                  boxShadow: isActive ? `0 0 16px ${c}18` : isNext && canAffordReel ? `0 0 12px ${c}12` : 'none',
                  borderRadius: 12,
                  opacity: locked ? 0.3 : isPending && isNext ? 0.6 : 1,
                  cursor: isNext && canAffordReel ? 'pointer' : 'default',
                  transition: 'box-shadow 0.2s ease, opacity 0.15s ease',
                }}
              >
                <div className="flex items-start gap-3">
                  <GearIcon color={c} owned={owned} isActive={isActive} label={`T${reel.tier}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-cinzel font-700 text-sm" style={{ color: owned ? '#f0ede8' : '#6a6764' }}>
                        {reel.name}
                      </p>
                      {isActive && (
                        <span className="font-karla font-600 uppercase tracking-[0.12em] text-[0.52rem]" style={{ color: c }}>Active</span>
                      )}
                      {owned && !isActive && (
                        <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80] text-[0.52rem]">Owned</span>
                      )}
                    </div>
                    <p className="font-karla font-300 text-[#6a6764] text-xs">{reel.description}</p>

                    {owned && slowerPct > 0 && (
                      <span className="font-karla font-600 inline-block mt-1.5"
                        style={{
                          fontSize: '0.5rem', color: `${c}bb`,
                          background: `${c}14`, border: `1px solid ${c}30`,
                          padding: '0.1rem 0.4rem', borderRadius: '2rem',
                        }}>
                        Needle {slowerPct}% slower
                      </span>
                    )}
                    {owned && slowerPct === 0 && (
                      <span className="font-karla font-600 inline-block mt-1.5"
                        style={{
                          fontSize: '0.5rem', color: '#6a6764',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                          padding: '0.1rem 0.4rem', borderRadius: '2rem',
                        }}>
                        Base speed
                      </span>
                    )}

                    {isNext && (
                      <p className="font-karla font-600 mt-1.5 text-xs" style={{ color: canAffordReel ? c : '#6a6764' }}>
                        {isPending ? 'Upgrading…' : canAffordReel ? '↑ Tap to upgrade' : `${(reel.cost - doubloons).toLocaleString()} ⟡ short`}
                      </p>
                    )}
                  </div>

                  {!owned && (
                    <p className="font-cinzel font-700 text-[#f0c040] text-sm shrink-0">
                      {reel.cost.toLocaleString()} ⟡
                    </p>
                  )}
                </div>
              </div>
            )
          })}
          {reelTier >= REELS.length - 1 && (
            <p className="font-karla font-300 text-[#a0a09a] text-sm text-center">
              You have the finest reel in the sea.
            </p>
          )}
        </div>
      )}

      {/* ── Line ── */}
      {section === 'line' && (
        <div className="flex flex-col gap-2.5 mb-4">
          <p className="font-karla font-300 text-center mb-1" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
            Lines are earned by catching unique species — no purchase needed.
          </p>
          {LINES.map(line => {
            const owned = line.tier <= lineTier
            const isActive = line.tier === lineTier
            const c = line.color
            const smallerPct = Math.round((1 - line.penaltyMultiplier) * 100)

            return (
              <div
                key={line.tier}
                className="p-3 sm:p-5"
                style={{
                  background: owned ? `${c}0d` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${owned ? `${c}55` : 'rgba(255,255,255,0.09)'}`,
                  boxShadow: isActive ? `0 0 16px ${c}18` : 'none',
                  borderRadius: 12,
                  opacity: owned ? 1 : 0.45,
                }}
              >
                <div className="flex items-start gap-3">
                  <GearIcon color={c} owned={owned} isActive={isActive} label={`T${line.tier}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-cinzel font-700 text-sm" style={{ color: owned ? '#f0ede8' : '#6a6764' }}>
                        {line.name}
                      </p>
                      {isActive && (
                        <span className="font-karla font-600 uppercase tracking-[0.12em] text-[0.52rem]" style={{ color: c }}>Active</span>
                      )}
                      {owned && !isActive && (
                        <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80] text-[0.52rem]">Owned</span>
                      )}
                    </div>
                    <p className="font-karla font-300 text-[#6a6764] text-xs">{line.description}</p>

                    {owned && (
                      <span className="font-karla font-600 inline-block mt-1.5"
                        style={{
                          fontSize: '0.5rem', color: smallerPct > 0 ? `${c}bb` : '#6a6764',
                          background: smallerPct > 0 ? `${c}14` : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${smallerPct > 0 ? `${c}30` : 'rgba(255,255,255,0.12)'}`,
                          padding: '0.1rem 0.4rem', borderRadius: '2rem',
                        }}>
                        {smallerPct > 0 ? `Snag zones ${smallerPct}% smaller` : 'Standard snag zones'}
                      </span>
                    )}

                    {!owned && line.unlockAt > 0 && (
                      <p className="font-karla font-400 mt-1 text-[0.62rem]" style={{ color: '#5a5956' }}>
                        Catch {line.unlockAt} unique species to unlock
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HookIcon({ tier, color, owned, isActive }: { tier: number; color: string; owned: boolean; isActive: boolean }) {
  const stroke = owned ? color : '#4a4845'
  const fill   = owned ? color : '#4a4845'
  const bg     = owned ? `${color}12` : 'rgba(255,255,255,0.06)'
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
      {icons[tier] ?? icons[0]}
    </div>
  )
}

function GearIcon({ color, owned, isActive, label }: { color: string; owned: boolean; isActive: boolean; label: string }) {
  const bg     = owned ? `${color}12` : 'rgba(255,255,255,0.06)'
  const border = owned ? `${color}35` : 'rgba(255,255,255,0.11)'

  return (
    <div
      className="w-[38px] h-[38px] sm:w-12 sm:h-12 shrink-0 flex items-center justify-center"
      style={{
        borderRadius: 10,
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: isActive ? `0 0 10px ${color}25` : 'none',
      }}
    >
      <span className="font-karla font-700" style={{ fontSize: '0.58rem', color: owned ? color : '#4a4845' }}>
        {label}
      </span>
    </div>
  )
}
