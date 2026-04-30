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
  perfectStreak: number
}

interface Props {
  fishing: LeaderboardEntry[]
  perfectStreak: LeaderboardEntry[]
  myScores: MyScores
  currentUserId: string
}

const TABS = [
  { key: 'fishing',       label: 'Fishing',        accent: '#f0c040', unit: (n: number) => `Lv ${getLevelFromXP(n)}`, subUnit: (n: number) => `${n.toLocaleString()} XP` },
  { key: 'perfectStreak', label: 'Perfect Streak',  accent: '#fb923c', unit: (n: number) => `${n}×`,                   subUnit: () => 'perfect' },
] as const

type TabKey = typeof TABS[number]['key']

const PODIUM = [
  { rank: 1, medal: '🥇', color: '#f0c040', size: 64, order: 1 },
  { rank: 2, medal: '🥈', color: '#9ca3af', size: 52, order: 0 },
  { rank: 3, medal: '🥉', color: '#cd7f32', size: 52, order: 2 },
]

const AVATAR_COLORS = ['#0e7490', '#0d9488', '#7c3aed', '#b45309', '#0369a1', '#be185d']
function avatarColor(str: string) {
  let h = 0
  for (const c of str) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function Avatar({ username, size = 36 }: { username: string; size?: number }) {
  const color = avatarColor(username)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `radial-gradient(circle at 38% 35%, ${color}ee 0%, ${color}77 100%)`,
      border: `1.5px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span className="font-cinzel font-700" style={{ fontSize: size * 0.38, color: '#f0ede8' }}>
        {username.slice(0, 1).toUpperCase()}
      </span>
    </div>
  )
}

export default function LeaderboardClient({ fishing, perfectStreak, myScores, currentUserId }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('fishing')

  const dataMap: Record<TabKey, LeaderboardEntry[]> = { fishing, perfectStreak }
  const myScoreMap: Record<TabKey, number> = { fishing: myScores.fishing, perfectStreak: myScores.perfectStreak }

  const data = dataMap[activeTab]
  const tab = TABS.find(t => t.key === activeTab)!
  const myRank = data.findIndex(e => e.user_id === currentUserId) + 1
  const inTop50 = myRank > 0
  const myScore = myScoreMap[activeTab]

  const top3 = data.slice(0, 3)
  const rest = data.slice(3)

  return (
    <div style={{ paddingBottom: '2rem' }}>

      {/* ── Tabs ── */}
      <div className="flex gap-2 mb-8">
        {TABS.map(t => {
          const isActive = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="flex-1 font-cinzel font-700 uppercase tracking-[0.12em] transition-all"
              style={{
                padding: '0.7rem 0.5rem',
                borderRadius: 12,
                fontSize: '0.62rem',
                background: isActive ? `${t.accent}18` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isActive ? t.accent + '55' : 'rgba(255,255,255,0.09)'}`,
                color: isActive ? t.accent : '#4a4845',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {data.length === 0 && (
        <p className="font-karla font-300 text-center py-16" style={{ color: '#4a4845', fontSize: '0.8rem' }}>No entries yet.</p>
      )}

      {/* ── Top 3 podium ── */}
      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-3 mb-6" style={{ minHeight: 160 }}>
          {PODIUM.filter(p => top3[p.rank - 1]).map(p => {
            const entry = top3[p.rank - 1]
            const isMe = entry.user_id === currentUserId
            const podiumHeight = p.rank === 1 ? 110 : 88
            return (
              <Link
                key={p.rank}
                href={`/u/${entry.username}`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: 8, textDecoration: 'none', flex: 1,
                  order: p.order,
                }}
              >
                {/* Avatar + medal */}
                <div style={{ position: 'relative' }}>
                  <Avatar username={entry.username} size={p.size} />
                  <span style={{
                    position: 'absolute', bottom: -4, right: -4,
                    fontSize: p.rank === 1 ? '1.1rem' : '0.9rem', lineHeight: 1,
                  }}>{p.medal}</span>
                </div>

                {/* Name + score */}
                <div style={{ textAlign: 'center' }}>
                  <p className="font-karla font-700 truncate" style={{
                    fontSize: p.rank === 1 ? '0.82rem' : '0.72rem',
                    color: isMe ? tab.accent : '#f0ede8',
                    maxWidth: 80,
                  }}>
                    {entry.username}
                    {isMe && <span style={{ color: tab.accent, fontSize: '0.55rem', marginLeft: 3 }}>you</span>}
                  </p>
                  <p className="font-cinzel font-700" style={{ fontSize: p.rank === 1 ? '1.0rem' : '0.82rem', color: p.color, lineHeight: 1.1, marginTop: 2 }}>
                    {tab.unit(entry.score)}
                  </p>
                  <p className="font-karla font-400" style={{ fontSize: '0.5rem', color: p.color + '88', marginTop: 1 }}>
                    {tab.subUnit(entry.score)}
                  </p>
                </div>

                {/* Podium base */}
                <div style={{
                  width: '100%', height: podiumHeight, borderRadius: '8px 8px 0 0',
                  background: `linear-gradient(180deg, ${p.color}22 0%, ${p.color}0a 100%)`,
                  border: `1px solid ${p.color}30`,
                  borderBottom: 'none',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                  paddingTop: 8,
                }}>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.6rem', color: p.color + '60' }}>
                    #{p.rank}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* ── Ranks 4+ ── */}
      {rest.length > 0 && (
        <div style={{
          background: 'rgba(4,10,20,0.6)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14, overflow: 'hidden',
        }}>
          {rest.map((entry, i) => {
            const rank = i + 4
            const isMe = entry.user_id === currentUserId
            return (
              <Link
                key={entry.user_id}
                href={`/u/${entry.username}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0.65rem 1rem',
                  borderBottom: i < rest.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  background: isMe ? `${tab.accent}0d` : 'transparent',
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
              >
                <span className="font-karla font-300 shrink-0" style={{ width: 22, textAlign: 'right', fontSize: '0.65rem', color: '#3a3835' }}>
                  {rank}
                </span>
                <Avatar username={entry.username} size={28} />
                <p className="flex-1 font-karla font-600 truncate" style={{ fontSize: '0.8rem', color: isMe ? '#f0ede8' : '#a0a09a' }}>
                  {entry.username}
                  {isMe && <span style={{ color: tab.accent, fontSize: '0.55rem', marginLeft: 6 }}>you</span>}
                </p>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="font-cinzel font-600" style={{ fontSize: '0.75rem', color: isMe ? tab.accent : '#6a6764' }}>
                    {tab.unit(entry.score)}
                  </p>
                  <p className="font-karla font-300" style={{ fontSize: '0.48rem', color: '#3a3835' }}>
                    {tab.subUnit(entry.score)}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* ── You if outside top 50 ── */}
      {!inTop50 && myScore > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '0.75rem 1rem', borderRadius: 12,
            background: `${tab.accent}0d`, border: `1px solid ${tab.accent}30`,
          }}>
            <span className="font-karla font-300" style={{ width: 22, textAlign: 'right', fontSize: '0.65rem', color: '#4a4845' }}>—</span>
            <Avatar username="you" size={28} />
            <p className="flex-1 font-karla font-700" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>You</p>
            <div style={{ textAlign: 'right' }}>
              <p className="font-cinzel font-600" style={{ fontSize: '0.75rem', color: tab.accent }}>{tab.unit(myScore)}</p>
              <p className="font-karla font-300" style={{ fontSize: '0.48rem', color: tab.accent + '80' }}>{tab.subUnit(myScore)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
