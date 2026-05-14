'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { rarityFromVariant } from '@/lib/variants'
import FishCard from '@/components/FishCard'
import PrizeModal from '@/components/PrizeModal'
import { openPack as openPackAction, buyPacksWithGems } from './actions'
import type { DrawnCard } from '@/lib/types'
import type { OpenPackResponse } from './actions'
import AchievementToast from '@/components/AchievementToast'


interface Props {
  packsAvailable: number
  gems: number
  isPremium: boolean
}

export default function PackOpener({ packsAvailable: initialPacks, gems: initialGems, isPremium }: Props) {
  const router = useRouter()
  const packButtonRef = useRef<HTMLButtonElement>(null)
  const [packs, setPacks] = useState(initialPacks)
  const [phase, setPhase] = useState<'idle' | 'reveal' | 'done'>('idle')
  const [cards, setCards] = useState<DrawnCard[]>([])
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [glowClasses, setGlowClasses] = useState<string[]>([])
  const [flash, setFlash] = useState<{ type: string; key: number } | null>(null)
  const [prize, setPrize] = useState<{ cardName: string; variantName: string; prizeCode: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [gems, setGems] = useState(initialGems)
  const [buyingWithGems, setBuyingWithGems] = useState(false)
  const [newVariantIds, setNewVariantIds] = useState<Set<number>>(new Set())
  const [isGodPack, setIsGodPack] = useState(false)
  const [rankUp, setRankUp] = useState<{ rank: string; bonus: number } | null>(null)
  const [shockwaveCards, setShockwaveCards] = useState<Set<number>>(new Set())
  const [mythicFeatured, setMythicFeatured] = useState<number | null>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const [achievementKeys, setAchievementKeys] = useState<string[]>([])
  const pendingAchievements = useRef<string[]>([])
  const [peekGlows, setPeekGlows] = useState<string[]>([])
  const peekTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const peekActive = useRef<Set<number>>(new Set())
  const suppressClick = useRef<Set<number>>(new Set())

  function getInner(i: number) {
    return cardRefs.current[i]?.querySelector('.flip-card-inner') as HTMLElement | null
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>, i: number) {
    if (flipped[i]) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    const rotX = (0.5 - y) * 14
    const rotY = (x - 0.5) * 14
    const inner = getInner(i)
    if (inner) {
      inner.style.transition = 'transform 0.08s ease-out'
      inner.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-6px) scale(1.03)`
    }
  }

  function handleMouseLeave(e: React.MouseEvent<HTMLDivElement>, i: number) {
    if (flipped[i]) return
    const inner = getInner(i)
    if (inner) {
      inner.style.transition = 'transform 0.4s ease-out'
      inner.style.transform = ''
    }
  }

  function resetTilt(i: number) {
    const inner = getInner(i)
    if (inner) {
      inner.style.transition = ''
      inner.style.transform = ''
    }
  }

  const PEEK_GLOW: Record<string, string> = {
    Rare: 'peek-glow-rare', Epic: 'peek-glow-epic',
    Legendary: 'peek-glow-legendary', Mythic: 'peek-glow-mythic',
  }

  function handlePointerDown(i: number) {
    if (flipped[i] || loading) return
    const timer = setTimeout(() => {
      const rarity = rarityFromVariant(cards[i].variantName, cards[i].dropWeight)
      peekActive.current.add(i)
      setPeekGlows(prev => { const n = [...prev]; n[i] = PEEK_GLOW[rarity] ?? 'peek-jiggle'; return n })
    }, 350)
    peekTimers.current.set(i, timer)
  }

  function handlePointerUp(i: number) {
    clearTimeout(peekTimers.current.get(i))
    peekTimers.current.delete(i)
    if (peekActive.current.has(i)) {
      peekActive.current.delete(i)
      suppressClick.current.add(i)
      setPeekGlows(prev => { const n = [...prev]; n[i] = ''; return n })
    }
  }

  async function openPack() {
    if (packs <= 0 || loading) return
    if (packButtonRef.current) {
      packButtonRef.current.style.transform = ''
      packButtonRef.current.style.filter = ''
    }
    setLoading(true)
    setFlipped(new Array(cards.length || 5).fill(false))
    setGlowClasses(new Array(cards.length || 5).fill(''))
    setPeekGlows(new Array(cards.length || 5).fill(''))
    setPrize(null)
    setShockwaveCards(new Set())
    setMythicFeatured(null)

    const result: OpenPackResponse = await openPackAction()

    if (result.error || !result.drawn) {
      setLoading(false)
      if (result.error === 'Unauthorized') router.push('/login')
      return
    }

    setNewVariantIds(new Set(result.newVariantIds ?? []))
    setIsGodPack(result.isGodPack ?? false)
    setRankUp(result.rankUp ?? null)
    pendingAchievements.current = result.newAchievements ?? []
    setCards(result.drawn)
    setFlipped(new Array(result.drawn.length).fill(false))
    setGlowClasses(new Array(result.drawn.length).fill(''))
    setPeekGlows(new Array(result.drawn.length).fill(''))
    setFlash(result.isGodPack ? { type: 'godpack', key: Date.now() } : null)
    const newPacks = result.packsRemaining ?? packs - 1
    setPacks(newPacks)
    window.dispatchEvent(new CustomEvent('packs-changed', { detail: newPacks }))
    setPhase('reveal')
    setLoading(false)
    router.refresh()
  }

  function isPrizeCard(card: DrawnCard) {
    return (card.name === 'Catfish' || card.name === 'Doby Mick') && card.variantName === 'GOD'
  }

  function generatePrizeCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
    return `WIN-${rand}`
  }

  async function checkPrize(card: DrawnCard) {
    if (!isPrizeCard(card)) return
    const code = generatePrizeCode()
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('prize_claims').insert({
      user_id: user.id,
      prize_code: code,
      card_variant_id: card.variantId,
      card_name: card.name,
      variant_name: card.variantName,
    })
    if (!error) setTimeout(() => setPrize({ cardName: card.name, variantName: card.variantName, prizeCode: code }), 2500)
  }

  // To add reveal effects for a new rarity, add one entry here.
  const RARITY_EFFECTS: Record<string, { glow: string; flash: string }> = {
    Rare:      { glow: 'reveal-glow-rare',      flash: ''          },
    Epic:      { glow: 'reveal-glow-epic',      flash: 'epic'      },
    Legendary: { glow: 'reveal-glow-legendary', flash: 'legendary' },
    Mythic:    { glow: 'reveal-glow-mythic',    flash: 'mythic'    },
  }

  function glowClassFor(rarity: string) {
    return RARITY_EFFECTS[rarity]?.glow ?? ''
  }

  function triggerFlash(rarity: string) {
    const fx = RARITY_EFFECTS[rarity]
    if (fx?.flash) setFlash({ type: fx.flash, key: Date.now() })
  }

  function flipCard(i: number) {
    if (suppressClick.current.has(i)) { suppressClick.current.delete(i); return }
    if (flipped[i] || loading) return
    resetTilt(i)
    const rarity = rarityFromVariant(cards[i].variantName, cards[i].dropWeight)
    checkPrize(cards[i])

    if (rarity === 'Mythic') {
      // Delay all mythic effects until after the 0.6s flip completes
      const FLIP_MS = 660
      setTimeout(() => {
        triggerFlash(rarity)
        setGlowClasses((prev) => { const n = [...prev]; n[i] = glowClassFor(rarity); return n })
        setMythicFeatured(i)
        setShockwaveCards((prev) => new Set([...prev, i]))
      }, FLIP_MS)
      setTimeout(() => setMythicFeatured(null), FLIP_MS + 2500)
      setTimeout(() => setShockwaveCards((prev) => { const n = new Set(prev); n.delete(i); return n }), FLIP_MS + 1600)
    } else {
      setGlowClasses((prev) => { const n = [...prev]; n[i] = glowClassFor(rarity); return n })
      triggerFlash(rarity)
    }

    setFlipped((prev) => {
      const n = [...prev]
      n[i] = true
      if (n.every(Boolean)) setTimeout(() => {
        setPhase('done')
        if (pendingAchievements.current.length) {
          setAchievementKeys(pendingAchievements.current)
          pendingAchievements.current = []
        }
      }, 700)
      return n
    })
  }

  function flipAll() {
    cards.forEach((_, i) => resetTilt(i))
    const lastIdx = cards.length - 1
    cards.forEach((card, i) => {
      const delay = i * 480 + (i === lastIdx ? 500 : 0)
      setTimeout(() => {
        const rarity = rarityFromVariant(card.variantName, card.dropWeight)
        triggerFlash(rarity)
        setGlowClasses(prev => { const n = [...prev]; n[i] = glowClassFor(rarity); return n })
        checkPrize(card)
        setFlipped(prev => { const n = [...prev]; n[i] = true; return n })
      }, delay)
    })
    setTimeout(() => {
      setPhase('done')
      if (pendingAchievements.current.length) {
        setAchievementKeys(pendingAchievements.current)
        pendingAchievements.current = []
      }
    }, lastIdx * 480 + 500 + 700)
  }

  function reset() {
    setPhase('idle')
    setCards([])
    setFlipped([])
    setGlowClasses([])
    setPeekGlows([])
    setFlash(null)
    setPrize(null)
    setIsGodPack(false)
    setRankUp(null)
    setNewVariantIds(new Set())
    setShockwaveCards(new Set())
    setMythicFeatured(null)
    pendingAchievements.current = []
    router.refresh()
  }

  async function handleBuyWithGems(count: 1 | 10) {
    if (buyingWithGems) return
    setBuyingWithGems(true)
    const result = await buyPacksWithGems(count)
    if (!('error' in result)) {
      setPacks(result.packsAvailable)
      setGems(result.gems)
      window.dispatchEvent(new CustomEvent('packs-changed', { detail: result.packsAvailable }))
      window.dispatchEvent(new CustomEvent('gems-changed', { detail: result.gems }))
    }
    setBuyingWithGems(false)
  }

  if (phase === 'idle') {
    const canBuyOne = gems >= 100
    const canBuyTen = gems >= 900
    return (
      <div style={{
        width: '100%',
        maxWidth: 400,
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '1rem',
      }}>
        {/* Hero — pack-art image floats above the panel for some life. */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '-30px', position: 'relative', zIndex: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/recruitcrew.png"
            alt=""
            style={{
              width: '70%', maxWidth: 220, height: 'auto',
              filter: 'drop-shadow(0 14px 32px rgba(0,0,0,0.65)) drop-shadow(0 0 28px rgba(240,192,64,0.18))',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            draggable={false}
          />
        </div>

        {/* Primary panel: count + recruit button. */}
        <div style={{
          background: 'linear-gradient(180deg, rgba(14,22,38,0.96) 0%, rgba(6,12,22,0.98) 100%)',
          border: '1px solid rgba(240,192,64,0.22)',
          borderTop: '1px solid rgba(240,192,64,0.42)',
          borderRadius: 18,
          padding: '1.6rem 1.4rem 1.4rem',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.1rem',
          boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
          position: 'relative', zIndex: 2,
        }}>
          {/* Count + label */}
          <div style={{ textAlign: 'center' }}>
            <p className="font-karla font-700 uppercase tracking-[0.20em]" style={{ fontSize: '0.65rem', color: '#8a7a52', marginBottom: 4 }}>
              You have
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '0.6rem' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '4.5rem', lineHeight: 0.9, color: '#f0ede8', textShadow: '0 4px 20px rgba(240,192,64,0.22)' }}>{packs}</p>
              <p className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ fontSize: '1.05rem', color: '#a8a08c' }}>
                Crew Notice{packs !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          {/* Primary action — Recruit Crew (when packs available) */}
          {packs > 0 ? (
            <button
              ref={packButtonRef}
              onClick={openPack}
              disabled={loading}
              style={{
                width: '100%',
                background: 'linear-gradient(180deg, rgba(240,192,64,0.28) 0%, rgba(240,192,64,0.10) 100%)',
                border: '1px solid rgba(240,192,64,0.55)',
                borderTop: '1px solid rgba(240,192,64,0.85)',
                borderRadius: 14,
                padding: '1.2rem 1rem',
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                boxShadow: '0 4px 22px rgba(240,192,64,0.22), inset 0 1px 0 rgba(255,255,255,0.08)',
                animation: 'btn-pulse 2.4s ease-in-out infinite',
              }}
              onPointerEnter={e => { if (e.pointerType !== 'touch' && !loading) e.currentTarget.style.transform = 'translateY(-2px)' }}
              onPointerLeave={e => { e.currentTarget.style.transform = '' }}
            >
              <span className="font-cinzel font-700 uppercase tracking-[0.18em]" style={{ fontSize: '1.25rem', color: '#f0c040', textShadow: '0 0 18px rgba(240,192,64,0.45)' }}>
                {loading ? 'Recruiting…' : 'Recruit Crew'}
              </span>
            </button>
          ) : (
            <p className="font-karla" style={{ fontSize: '0.92rem', color: '#a09a8c', textAlign: 'center', lineHeight: 1.5 }}>
              No Crew Notices left.<br />
              <span style={{ color: '#f0c040' }}>Get more below ↓</span>
            </p>
          )}
        </div>

        {/* Buy-with-gems panel — bigger, clearer cards. */}
        <div style={{
          background: 'rgba(167,139,250,0.04)',
          border: '1px solid rgba(167,139,250,0.18)',
          borderTop: '1px solid rgba(167,139,250,0.34)',
          borderRadius: 16,
          padding: '0.95rem 1rem 1rem',
          display: 'flex', flexDirection: 'column', gap: '0.7rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p className="font-cinzel font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.85rem', color: '#cab8ff' }}>
              Buy with Gems
            </p>
            <p className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#a78bfa' }}>
              {gems.toLocaleString()} <span style={{ fontSize: '0.78rem' }}>◆</span>
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              onClick={() => canBuyOne && handleBuyWithGems(1)}
              disabled={buyingWithGems || !canBuyOne}
              style={{
                background: canBuyOne ? 'linear-gradient(180deg, rgba(167,139,250,0.16) 0%, rgba(167,139,250,0.04) 100%)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${canBuyOne ? 'rgba(167,139,250,0.36)' : 'rgba(255,255,255,0.08)'}`,
                borderTop: `1px solid ${canBuyOne ? 'rgba(167,139,250,0.55)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 12,
                padding: '0.85rem 0.6rem',
                cursor: canBuyOne && !buyingWithGems ? 'pointer' : 'default',
                opacity: canBuyOne ? 1 : 0.45,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                transition: 'transform 0.12s ease',
              }}
            >
              <span className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', lineHeight: 1 }}>1</span>
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#a8a08c' }}>Pack</span>
              <span className="font-karla font-700" style={{ fontSize: '0.85rem', color: canBuyOne ? '#a78bfa' : '#5a5468', marginTop: 2 }}>
                100 ◆
              </span>
            </button>
            <button
              onClick={() => canBuyTen && handleBuyWithGems(10)}
              disabled={buyingWithGems || !canBuyTen}
              style={{
                background: canBuyTen ? 'linear-gradient(180deg, rgba(167,139,250,0.22) 0%, rgba(167,139,250,0.06) 100%)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${canBuyTen ? 'rgba(167,139,250,0.42)' : 'rgba(255,255,255,0.08)'}`,
                borderTop: `1px solid ${canBuyTen ? 'rgba(167,139,250,0.65)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 12,
                padding: '0.85rem 0.6rem',
                cursor: canBuyTen && !buyingWithGems ? 'pointer' : 'default',
                opacity: canBuyTen ? 1 : 0.45,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                position: 'relative',
                transition: 'transform 0.12s ease',
              }}
            >
              <span className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{
                  position: 'absolute', top: -8, right: 8,
                  fontSize: '0.52rem', color: '#0a0612',
                  background: 'linear-gradient(180deg, #f0c040 0%, #d4a430 100%)',
                  padding: '2px 6px', borderRadius: 4,
                  boxShadow: '0 2px 6px rgba(240,192,64,0.35)',
                }}>
                Best Value
              </span>
              <span className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', lineHeight: 1 }}>10</span>
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#a8a08c' }}>Packs</span>
              <span className="font-karla font-700" style={{ fontSize: '0.85rem', color: canBuyTen ? '#a78bfa' : '#5a5468', marginTop: 2 }}>
                900 ◆
              </span>
            </button>
          </div>

          {buyingWithGems && (
            <p className="font-karla" style={{ fontSize: '0.7rem', color: '#a78bfa', textAlign: 'center' }}>Processing…</p>
          )}
        </div>

        {/* Membership hint — only for non-members. Soft sell, not a pop-up. */}
        {!isPremium && (
          <a
            href="/marketplace"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'linear-gradient(180deg, rgba(240,192,64,0.06) 0%, rgba(240,192,64,0.02) 100%)',
              border: '1px solid rgba(240,192,64,0.18)',
              borderTop: '1px solid rgba(240,192,64,0.32)',
              borderRadius: 12,
              padding: '0.65rem 0.85rem',
              textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>✦</span>
            <span className="font-karla" style={{ fontSize: '0.78rem', color: '#c8b890', lineHeight: 1.4, flex: 1 }}>
              Members get <span style={{ color: '#f0c040', fontWeight: 700 }}>1 free pack daily</span>. Learn more.
            </span>
            <span style={{ fontSize: '0.85rem', color: '#a88a48' }}>›</span>
          </a>
        )}

        {/* Quiet utility row — keep redeem-code access available. */}
        <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
          <a href="/redeem" className="font-karla font-600 uppercase tracking-[0.12em] transition-colors" style={{ fontSize: '0.62rem', color: '#6a6760' }}>
            Have a code? Redeem here
          </a>
        </div>
      </div>
    )
  }

  const someUnflipped = flipped.some(f => !f)

  function renderFlipInner(card: DrawnCard, i: number) {
    return (
      <>
        <div className="flip-card-inner w-full h-full">
          <div className="flip-card-front w-full h-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cardbacknew.png" alt="" className="w-full h-full object-cover" draggable={false} onContextMenu={(e) => e.preventDefault()} />
          </div>
          <div className="flip-card-back w-full h-full bg-black">
            <FishCard name={card.name} filename={card.filename} borderStyle={card.borderStyle} artEffect={card.artEffect} variantName={card.variantName} dropWeight={card.dropWeight} stats={{ power: card.power, dodge: card.dodge, fortune: card.fortune }} fill />
          </div>
        </div>
        {shockwaveCards.has(i) && (() => {
          const r = rarityFromVariant(card.variantName, card.dropWeight)
          return (
            <>
              <div className="shockwave-ring" />
              <div className="shockwave-ring shockwave-ring-2" />
              <div className="shockwave-ring shockwave-ring-3" />
            </>
          )
        })()}
      </>
    )
  }

  function renderCard(card: DrawnCard, i: number) {
    return (
      <div key={i} className="relative" style={{ animation: 'cardEntrance 0.55s cubic-bezier(0.34,1.56,0.64,1) both', animationDelay: `${i * 130}ms` }}>
        <div
          ref={(el) => { cardRefs.current[i] = el }}
          className={`flip-card pack-card-size select-none ${flipped[i] ? 'flipped' : loading ? '' : 'cursor-pointer'} ${glowClasses[i] ?? ''} ${peekGlows[i] ?? ''}`}
          style={{ opacity: mythicFeatured !== null && mythicFeatured !== i ? 0.2 : 1, transition: 'opacity 0.3s ease', WebkitTouchCallout: 'none' }}
          onClick={() => flipCard(i)}
          onContextMenu={(e) => e.preventDefault()}
          onMouseMove={(e) => handleMouseMove(e, i)}
          onMouseLeave={(e) => { handleMouseLeave(e, i); handlePointerUp(i) }}
          onPointerDown={() => handlePointerDown(i)}
          onPointerUp={() => handlePointerUp(i)}
          onPointerCancel={() => handlePointerUp(i)}
        >
          {renderFlipInner(card, i)}
        </div>
        {flipped[i] && newVariantIds.has(card.variantId) && (
          <p className="new-badge absolute left-0 right-0 text-center pointer-events-none" style={{ top: '0.7rem', zIndex: 20 }}>New</p>
        )}
      </div>
    )
  }

  function renderMobileActions() {
    const isDone = phase === 'done'
    const outOfPacks = isDone && packs === 0
    const showAction = someUnflipped || (isDone && packs > 0) || outOfPacks
    return (
      <div className="flex items-center justify-between w-full px-6 py-2">
        {/* Pack count */}
        <div className="flex flex-col gap-0.5">
          <span className="font-cinzel font-700 text-[#f0ede8] leading-none" style={{ fontSize: '2rem' }}>{packs}</span>
          <span className="font-karla font-600 uppercase text-[#6a6764]" style={{ fontSize: '0.58rem', letterSpacing: '0.12em' }}>Crew Notices</span>
        </div>
        {/* Action button — always rendered to prevent layout shift */}
        <button
          onClick={outOfPacks ? reset : isDone ? openPack : flipAll}
          disabled={!showAction || (isDone && loading && !outOfPacks)}
          className="rounded-full flex items-center justify-center select-none touch-manipulation disabled:opacity-40"
          style={{
            width: '5rem', height: '5rem',
            visibility: showAction ? 'visible' : 'hidden',
            background: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.20)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)',
            backdropFilter: 'blur(12px)',
            transition: 'transform 0.12s cubic-bezier(0.34,1.56,0.64,1)',
          }}
          onPointerDown={(e) => { e.currentTarget.style.transform = 'scale(0.92)' }}
          onPointerUp={(e) => { e.currentTarget.style.transform = '' }}
          onPointerLeave={(e) => { e.currentTarget.style.transform = '' }}
        >
          <span className="font-karla font-800 uppercase text-[#f0ede8] text-center leading-snug" style={{ fontSize: '0.65rem', letterSpacing: '0.10em' }}>
            {outOfPacks ? <>Get<br/>More</> : isDone ? <>Recruit<br/>Again</> : <>Reveal<br/>All</>}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-10 w-full">
      <AchievementToast keys={achievementKeys} onDone={() => setAchievementKeys([])} />
      {flash && <div key={flash.key} className={`reveal-flash reveal-flash-${flash.type}`} />}
      {prize && (
        <PrizeModal
          cardName={prize.cardName}
          variantName={prize.variantName}
          prizeCode={prize.prizeCode}
          onClose={() => setPrize(null)}
        />
      )}
      {isGodPack && (
        <div className="text-center godpack-title">
          <p className="font-cinzel font-700 tracking-[0.35em] uppercase"
             style={{ fontSize: 'clamp(1.1rem, 3vw, 1.6rem)', color: '#fff8e8', textShadow: '0 0 24px rgba(255,220,120,0.9), 0 0 60px rgba(255,200,60,0.5), 0 0 100px rgba(255,180,0,0.3)' }}>
            God Pack
          </p>
        </div>
      )}
      {rankUp && (() => {
        const RANK_COLORS: Record<string, string> = {
          'Officer': '#4ade80',
          'Second Mate': '#60a5fa',
          'Quartermaster': '#a78bfa',
          'Captain': '#f0c040',
        }
        const c = RANK_COLORS[rankUp.rank] ?? '#f0ede8'
        const rgb = c === '#4ade80' ? '74,222,128' : c === '#60a5fa' ? '96,165,250' : c === '#a78bfa' ? '167,139,250' : '240,192,64'
        return (
          <div className="w-full max-w-xs mx-auto px-6">
            <div style={{
              background: `linear-gradient(135deg, rgba(${rgb},0.12), rgba(${rgb},0.05))`,
              border: `1px solid rgba(${rgb},0.5)`,
              borderRadius: 14,
              padding: '1.125rem 1.25rem',
              boxShadow: `0 0 40px rgba(${rgb},0.2), 0 0 80px rgba(${rgb},0.08)`,
              textAlign: 'center',
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.25em]" style={{ fontSize: '0.58rem', color: c, marginBottom: 6, opacity: 0.8 }}>
                ✦ Rank Up ✦
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', lineHeight: 1.1, marginBottom: 6, color: c, textShadow: `0 0 24px rgba(${rgb},0.6)` }}>
                {rankUp.rank}
              </p>
              <p className="font-cinzel font-700 text-[#f0c040]" style={{ fontSize: '1.05rem', textShadow: '0 0 16px rgba(240,192,64,0.4)' }}>
                +{rankUp.bonus.toLocaleString()} ⟡
              </p>
            </div>
          </div>
        )
      })()}
      {/* Mobile: 2×2 grid */}
      <div className="sm:hidden flex flex-col items-center w-full">
        <div className="grid grid-cols-2 gap-3 w-full px-3 mb-2">
          {cards.map((card, i) => renderCard(card, i))}
        </div>
        {renderMobileActions()}
      </div>

      {/* Desktop: flex-wrap all cards */}
      <div className="hidden sm:flex flex-wrap justify-center gap-x-4 gap-y-8">
        {cards.map((card, i) => renderCard(card, i))}
      </div>


      {/* Desktop: in flow */}
      {phase !== 'done' && flipped.some((f) => !f) ? (
        <div className="hidden sm:block"><button onClick={flipAll} className="btn-ghost">Reveal All</button></div>
      ) : phase === 'done' ? (
        <div className="hidden sm:flex flex-col items-center gap-4">
          <div className="flex gap-4 flex-wrap justify-center">
            {packs > 0 && (
              <button onClick={openPack} disabled={loading} className="btn-ghost">
                {loading ? 'Recruiting…' : `Recruit Again · ${packs} Left`}
              </button>
            )}
          </div>
          {!loading && packs === 0 && (
            <button onClick={reset} className="btn-ghost">Find More Crew</button>
          )}
        </div>
      ) : (
        /* invisible placeholder keeps layout height stable during the flip-settle delay */
        <div className="hidden sm:block" style={{ visibility: 'hidden' }}><button className="btn-ghost">Open All</button></div>
      )}
    </div>
  )
}
