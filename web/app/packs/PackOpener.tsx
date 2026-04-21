'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { drawPack } from '@/lib/drawPack'
import FishCard from '@/components/FishCard'
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
  const [loading, setLoading] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

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
    setCurrentIndex(0)
    setPacks((p) => p - 1)
    setPhase('reveal')
    setLoading(false)
  }

  function flipNext() {
    if (currentIndex >= cards.length) return
    setFlipped((prev) => { const n = [...prev]; n[currentIndex] = true; return n })
    setCurrentIndex((i) => i + 1)
    if (currentIndex === cards.length - 1) setTimeout(() => setPhase('done'), 700)
  }

  function reset() {
    setPhase('idle')
    setCards([])
    setFlipped([])
    setCurrentIndex(0)
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
      <div className="flex flex-wrap justify-center gap-5">
        {cards.map((card, i) => (
          <div
            key={i}
            className={`flip-card ${flipped[i] ? 'flipped' : ''} ${i === currentIndex && !flipped[i] ? 'cursor-pointer' : 'cursor-default'}`}
            style={{ width: 160, height: 200 }}
            onClick={() => { if (i === currentIndex && !flipped[i]) flipNext() }}
          >
            <div className="flip-card-inner w-full h-full">
              <div className="flip-card-front w-full h-full bg-black border border-[rgba(255,255,255,0.08)] flex flex-col items-center justify-center gap-3">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M4 16C4 16 8 6 16 6C24 6 28 16 28 16C28 16 24 26 16 26C8 26 4 16 4 16Z" stroke="#8a8880" strokeWidth="1.6" fill="none"/>
                  <circle cx="16" cy="16" r="4" stroke="#f0c040" strokeWidth="1.6" fill="none"/>
                </svg>
                {i === currentIndex && (
                  <p className="sg-eyebrow text-[0.6rem]">Reveal</p>
                )}
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

      {currentIndex < cards.length ? (
        <button onClick={flipNext} className="btn-gold">
          Reveal · {currentIndex + 1} of {cards.length}
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
