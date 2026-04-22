'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { rarityFromWeight } from '@/lib/variants'
import FishCard from '@/components/FishCard'
import PrizeModal from '@/components/PrizeModal'
import { openPack as openPackAction } from './actions'
import type { DrawnCard, BorderStyle, ArtEffect } from '@/lib/types'
import type { OpenPackResponse } from './actions'

function cardBackBorderStyle(borderStyle: BorderStyle, artEffect: ArtEffect): React.CSSProperties {
  if (artEffect === 'ghost')  return { borderColor: 'rgba(200,210,220,0.45)' }
  if (artEffect === 'shadow') return { borderColor: 'rgba(168,85,247,0.45)' }
  switch (borderStyle) {
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
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

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

    const result: OpenPackResponse = await openPackAction()

    if (result.error || !result.drawn) {
      setLoading(false)
      if (result.error === 'Unauthorized') router.push('/login')
      return
    }

    setNewVariantIds(new Set(result.newVariantIds ?? []))
    setCards(result.drawn)
    setFlipped(new Array(5).fill(false))
    setGlowClasses(new Array(5).fill(''))
    setFlash(null)
    setPacks(result.packsRemaining ?? packs - 1)
    setPhase('reveal')
    setLoading(false)
    router.refresh()
  }

  const PRIZE_VARIANTS = new Set(['Davy Jones', 'Golden Age', 'Kraken Edition', 'Wanted', 'Storm'])

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
    if (!error) setPrize({ cardName: card.name, variantName: card.variantName, prizeCode: code })
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
    const rarity = rarityFromWeight(cards[i].dropWeight)
    setGlowClasses((prev) => { const n = [...prev]; n[i] = glowClassFor(rarity); return n })
    triggerFlash(rarity)
    checkPrize(cards[i])
    setFlipped((prev) => {
      const n = [...prev]
      n[i] = true
      if (n.every(Boolean)) setTimeout(() => setPhase('done'), 700)
      return n
    })
  }

  function flipAll() {
    cards.forEach((_, i) => resetTilt(i))
    const rarities = cards.map((c) => rarityFromWeight(c.dropWeight))
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
    setNewVariantIds(new Set())
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
              {loading ? 'Drawing…' : 'Open Pack'}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="font-karla font-300 text-[#8a8880] text-sm">No packs available.</p>
              <a href="/redeem" className="text-[#f0c040] hover:text-[#ffd966] text-xs font-karla font-600 uppercase tracking-[0.12em] transition-colors">
                Redeem a Code
              </a>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-10">
      {flash && <div key={flash.key} className={`reveal-flash reveal-flash-${flash.type}`} />}
      {prize && (
        <PrizeModal
          cardName={prize.cardName}
          variantName={prize.variantName}
          prizeCode={prize.prizeCode}
          onClose={() => setPrize(null)}
        />
      )}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-8">
        {cards.map((card, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div
              ref={(el) => { cardRefs.current[i] = el }}
              className={`flip-card select-none ${flipped[i] ? 'flipped' : 'cursor-pointer'} ${glowClasses[i] ?? ''}`}
              style={{ width: 160, height: 248 }}
              onClick={() => flipCard(i)}
              onMouseMove={(e) => handleMouseMove(e, i)}
              onMouseLeave={(e) => handleMouseLeave(e, i)}
            >
            <div className="flip-card-inner w-full h-full">
              <div className="flip-card-front w-full h-full bg-black border border-[rgba(255,255,255,0.08)] flex flex-col items-center justify-center gap-3">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M4 16C4 16 8 6 16 6C24 6 28 16 28 16C28 16 24 26 16 26C8 26 4 16 4 16Z" stroke="#8a8880" strokeWidth="1.6" fill="none"/>
                  <circle cx="16" cy="16" r="4" stroke="#f0c040" strokeWidth="1.6" fill="none"/>
                </svg>
                <p className="sg-eyebrow text-[0.6rem]">Reveal</p>
              </div>
              <div className="flip-card-back w-full h-full bg-black flex items-center justify-center p-3" style={cardBackBorderStyle(card.borderStyle, card.artEffect)}>
                <FishCard
                  name={card.name}
                  filename={card.filename}
                  borderStyle={card.borderStyle}
                  artEffect={card.artEffect}
                  variantName={card.variantName}
                  dropWeight={card.dropWeight}
                />
              </div>
            </div>
            </div>
            {flipped[i] && newVariantIds.has(card.variantId) && (
              <p className="new-badge">New</p>
            )}
          </div>
        ))}
      </div>

      {phase !== 'done' && flipped.some((f) => !f) ? (
        <button onClick={flipAll} className="btn-gold">
          Reveal All
        </button>
      ) : phase === 'done' ? (
        <div className="flex gap-4 flex-wrap justify-center">
          {packs > 0 && (
            <button onClick={() => setPhase('idle')} className="btn-gold">
              Open Another · {packs} Left
            </button>
          )}
          <button onClick={reset} className="btn-ghost">
            View Collection
          </button>
        </div>
      ) : null}
    </div>
  )
}
