'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { drawPack } from '@/lib/drawPack'
import { rarityFromWeight } from '@/lib/variants'
import FishCard from '@/components/FishCard'
import PrizeModal from '@/components/PrizeModal'
import type { CardVariant, DrawnCard } from '@/lib/types'

interface Props {
  packsAvailable: number
  variants: CardVariant[]
}

export default function PackOpener({ packsAvailable: initialPacks, variants }: Props) {
  const router = useRouter()
  const [packs, setPacks] = useState(initialPacks)
  const [phase, setPhase] = useState<'idle' | 'reveal' | 'done'>('idle')
  const [cards, setCards] = useState<DrawnCard[]>([])
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [glowClasses, setGlowClasses] = useState<string[]>([])
  const [flash, setFlash] = useState<{ type: string; key: number } | null>(null)
  const [prize, setPrize] = useState<{ cardName: string; variantName: string; prizeCode: string } | null>(null)
  const [loading, setLoading] = useState(false)

  async function openPack() {
    if (packs <= 0 || loading) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const drawn = drawPack(variants)
    await supabase.from('user_collection').insert(
      drawn.map((d) => ({ user_id: user.id, card_variant_id: d.variantId }))
    )
    await supabase.from('profiles').update({ packs_available: packs - 1 }).eq('id', user.id)

    setCards(drawn)
    setFlipped(new Array(5).fill(false))
    setGlowClasses(new Array(5).fill(''))
    setFlash(null)
    setPacks((p) => p - 1)
    setPhase('reveal')
    setLoading(false)
    router.refresh()
  }

  function isPrizeCard(card: DrawnCard) {
    return card.dropWeight < 1 && (card.name === 'Catfish' || card.name === 'Doby Mick')
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
          <div
            key={i}
            className={`flip-card select-none ${flipped[i] ? 'flipped' : 'cursor-pointer'} ${glowClasses[i] ?? ''}`}
            style={{ width: 160, height: 248 }}
            onClick={() => flipCard(i)}
          >
            <div className="flip-card-inner w-full h-full">
              <div className="flip-card-front w-full h-full bg-black border border-[rgba(255,255,255,0.08)] flex flex-col items-center justify-center gap-3">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M4 16C4 16 8 6 16 6C24 6 28 16 28 16C28 16 24 26 16 26C8 26 4 16 4 16Z" stroke="#8a8880" strokeWidth="1.6" fill="none"/>
                  <circle cx="16" cy="16" r="4" stroke="#f0c040" strokeWidth="1.6" fill="none"/>
                </svg>
                <p className="sg-eyebrow text-[0.6rem]">Reveal</p>
              </div>
              <div className="flip-card-back w-full h-full bg-black flex items-center justify-center p-3">
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
