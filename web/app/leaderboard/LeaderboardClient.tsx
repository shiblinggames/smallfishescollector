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
  fishSlots: number
}

interface Props {
  fishing: LeaderboardEntry[]
  perfectStreak: LeaderboardEntry[]
  fishSlots: LeaderboardEntry[]
  myScores: MyScores
  currentUserId: string
}

type TabKey = 'fishingLevel' | 'perfectStreak' | 'fishSlots'

const TABS: { key: TabKey; label: string; accent: string }[] = [
  { key: 'fishingLevel',  label: 'Fishing Level',  accent: '#f0c040' },
  { key: 'perfectStreak', label: 'Perfect Streak', accent: '#fb923c' },
  { key: 'fishSlots',     label: 'Fish Slots',     accent: '#34d399' },
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

interface SectionProps {
  label: string
  accent: string
  unit: (n: number) => string
  subUnit: (n: number) => string
  data: LeaderboardEntry[]
  myScore: number
  currentUserId: string
}

function LeaderboardSection({ label, accent, unit, subUnit, data, myScore, currentUserId }: SectionProps) {
  const top3 = data.slice(0, 3)
  const rest = data.slice(3)
  const myRank = data.findIndex(e => e.user_id === currentUserId) + 1
  const inTop50 = myRank > 0

  return (
    <div>
      {data.length === 0 && (
        <p className="font-karla font-300 text-center py-10" style={{ color: '#4a4845', fontSize: '0.8rem' }}>No entries yet.</p>
      )}

      {/* Top 3 */}
      {top3.length > 0 && (
        <div style={{
          background: 'rgba(4,10,20,0.82)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, overflow: 'hidden', marginBottom: 6,
        }}>
          {top3.map((entry, i) => {
            const rank = i + 1
            const isMe = entry.user_id === currentUserId
            const medal = ['🥇','🥈','🥉'][i]
            const rankColor = ['#f0c040', '#9ca3af', '#cd7f32'][i]
            return (
              <Link
                key={entry.user_id}
                href={`/u/${entry.username}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0.8rem 1rem',
                  borderBottom: i < top3.length - 1 ? `1px solid rgba(255,255,255,0.05)` : 'none',
                  borderLeft: `3px solid ${rankColor}`,
                  background: isMe ? `${accent}0d` : 'transparent',
                  textDecoration: 'none',
                }}
              >
                <span style={{ fontSize: rank === 1 ? '1.3rem' : '1.1rem', lineHeight: 1, flexShrink: 0 }}>{medal}</span>
                <Avatar username={entry.username} size={rank === 1 ? 36 : 28} />
                <p className="flex-1 font-karla font-700 truncate" style={{ fontSize: rank === 1 ? '0.88rem' : '0.8rem', color: isMe ? '#f0ede8' : '#c8c8c2' }}>
                  {entry.username}
                  {isMe && <span style={{ color: accent, fontSize: '0.55rem', marginLeft: 6 }}>you</span>}
                </p>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: rank === 1 ? '0.95rem' : '0.78rem', color: rankColor }}>
                    {unit(entry.score)}
                  </p>
                  <p className="font-karla font-300" style={{ fontSize: '0.48rem', color: rankColor + '77' }}>
                    {subUnit(entry.score)}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Ranks 4+ */}
      {rest.length > 0 && (
        <div style={{
          background: 'rgba(4,10,20,0.82)', border: '1px solid rgba(255,255,255,0.1)',
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
                  background: isMe ? `${accent}0d` : 'transparent',
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
                  {isMe && <span style={{ color: accent, fontSize: '0.55rem', marginLeft: 6 }}>you</span>}
                </p>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="font-cinzel font-600" style={{ fontSize: '0.75rem', color: isMe ? accent : '#6a6764' }}>
                    {unit(entry.score)}
                  </p>
                  <p className="font-karla font-300" style={{ fontSize: '0.48rem', color: '#3a3835' }}>
                    {subUnit(entry.score)}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* You if outside top 50 */}
      {!inTop50 && myScore > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '0.75rem 1rem', borderRadius: 12,
            background: `${accent}0d`, border: `1px solid ${accent}30`,
          }}>
            <span className="font-karla font-300" style={{ width: 22, textAlign: 'right', fontSize: '0.65rem', color: '#4a4845' }}>—</span>
            <Avatar username="you" size={28} />
            <p className="flex-1 font-karla font-700" style={{ fontSize: '0.8rem', color: '#f0ede8' }}>You</p>
            <div style={{ textAlign: 'right' }}>
              <p className="font-cinzel font-600" style={{ fontSize: '0.75rem', color: accent }}>{unit(myScore)}</p>
              <p className="font-karla font-300" style={{ fontSize: '0.48rem', color: accent + '80' }}>{subUnit(myScore)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function LeaderboardClient({ fishing, perfectStreak, fishSlots, myScores, currentUserId }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('fishingLevel')

  return (
    <div style={{ paddingBottom: '2rem' }}>

      {/* ── Filter pills ── */}
      <div className="flex gap-2 mb-8">
        {TABS.map(t => {
          const isActive = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="flex-1 font-karla font-700 transition-all"
              style={{
                padding: '0.55rem 0.25rem',
                borderRadius: 10,
                fontSize: '0.62rem',
                background: isActive ? `${t.accent}28` : 'rgba(4,10,20,0.55)',
                border: `1px solid ${isActive ? t.accent + '80' : 'rgba(255,255,255,0.14)'}`,
                color: isActive ? t.accent : '#7a7875',
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Active leaderboard ── */}
      {activeTab === 'fishingLevel' && (
        <LeaderboardSection
          label="Fishing Level"
          accent="#f0c040"
          unit={n => `Lv ${getLevelFromXP(n)}`}
          subUnit={n => `${n.toLocaleString()} XP`}
          data={fishing}
          myScore={myScores.fishing}
          currentUserId={currentUserId}
        />
      )}
      {activeTab === 'perfectStreak' && (
        <LeaderboardSection
          label="Perfect Streak"
          accent="#fb923c"
          unit={n => `${n}×`}
          subUnit={() => 'perfect'}
          data={perfectStreak}
          myScore={myScores.perfectStreak}
          currentUserId={currentUserId}
        />
      )}
      {activeTab === 'fishSlots' && (
        <LeaderboardSection
          label="Fish Slots — Biggest Win"
          accent="#34d399"
          unit={n => `${n.toLocaleString()} ⟡`}
          subUnit={() => 'single spin'}
          data={fishSlots}
          myScore={myScores.fishSlots}
          currentUserId={currentUserId}
        />
      )}
    </div>
  )
}
