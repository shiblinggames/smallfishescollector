'use client'

import { useState, useTransition, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { HOOKS } from '@/lib/hooks'
import { RODS } from '@/lib/rods'
import { REELS } from '@/lib/reels'
import { LINES } from '@/lib/lines'
import { BAITS } from '@/lib/bait'
import { buyHook } from '@/app/hooks/actions'
import { buyBait, purchaseRod, equipRod, buyReel, claimCompletionistRod } from './actions'
import { getLevelFromXP } from '@/lib/fishingLevel'

const HookViewer3D = dynamic(() => import('./HookViewer3D'), { ssr: false })


type BaitInventoryItem = { bait_type: string; quantity: number }
type Section = 'bait' | 'hook' | 'rod' | 'reel' | 'line' | null

export default function TackleShopClient({
  hookTier: initialHookTier,
  equippedRod: initialEquippedRod,
  ownedRods: initialOwnedRods,
  reelTier: initialReelTier,
  lineTier,
  doubloons: initialDoubloons,
  baitInventory: initialBait,
  fishingXP,
  uniqueSpeciesCaught,
  totalSpecies,
}: {
  hookTier: number
  equippedRod: number
  ownedRods: number[]
  reelTier: number
  lineTier: number
  doubloons: number
  baitInventory: BaitInventoryItem[]
  fishingXP: number
  uniqueSpeciesCaught: number
  totalSpecies: number
}) {
  const [section, setSection] = useState<Section>(null)

  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as Section
    if (hash && ['bait', 'hook', 'rod', 'reel', 'line'].includes(hash)) setSection(hash)
  }, [])
  const [hookTier, setHookTier] = useState(initialHookTier)
  const [equippedRod, setEquippedRod] = useState(initialEquippedRod)
  const [ownedRods, setOwnedRods] = useState<number[]>(initialOwnedRods)
  const [reelTier, setReelTier] = useState(initialReelTier)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [baitInventory, setBaitInventory] = useState<BaitInventoryItem[]>(initialBait)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [buyingBait, setBuyingBait] = useState<string | null>(null)
  const [buyingRod, setBuyingRod] = useState<number | null>(null)
  const [equippingRod, setEquippingRod] = useState<number | null>(null)
  const [isClaiming, setIsClaiming] = useState(false)
  const [previewTier, setPreviewTier] = useState(initialHookTier)
  const [showCompModal, setShowCompModal] = useState(false)

  const baitMap = Object.fromEntries(baitInventory.map(b => [b.bait_type, b.quantity]))
  const totalBait = Object.values(baitMap).reduce((a, b) => a + b, 0)
  const shopBaits = BAITS

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

  function handlePurchaseRod(rodTier: number) {
    setError(null)
    setBuyingRod(rodTier)
    startTransition(async () => {
      const result = await purchaseRod(rodTier)
      setBuyingRod(null)
      if ('error' in result) { setError(result.error) }
      else {
        setOwnedRods(result.ownedRods)
        setDoubloons(result.doubloons)
        broadcastDoubloons(result.doubloons)
        setEquippedRod(rodTier)
      }
    })
  }

  function handleEquipRod(rodTier: number) {
    setError(null)
    setEquippingRod(rodTier)
    startTransition(async () => {
      const result = await equipRod(rodTier)
      setEquippingRod(null)
      if ('error' in result) { setError(result.error) }
      else { setEquippedRod(result.rodTier) }
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

  function handleClaimCompletionistRod() {
    setError(null)
    setIsClaiming(true)
    startTransition(async () => {
      const result = await claimCompletionistRod()
      setIsClaiming(false)
      if ('error' in result) { setError(result.error) }
      else { setOwnedRods(result.ownedRods) }
    })
  }

  function handleBuyBait(baitType: string, qty: number) {
    setError(null)
    setBuyingBait(`${baitType}-${qty}`)
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

  const CATEGORIES: { key: Exclude<Section, null>; label: string; desc: string; color: string; imageUrl?: string }[] = [
    { key: 'bait',  label: 'Bait',  color: '#34d399', desc: 'Consumables used per cast.',           imageUrl: '/worms.png' },
    { key: 'hook',  label: 'Hooks', color: '#f0c040', desc: 'Widens the catch zone on the dial.',  imageUrl: '/models/hooks/steel-hook.png' },
    { key: 'rod',   label: 'Rods',  color: '#b8956a', desc: 'Every rod has a unique ability.',       imageUrl: '/driftwoodrod.png' },
    { key: 'reel',  label: 'Reels', color: '#60a5fa', desc: 'Slows the needle for easier timing.',   imageUrl: '/basicreel.png' },
    { key: 'line',  label: 'Line',  color: '#4ade80', desc: 'Shrinks snag zones. Earned by species.' },
  ]

  // ── Landing ────────────────────────────────────────────────────────────
  if (section === null) {
    return (
      <div className="px-4 sm:px-6 max-w-sm sm:max-w-2xl mx-auto pb-16">
        <p className="font-karla font-700 uppercase tracking-[0.14em] text-[#8a8784] mb-4" style={{ fontSize: '0.72rem' }}>
          Tackle Shop
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CATEGORIES.map(({ key, label, desc, color, imageUrl }) => (
            <div
              key={key}
              onClick={() => { setSection(key); setError(null) }}
              style={{
                background: 'rgba(6,12,20,0.92)',
                border: `1px solid ${color}30`,
                borderTop: `1px solid ${color}55`,
                borderRadius: 20,
                padding: '1.3rem 1.4rem 1.25rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'stretch',
                gap: '1rem',
                transition: 'border-color 0.15s',
              }}
            >
              {/* Left: text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-karla font-600 uppercase tracking-[0.12em]"
                  style={{ fontSize: '0.56rem', color: color + 'cc', marginBottom: '0.4rem' }}>
                  Tackle Shop
                </p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#ffffff', lineHeight: 1.2, marginBottom: '0.4rem' }}>
                  {label}
                </p>
                <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: '#b0ada8', lineHeight: 1.5 }}>
                  {desc}
                </p>
              </div>

              {/* Right: image */}
              {imageUrl && (
                <div style={{
                  flexShrink: 0, width: 100,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={label}
                    style={{
                      maxWidth: '100%',
                      maxHeight: 110,
                      objectFit: 'contain',
                      filter: `drop-shadow(0 2px 10px ${color}28)`,
                      opacity: 0.92,
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Section shell ──────────────────────────────────────────────────────
  const sectionColor = CATEGORIES.find(c => c.key === section)?.color ?? '#f0ede8'
  const sectionLabel = CATEGORIES.find(c => c.key === section)?.label ?? ''

  return (
    <div className="px-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => { setSection(null); setError(null) }}
          className="font-karla font-600"
          style={{ fontSize: '0.85rem', color: '#6a6764' }}
        >
          ← Tackle Shop
        </button>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: sectionColor }}>{sectionLabel}</p>
      </div>

      {error && <p className="font-karla font-300 text-red-400 text-xs text-center mb-3">{error}</p>}

      {/* ── Bait ── */}
      {section === 'bait' && (
        <div id="bait" className="mb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.55rem' }}>
          {shopBaits.map(bait => {
            const owned        = baitMap[bait.type] ?? 0
            const hasFasterBite = bait.waitMult < 1.0
            const hasCatchBonus = bait.catchZoneBonus > 0
            const noDrawbacks   = bait.waitMult <= 1.0 && hasCatchBonus && !hasFasterBite

            return (
              <div key={bait.type} style={{
                background: 'rgba(8,8,6,0.88)',
                border: `1px solid ${bait.color}28`,
                borderTop: `2px solid ${bait.color}88`,
                borderRadius: 14,
                padding: '0.75rem 0.75rem 0.7rem',
                display: 'flex', flexDirection: 'column', gap: '0.5rem',
              }}>

                {/* Icon + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: `${bait.color}18`, border: `1px solid ${bait.color}38`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {bait.imageUrl
                      ? <img src={bait.imageUrl} alt={bait.name} style={{ width: 26, height: 26, objectFit: 'contain' }} />
                      : <div style={{ width: 12, height: 12, borderRadius: 4, background: bait.color }} />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0ede8', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bait.name}
                    </p>
                    {owned > 0 && (
                      <p className="font-karla font-600" style={{ fontSize: '0.55rem', color: bait.color, marginTop: 1 }}>×{owned} owned</p>
                    )}
                  </div>
                </div>

                {/* Effect chips */}
                <div style={{ display: 'flex', gap: '0.28rem', flexWrap: 'wrap' }}>
                  {hasFasterBite && (
                    <span className="font-karla font-600" style={{
                      fontSize: '0.6rem', color: '#e8e4de',
                      background: `${bait.color}20`, border: `1px solid ${bait.color}45`,
                      borderRadius: 20, padding: '0.15rem 0.45rem',
                    }}>{Math.round((1 - bait.waitMult) * 100)}% faster</span>
                  )}
                  {hasCatchBonus && (
                    <span className="font-karla font-600" style={{
                      fontSize: '0.6rem', color: '#e8e4de',
                      background: `${bait.color}20`, border: `1px solid ${bait.color}45`,
                      borderRadius: 20, padding: '0.15rem 0.45rem',
                    }}>+{bait.catchZoneBonus}° zone</span>
                  )}
                  {noDrawbacks && (
                    <span className="font-karla font-600" style={{
                      fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)',
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 20, padding: '0.15rem 0.45rem',
                    }}>no penalty</span>
                  )}
                  {bait.type === 'worm' && (
                    <span className="font-karla font-600" style={{
                      fontSize: '0.6rem', color: '#4ade80',
                      background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)',
                      borderRadius: 20, padding: '0.15rem 0.45rem',
                    }}>20 free/day</span>
                  )}
                </div>

                {/* Buy buttons or earned badge */}
                {bait.shopCost > 0 ? (
                  <div style={{ display: 'flex', gap: '0.35rem', marginTop: 2 }}>
                    {([10, 25] as const).map(buyQty => {
                      const cost       = bait.shopCost * buyQty
                      const canAfford  = doubloons >= cost
                      const isBuying   = buyingBait === `${bait.type}-${buyQty}` && isPending
                      return (
                        <button
                          key={buyQty}
                          onClick={() => handleBuyBait(bait.type, buyQty)}
                          disabled={!canAfford || isPending}
                          style={{
                            flex: 1,
                            borderRadius: 8, padding: '0.4rem 0.25rem',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                            background: canAfford ? `${bait.color}18` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${canAfford ? bait.color + '42' : 'rgba(255,255,255,0.08)'}`,
                            color: canAfford ? bait.color : '#4a4845',
                            cursor: canAfford && !isPending ? 'pointer' : 'default',
                            opacity: isBuying ? 0.5 : 1, transition: 'opacity 0.15s',
                          }}
                        >
                          <span className="font-karla font-700" style={{ fontSize: '0.72rem', lineHeight: 1 }}>
                            {isBuying ? '…' : `×${buyQty}`}
                          </span>
                          <span className="font-karla" style={{ fontSize: '0.52rem', color: canAfford ? 'rgba(255,255,255,0.38)' : '#3a3835', lineHeight: 1 }}>
                            {cost.toLocaleString()} ⟡
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ marginTop: 2, padding: '0.35rem 0.5rem', borderRadius: 8, background: `${bait.color}10`, border: `1px solid ${bait.color}28`, textAlign: 'center' }}>
                    <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: bait.color }}>
                      Earned — not for sale
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Hooks ── */}
      {section === 'hook' && (
        <>
          <div className="mb-5">
            <HookViewer3D imageUrl={HOOKS[previewTier]?.imageUrl} color={HOOKS[previewTier]?.color ?? '#f0c040'} tier={previewTier} />
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
                    background: 'rgba(8,8,6,0.82)',
                    border: `1px solid ${owned ? `${c}55` : isPreviewing ? `${c}30` : isNext && canAffordHook ? `${c}40` : 'rgba(255,255,255,0.14)'}`,
                    boxShadow: isActive ? `0 0 16px ${c}18` : isPreviewing ? `0 0 10px ${c}10` : isNext && canAffordHook ? `0 0 12px ${c}12` : 'none',
                    borderRadius: 12,
                    opacity: isPending && isNext ? 0.6 : 1,
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s ease, opacity 0.15s ease',
                  }}
                >
                  <div className="flex items-start gap-3 sm:gap-5">
                    <HookIcon tier={hook.tier} color={c} owned={owned} isActive={isActive} imageUrl={hook.imageUrl} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-cinzel font-700 text-sm sm:text-base" style={{ color: owned ? '#f0ede8' : '#6a6764' }}>
                          {hook.name}
                        </p>
                        {isActive && (
                          <span className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.65rem', color: c }}>Active</span>
                        )}
                        {owned && !isActive && (
                          <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80]" style={{ fontSize: '0.65rem' }}>Owned</span>
                        )}
                        {locked && (
                          <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#5a5755' }}>🔒 Locked</span>
                        )}
                      </div>
                      <p className="font-karla font-300 text-[#6a6764] text-sm sm:text-base">{hook.description}</p>

                      {hook.tier > 0 && (
                        <span className="font-karla font-600 inline-block mt-1.5"
                          style={{
                            fontSize: '0.65rem',
                            color: owned ? `${c}bb` : '#4a4845',
                            background: owned ? `${c}14` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${owned ? `${c}30` : 'rgba(255,255,255,0.1)'}`,
                            padding: '0.12rem 0.5rem', borderRadius: '2rem',
                          }}>
                          +{hook.tier * 3}° catch zone
                        </span>
                      )}

                      {isNext && (
                        <p className="font-karla font-600 mt-1 text-sm sm:text-base" style={{ color: canAffordHook ? c : '#6a6764' }}>
                          {isPending ? 'Upgrading…' : canAffordHook ? '↑ Tap to upgrade' : `${(hook.cost - doubloons).toLocaleString()} ⟡ short`}
                        </p>
                      )}
                    </div>

                    {!owned && (
                      <p className="font-cinzel font-700 text-[#f0c040] shrink-0 text-base sm:text-lg">
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
      {section === 'rod' && (() => {
        const compRod = RODS.find(r => r.tier === 14)!
        const compOwned = ownedRods.includes(14)
        const compActive = equippedRod === 14
        const playerLevel = getLevelFromXP(fishingXP)
        const isLevelOk = playerLevel >= 100
        const isSpeciesOk = totalSpecies > 0 && uniqueSpeciesCaught >= totalSpecies
        const eligible = isLevelOk && isSpeciesOk && !compOwned
        const c = compRod.color

        return (
          <>
            {/* Completionist Rod modal */}
            {showCompModal && (
              <div onClick={() => setShowCompModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
                <div onClick={e => e.stopPropagation()} style={{ background: '#0f0f0e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '18px 18px 0 0', width: '100%', maxWidth: 480, padding: '1.5rem' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>{compRod.name}</p>
                      <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.48rem', color: c, background: `${c}20`, border: `1px solid ${c}40`, padding: '0.1rem 0.5rem', borderRadius: '2rem' }}>Mastery Rod</span>
                    </div>
                    <button onClick={() => setShowCompModal(false)} style={{ color: '#6a6764', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  {compRod.imageUrl && (
                    <div style={{ background: `${c}0a`, border: `1px solid ${c}25`, borderRadius: 12, padding: '1rem', display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={compRod.imageUrl} alt={compRod.name} style={{ height: 140, objectFit: 'contain' }} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {['Always double catch', '50% miss retry', 'Snag immune', '+50% rare bias', '+16° catch zone', 'Perfect +5°', 'Fastest bites'].map(label => (
                      <span key={label} className="font-karla font-600" style={{ fontSize: '0.6rem', color: `${c}dd`, background: `${c}18`, border: `1px solid ${c}35`, padding: '0.15rem 0.5rem', borderRadius: '2rem' }}>{label}</span>
                    ))}
                  </div>
                  <p className="font-karla font-300 mb-4" style={{ fontSize: '0.78rem', color: '#8a8884', lineHeight: 1.5 }}>{compRod.description}</p>
                  {!compActive && (
                    <button onClick={() => { handleEquipRod(14); setShowCompModal(false) }} disabled={isPending} className="font-karla font-700 w-full"
                      style={{ fontSize: '0.75rem', padding: '0.5rem', borderRadius: 9, background: `${c}22`, border: `1px solid ${c}60`, color: c, cursor: isPending ? 'default' : 'pointer' }}>
                      Equip
                    </button>
                  )}
                  {compActive && <p className="font-karla font-600 text-center" style={{ fontSize: '0.72rem', color: `${c}88` }}>✓ Currently equipped</p>}
                </div>
              </div>
            )}

            {/* Rod grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="mb-4">
              {[...RODS].filter(r => !r.earnedOnly).sort((a, b) => a.cost - b.cost).map(rod => {
                const owned = (rod.cost === 0 && !rod.earnedOnly) || ownedRods.includes(rod.tier)
                const isActive = rod.tier === equippedRod
                const canAfford = doubloons >= rod.cost
                const isBuying = buyingRod === rod.tier && isPending
                const isEquipping = equippingRod === rod.tier && isPending
                const c = rod.color
                const speedPct = Math.round((3800 - rod.biteIntervalMs) / 3800 * 100)
                const hasSpecial = rod.doubleCatchChance > 0 || rod.retryOnMissChance > 0 || rod.snagImmune || rod.perfectZoneBonus > 0 || rod.rarityBonus > 0 || (rod.jackpotChance ?? 0) > 0

                const pill = (label: string) => (
                  <span key={label} className="font-karla font-600"
                    style={{ fontSize: '0.62rem', color: `${c}bb`, background: `${c}14`, border: `1px solid ${c}30`, padding: '0.12rem 0.45rem', borderRadius: '2rem' }}>
                    {label}
                  </span>
                )

                return (
                  <div
                    key={rod.tier}
                    style={{
                      background: 'rgba(8,8,6,0.82)',
                      border: `1px solid ${isActive ? `${c}70` : owned ? `${c}55` : 'rgba(255,255,255,0.14)'}`,
                      boxShadow: isActive ? `0 0 18px ${c}35` : owned ? `0 0 10px ${c}18` : 'none',
                      borderRadius: 12,
                      display: 'flex', flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Art — tall portrait header */}
                    <div style={{
                      height: 150,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `linear-gradient(160deg, ${c}20 0%, rgba(4,4,2,0.96) 100%)`,
                      borderBottom: `1px solid ${c}22`,
                      padding: '0.75rem 0.5rem',
                    }}>
                      {rod.imageUrl
                        ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={rod.imageUrl} alt={rod.name} style={{
                            height: '100%', maxWidth: '100%', objectFit: 'contain',
                            filter: owned
                              ? `drop-shadow(0 4px 18px ${c}60)`
                              : 'grayscale(1) brightness(0.35)',
                          }} />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: `${c}22`, border: `1px solid ${c}44` }} />
                        )
                      }
                    </div>

                    {/* Content */}
                    <div style={{ padding: '0.75rem 0.8rem', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <div>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: owned ? '#f0ede8' : '#6a6764', lineHeight: 1.25 }}>{rod.name}</p>
                        {isActive && <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: c }}>Equipped</span>}
                        {owned && !isActive && <span className="font-karla font-300 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#4ade80' }}>Owned</span>}
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {rod.doubleCatchChance > 0 && pill(rod.doubleCatchChance >= 1 ? 'Always double catch' : `${Math.round(rod.doubleCatchChance * 100)}% double catch`)}
                        {rod.retryOnMissChance > 0 && pill(`${Math.round(rod.retryOnMissChance * 100)}% miss retry`)}
                        {rod.snagImmune && pill('Snag immune')}
                        {rod.perfectZoneBonus > 0 && pill(`Perfect zone +${rod.perfectZoneBonus}°`)}
                        {rod.rarityBonus > 0 && pill(`+${Math.round(rod.rarityBonus * 100)}% rare bias`)}
                        {(rod.jackpotChance ?? 0) > 0 && pill(`${Math.round(rod.jackpotChance! * 100)}% jackpot ×${rod.jackpotMultiplier}`)}
                        {!hasSpecial && speedPct > 0 && pill(`${speedPct}% faster bites`)}
                        {!hasSpecial && rod.catchZoneBonus > 0 && pill(`+${rod.catchZoneBonus}° catch zone`)}
                      </div>

                      <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: '#6a6764', lineHeight: 1.45 }}>{rod.description}</p>

                      <div className="mt-auto pt-1">
                        {!owned && (
                          <button
                            onClick={() => { if (canAfford) handlePurchaseRod(rod.tier) }}
                            disabled={isPending}
                            className="font-karla font-700 w-full"
                            style={{
                              fontSize: '0.68rem', padding: '0.38rem 0.5rem', borderRadius: 8,
                              background: canAfford ? `${c}16` : 'rgba(255,255,255,0.06)',
                              border: `1px solid ${canAfford ? c + '44' : 'rgba(255,255,255,0.14)'}`,
                              color: canAfford ? c : '#4a4845',
                              cursor: canAfford && !isPending ? 'pointer' : 'default',
                              opacity: isBuying ? 0.5 : 1,
                            }}
                          >
                            {isBuying ? '…' : `Buy · ${rod.cost.toLocaleString()} ⟡`}
                          </button>
                        )}
                        {owned && !isActive && (
                          <button
                            onClick={() => handleEquipRod(rod.tier)}
                            disabled={isPending}
                            className="font-karla font-700 w-full"
                            style={{
                              fontSize: '0.68rem', padding: '0.38rem 0.5rem', borderRadius: 8,
                              background: `${c}16`, border: `1px solid ${c}44`,
                              color: c, cursor: isPending ? 'default' : 'pointer',
                              opacity: isEquipping ? 0.5 : 1,
                            }}
                          >
                            {isEquipping ? '…' : 'Equip'}
                          </button>
                        )}
                        {isActive && <span className="font-karla font-600" style={{ fontSize: '0.68rem', color: `${c}88` }}>✓ In use</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Completionist Rod — at the bottom */}
            <div className="mb-4" style={{
              padding: '1.1rem',
              background: compOwned ? 'rgba(8,8,6,0.92)' : 'rgba(4,4,2,0.92)',
              border: `1px solid ${compOwned ? `${c}55` : eligible ? `${c}50` : 'rgba(255,255,255,0.12)'}`,
              boxShadow: compOwned ? `0 0 32px ${c}22` : eligible ? `0 0 20px ${c}18` : 'none',
              borderRadius: 14,
            }}>
              {compOwned ? (
                <>
                  <div className="flex items-center gap-2 mb-3">
                    <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8' }}>{compRod.name}</p>
                    <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.48rem', color: c, background: `${c}20`, border: `1px solid ${c}40`, padding: '0.1rem 0.5rem', borderRadius: '2rem' }}>Mastery</span>
                    <div className="flex-1" />
                    {compActive && <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: c }}>Equipped</span>}
                    {!compActive && <span className="font-karla font-300 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#4ade80' }}>Owned</span>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowCompModal(true)} className="font-karla font-700 flex-1"
                      style={{ fontSize: '0.68rem', padding: '0.45rem 0.5rem', borderRadius: 8, background: `${c}20`, border: `1px solid ${c}55`, color: c, cursor: 'pointer' }}>
                      View Rod
                    </button>
                    {!compActive && (
                      <button onClick={() => handleEquipRod(14)} disabled={isPending} className="font-karla font-700 flex-1"
                        style={{ fontSize: '0.68rem', padding: '0.45rem 0.5rem', borderRadius: 8, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)', color: '#f0ede8', cursor: isPending ? 'default' : 'pointer', opacity: equippingRod === 14 && isPending ? 0.5 : 1 }}>
                        {equippingRod === 14 && isPending ? '…' : 'Equip'}
                      </button>
                    )}
                    {compActive && <span className="font-karla font-600 flex-1 text-center" style={{ fontSize: '0.68rem', color: `${c}88`, paddingTop: '0.45rem' }}>✓ In use</span>}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: eligible ? '#f0ede8' : '#6a6764', letterSpacing: '0.08em' }}>
                      {eligible ? '✦ Ready to Claim' : '🔒 Completionist Rod'}
                    </p>
                    <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.48rem', color: eligible ? c : '#4a4845', background: eligible ? `${c}18` : 'rgba(255,255,255,0.05)', border: `1px solid ${eligible ? `${c}35` : 'rgba(255,255,255,0.1)'}`, padding: '0.1rem 0.5rem', borderRadius: '2rem' }}>Mastery</span>
                  </div>
                  <p className="font-karla font-300 mb-4" style={{ fontSize: '0.75rem', color: eligible ? '#a0a09a' : '#4a4845', lineHeight: 1.5 }}>
                    {eligible
                      ? 'You\'ve seen it all. Something extraordinary is waiting for you.'
                      : 'The sea hides its greatest secret from those who haven\'t seen everything it holds.'}
                  </p>
                  <div className="flex flex-col gap-2.5 mb-4">
                    {[
                      { label: 'Fishing Level', current: Math.min(playerLevel, 100), max: 100, done: isLevelOk },
                      { label: 'Species Discovered', current: uniqueSpeciesCaught, max: totalSpecies, done: isSpeciesOk },
                    ].map(({ label, current, max, done }) => (
                      <div key={label}>
                        <div className="flex justify-between mb-1">
                          <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: done ? '#4ade80' : '#6a6764' }}>{label}</span>
                          <span className="font-karla font-600" style={{ fontSize: '0.52rem', color: done ? '#4ade80' : '#6a6764' }}>{current} / {max}</span>
                        </div>
                        <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, (current / max) * 100)}%`, background: done ? '#4ade80' : `${c}80`, borderRadius: 2, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {eligible && (
                    <button onClick={handleClaimCompletionistRod} disabled={isPending} className="font-karla font-700 w-full"
                      style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', borderRadius: 9, background: `${c}22`, border: `1px solid ${c}65`, color: c, cursor: isPending ? 'default' : 'pointer', opacity: isClaiming ? 0.5 : 1 }}>
                      {isClaiming ? 'Claiming…' : '✦ Claim Your Reward'}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )
      })()}

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
                  background: 'rgba(8,8,6,0.82)',
                  border: `1px solid ${owned ? `${c}55` : isNext && canAffordReel ? `${c}40` : 'rgba(255,255,255,0.14)'}`,
                  boxShadow: isActive ? `0 0 16px ${c}18` : isNext && canAffordReel ? `0 0 12px ${c}12` : 'none',
                  borderRadius: 12,
                  opacity: isPending && isNext ? 0.6 : 1,
                  cursor: isNext && canAffordReel ? 'pointer' : 'default',
                  transition: 'box-shadow 0.2s ease, opacity 0.15s ease',
                }}
              >
                <div className="flex items-start gap-3">
                  <ReelIcon color={c} owned={owned} isActive={isActive} imageUrl={reel.imageUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-cinzel font-700 text-sm" style={{ color: owned ? '#f0ede8' : '#6a6764' }}>
                        {reel.name}
                      </p>
                      {isActive && (
                        <span className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.65rem', color: c }}>Active</span>
                      )}
                      {owned && !isActive && (
                        <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80]" style={{ fontSize: '0.65rem' }}>Owned</span>
                      )}
                      {locked && (
                        <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.55rem', color: '#5a5755' }}>🔒 Locked</span>
                      )}
                    </div>
                    <p className="font-karla font-300 text-[#6a6764] text-sm">{reel.description}</p>

                    {owned && slowerPct > 0 && (
                      <span className="font-karla font-600 inline-block mt-1.5"
                        style={{
                          fontSize: '0.65rem', color: `${c}bb`,
                          background: `${c}14`, border: `1px solid ${c}30`,
                          padding: '0.12rem 0.5rem', borderRadius: '2rem',
                        }}>
                        Needle {slowerPct}% slower
                      </span>
                    )}
                    {owned && slowerPct === 0 && (
                      <span className="font-karla font-600 inline-block mt-1.5"
                        style={{
                          fontSize: '0.65rem', color: '#6a6764',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                          padding: '0.12rem 0.5rem', borderRadius: '2rem',
                        }}>
                        Base speed
                      </span>
                    )}

                    {isNext && (
                      <p className="font-karla font-600 mt-1.5 text-sm" style={{ color: canAffordReel ? c : '#6a6764' }}>
                        {isPending ? 'Upgrading…' : canAffordReel ? '↑ Tap to upgrade' : `${(reel.cost - doubloons).toLocaleString()} ⟡ short`}
                      </p>
                    )}
                  </div>

                  {!owned && (
                    <p className="font-cinzel font-700 text-[#f0c040] text-base shrink-0">
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
          <p className="font-karla font-300 text-center mb-1" style={{ fontSize: '0.82rem', color: '#6a6764' }}>
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
                  background: 'rgba(8,8,6,0.82)',
                  border: `1px solid ${owned ? `${c}55` : 'rgba(255,255,255,0.14)'}`,
                  boxShadow: isActive ? `0 0 16px ${c}18` : 'none',
                  borderRadius: 12,
                }}
              >
                <div className="flex items-start gap-3">
                  <LineIcon color={c} owned={owned} isActive={isActive} tier={line.tier} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-cinzel font-700 text-base" style={{ color: owned ? '#f0ede8' : '#6a6764' }}>
                        {line.name}
                      </p>
                      {isActive && (
                        <span className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.65rem', color: c }}>Active</span>
                      )}
                      {owned && !isActive && (
                        <span className="font-karla font-300 uppercase tracking-[0.10em] text-[#4ade80]" style={{ fontSize: '0.65rem' }}>Owned</span>
                      )}
                    </div>
                    <p className="font-karla font-300 text-[#6a6764] text-sm">{line.description}</p>

                    {owned && (
                      <span className="font-karla font-600 inline-block mt-1.5"
                        style={{
                          fontSize: '0.65rem', color: smallerPct > 0 ? `${c}bb` : '#6a6764',
                          background: smallerPct > 0 ? `${c}14` : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${smallerPct > 0 ? `${c}30` : 'rgba(255,255,255,0.12)'}`,
                          padding: '0.12rem 0.5rem', borderRadius: '2rem',
                        }}>
                        {smallerPct > 0 ? `Snag zones ${smallerPct}% smaller` : 'Standard snag zones'}
                      </span>
                    )}

                    {!owned && line.unlockAt > 0 && (
                      <p className="font-karla font-400 mt-1" style={{ fontSize: '0.78rem', color: '#5a5956' }}>
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

function HookIcon({ tier, color, owned, isActive, imageUrl }: { tier: number; color: string; owned: boolean; isActive: boolean; imageUrl?: string }) {
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
      {imageUrl ? (
        <img
          src={imageUrl} alt=""
          style={{
            width: '100%', height: '100%', objectFit: 'contain',
            opacity: owned ? 1 : 0.28,
            filter: owned ? `drop-shadow(0 0 5px ${color}70)` : 'grayscale(80%)',
          }}
        />
      ) : (
        icons[tier] ?? icons[0]
      )}
    </div>
  )
}

function LineIcon({ color, owned, isActive, tier }: { color: string; owned: boolean; isActive: boolean; tier: number }) {
  const sc = owned ? color : '#4a4845'
  const bg = owned ? `${color}12` : 'rgba(255,255,255,0.06)'
  const border = owned ? `${color}35` : 'rgba(255,255,255,0.11)'
  // 2 wraps at tier 0–1, 3 at 2–3, 4 at 4–5
  const wrapCount = tier <= 1 ? 2 : tier <= 3 ? 3 : 4
  const bodyY1 = 9, bodyY2 = 15
  const wraps = Array.from({ length: wrapCount }, (_, i) =>
    bodyY1 + 1 + (i * (bodyY2 - bodyY1 - 2)) / Math.max(wrapCount - 1, 1)
  )
  return (
    <div
      className="w-[38px] h-[38px] sm:w-12 sm:h-12 shrink-0 flex items-center justify-center"
      style={{ borderRadius: 10, background: bg, border: `1px solid ${border}`, boxShadow: isActive ? `0 0 10px ${color}25` : 'none' }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        {/* Left flange */}
        <rect x="2.5" y="5.5" width="3.5" height="13" rx="1.5" fill={sc} opacity={owned ? 0.75 : 0.4} />
        {/* Right flange */}
        <rect x="18" y="5.5" width="3.5" height="13" rx="1.5" fill={sc} opacity={owned ? 0.75 : 0.4} />
        {/* Spool body */}
        <rect x="6" y={bodyY1} width="12" height={bodyY2 - bodyY1} rx="1" stroke={sc} strokeWidth="1.3" />
        {/* Wrapped line */}
        {wraps.map((y, i) => (
          <line key={i} x1="6.5" y1={y} x2="17.5" y2={y} stroke={sc} strokeWidth="1.2" strokeLinecap="round" />
        ))}
      </svg>
    </div>
  )
}

function ReelIcon({ color, owned, isActive, imageUrl }: { color: string; owned: boolean; isActive: boolean; imageUrl?: string }) {
  const sc = owned ? color : '#4a4845'
  const bg = owned ? `${color}12` : 'rgba(255,255,255,0.06)'
  const border = owned ? `${color}35` : 'rgba(255,255,255,0.11)'
  const op = owned ? 1 : 0.45
  return (
    <div
      className="w-[38px] h-[38px] sm:w-12 sm:h-12 shrink-0 flex items-center justify-center"
      style={{ borderRadius: 10, background: bg, border: `1px solid ${border}`, boxShadow: isActive ? `0 0 10px ${color}25` : 'none' }}
    >
      {imageUrl
        ? <img src={imageUrl} alt="" style={{ width: 28, height: 28, objectFit: 'contain', opacity: op, filter: `drop-shadow(0 1px 4px ${color}55)` }} />
        : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="10" cy="12" r="7.5" stroke={sc} strokeWidth="1.3" opacity={op * 0.9} />
            <circle cx="10" cy="12" r="4.5" stroke={sc} strokeWidth="1" fill={sc} fillOpacity={owned ? 0.1 : 0.04} opacity={op * 0.8} />
            <circle cx="10" cy="12" r="1.8" fill={sc} opacity={op * 0.85} />
            <line x1="17.5" y1="12" x2="21.5" y2="9.5" stroke={sc} strokeWidth="1.6" strokeLinecap="round" opacity={op} />
            <circle cx="21.5" cy="9.5" r="1.5" fill={sc} opacity={op * 0.85} />
          </svg>
        )
      }
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
      <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: owned ? color : '#4a4845' }}>
        {label}
      </span>
    </div>
  )
}
