'use client'

import { useState, useTransition } from 'react'
import FishCard from '@/components/FishCard'
import type { BorderStyle, ArtEffect } from '@/lib/types'
import type { Achievement } from '@/lib/achievements'
import { addCrewMember, removeCrewMember } from '@/app/social/actions'

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
  achievements?: Achievement[]
  isOwnProfile?: boolean
  isInCrew?: boolean
}

export default function ProfileClient({ username, showcaseVariants, stats, isPremium, achievements = [], isOwnProfile, isInCrew: initialIsInCrew }: Props) {
  const variants = showcaseVariants as CardVariant[]
  const [statsOpen, setStatsOpen] = useState(false)
  const [inCrew, setInCrew] = useState(initialIsInCrew ?? false)
  const [crewPending, startCrewTransition] = useTransition()

  function toggleCrew() {
    startCrewTransition(async () => {
      if (inCrew) {
        await removeCrewMember(username)
        setInCrew(false)
      } else {
        await addCrewMember(username)
        setInCrew(true)
      }
    })
  }

  return (
    <div className="flex flex-col items-center gap-8 px-6 max-w-sm mx-auto">

      {/* Username + member badge */}
      <div className="flex flex-col items-center gap-2">
        <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem' }}>{username}</p>
        <div className="flex items-center gap-2">
          {isPremium && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.3)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#f0c040" stroke="none">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#f0c040' }}>Member</span>
            </div>
          )}
          {!isOwnProfile && (
            <button
              onClick={toggleCrew}
              disabled={crewPending}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-karla font-600 uppercase tracking-[0.12em] transition-all disabled:opacity-40"
              style={{
                fontSize: '0.6rem',
                background: inCrew ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${inCrew ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.12)'}`,
                color: inCrew ? '#4ade80' : '#8a8880',
              }}
            >
              {crewPending ? '…' : inCrew ? '✓ In Your Crew' : '+ Add to Crew'}
            </button>
          )}
        </div>
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

      {/* Achievements */}
      {achievements.length > 0 && (
        <div className="w-full">
          <div className="flex items-center justify-between mb-4">
            <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764]" style={{ fontSize: '0.6rem' }}>
              Achievements · {achievements.length}
            </p>
            <a href="/achievements" className="font-karla font-600 text-[#6a6764] hover:text-[#f0c040] transition-colors" style={{ fontSize: '0.6rem' }}>
              View all →
            </a>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {achievements.map(a => (
              <div
                key={a.key}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '10px',
                  padding: '0.625rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                }}
              >
                <div style={{
                  width: 28, height: 28, flexShrink: 0,
                  background: 'rgba(240,192,64,0.08)',
                  border: '1px solid rgba(240,192,64,0.18)',
                  borderRadius: '7px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#f0c040',
                }}>
                  <AchievementIcon icon={a.icon} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <p className="font-karla font-700 text-[#f0ede8]" style={{ fontSize: '0.7rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</p>
                  <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.6rem', lineHeight: 1.4 }}>{a.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

function AchievementIcon({ icon }: { icon: string }) {
  const s = 13
  if (icon === 'pack') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="17"/><line x1="9.5" y1="14.5" x2="14.5" y2="14.5"/></svg>
  if (icon === 'fish') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 12c.94-3.46 4.94-6 10.5-6-3 3.46-3 8.54 0 12-5.56 0-9.56-2.54-10.5-6z"/><path d="M18 6L2 12l16 6"/></svg>
  if (icon === 'star') return <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
  if (icon === 'anchor') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="22"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>
  if (icon === 'coin') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v2m0 8v2m-3-7h6"/></svg>
  if (icon === 'crown') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 19l3-10 4.5 4.5L12 4l2.5 9.5L19 9l3 10H2z"/></svg>
  if (icon === 'scroll') return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4V4h16v5h-2"/><path d="M6 4v5a6 6 0 0 0 12 0V4"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/></svg>
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <p className="font-karla font-300 text-[0.7rem] uppercase tracking-[0.10em] text-[#6a6764]">{label}</p>
      <p className="font-karla font-600 text-[0.78rem] text-[#f0ede8]">{value}</p>
    </div>
  )
}
