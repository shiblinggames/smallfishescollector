'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getLevelFromXP } from '@/lib/fishingLevel'

export interface LeaderboardEntry {
  user_id: string
  username: string
  score: number
}

interface MyScores {
  fishing: number
  packs: number
  collection: number
  streak: number
  achievements: number
}

interface Props {
  fishing: LeaderboardEntry[]
  packs: LeaderboardEntry[]
  collection: LeaderboardEntry[]
  streak: LeaderboardEntry[]
  achievements: LeaderboardEntry[]
  myScores: MyScores
  currentUserId: string
}

const TABS = [
  { key: 'fishing',      label: 'Fishing',      unit: (n: number) => `Lv ${getLevelFromXP(n)} · ${n.toLocaleString()} XP` },
  { key: 'collection',   label: 'Collection',   unit: (n: number) => `${n.toLocaleString()} cards` },
  { key: 'achievements', label: 'Achievements', unit: (n: number) => `${n} / 25` },
  { key: 'packs',        label: 'Packs',        unit: (n: number) => `${n.toLocaleString()} packs` },
  { key: 'streak',       label: 'Streak',       unit: (n: number) => `${n} days` },
] as const

type TabKey = typeof TABS[number]['key']

const RANK_COLORS: Record<number, { color: string; label: string }> = {
  1: { color: '#f0c040', label: '1st' },
  2: { color: '#9ca3af', label: '2nd' },
  3: { color: '#cd7f32', label: '3rd' },
}

export default function LeaderboardClient({ fishing, packs, collection, streak, achievements, myScores, currentUserId }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('fishing')

  const dataMap: Record<TabKey, LeaderboardEntry[]> = { fishing, packs, collection, streak, achievements }
  const myScoreMap: Record<TabKey, number> = {
    fishing: myScores.fishing,
    packs: myScores.packs,
    collection: myScores.collection,
    streak: myScores.streak,
    achievements: myScores.achievements,
  }

  const data = dataMap[activeTab]
  const tab = TABS.find(t => t.key === activeTab)!
  const myRank = data.findIndex(e => e.user_id === currentUserId) + 1
  const inTop50 = myRank > 0
  const myScore = myScoreMap[activeTab]

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.11)' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className="flex-1 py-2 rounded-lg font-karla font-600 uppercase tracking-[0.10em] transition-all"
            style={{
              fontSize: '0.6rem',
              background: activeTab === t.key ? 'rgba(240,192,64,0.12)' : 'transparent',
              border: `1px solid ${activeTab === t.key ? 'rgba(240,192,64,0.3)' : 'transparent'}`,
              color: activeTab === t.key ? '#f0c040' : '#6a6764',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1.5">
        {data.map((entry, i) => {
          const rank = i + 1
          const isMe = entry.user_id === currentUserId
          const rankStyle = RANK_COLORS[rank]

          return (
            <Link
              key={entry.user_id}
              href={`/u/${entry.username}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.875rem',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                background: isMe ? 'rgba(240,192,64,0.07)' : rank <= 3 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${isMe ? 'rgba(240,192,64,0.22)' : rank <= 3 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
                textDecoration: 'none',
              }}
            >
              {/* Rank */}
              <div style={{ width: 28, flexShrink: 0, textAlign: 'center' }}>
                {rankStyle ? (
                  <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: rankStyle.color }}>
                    {rankStyle.label}
                  </span>
                ) : (
                  <span className="font-karla font-300" style={{ fontSize: '0.72rem', color: '#4a4845' }}>
                    {rank}
                  </span>
                )}
              </div>

              {/* Username */}
              <p className="flex-1 font-karla font-600 truncate" style={{ fontSize: '0.85rem', color: isMe ? '#f0ede8' : '#a0a09a' }}>
                {entry.username}
                {isMe && <span className="font-karla font-300 text-[#f0c040] ml-2" style={{ fontSize: '0.65rem' }}>you</span>}
              </p>

              {/* Score */}
              <p className="font-cinzel font-600 shrink-0" style={{ fontSize: '0.8rem', color: rankStyle?.color ?? (isMe ? '#f0c040' : '#6a6764') }}>
                {tab.unit(entry.score)}
              </p>
            </Link>
          )
        })}
      </div>

      {/* Current user if outside top 50 */}
      {!inTop50 && myScore > 0 && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.11)', paddingTop: '1rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.875rem',
            padding: '0.75rem 1rem',
            borderRadius: '10px',
            background: 'rgba(240,192,64,0.07)',
            border: '1px solid rgba(240,192,64,0.22)',
          }}>
            <div style={{ width: 28, flexShrink: 0, textAlign: 'center' }}>
              <span className="font-karla font-300 text-[#4a4845]" style={{ fontSize: '0.72rem' }}>—</span>
            </div>
            <p className="flex-1 font-karla font-600 truncate text-[#f0ede8]" style={{ fontSize: '0.85rem' }}>
              You
            </p>
            <p className="font-cinzel font-600 shrink-0 text-[#f0c040]" style={{ fontSize: '0.8rem' }}>
              {tab.unit(myScore)}
            </p>
          </div>
        </div>
      )}

      {data.length === 0 && (
        <p className="font-karla font-300 text-[#6a6764] text-sm text-center py-12">No data yet.</p>
      )}
    </div>
  )
}
