'use client'

import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import { rarityFromVariant, RARITY_COLOR } from '@/lib/variants'

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

      {/* Showcase cards — horizontal scroll */}
      {variants.length > 0 ? (
        <div className="w-full">
          <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-3 text-center" style={{ fontSize: '0.6rem' }}>Top Catches</p>
          <div
            className="flex gap-3 overflow-x-auto scrollbar-hide pb-1"
            style={{ justifyContent: variants.length < 3 ? 'center' : 'flex-start' }}
          >
            {variants.map((cv) => {
              const rarity = rarityFromVariant(cv.variant_name, cv.drop_weight)
              const rc = RARITY_COLOR[rarity] ?? '#8a8880'
              return (
                <div key={cv.id} className="flex flex-col items-center gap-2 shrink-0">
                  <div style={{ width: 100, height: 155 }}>
                    <FishCard
                      name={cv.cards.name}
                      filename={cv.cards.filename}
                      borderStyle={cv.border_style}
                      artEffect={cv.art_effect}
                      variantName={cv.variant_name}
                      dropWeight={cv.drop_weight}
                    />
                  </div>
                  <div className="text-center">
                    <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.65rem' }}>{cv.cards.name}</p>
                    <p className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.58rem', color: rc }}>{rarity}</p>
                  </div>
                </div>
              )
            })}
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
