'use client'

import { useState } from 'react'
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

interface Stats {
  packsOpened: number
  completionPct: number
  fishDiscovered: number
  uniqueVariants: number
  fotdStreak: number
  rarestPull: { variantName: string; cardName: string; dropWeight: number } | null
}

interface Props {
  username: string
  showcaseVariants: unknown[]
  stats: Stats
  isPremium?: boolean
}

export default function ProfileClient({ username, showcaseVariants, stats, isPremium }: Props) {
  const variants = showcaseVariants as CardVariant[]
  const [statsOpen, setStatsOpen] = useState(false)

  return (
    <div className="flex flex-col items-center gap-8 px-6 max-w-sm mx-auto">

      {/* Username + member badge */}
      <div className="flex flex-col items-center gap-2">
        <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem' }}>{username}</p>
        {isPremium && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.3)' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#f0c040' }}>Member</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="w-full" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: statsOpen ? '12px 12px 0 0' : 12 }}>
        {/* Primary stats row */}
        <button
          className="w-full flex items-center justify-between px-5 py-4"
          onClick={() => setStatsOpen(v => !v)}
        >
          <div className="flex gap-6">
            <div className="text-left">
              <p className="font-cinzel font-700 text-[#f0ede8] text-lg leading-none mb-0.5">{stats.packsOpened}</p>
              <p className="font-karla font-300 text-[0.62rem] uppercase tracking-[0.12em] text-[#8a8880]">Packs Opened</p>
            </div>
            <div className="w-px bg-[rgba(255,255,255,0.08)]" />
            <div className="text-left">
              <p className="font-cinzel font-700 text-[#f0ede8] text-lg leading-none mb-0.5">{stats.completionPct}%</p>
              <p className="font-karla font-300 text-[0.62rem] uppercase tracking-[0.12em] text-[#8a8880]">Completion</p>
            </div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transition: 'transform 0.2s ease', transform: statsOpen ? 'rotate(180deg)' : '' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>

        {/* Extended stats dropdown */}
        {statsOpen && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '1rem 1.25rem 1.25rem', borderRadius: '0 0 12px 12px' }}>
            <div className="flex flex-col gap-3">
              <StatRow label="Fish Discovered" value={String(stats.fishDiscovered)} />
              <StatRow label="Unique Variants" value={String(stats.uniqueVariants)} />
              {stats.fotdStreak > 0 && (
                <StatRow label="Fish of the Day Streak" value={`${stats.fotdStreak} days`} />
              )}
              {stats.rarestPull && (
                <StatRow label="Rarest Pull" value={`${stats.rarestPull.cardName} · ${stats.rarestPull.variantName}`} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Showcase cards — 1-2-2 pyramid */}
      {variants.length > 0 ? (
        <div className="w-full">
          <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764] mb-4 text-center" style={{ fontSize: '0.6rem' }}>Top Catches</p>
          <div className="flex flex-col items-center gap-6">
            <FishCard
              name={variants[0].cards.name}
              filename={variants[0].cards.filename}
              borderStyle={variants[0].border_style}
              artEffect={variants[0].art_effect}
              variantName={variants[0].variant_name}
              dropWeight={variants[0].drop_weight}
            />
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

    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="font-karla font-300 text-[0.7rem] uppercase tracking-[0.10em] text-[#6a6764]">{label}</p>
      <p className="font-karla font-600 text-[0.78rem] text-[#f0ede8]">{value}</p>
    </div>
  )
}
