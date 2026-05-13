'use client'

import { useState } from 'react'
import Link from 'next/link'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel } from '@/lib/expeditionLevel'
import CharacterAvatar from '@/components/CharacterAvatar'

export interface LeaderboardEntry {
  user_id: string
  username: string
  score: number
  zone?: string | null
}

interface MyScores {
  fishing: number
  perfectStreak: number
  tideRun: number
  fishSlots: number
  expedition: number
}

interface Props {
  fishing: LeaderboardEntry[]
  perfectStreak: LeaderboardEntry[]
  tideRun: LeaderboardEntry[]
  fishSlots: LeaderboardEntry[]
  expedition: LeaderboardEntry[]
  myScores: MyScores
  currentUserId: string
  /** Map of user_id → avatar attributes for every player shown across any
   *  of the boards. Populated server-side in a single side query so each
   *  row can render the player's actual character. */
  avatars: Record<string, {
    characterColor: string | null
    equippedHat: string | null
    avatarBg: string | null
    avatarBorder: string | null
  }>
}

type TabKey = 'fishingLevel' | 'perfectStreak' | 'tideRun' | 'fishSlots' | 'expedition'

interface BoardDef {
  key: TabKey
  label: string
  accent: string
  /** Compact teaser shown to the right of the label on the picker pill. */
  teaser: (myScore: number) => string
}

// Order is also the grouping (Fishing → Tavern → Expeditions). Visual
// section breaks come from the implicit row flow rather than headers.
const BOARDS: BoardDef[] = [
  { key: 'fishingLevel',  label: 'Fishing Level',   accent: '#f0c040', teaser: n => n > 0 ? `Lv ${getLevelFromXP(n)}`         : '—' },
  { key: 'perfectStreak', label: 'Perfect Streak',  accent: '#fb923c', teaser: n => n > 0 ? `${n}×`                            : '—' },
  { key: 'tideRun',       label: 'Tide Run',        accent: '#5da7d4', teaser: n => n > 0 ? `${n.toLocaleString()} m`          : '—' },
  { key: 'fishSlots',     label: 'Fish Slots',      accent: '#34d399', teaser: n => n > 0 ? `${n.toLocaleString()} ⟡`          : '—' },
  { key: 'expedition',    label: 'Navigator Level', accent: '#7090c0', teaser: n => n > 0 ? `Lv ${getExpeditionLevel(n)}`     : '—' },
]


const AVATAR_COLORS = ['#0e7490', '#0d9488', '#7c3aed', '#b45309', '#0369a1', '#be185d']
function avatarColor(str: string) {
  let h = 0
  for (const c of str) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function Avatar({ username, size = 36, characterColor: charColor, equippedHat, avatarBg, avatarBorder }: {
  username: string
  size?: number
  characterColor?: string | null
  equippedHat?: string | null
  avatarBg?: string | null
  avatarBorder?: string | null
}) {
  const fallbackColor = avatarColor(username)
  // If we have avatar data from the server payload, render the character +
  // hat composite using the player's saved colors (or the shared defaults).
  // Otherwise fall back to the username-hashed colored letter circle (still
  // used for legacy accounts without character_color set).
  if (charColor) {
    return (
      <CharacterAvatar
        characterColor={charColor}
        equippedHat={equippedHat ?? null}
        size={size}
        bgColor={avatarBg ?? undefined}
        ringColor={avatarBorder ?? undefined}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `radial-gradient(circle at 38% 35%, ${fallbackColor}ee 0%, ${fallbackColor}77 100%)`,
      border: `1.5px solid ${fallbackColor}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span className="font-cinzel font-700" style={{ fontSize: size * 0.38, color: '#f0ede8' }}>
        {username.slice(0, 1).toUpperCase()}
      </span>
    </div>
  )
}

const ZONE_LABELS: Record<string, { label: string; color: string }> = {
  shallows:     { label: 'Shallows',     color: '#60a5fa' },
  open_waters:  { label: 'Open Waters',  color: '#34d399' },
  deep:         { label: 'Deep',         color: '#a78bfa' },
  abyss:        { label: 'Abyss',        color: '#f87171' },
  ancient_deep: { label: 'Ancient Deep', color: '#c084fc' },
}

function ZoneBadge({ zone }: { zone: string | null | undefined }) {
  if (!zone) return null
  const z = ZONE_LABELS[zone]
  if (!z) return null
  return (
    <span style={{
      fontSize: '0.45rem', padding: '1px 5px', borderRadius: 4,
      background: z.color + '22', border: `1px solid ${z.color}55`,
      color: z.color, fontFamily: 'var(--font-karla)', fontWeight: 600,
      letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {z.label}
    </span>
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
  showZone?: boolean
  avatars: Record<string, {
    characterColor: string | null
    equippedHat: string | null
    avatarBg: string | null
    avatarBorder: string | null
  }>
}

function LeaderboardSection({ label, accent, unit, subUnit, data, myScore, currentUserId, showZone, avatars }: SectionProps) {
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
                <Avatar
                  username={entry.username}
                  size={rank === 1 ? 36 : 28}
                  characterColor={avatars[entry.user_id]?.characterColor}
                  equippedHat={avatars[entry.user_id]?.equippedHat}
                  avatarBg={avatars[entry.user_id]?.avatarBg}
                  avatarBorder={avatars[entry.user_id]?.avatarBorder}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-karla font-700 truncate" style={{ fontSize: rank === 1 ? '0.88rem' : '0.8rem', color: isMe ? '#f0ede8' : '#c8c8c2' }}>
                    {entry.username}
                    {isMe && <span style={{ color: accent, fontSize: '0.55rem', marginLeft: 6 }}>you</span>}
                  </p>
                  {showZone && <ZoneBadge zone={entry.zone} />}
                </div>
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
                <Avatar
                  username={entry.username}
                  size={28}
                  characterColor={avatars[entry.user_id]?.characterColor}
                  equippedHat={avatars[entry.user_id]?.equippedHat}
                  avatarBg={avatars[entry.user_id]?.avatarBg}
                  avatarBorder={avatars[entry.user_id]?.avatarBorder}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-karla font-600 truncate" style={{ fontSize: '0.8rem', color: isMe ? '#f0ede8' : '#a0a09a' }}>
                    {entry.username}
                    {isMe && <span style={{ color: accent, fontSize: '0.55rem', marginLeft: 6 }}>you</span>}
                  </p>
                  {showZone && <ZoneBadge zone={entry.zone} />}
                </div>
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
            <Avatar
              username="you"
              size={28}
              characterColor={avatars[currentUserId]?.characterColor}
              equippedHat={avatars[currentUserId]?.equippedHat}
              avatarBg={avatars[currentUserId]?.avatarBg}
              avatarBorder={avatars[currentUserId]?.avatarBorder}
            />
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

export default function LeaderboardClient({ fishing, perfectStreak, tideRun, fishSlots, expedition, myScores, currentUserId, avatars }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('fishingLevel')

  return (
    <div style={{ paddingBottom: '2rem' }}>

      {/* ── Board picker — compact pills ── */}
      {/* 2-col grid of thin pills. Left edge stripe carries each board's
          accent so the picker has color without taking the space an icon
          tile would. Active pill gets a stronger border + glow. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: '1.25rem' }}>
        {BOARDS.map(b => {
          const isActive = activeTab === b.key
          const myScore = b.key === 'fishingLevel' ? myScores.fishing
            : b.key === 'perfectStreak' ? myScores.perfectStreak
            : b.key === 'tideRun' ? myScores.tideRun
            : b.key === 'fishSlots' ? myScores.fishSlots
            : myScores.expedition
          const teaser = b.teaser(myScore)
          return (
            <button
              key={b.key}
              onClick={() => setActiveTab(b.key)}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '0.5rem 0.7rem 0.5rem 0.85rem',
                borderRadius: 10,
                background: isActive ? `${b.accent}18` : 'rgba(6,6,4,0.7)',
                border: `1px solid ${isActive ? `${b.accent}70` : 'rgba(255,255,255,0.09)'}`,
                boxShadow: isActive ? `0 0 12px ${b.accent}30` : 'none',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                textAlign: 'left',
                overflow: 'hidden',
              }}
            >
              {/* Left-edge accent stripe */}
              <div style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                background: b.accent, opacity: isActive ? 1 : 0.55,
              }} />
              <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: isActive ? '#f0ede8' : '#d8d4cf', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b.label}
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.74rem', color: myScore > 0 ? b.accent : '#5a5856', lineHeight: 1, flexShrink: 0 }}>
                {teaser}
              </p>
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
          avatars={avatars}
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
          avatars={avatars}
          showZone
        />
      )}
      {activeTab === 'tideRun' && (
        <LeaderboardSection
          label="Tide Run — Longest Distance"
          accent="#5da7d4"
          unit={n => `${n.toLocaleString()} m`}
          subUnit={() => 'best run'}
          data={tideRun}
          myScore={myScores.tideRun}
          currentUserId={currentUserId}
          avatars={avatars}
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
          avatars={avatars}
        />
      )}
      {activeTab === 'expedition' && (
        <LeaderboardSection
          label="Navigator Level"
          accent="#7090c0"
          unit={n => `Lv ${getExpeditionLevel(n)}`}
          subUnit={n => `${n.toLocaleString()} XP`}
          data={expedition}
          myScore={myScores.expedition}
          currentUserId={currentUserId}
          avatars={avatars}
        />
      )}
    </div>
  )
}
