'use client'

import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'

interface CardVariant {
  id: number
  variant_name: string
  border_style: BorderStyle
  art_effect: ArtEffect
  drop_weight: number
  cards: { name: string; filename: string }
}

interface Props {
  username: string
  showcaseVariants: unknown[]
  stats: { packsOpened: number; completionPct: number }
}

export default function ProfileClient({ username, showcaseVariants, stats }: Props) {
  const variants = showcaseVariants as CardVariant[]

  return (
    <div className="flex flex-col items-center gap-8 px-6 max-w-sm mx-auto">

      {/* Username */}
      <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem' }}>{username}</p>

      {/* Showcase cards — 1-2-2 pyramid */}
      {variants.length > 0 ? (
        <div className="w-full">
          <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-4 text-center" style={{ fontSize: '0.6rem' }}>Top Catches</p>
          <div className="flex flex-col items-center gap-6">
            {/* Row 1: first card */}
            <FishCard
              name={variants[0].cards.name}
              filename={variants[0].cards.filename}
              borderStyle={variants[0].border_style}
              artEffect={variants[0].art_effect}
              variantName={variants[0].variant_name}
              dropWeight={variants[0].drop_weight}
            />
            {/* Row 2: cards 2-3 */}
            {variants.length > 1 && (
              <div className="flex gap-6 justify-center">
                {variants.slice(1, 3).map(cv => (
                  <FishCard
                    key={cv.id}
                    name={cv.cards.name}
                    filename={cv.cards.filename}
                    borderStyle={cv.border_style}
                    artEffect={cv.art_effect}
                    variantName={cv.variant_name}
                    dropWeight={cv.drop_weight}
                  />
                ))}
              </div>
            )}
            {/* Row 3: cards 4-5 */}
            {variants.length > 3 && (
              <div className="flex gap-6 justify-center">
                {variants.slice(3, 5).map(cv => (
                  <FishCard
                    key={cv.id}
                    name={cv.cards.name}
                    filename={cv.cards.filename}
                    borderStyle={cv.border_style}
                    artEffect={cv.art_effect}
                    variantName={cv.variant_name}
                    dropWeight={cv.drop_weight}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8">
          <p className="font-karla font-300 text-[#4a4845] text-sm">No catches yet</p>
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-6">
        <div className="text-center">
          <p className="font-cinzel font-700 text-[#f0ede8] text-lg leading-none mb-1">{stats.packsOpened}</p>
          <p className="font-karla font-300 text-[0.62rem] uppercase tracking-[0.12em] text-[#8a8880]">Packs Opened</p>
        </div>
        <div className="w-px bg-[rgba(255,255,255,0.08)]" />
        <div className="text-center">
          <p className="font-cinzel font-700 text-[#f0ede8] text-lg leading-none mb-1">{stats.completionPct}%</p>
          <p className="font-karla font-300 text-[0.62rem] uppercase tracking-[0.12em] text-[#8a8880]">Completion</p>
        </div>
      </div>

    </div>
  )
}
