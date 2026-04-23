'use client'

import { useState } from 'react'
import FishCard from '@/components/FishCard'
import { drawPack } from '@/lib/drawPack'
import type { CardVariant, DrawnCard, BorderStyle, ArtEffect } from '@/lib/types'

const MYTHIC_BORDERS: BorderStyle[] = ['kraken', 'davy-jones', 'golden-age', 'storm', 'wanted']
const PACK_NAMES = ['Mythic Showcase', 'Random Pack']

interface Props {
  variants: CardVariant[]
}

function variantToCard(v: CardVariant): DrawnCard {
  const card = v.cards!
  return {
    variantId:   v.id,
    cardId:      card.id,
    name:        card.name,
    slug:        card.slug,
    filename:    card.filename,
    tier:        card.tier as 1 | 2 | 3,
    variantName: v.variant_name,
    borderStyle: v.border_style as BorderStyle,
    artEffect:   v.art_effect as ArtEffect,
    dropWeight:  v.drop_weight,
  }
}

export default function DemoPackOpener({ variants }: Props) {
  const [packIndex, setPackIndex] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'reveal' | 'done'>('idle')
  const [cards, setCards] = useState<DrawnCard[]>([])
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  function drawForPack(index: number): DrawnCard[] {
    if (PACK_NAMES[index] === 'Mythic Showcase') {
      const mythic = MYTHIC_BORDERS.flatMap((bs) => {
        const matches = variants.filter((v) => v.border_style === bs)
        if (matches.length === 0) return []
        return [variantToCard(matches[Math.floor(Math.random() * matches.length)])]
      })
      if (mythic.length > 0) return mythic
    }
    return variants.length > 0 ? drawPack(variants) : []
  }

  function openPack() {
    const drawn = drawForPack(packIndex)
    setCards(drawn)
    setFlipped(new Array(drawn.length).fill(false))
    setCurrentIndex(0)
    setPhase('reveal')
  }

  function flipNext() {
    const i = currentIndex
    if (i >= cards.length) return
    setFlipped((prev) => { const n = [...prev]; n[i] = true; return n })
    const next = i + 1
    setCurrentIndex(next)
    if (next >= cards.length) setTimeout(() => setPhase('done'), 700)
  }

  function reset() {
    setPhase('idle')
    setCards([])
    setFlipped([])
    setCurrentIndex(0)
  }

  if (variants.length === 0) {
    return (
      <p className="text-center font-karla font-300 text-[#8a8880] text-sm">
        No cards in database yet.
      </p>
    )
  }

  if (phase === 'idle') {
    return (
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-wrap justify-center gap-2">
          {PACK_NAMES.map((name, i) => (
            <button
              key={i}
              onClick={() => setPackIndex(i)}
              className="font-karla font-600 text-[0.65rem] uppercase tracking-[0.12em] px-3 py-1.5 transition-colors"
              style={{
                color: packIndex === i ? '#f0c040' : '#8a8880',
                borderBottom: packIndex === i ? '1px solid #f0c040' : '1px solid transparent',
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="sg-card px-14 py-10 text-center">
          <p className="sg-eyebrow mb-3">Selected Pack</p>
          <p className="font-cinzel font-700 text-[#f0ede8] text-xl mb-8">
            {PACK_NAMES[packIndex]}
          </p>
          <button onClick={openPack} className="btn-gold">Open Pack</button>
        </div>
        <p className="font-karla font-300 text-[#8a8880] text-xs tracking-wide">
          CSS effects only · No account needed
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-10">
      <div className="flex flex-wrap justify-center gap-5">
        {cards.map((card, i) => (
          <div
            key={i}
            className={`flip-card select-none ${flipped[i] ? 'flipped' : ''} ${i === currentIndex && !flipped[i] ? 'cursor-pointer' : 'cursor-default'}`}
            style={{ width: 160, height: 248 }}
            onClick={() => { if (i === currentIndex && !flipped[i]) flipNext() }}
          >
            <div className="flip-card-inner w-full h-full">
              <div className="flip-card-front w-full h-full bg-black border border-[rgba(255,255,255,0.08)] flex flex-col items-center justify-center gap-3">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <path d="M4 16C4 16 8 6 16 6C24 6 28 16 28 16C28 16 24 26 16 26C8 26 4 16 4 16Z" stroke="#8a8880" strokeWidth="1.6" fill="none"/>
                  <circle cx="16" cy="16" r="4" stroke="#f0c040" strokeWidth="1.6" fill="none"/>
                </svg>
                {i === currentIndex && <p className="sg-eyebrow text-[0.6rem]">Reveal</p>}
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
        <div className="flex flex-col items-center gap-4">
          <p className="font-karla font-300 text-[#8a8880] text-sm">
            {cards.map((c) => c.variantName).join(' · ')}
          </p>
          <button onClick={reset} className="btn-ghost">Open Another</button>
        </div>
      ) : null}
    </div>
  )
}
