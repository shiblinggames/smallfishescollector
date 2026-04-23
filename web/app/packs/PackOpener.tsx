'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { rarityFromVariant } from '@/lib/variants'
import FishCard from '@/components/FishCard'
import PrizeModal from '@/components/PrizeModal'
import { openPack as openPackAction } from './actions'
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
}

export default function PackOpener({ packsAvailable: initialPacks }: Props) {
  const router = useRouter()
  const [packs, setPacks] = useState(initialPacks)
  const [phase, setPhase] = useState<'idle' | 'reveal' | 'done'>('idle')
  const [cards, setCards] = useState<DrawnCard[]>([])
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [glowClasses, setGlowClasses] = useState<string[]>([])
  const [flash, setFlash] = useState<{ type: string; key: number } | null>(null)
  const [prize, setPrize] = useState<{ cardName: string; variantName: string; prizeCode: string } | null>(null)
  const [loading, setLoading] = useState(false)
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

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center gap-8">
        <div className="sg-card px-16 py-12 text-center">
          <p className="sg-eyebrow mb-3">Available</p>
          <p className="font-cinzel font-900 text-[#f0ede8] leading-none mb-1"
             style={{ fontSize: 'clamp(3.5rem, 10vw, 6rem)' }}>
            {packs}
          </p>
          <p className="font-karla font-300 text-[#8a8880] text-sm mb-10 tracking-wide">
            {packs === 1 ? 'pack' : 'packs'}
          </p>
          {packs > 0 ? (
            <button onClick={openPack} disabled={loading} className="btn-gold">
              {loading ? 'Fishing…' : 'Open Pack'}
            </button>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <p className="font-karla font-300 text-[#8a8880] text-sm">No packs available.</p>
              <a
                href="https://shiblingshop.com/products/small-fishes-seas-the-booty-strategy-card-game"
                target="_blank" rel="noopener noreferrer"
                className="btn-gold"
              >
                Get the Game
              </a>
              <a href="/redeem" className="text-[#f0c040] hover:text-[#ffd966] text-xs font-karla font-600 uppercase tracking-[0.12em] transition-colors">
                Redeem a Code
              </a>
            </div>
          )}
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
              background: 'linear-gradient(to bottom, #ffd84d, #e8aa00)',
              boxShadow: '0 5px 0 #9a6e00, 0 8px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)',
              transition: 'transform 0.07s ease, box-shadow 0.07s ease',
            }}
            onPointerDown={(e) => {
              e.currentTarget.style.transform = 'translateY(4px)'
              e.currentTarget.style.boxShadow = '0 1px 0 #9a6e00, 0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)'
            }}
            onPointerUp={(e) => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = '0 5px 0 #9a6e00, 0 8px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)'
            }}
            onPointerLeave={(e) => {
              e.currentTarget.style.transform = ''
              e.currentTarget.style.boxShadow = '0 5px 0 #9a6e00, 0 8px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)'
            }}
          >
            <span className="font-karla font-700 uppercase text-black text-center leading-snug" style={{ fontSize: '0.62rem', letterSpacing: '0.10em', textShadow: '0 1px 0 rgba(255,255,255,0.3)' }}>
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
