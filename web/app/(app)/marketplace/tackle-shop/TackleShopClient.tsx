'use client'

import { useState, useTransition, useEffect } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { HOOKS, hookGlowClass } from '@/lib/hooks'
import { RODS, rodGlowClass } from '@/lib/rods'
import { REELS } from '@/lib/reels'
import { LINES } from '@/lib/lines'
import { BAITS } from '@/lib/bait'
import { motion } from 'framer-motion'
import { buyHook } from '@/app/(app)/hooks/actions'
import { buyBait, purchaseRod, equipRod, buyReel, claimCompletionistRod } from './actions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { fishingLevelReqForCost } from '@/lib/gearGating'
import ShopHeader from '@/components/ShopHeader'
import ShopStatusPill from '@/components/ShopStatusPill'

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
  const router = useRouter()
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
  // Fishing-level gate on buying gear (rod / reel / hook). Server-enforced too.
  const fishingLevel = getLevelFromXP(fishingXP)

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
    { key: 'hook',  label: 'Hooks', color: '#f0c040', desc: 'Widens the catch zone on the dial.',  imageUrl: '/hook_steel_thumb.png' },
    { key: 'rod',   label: 'Rods',  color: '#b8956a', desc: 'Every rod has a unique ability.',       imageUrl: '/rod_driftwood_thumb.png' },
    { key: 'reel',  label: 'Reels', color: '#60a5fa', desc: 'Slows the needle for easier timing.',   imageUrl: '/reel_basic_thumb.png' },
    { key: 'line',  label: 'Line',  color: '#4ade80', desc: 'Shrinks snag zones. Earned by species.',  imageUrl: '/monofilament.png' },
  ]

  // ── Landing ────────────────────────────────────────────────────────────
  if (section === null) {
    // Storefront grid: 2-up art-forward tiles so the row width is actually
    // used (the old single-column rows left a big empty gutter beside the
    // short text). Line is the odd one out → it spans full width as a wide
    // banner that also has room for its "earned by species" context.
    const tileBase = (color: string): React.CSSProperties => ({
      position: 'relative', cursor: 'pointer', overflow: 'hidden',
      background: `linear-gradient(165deg, ${color}1c 0%, rgba(6,12,20,0.95) 62%)`,
      border: `1px solid ${color}30`,
      borderTop: `1px solid ${color}70`,
      borderRadius: 18,
      boxShadow: `0 3px 12px rgba(0,0,0,0.4), 0 0 16px ${color}12`,
    })
    const sheen = <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 22%)', pointerEvents: 'none', zIndex: 1 }} />

    return (
      <div className="px-4 sm:px-6 max-w-lg sm:max-w-2xl mx-auto pb-16">
        <ShopHeader title="Tackle Shop" backLabel="Back" onBack={() => router.back()} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
          {CATEGORIES.map(({ key, label, desc, color, imageUrl }) => {
            const wide = key === 'line'
            return (
              <motion.div
                key={key}
                onClick={() => { setSection(key); setError(null) }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                style={{
                  ...tileBase(color),
                  gridColumn: wide ? '1 / -1' : undefined,
                  display: 'flex',
                  flexDirection: wide ? 'row' : 'column',
                  alignItems: wide ? 'center' : 'stretch',
                  gap: wide ? '1rem' : 0,
                  padding: wide ? '0.9rem 1.2rem' : 0,
                }}
              >
                {sheen}

                {wide ? (
                  <>
                    <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 2 }}>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#fff', lineHeight: 1.15, marginBottom: '0.3rem' }}>{label}</p>
                      <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: '#b0ada8', lineHeight: 1.45 }}>{desc}</p>
                    </div>
                    {imageUrl && (
                      <div style={{ flexShrink: 0, width: 92, height: 80, position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt={label} loading="lazy" decoding="async" style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', filter: `drop-shadow(0 4px 16px ${color}55)` }} />
                      </div>
                    )}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={`${color}99`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ position: 'relative', zIndex: 2, flexShrink: 0 }}>
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </>
                ) : (
                  <>
                    {/* Art scene — fills the tile width with a radial halo behind the piece */}
                    <div style={{
                      position: 'relative', height: 120,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `radial-gradient(ellipse 75% 70% at 50% 45%, ${color}24 0%, transparent 70%)`,
                      borderBottom: `1px solid ${color}1f`,
                    }}>
                      {imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt={label} loading="lazy" decoding="async" style={{ maxWidth: '72%', maxHeight: 96, objectFit: 'contain', filter: `drop-shadow(0 5px 18px ${color}60)`, position: 'relative', zIndex: 2 }} />
                      )}
                    </div>
                    {/* Label + desc */}
                    <div style={{ position: 'relative', zIndex: 2, padding: '0.7rem 0.85rem 0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '1.18rem', color: '#fff', lineHeight: 1.1 }}>{label}</p>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`${color}99`} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </div>
                      <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#b0ada8', lineHeight: 1.4, marginTop: 3 }}>{desc}</p>
                    </div>
                  </>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Section shell ──────────────────────────────────────────────────────
  const sectionColor = CATEGORIES.find(c => c.key === section)?.color ?? '#f0ede8'
  const sectionLabel = CATEGORIES.find(c => c.key === section)?.label ?? ''

  return (
    <div className="px-4 sm:px-6 max-w-4xl mx-auto">
      <ShopHeader
        title={sectionLabel}
        backLabel="Tackle Shop"
        onBack={() => { setSection(null); setError(null) }}
        accent={sectionColor}
      />

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
                ...tileSurface(bait.color, { owned: owned > 0 }),
                padding: '0.8rem 0.8rem 0.75rem',
                display: 'flex', flexDirection: 'column', gap: '0.55rem',
              }}>
                <Sheen />

                {/* Icon + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', position: 'relative' }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 11, flexShrink: 0,
                    background: `radial-gradient(circle at 38% 30%, ${bait.color}30 0%, ${bait.color}10 70%)`,
                    border: `1px solid ${bait.color}45`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {bait.imageUrl
                      ? <img src={bait.imageUrl} alt={bait.name} loading="lazy" decoding="async" style={{ width: 28, height: 28, objectFit: 'contain', filter: `drop-shadow(0 2px 5px ${bait.color}55)` }} />
                      : <div style={{ width: 12, height: 12, borderRadius: 4, background: bait.color }} />
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f4ecd8', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bait.name}
                    </p>
                    {owned > 0 && (
                      <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ display: 'inline-block', marginTop: 3, fontSize: '0.5rem', color: bait.color, background: `${bait.color}1c`, border: `1px solid ${bait.color}45`, borderRadius: 999, padding: '0.1rem 0.4rem' }}>×{owned} in hold</span>
                    )}
                  </div>
                </div>

                {/* Effect chips */}
                <div style={{ display: 'flex', gap: '0.28rem', flexWrap: 'wrap', position: 'relative' }}>
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
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: 'auto', position: 'relative' }}>
                    {([10, 25] as const).map(buyQty => {
                      const cost       = bait.shopCost * buyQty
                      const canAfford  = doubloons >= cost
                      const isBuying   = buyingBait === `${bait.type}-${buyQty}` && isPending
                      return (
                        <motion.button
                          key={buyQty}
                          onClick={() => { if (canAfford && !isPending) handleBuyBait(bait.type, buyQty) }}
                          disabled={!canAfford || isPending}
                          whileTap={canAfford && !isPending ? { scale: 0.95 } : undefined}
                          transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                          style={{
                            flex: 1,
                            borderRadius: 9, padding: '0.45rem 0.25rem',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                            background: canAfford ? `linear-gradient(180deg, ${bait.color}26 0%, ${bait.color}12 100%)` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${canAfford ? bait.color + '55' : 'rgba(255,255,255,0.08)'}`,
                            color: canAfford ? bait.color : '#4a4845',
                            cursor: canAfford && !isPending ? 'pointer' : 'default',
                            opacity: isBuying ? 0.5 : 1,
                            boxShadow: canAfford ? `inset 0 1px 0 rgba(255,255,255,0.08)` : 'none',
                          }}
                        >
                          <span className="font-karla font-700" style={{ fontSize: '0.76rem', lineHeight: 1 }}>
                            {isBuying ? '…' : `×${buyQty}`}
                          </span>
                          <span className="font-karla font-600" style={{ fontSize: '0.54rem', color: canAfford ? 'rgba(255,255,255,0.6)' : '#f0c040', lineHeight: 1 }}>
                            {cost.toLocaleString()} ⟡
                          </span>
                        </motion.button>
                      )
                    })}
                  </div>
                ) : (
                  <Link href="/expeditions" style={{ textDecoration: 'none', display: 'block', marginTop: 'auto', padding: '0.45rem 0.5rem', borderRadius: 9, background: `${bait.color}12`, border: `1px solid ${bait.color}32`, textAlign: 'center', position: 'relative' }}>
                    <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: bait.color }}>
                      Earned from voyages →
                    </span>
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Hooks ── */}
      {section === 'hook' && (
        <>
          <div className="mb-5" style={{
            ...tileSurface(HOOKS[previewTier]?.color ?? '#f0c040', { active: true }),
            padding: '1rem 1rem 0.85rem',
          }}>
            <Sheen />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HookViewer3D imageUrl={HOOKS[previewTier]?.imageUrl ? HOOKS[previewTier]!.imageUrl!.replace(/\.png$/, '_thumb.png') : undefined} color={HOOKS[previewTier]?.color ?? '#f0c040'} tier={previewTier} glowClass={HOOKS[previewTier] ? hookGlowClass(HOOKS[previewTier]) : undefined} />
            </div>
            <div className="flex items-center justify-center gap-2 mt-2" style={{ position: 'relative' }}>
              <p className="font-cinzel font-700 text-center" style={{ fontSize: '0.95rem', color: HOOKS[previewTier]?.color, textShadow: `0 0 14px ${HOOKS[previewTier]?.color ?? '#f0c040'}40` }}>
                {HOOKS[previewTier]?.name}
              </p>
              {previewTier !== hookTier && (
                <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.46rem', color: '#9a948a', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '0.12rem 0.4rem' }}>
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
              const hookReq = fishingLevelReqForCost(hook.cost)
              const hookLevelMet = fishingLevel >= hookReq
              const canAffordHook = isNext && doubloons >= hook.cost
              const hookReady = canAffordHook && hookLevelMet
              const clickable = isNext && hookReady && !isPending
              const isPreviewing = previewTier === hook.tier && hook.tier !== hookTier

              return (
                <motion.div
                  key={hook.tier}
                  onClick={() => { setPreviewTier(hook.tier); if (clickable) handleBuyHook() }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  style={{
                    ...tileSurface(c, { owned, active: isActive, ready: isNext && hookReady, locked }),
                    ...(isPreviewing && !owned ? { boxShadow: `0 0 14px ${c}1a`, borderTop: `1.5px solid ${c}aa` } : null),
                    padding: '0.85rem 0.9rem',
                    opacity: isPending && isNext ? 0.6 : 1,
                    cursor: 'pointer',
                  }}
                >
                  <Sheen />
                  <div className="flex items-center gap-3 sm:gap-4" style={{ position: 'relative' }}>
                    <HookIcon tier={hook.tier} color={c} owned={owned} isActive={isActive} imageUrl={hook.imageUrl ? hook.imageUrl.replace(/\.png$/, '_thumb.png') : undefined} glowClass={hookGlowClass(hook)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className="font-cinzel font-700 text-sm sm:text-base" style={{ color: owned ? '#f4ecd8' : '#7a756c' }}>
                          {hook.name}
                        </p>
                        {isActive && <ShopStatusPill kind="active" />}
                        {owned && !isActive && <ShopStatusPill kind="owned" />}
                        {locked && <ShopStatusPill kind="locked" />}
                      </div>
                      <p className="font-karla font-300 text-sm" style={{ color: owned ? '#9a958c' : '#6a655d' }}>{hook.description}</p>

                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {hook.tier > 0 && (
                          <span className="font-karla font-600"
                            style={{
                              fontSize: '0.62rem',
                              color: owned ? `${c}cc` : '#5a564e',
                              background: owned ? `${c}16` : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${owned ? `${c}38` : 'rgba(255,255,255,0.1)'}`,
                              padding: '0.12rem 0.5rem', borderRadius: '2rem',
                            }}>
                            +{hook.tier * 3}° catch zone
                          </span>
                        )}
                        {isNext && (
                          <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
                            fontSize: '0.56rem',
                            color: hookReady ? c : '#f0c040',
                            background: hookReady ? `${c}1c` : 'rgba(240,192,64,0.1)',
                            border: `1px solid ${hookReady ? `${c}55` : 'rgba(240,192,64,0.32)'}`,
                            padding: '0.14rem 0.5rem', borderRadius: 999,
                          }}>
                            {isPending ? 'Upgrading…' : !hookLevelMet ? `Fishing Lv ${hookReq}` : canAffordHook ? 'Tap to upgrade' : `${(hook.cost - doubloons).toLocaleString()} ⟡ short`}
                          </span>
                        )}
                      </div>
                    </div>

                    {!owned && (
                      <p className="font-cinzel font-700 shrink-0 text-base sm:text-lg" style={{ color: hookReady ? c : '#f0c040', whiteSpace: 'nowrap' }}>
                        {hook.cost.toLocaleString()} ⟡
                      </p>
                    )}
                  </div>
                </motion.div>
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
                  {(compRod.slug || compRod.imageUrl) && (
                    <div style={{ background: `${c}0a`, border: `1px solid ${c}25`, borderRadius: 12, padding: '1rem', display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={compRod.slug ? `/${compRod.slug}_thumb.png` : compRod.imageUrl} alt={compRod.name} loading="lazy" decoding="async" style={{ height: 140, objectFit: 'contain' }} />
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
                  {compActive && <p className="font-karla font-600 text-center" style={{ fontSize: '0.72rem', color: `${c}88` }}>Currently equipped</p>}
                </div>
              </div>
            )}

            {/* Rod list — single column so each rod gets a wide, readable row:
                a big neutral art panel on the left, name + plain effect chips +
                buy on the right. The old 2-col cards flooded every card with the
                rod's own colour (bg, halo, pills, button), turning the shop into
                a distracting rainbow where the rods + effects were hard to read.
                Each rod's colour now shows ONLY as its art glow + a small
                identity dot; the card chrome + chips are neutral. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className="mb-4">
              {[...RODS].filter(r => !r.earnedOnly).sort((a, b) => a.cost - b.cost).map(rod => {
                const owned = (rod.cost === 0 && !rod.earnedOnly) || ownedRods.includes(rod.tier)
                const isActive = rod.tier === equippedRod
                const canAfford = doubloons >= rod.cost
                const rodReq = fishingLevelReqForCost(rod.cost)
                const rodLevelMet = fishingLevel >= rodReq
                const rodBuyable = canAfford && rodLevelMet
                const isBuying = buyingRod === rod.tier && isPending
                const isEquipping = equippingRod === rod.tier && isPending
                const c = rod.color
                const speedPct = Math.round((3800 - rod.biteIntervalMs) / 3800 * 100)

                const effects: string[] = []
                if (rod.doubleCatchChance >= 1) effects.push('Always double catch')
                else if (rod.doubleCatchChance > 0) effects.push(`${Math.round(rod.doubleCatchChance * 100)}% double catch`)
                if (rod.retryOnMissChance > 0) effects.push(`${Math.round(rod.retryOnMissChance * 100)}% miss retry`)
                if (rod.snagImmune) effects.push('Snag immune')
                if (rod.perfectZoneBonus > 0) effects.push(`Perfect zone +${rod.perfectZoneBonus}°`)
                if (rod.rarityBonus > 0) effects.push(`+${Math.round(rod.rarityBonus * 100)}% rare bias`)
                if ((rod.jackpotChance ?? 0) > 0) effects.push(`${Math.round(rod.jackpotChance! * 100)}% jackpot ×${rod.jackpotMultiplier}`)
                if ((rod.crateChanceMult ?? 1) > 1) effects.push(`${rod.crateChanceMult}× crate odds`)
                if ((rod.perfectXpMult ?? 1) > 1) effects.push(`${rod.perfectXpMult}× perfect XP`)
                if (rod.wormhole) effects.push('Wormhole reroll')
                if ((rod.instantBiteChance ?? 0) > 0) effects.push(`${Math.round(rod.instantBiteChance! * 100)}% instant bite`)
                if (speedPct > 0) effects.push(`${speedPct}% faster bites`)
                if (rod.catchZoneBonus > 0) effects.push(`+${rod.catchZoneBonus}° catch zone`)
                if (effects.length === 0) effects.push('Standard rod')

                return (
                  <div key={rod.tier} style={{
                    display: 'flex', gap: 12, padding: 10,
                    background: 'rgba(12,14,19,0.95)',
                    border: `1px solid ${isActive ? 'rgba(240,192,64,0.45)' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 14,
                    boxShadow: isActive ? '0 0 16px rgba(240,192,64,0.1)' : '0 2px 8px rgba(0,0,0,0.3)',
                  }}>
                    {/* Art panel — neutral box, big enough to actually see the rod */}
                    <div style={{
                      flexShrink: 0, width: 104, alignSelf: 'stretch', minHeight: 104,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'radial-gradient(ellipse at 50% 45%, rgba(255,255,255,0.05) 0%, transparent 70%), rgba(4,6,10,0.5)',
                      border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 8,
                    }}>
                      {(rod.slug || rod.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={rod.slug ? `/${rod.slug}_thumb.png` : rod.imageUrl} alt={rod.name} loading="lazy" decoding="async"
                          className={owned ? rodGlowClass(rod) : undefined} style={{
                            // Always show the rod in full colour — even unaffordable
                            // ones — so players can see what they're saving up for.
                            // Owned rods are set apart by their animated glow (glow
                            // class) or a colour-matched drop-shadow; unowned rods
                            // just get a soft neutral shadow.
                            maxWidth: '100%', maxHeight: 92, objectFit: 'contain',
                            ...(owned && rod.glow
                              ? { ['--rod-glow-color' as string]: rod.color }
                              : { filter: `drop-shadow(0 3px 12px ${owned ? `${c}55` : 'rgba(0,0,0,0.55)'})` }
                            ),
                          } as React.CSSProperties} />
                      ) : <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />}
                    </div>

                    {/* Right: name + effects + action */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, flexShrink: 0, boxShadow: `0 0 6px ${c}88` }} />
                        <p className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.95rem', color: owned ? '#f4ecd8' : '#cfcabf', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rod.name}</p>
                        {isActive ? <ShopStatusPill kind="equipped" /> : owned ? <ShopStatusPill kind="owned" /> : null}
                      </div>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {effects.map(label => (
                          <span key={label} className="font-karla font-600" style={{
                            fontSize: '0.66rem', color: '#cdc8be',
                            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.13)',
                            padding: '0.16rem 0.5rem', borderRadius: 7, whiteSpace: 'nowrap',
                          }}>{label}</span>
                        ))}
                      </div>

                      <div style={{ marginTop: 'auto', paddingTop: 2 }}>
                        {!owned && (
                          <motion.button
                            onClick={() => { if (rodBuyable && !isPending) handlePurchaseRod(rod.tier) }}
                            disabled={isPending}
                            whileTap={rodBuyable && !isPending ? { scale: 0.97 } : undefined}
                            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                            className="font-karla font-700 uppercase tracking-[0.08em]"
                            style={{
                              padding: '0.5rem 0.95rem', borderRadius: 9,
                              background: rodBuyable ? 'linear-gradient(180deg, rgba(240,192,64,0.26) 0%, rgba(240,192,64,0.13) 100%)' : 'rgba(255,255,255,0.05)',
                              border: `1px solid ${rodBuyable ? 'rgba(240,192,64,0.6)' : 'rgba(255,255,255,0.12)'}`,
                              color: rodBuyable ? '#f0c040' : '#9a8f6a', fontSize: '0.66rem',
                              cursor: rodBuyable && !isPending ? 'pointer' : 'default', opacity: isBuying ? 0.5 : 1,
                              boxShadow: rodBuyable ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
                            }}>
                            {isBuying ? '…' : !rodLevelMet ? `Fishing Lv ${rodReq}` : canAfford ? `Buy · ${rod.cost.toLocaleString()} ⟡` : `Need ${(rod.cost - doubloons).toLocaleString()} ⟡`}
                          </motion.button>
                        )}
                        {owned && !isActive && (
                          <motion.button
                            onClick={() => handleEquipRod(rod.tier)}
                            disabled={isPending}
                            whileTap={!isPending ? { scale: 0.97 } : undefined}
                            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                            className="font-karla font-700 uppercase tracking-[0.08em]"
                            style={{
                              padding: '0.5rem 0.95rem', borderRadius: 9,
                              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.2)',
                              color: '#e0ddd8', fontSize: '0.66rem', cursor: isPending ? 'default' : 'pointer', opacity: isEquipping ? 0.5 : 1,
                            }}>
                            {isEquipping ? '…' : 'Equip'}
                          </motion.button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Completionist Rod — the capstone trophy card at the bottom */}
            <div className="mb-4" style={{
              ...tileSurface(c, { owned: compOwned, active: eligible, locked: !compOwned && !eligible }),
              padding: '1.1rem',
              boxShadow: compOwned ? `0 0 32px ${c}26, inset 0 1px 0 rgba(255,255,255,0.06)` : eligible ? `0 0 22px ${c}1f` : '0 2px 10px rgba(0,0,0,0.35)',
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
                    {compActive && <span className="flex-1 text-center" style={{ paddingTop: '0.4rem' }}><ShopStatusPill kind="active" label="In use" /></span>}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    {eligible ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill={c} stroke="none" aria-hidden style={{ flexShrink: 0, filter: `drop-shadow(0 0 6px ${c}88)` }}>
                        <path d="M12 2l2.4 6.9L21.5 9l-5.7 4.3 2.2 7-6-4.4-6 4.4 2.2-7L2.5 9l7.1-.1z" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6a6764" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                        <rect x="4.5" y="11" width="15" height="9.5" rx="1.5" />
                        <path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
                      </svg>
                    )}
                    <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: eligible ? '#f0ede8' : '#6a6764', letterSpacing: '0.08em' }}>
                      {eligible ? 'Ready to Claim' : 'Completionist Rod'}
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
                      {isClaiming ? 'Claiming…' : 'Claim Your Reward'}
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
            const reelReq = fishingLevelReqForCost(reel.cost)
            const reelLevelMet = fishingLevel >= reelReq
            const canAffordReel = isNext && doubloons >= reel.cost
            const reelReady = canAffordReel && reelLevelMet
            const c = reel.color
            const slowerPct = Math.round((1 - reel.needleSpeedMultiplier) * 100)

            return (
              <motion.div
                key={reel.tier}
                onClick={() => { if (isNext && reelReady && !isPending) handleBuyReel() }}
                whileTap={isNext && reelReady && !isPending ? { scale: 0.985 } : undefined}
                transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                style={{
                  ...tileSurface(c, { owned, active: isActive, ready: isNext && reelReady, locked }),
                  padding: '0.85rem 0.9rem',
                  opacity: isPending && isNext ? 0.6 : 1,
                  cursor: isNext && reelReady ? 'pointer' : 'default',
                }}
              >
                <Sheen />
                <div className="flex items-center gap-3" style={{ position: 'relative' }}>
                  <ReelIcon color={c} owned={owned} isActive={isActive} imageUrl={reel.imageUrl ? reel.imageUrl.replace(/\.png$/, '_thumb.png') : undefined} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-cinzel font-700 text-sm sm:text-base" style={{ color: owned ? '#f4ecd8' : '#7a756c' }}>
                        {reel.name}
                      </p>
                      {isActive && <ShopStatusPill kind="active" />}
                      {owned && !isActive && <ShopStatusPill kind="owned" />}
                      {locked && <ShopStatusPill kind="locked" />}
                    </div>
                    <p className="font-karla font-300 text-sm" style={{ color: owned ? '#9a958c' : '#6a655d' }}>{reel.description}</p>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="font-karla font-600"
                        style={{
                          fontSize: '0.62rem',
                          color: owned ? (slowerPct > 0 ? `${c}cc` : '#9a958c') : '#5a564e',
                          background: owned && slowerPct > 0 ? `${c}16` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${owned && slowerPct > 0 ? `${c}38` : 'rgba(255,255,255,0.1)'}`,
                          padding: '0.12rem 0.5rem', borderRadius: '2rem',
                        }}>
                        {slowerPct > 0 ? `Needle ${slowerPct}% slower` : 'Base speed'}
                      </span>
                      {isNext && (
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
                          fontSize: '0.56rem',
                          color: reelReady ? c : '#f0c040',
                          background: reelReady ? `${c}1c` : 'rgba(240,192,64,0.1)',
                          border: `1px solid ${reelReady ? `${c}55` : 'rgba(240,192,64,0.32)'}`,
                          padding: '0.14rem 0.5rem', borderRadius: 999,
                        }}>
                          {isPending ? 'Upgrading…' : !reelLevelMet ? `Fishing Lv ${reelReq}` : canAffordReel ? 'Tap to upgrade' : `${(reel.cost - doubloons).toLocaleString()} ⟡ short`}
                        </span>
                      )}
                    </div>
                  </div>

                  {!owned && (
                    <p className="font-cinzel font-700 text-base shrink-0" style={{ color: reelReady ? c : '#f0c040', whiteSpace: 'nowrap' }}>
                      {reel.cost.toLocaleString()} ⟡
                    </p>
                  )}
                </div>
              </motion.div>
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
          <div style={{
            ...tileSurface('#4ade80', {}),
            padding: '0.7rem 0.9rem', marginBottom: 4,
            display: 'flex', alignItems: 'center', gap: 9,
          }}>
            <Sheen />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, position: 'relative' }}>
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
            </svg>
            <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: '#9ab39c', lineHeight: 1.4, position: 'relative' }}>
              Lines are earned by catching unique species — no purchase needed.
            </p>
          </div>
          {LINES.map(line => {
            const owned = line.tier <= lineTier
            const isActive = line.tier === lineTier
            const locked = !owned && line.unlockAt > 0
            const c = line.color
            const smallerPct = Math.round((1 - line.penaltyMultiplier) * 100)

            return (
              <div
                key={line.tier}
                style={{
                  ...tileSurface(c, { owned, active: isActive, locked }),
                  padding: '0.85rem 0.9rem',
                }}
              >
                <Sheen />
                <div className="flex items-center gap-3" style={{ position: 'relative' }}>
                  <LineIcon color={c} owned={owned} isActive={isActive} imageUrl={line.imageUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="font-cinzel font-700 text-base" style={{ color: owned ? '#f4ecd8' : '#7a756c' }}>
                        {line.name}
                      </p>
                      {isActive && <ShopStatusPill kind="active" />}
                      {owned && !isActive && <ShopStatusPill kind="owned" />}
                      {locked && <ShopStatusPill kind="locked" />}
                    </div>
                    <p className="font-karla font-300 text-sm" style={{ color: owned ? '#9a958c' : '#6a655d' }}>{line.description}</p>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="font-karla font-600"
                        style={{
                          fontSize: '0.62rem',
                          color: owned ? (smallerPct > 0 ? `${c}cc` : '#9a958c') : '#5a564e',
                          background: owned && smallerPct > 0 ? `${c}16` : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${owned && smallerPct > 0 ? `${c}38` : 'rgba(255,255,255,0.1)'}`,
                          padding: '0.12rem 0.5rem', borderRadius: '2rem',
                        }}>
                        {smallerPct > 0 ? `Snag zones ${smallerPct}% smaller` : 'Standard snag zones'}
                      </span>
                      {locked && (
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
                          fontSize: '0.56rem', color: '#9a8f6a',
                          background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.25)',
                          padding: '0.14rem 0.5rem', borderRadius: 999,
                        }}>
                          {line.unlockAt} species to unlock
                        </span>
                      )}
                    </div>
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

// ── Shared item-card chrome ──────────────────────────────────────────────
// One surface recipe so every Tackle Shop section (bait/hook/rod/reel/line)
// reads as the same family: an accent-tinted gradient body, a brighter accent
// top-rim, soft depth, and state-driven emphasis (owned glows, ready gets a
// gold-ready edge, locked goes flat/dim).
type TileState = { owned?: boolean; active?: boolean; ready?: boolean; locked?: boolean }
function tileSurface(c: string, s: TileState): React.CSSProperties {
  const { owned, active, ready, locked } = s
  const bodyAlpha = owned || active ? '20' : ready ? '15' : '0d'
  return {
    position: 'relative',
    background: locked
      ? 'rgba(7,10,15,0.72)'
      : `linear-gradient(160deg, ${c}${bodyAlpha} 0%, rgba(7,11,17,0.95) 64%)`,
    border: `1px solid ${active ? c + '7a' : owned ? c + '4a' : ready ? c + '4a' : locked ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.1)'}`,
    borderTop: `1.5px solid ${active ? c : owned ? c + 'cc' : ready ? c + 'aa' : locked ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.18)'}`,
    borderRadius: 15,
    boxShadow: active
      ? `0 0 22px ${c}26, inset 0 1px 0 rgba(255,255,255,0.06)`
      : owned ? `0 2px 12px ${c}16`
      : ready ? `0 0 16px ${c}16`
      : '0 2px 10px rgba(0,0,0,0.35)',
    overflow: 'hidden',
  }
}
// Glossy top sheen — drop inside any tileSurface card as the first child.
function Sheen() {
  return <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 20%)', pointerEvents: 'none' }} />
}

function HookIcon({ tier, color, owned, isActive, imageUrl, glowClass }: { tier: number; color: string; owned: boolean; isActive: boolean; imageUrl?: string; glowClass?: string }) {
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
          loading="lazy"
          decoding="async"
          className={owned ? glowClass : undefined}
          style={{
            width: '100%', height: '100%', objectFit: 'contain',
            opacity: owned ? 1 : 0.28,
            ...(owned && glowClass
              ? {}
              : { filter: owned ? `drop-shadow(0 0 5px ${color}70)` : 'grayscale(80%)' }),
          } as React.CSSProperties}
        />
      ) : (
        icons[tier] ?? icons[0]
      )}
    </div>
  )
}

function LineIcon({ color, owned, isActive, imageUrl }: { color: string; owned: boolean; isActive: boolean; imageUrl?: string }) {
  const bg = owned ? `${color}12` : 'rgba(255,255,255,0.06)'
  const border = owned ? `${color}35` : 'rgba(255,255,255,0.11)'
  const op = owned ? 1 : 0.45
  return (
    <div
      className="w-[38px] h-[38px] sm:w-12 sm:h-12 shrink-0 flex items-center justify-center"
      style={{ borderRadius: 10, background: bg, border: `1px solid ${border}`, boxShadow: isActive ? `0 0 10px ${color}25` : 'none' }}
    >
      {imageUrl
        ? <img src={imageUrl} alt="" loading="lazy" decoding="async" style={{ width: 28, height: 28, objectFit: 'contain', opacity: op, filter: `drop-shadow(0 1px 4px ${color}55)` }} />
        : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={owned ? color : '#4a4845'} strokeWidth="1.6" strokeLinecap="round">
            <path d="M3 7 Q7 4 12 7 Q17 10 21 7" />
            <path d="M3 12 Q7 9 12 12 Q17 15 21 12" />
            <path d="M3 17 Q7 14 12 17 Q17 20 21 17" />
          </svg>
        )
      }
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
        ? <img src={imageUrl} alt="" loading="lazy" decoding="async" style={{ width: 28, height: 28, objectFit: 'contain', opacity: op, filter: `drop-shadow(0 1px 4px ${color}55)` }} />
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
