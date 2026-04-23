'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { rarityFromVariant } from '@/lib/variants'
import FishCard from '@/components/FishCard'
import PrizeModal from '@/components/PrizeModal'
import { openPack as openPackAction, buyPacksWithDoubloons } from './actions'
import type { DrawnCard, BorderStyle, ArtEffect } from '@/lib/types'
import type { OpenPackResponse } from './actions'

function cardBackBorderStyle(borderStyle: BorderStyle, artEffect: ArtEffect): React.CSSProperties {
  if (artEffect === 'ghost')  return { borderColor: 'rgba(200,210,220,0.45)' }
  if (artEffect === 'shadow') return { borderColor: 'rgba(168,85,247,0.45)' }
  switch (borderStyle) {
    case 'pearl':       return { borderColor: 'rgba(232,213,175,0.45)' }
    case 'void':        return { borderColor: 'rgba(168,85,247,0.45)' }
    case 'kraken':      return { borderColor: 'rgba(0,204,153,0.45)' }
    case 'davy-jones':  return { borderColor: 'rgba(30,106,144,0.45)' }
    case 'golden-age':  return { borderColor: 'rgba(232,184,48,0.45)' }
    case 'storm':       return { borderColor: 'rgba(74,136,200,0.45)' }
    case 'wanted':      return { borderColor: 'rgba(170,64,16,0.45)' }
    case 'prismatic':   return {
      borderColor: 'transparent',
      backgroundImage: 'linear-gradient(#000 0 0), linear-gradient(90deg,#ff0080,#ff8c00,#ffe600,#00ff88,#00cfff,#8a5cf7)',
      backgroundOrigin: 'padding-box, border-box',
      backgroundClip: 'padding-box, border-box',
    }
    default:            return {}
  }
}

interface Props {
  packsAvailable: number
  doubloons: number
}

export default function PackOpener({ packsAvailable: initialPacks, doubloons: initialDoubloons }: Props) {
  const router = useRouter()
  const [packs, setPacks] = useState(initialPacks)
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [phase, setPhase] = useState<'idle' | 'reveal' | 'done'>('idle')
  const [cards, setCards] = useState<DrawnCard[]>([])
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [glowClasses, setGlowClasses] = useState<string[]>([])
  const [flash, setFlash] = useState<{ type: string; key: number } | null>(null)
  const [prize, setPrize] = useState<{ cardName: string; variantName: string; prizeCode: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [buyingWithDoubloons, setBuyingWithDoubloons] = useState(false)
  const [newVariantIds, setNewVariantIds] = useState<Set<number>>(new Set())
  const [isGodPack, setIsGodPack] = useState(false)
  const [shockwaveCards, setShockwaveCards] = useState<Set<number>>(new Set())
  const [mythicFeatured, setMythicFeatured] = useState<number | null>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const [swapped, setSwapped] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('packOpenSide') === 'left') setSwapped(true)
  }, [])

  function toggleSwap() {
    setSwapped(prev => {
      const next = !prev
      localStorage.setItem('packOpenSide', next ? 'left' : 'right')
      return next
    })
  }

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

  async function openPack() {
    if (packs <= 0 || loading) return
    setLoading(true)
    setFlipped(new Array(cards.length || 5).fill(false))
    setGlowClasses(new Array(cards.length || 5).fill(''))
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
    setCards(result.drawn)
    setFlipped(new Array(5).fill(false))
    setGlowClasses(new Array(5).fill(''))
    setFlash(result.isGodPack ? { type: 'godpack', key: Date.now() } : null)
    setPacks(result.packsRemaining ?? packs - 1)
    setPhase('reveal')
    setLoading(false)
    router.refresh()
  }

  const PRIZE_VARIANTS = new Set(['Davy Jones', 'Golden Age', 'Kraken', 'Wanted', 'Maelstrom'])

  function isPrizeCard(card: DrawnCard) {
    return (card.name === 'Catfish' || card.name === 'Doby Mick') && PRIZE_VARIANTS.has(card.variantName)
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

  function glowClassFor(rarity: string) {
    if (rarity === 'Mythic')    return 'reveal-glow-mythic'
    if (rarity === 'Legendary') return 'reveal-glow-legendary'
    if (rarity === 'Epic')      return 'reveal-glow-epic'
    return ''
  }

  function triggerFlash(rarity: string) {
    if (['Mythic', 'Legendary', 'Epic'].includes(rarity)) {
      setFlash({ type: rarity.toLowerCase(), key: Date.now() })
    }
  }

  function flipCard(i: number) {
    if (flipped[i]) return
    resetTilt(i)
    const rarity = rarityFromVariant(cards[i].variantName, cards[i].dropWeight)
    setGlowClasses((prev) => { const n = [...prev]; n[i] = glowClassFor(rarity); return n })
    triggerFlash(rarity)
    checkPrize(cards[i])
    if (rarity === 'Mythic') {
      setMythicFeatured(i)
      setShockwaveCards((prev) => new Set([...prev, i]))
      setTimeout(() => setMythicFeatured(null), 2500)
      setTimeout(() => setShockwaveCards((prev) => { const n = new Set(prev); n.delete(i); return n }), 1600)
    }
    setFlipped((prev) => {
      const n = [...prev]
      n[i] = true
      if (n.every(Boolean)) setTimeout(() => setPhase('done'), 700)
      return n
    })
  }

  function flipAll() {
    cards.forEach((_, i) => resetTilt(i))
    const rarities = cards.map((c) => rarityFromVariant(c.variantName, c.dropWeight))
    const priority = ['Mythic', 'Legendary', 'Epic']
    const top = priority.find((r) => rarities.includes(r))
    if (top) triggerFlash(top)
    setGlowClasses(rarities.map(glowClassFor))
    setFlipped(new Array(cards.length).fill(true))
    cards.forEach((card) => checkPrize(card))
    setTimeout(() => setPhase('done'), 700)
  }

  function reset() {
    setPhase('idle')
    setCards([])
    setFlipped([])
    setGlowClasses([])
    setFlash(null)
    setPrize(null)
    setIsGodPack(false)
    setNewVariantIds(new Set())
    setShockwaveCards(new Set())
    setMythicFeatured(null)
    router.refresh()
  }

  async function handleBuyWithDoubloons(count: 1 | 10) {
    if (buyingWithDoubloons) return
    setBuyingWithDoubloons(true)
    const result = await buyPacksWithDoubloons(count)
    if (!('error' in result)) {
      setPacks(result.packsAvailable)
      setDoubloons(result.doubloons)
    }
    setBuyingWithDoubloons(false)
  }

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          {/* Booster pack */}
          <div className="relative" style={{ marginTop: packs > 1 ? 12 : 0 }}>
            {packs > 2 && (
              <div className="absolute inset-0" style={{ borderRadius: 14, transform: 'translateY(10px) translateX(5px) rotate(2deg)', background: 'rgba(13,26,60,0.9)', border: '1px solid rgba(240,192,64,0.12)' }} />
            )}
            {packs > 1 && (
              <div className="absolute inset-0" style={{ borderRadius: 14, transform: 'translateY(5px) translateX(2.5px) rotate(1deg)', background: 'rgba(13,26,60,0.95)', border: '1px solid rgba(240,192,64,0.18)' }} />
            )}
            <button
              onClick={packs > 0 ? openPack : undefined}
              disabled={loading || packs === 0}
              className="relative block select-none"
              style={{
                width: 210, height: 315,
                borderRadius: 14,
                cursor: packs > 0 && !loading ? 'pointer' : 'default',
                overflow: 'hidden',
                background: 'linear-gradient(160deg, #0c1a35 0%, #091428 35%, #0b2252 65%, #0d1830 100%)',
                border: '1px solid rgba(240,192,64,0.32)',
                boxShadow: '0 16px 60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.08)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={e => {
                if (packs === 0 || loading) return
                e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'
                e.currentTarget.style.boxShadow = '0 24px 70px rgba(0,0,0,0.8), 0 0 30px rgba(240,192,64,0.12), inset 0 1px 0 rgba(255,255,255,0.08)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 16px 60px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.08)'
              }}
            >
              {/* Foil shimmer */}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, transparent 25%, rgba(240,192,64,0.04) 50%, transparent 75%)', pointerEvents: 'none' }} />

              {/* Tear strip */}
              <div style={{ height: 32, background: 'rgba(240,192,64,0.07)', borderBottom: '1px dashed rgba(240,192,64,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="rgba(240,192,64,0.4)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 8l-6 6-6-6"/></svg>
                <span style={{ fontFamily: 'var(--font-karla)', fontWeight: 600, fontSize: '0.45rem', color: 'rgba(240,192,64,0.4)', letterSpacing: '0.25em', textTransform: 'uppercase' }}>open here</span>
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="rgba(240,192,64,0.4)" strokeWidth="2.5" strokeLinecap="round"><path d="M18 8l-6 6-6-6"/></svg>
              </div>

              {/* Art area */}
              <div style={{ height: 162, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 60%, rgba(0,70,160,0.28) 0%, transparent 70%)' }}>
                {/* Wave */}
                <svg style={{ position: 'absolute', bottom: 0, left: 0, right: 0, opacity: 0.14 }} viewBox="0 0 210 55" preserveAspectRatio="none" width="210" height="55">
                  <path d="M0 35 Q52 15 105 35 Q158 55 210 35 L210 55 L0 55Z" fill="#f0c040"/>
                  <path d="M0 45 Q52 28 105 45 Q158 62 210 45 L210 55 L0 55Z" fill="rgba(30,100,220,0.6)"/>
                </svg>
                {/* Fish */}
                <svg width="80" height="80" viewBox="0 0 64 64" fill="none" style={{ opacity: 0.9, filter: 'drop-shadow(0 0 14px rgba(240,192,64,0.28))' }}>
                  <path d="M5 32C14 16 26 10 38 10C50 10 60 18 60 32C60 46 50 54 38 54C26 54 14 48 5 32Z" stroke="rgba(240,192,64,0.65)" strokeWidth="1.4" fill="rgba(240,192,64,0.04)"/>
                  <circle cx="51" cy="25" r="2.8" fill="rgba(240,192,64,0.7)"/>
                  <path d="M5 32C-1 26 -1 20 5 20" stroke="rgba(240,192,64,0.65)" strokeWidth="1.4" strokeLinecap="round"/>
                  <path d="M32 16 Q38 32 32 48" stroke="rgba(240,192,64,0.14)" strokeWidth="1.2" fill="none"/>
                  <path d="M22 19 Q28 32 22 45" stroke="rgba(240,192,64,0.1)" strokeWidth="1.2" fill="none"/>
                </svg>
                {/* Sparkles */}
                <div style={{ position: 'absolute', top: 18, right: 26, width: 4, height: 4, borderRadius: '50%', background: 'rgba(240,192,64,0.5)', boxShadow: '0 0 7px rgba(240,192,64,0.7)' }}/>
                <div style={{ position: 'absolute', top: 36, right: 40, width: 2.5, height: 2.5, borderRadius: '50%', background: 'rgba(240,192,64,0.3)' }}/>
                <div style={{ position: 'absolute', top: 28, left: 30, width: 3, height: 3, borderRadius: '50%', background: 'rgba(240,192,64,0.28)', boxShadow: '0 0 5px rgba(240,192,64,0.4)' }}/>
                <div style={{ position: 'absolute', top: 50, left: 44, width: 2, height: 2, borderRadius: '50%', background: 'rgba(240,192,64,0.2)' }}/>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(240,192,64,0.2), transparent)' }} />

              {/* Branding */}
              <div style={{ padding: '14px 18px 8px' }}>
                <p style={{ fontFamily: 'var(--font-cinzel)', fontWeight: 700, fontSize: '1.05rem', color: '#f0c040', letterSpacing: '0.02em', marginBottom: 3 }}>
                  Small Fishes
                </p>
                <p style={{ fontFamily: 'var(--font-karla)', fontWeight: 300, fontSize: '0.58rem', color: '#6a6764', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                  Collector's Edition
                </p>
                {loading && (
                  <p style={{ fontFamily: 'var(--font-karla)', fontSize: '0.75rem', color: '#f0c040', marginTop: 10 }}>Fishing…</p>
                )}
              </div>

              {/* Bottom strip */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 42, background: 'rgba(240,192,64,0.06)', borderTop: '1px solid rgba(240,192,64,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px' }}>
                <span style={{ fontFamily: 'var(--font-karla)', fontSize: '0.56rem', color: '#6a6764', textTransform: 'uppercase', letterSpacing: '0.14em' }}>5 cards</span>
                <span style={{ fontFamily: 'var(--font-karla)', fontWeight: 600, fontSize: '0.56rem', color: 'rgba(240,192,64,0.55)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>Booster Pack</span>
              </div>
            </button>
          </div>

          {packs > 0 ? (
            <p className="font-karla text-[#6a6764] text-xs uppercase tracking-[0.12em]">
              {packs} {packs === 1 ? 'pack' : 'packs'} available — click to open
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 mt-2">
              <p className="font-karla font-300 text-[#8a8880] text-sm">No packs available.</p>
              <a href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game" target="_blank" rel="noopener noreferrer" className="btn-gold">
                Get the Game
              </a>
              <a href="/redeem" className="text-[#f0c040] hover:text-[#ffd966] text-xs font-karla font-600 uppercase tracking-[0.12em] transition-colors">
                Redeem a Code
              </a>
            </div>
          )}
        </div>

        {/* Doubloon balance + buy buttons */}
        <div className="flex flex-col items-center gap-2">
          <p className="font-karla font-600 text-[#f0c040] text-sm tracking-wide">{doubloons.toLocaleString()} ⟡</p>
          <div className="flex gap-2">
            <button
              onClick={() => doubloons >= 200 && handleBuyWithDoubloons(1)}
              disabled={buyingWithDoubloons}
              className="btn-ghost text-xs transition-opacity"
              style={{ opacity: doubloons >= 200 ? 1 : 0.35, cursor: doubloons >= 200 ? 'pointer' : 'default' }}
            >
              {buyingWithDoubloons ? '…' : 'Buy 1 · 200 ⟡'}
            </button>
            <button
              onClick={() => doubloons >= 1500 && handleBuyWithDoubloons(10)}
              disabled={buyingWithDoubloons}
              className="btn-ghost text-xs transition-opacity"
              style={{ opacity: doubloons >= 1500 ? 1 : 0.35, cursor: doubloons >= 1500 ? 'pointer' : 'default' }}
            >
              Buy 10 · 1,500 ⟡
            </button>
          </div>
        </div>
      </div>
    )
  }

  const someUnflipped = flipped.some(f => !f)

  function renderFlipInner(card: DrawnCard, i: number) {
    return (
      <>
        <div className="flip-card-inner w-full h-full">
          <div className="flip-card-front w-full h-full border-[3px] border-[rgba(255,255,255,0.08)] flex flex-col items-center justify-center gap-3" style={{ background: 'rgba(8, 12, 40, 0.25)' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M18 4 C18 4 18 18 18 22 C18 27 13 29 10 26 C7 23 9 19 12 19"
                    stroke="#8a8880" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
              <path d="M12 19 L10 17" stroke="#f0c040" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
              <circle cx="18" cy="5" r="2.2" stroke="#8a8880" strokeWidth="1.6" fill="none"/>
            </svg>
            <p className="sg-eyebrow text-[0.6rem]" style={{ color: '#8a8880' }}>Open</p>
          </div>
          <div className="flip-card-back w-full h-full bg-black flex items-center justify-center p-3" style={cardBackBorderStyle(card.borderStyle, card.artEffect)}>
            <FishCard name={card.name} filename={card.filename} borderStyle={card.borderStyle} artEffect={card.artEffect} variantName={card.variantName} dropWeight={card.dropWeight} />
          </div>
        </div>
        {shockwaveCards.has(i) && (
          <>
            <div className="shockwave-ring" />
            <div className="shockwave-ring shockwave-ring-2" />
            <div className="shockwave-ring shockwave-ring-3" />
          </>
        )}
      </>
    )
  }

  function renderCard(card: DrawnCard, i: number) {
    return (
      <div key={i} className="flex flex-col items-center gap-2">
        <div
          ref={(el) => { cardRefs.current[i] = el }}
          className={`flip-card select-none ${flipped[i] ? 'flipped' : 'cursor-pointer'} ${glowClasses[i] ?? ''}`}
          style={{ width: 160, height: 248, opacity: mythicFeatured !== null && mythicFeatured !== i ? 0.2 : 1, transition: 'opacity 0.3s ease' }}
          onClick={() => flipCard(i)}
          onMouseMove={(e) => handleMouseMove(e, i)}
          onMouseLeave={(e) => handleMouseLeave(e, i)}
        >
          {renderFlipInner(card, i)}
        </div>
        {flipped[i] && newVariantIds.has(card.variantId) && <p className="new-badge">New</p>}
      </div>
    )
  }

  function renderOpenAllButton() {
    const isDone = phase === 'done'
    const show = someUnflipped || (isDone && packs > 0)
    return (
      <div className="flex-1 flex items-center justify-center" style={{ height: 248 }}>
        {show && (
          <button
            onClick={isDone ? openPack : flipAll}
            disabled={isDone && loading}
            className="w-[4.5rem] h-[4.5rem] rounded-full flex items-center justify-center select-none touch-manipulation"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)',
              backdropFilter: 'blur(12px)',
              transition: 'transform 0.1s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.1s ease, background 0.1s ease',
            }}
            onPointerDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.91)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.18)'
              e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)'
            }}
            onPointerUp={(e) => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)'
            }}
            onPointerLeave={(e) => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
              e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.18)'
            }}
          >
            <span className="font-karla font-900 uppercase text-[#f0ede8] text-center leading-snug" style={{ fontSize: '0.68rem', letterSpacing: '0.10em' }}>
              {isDone ? <>Open<br/>Another</> : <>Open<br/>All</>}
            </span>
          </button>
        )}
      </div>
    )
  }

  function renderPackCount() {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-1" style={{ height: 248 }}>
        <span className="font-cinzel font-700 text-[#f0ede8] leading-none" style={{ fontSize: '1.6rem' }}>{packs}</span>
        <span className="font-karla font-600 uppercase text-[#8a8880] text-center leading-tight" style={{ fontSize: '0.6rem', letterSpacing: '0.10em' }}>packs<br/>left</span>
        <button
          onClick={toggleSwap}
          className="mt-3 touch-manipulation rounded-full flex items-center justify-center"
          style={{ width: 32, height: 32, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#f0ede8', transition: 'background 0.07s ease, transform 0.07s ease' }}
          onPointerDown={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'scale(0.90)' }}
          onPointerUp={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = '' }}
          onPointerLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = '' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 16H17M17 16L14 13M17 16L14 19"/>
            <path d="M17 8H7M7 8L10 5M7 8L10 11"/>
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-10 pb-20 sm:pb-0">
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
      {/* Mobile: 2×2 grid + flanked 5th card */}
      <div className="sm:hidden flex flex-col items-center gap-2 w-full">
        <div className="grid grid-cols-2 gap-2">
          {cards.slice(0, 4).map((card, i) => renderCard(card, i))}
        </div>
        {cards[4] && (
          <div className="flex items-center gap-2 w-full">
            {swapped ? renderOpenAllButton() : renderPackCount()}
            {renderCard(cards[4], 4)}
            {swapped ? renderPackCount() : renderOpenAllButton()}
          </div>
        )}
      </div>

      {/* Desktop: flex-wrap all cards */}
      <div className="hidden sm:flex flex-wrap justify-center gap-x-4 gap-y-8">
        {cards.map((card, i) => renderCard(card, i))}
      </div>

      {/* Desktop: in flow */}
      {phase !== 'done' && flipped.some((f) => !f) ? (
        <button onClick={flipAll} className="hidden sm:block btn-gold">Open All</button>
      ) : phase === 'done' ? (
        <div className="hidden sm:flex flex-col items-center gap-4">
          <div className="flex gap-4 flex-wrap justify-center">
            {packs > 0 && (
              <button onClick={openPack} disabled={loading} className="btn-gold">
                {loading ? 'Fishing…' : `Open Another · ${packs} Left`}
              </button>
            )}
            {!loading && (
              <button onClick={() => router.push('/collection')} className="btn-ghost">
                View Collection
              </button>
            )}
          </div>
          {!loading && packs === 0 && (
            <a
              href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game"
              target="_blank" rel="noopener noreferrer"
              className="font-karla font-600 text-xs uppercase tracking-[0.12em] text-[#f0c040] hover:text-[#ffd966] transition-colors"
            >
              Out of packs — get the game →
            </a>
          )}
        </div>
      ) : null}
    </div>
  )
}
