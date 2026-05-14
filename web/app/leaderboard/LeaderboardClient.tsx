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
  raidScore: number
}

interface MyRanks {
  fishing: number | null
  perfectStreak: number | null
  tideRun: number | null
  fishSlots: number | null
  expedition: number | null
  raidScore: number | null
}

interface Props {
  fishing: LeaderboardEntry[]
  perfectStreak: LeaderboardEntry[]
  tideRun: LeaderboardEntry[]
  fishSlots: LeaderboardEntry[]
  expedition: LeaderboardEntry[]
  raidScore: LeaderboardEntry[]
  myScores: MyScores
  myRanks: MyRanks
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

type TabKey = 'fishingLevel' | 'perfectStreak' | 'tideRun' | 'fishSlots' | 'expedition' | 'raidScore'
type SectionKey = 'fishing' | 'expeditions' | 'tavern'

interface BoardDef {
  key: TabKey
  label: string
  /** Accent color for the leaderboard SECTION below the picker. Picker
   *  pills use rank-based podium colors, not this. */
  accent: string
}

const BOARDS: Record<TabKey, BoardDef> = {
  fishingLevel:  { key: 'fishingLevel',  label: 'Fishing Level',   accent: '#f0c040' },
  perfectStreak: { key: 'perfectStreak', label: 'Perfect Streak',  accent: '#fb923c' },
  expedition:    { key: 'expedition',    label: 'Navigator Level', accent: '#7090c0' },
  raidScore:     { key: 'raidScore',     label: 'Raid Score',      accent: '#c8704a' },
  tideRun:       { key: 'tideRun',       label: 'Tide Run',        accent: '#5da7d4' },
  fishSlots:     { key: 'fishSlots',     label: 'Fish Slots',      accent: '#34d399' },
}

/** Master sections — each owns 2 boards. Section order = display order. */
const SECTIONS: Record<SectionKey, { label: string; boards: TabKey[] }> = {
  fishing:     { label: 'Fishing',     boards: ['perfectStreak', 'fishingLevel'] },
  expeditions: { label: 'Expeditions', boards: ['expedition', 'raidScore'] },
  tavern:      { label: 'Tavern',      boards: ['tideRun', 'fishSlots'] },
}

/** Podium colors: gold / silver / bronze for ranks 1, 2, 3.
 *  Anything outside the top 3 uses a neutral pill — no accent. */
const PODIUM_COLORS: Record<number, string> = {
  1: '#f0c040', // gold
  2: '#c0c8d4', // silver
  3: '#c47a3a', // bronze
}
const NEUTRAL_TEXT = '#d8d4cf'
const NEUTRAL_BORDER = 'rgba(255,255,255,0.10)'
const NEUTRAL_BORDER_TOP = 'rgba(255,255,255,0.18)'


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

export default function LeaderboardClient({ fishing, perfectStreak, tideRun, fishSlots, expedition, raidScore, myScores, myRanks, currentUserId, avatars }: Props) {
  const [section, setSection] = useState<SectionKey>('fishing')
  const [activeTab, setActiveTab] = useState<TabKey>(SECTIONS.fishing.boards[0])

  function selectSection(s: SectionKey) {
    setSection(s)
    // When switching sections, reset to that section's first board so the
    // visible leaderboard always belongs to the active section.
    setActiveTab(SECTIONS[s].boards[0])
  }

  function rankOf(key: TabKey): number | null {
    switch (key) {
      case 'fishingLevel':  return myRanks.fishing
      case 'perfectStreak': return myRanks.perfectStreak
      case 'expedition':    return myRanks.expedition
      case 'raidScore':     return myRanks.raidScore
      case 'tideRun':       return myRanks.tideRun
      case 'fishSlots':     return myRanks.fishSlots
    }
  }

  return (
    <div style={{ paddingBottom: '2rem' }}>

      {/* ── Section tabs (Fishing / Expeditions / Tavern) ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: '0.6rem' }}>
        {(Object.keys(SECTIONS) as SectionKey[]).map(key => {
          const isActive = section === key
          return (
            <button
              key={key}
              onClick={() => selectSection(key)}
              className="font-cinzel font-700 uppercase tracking-[0.10em]"
              style={{
                padding: '0.55rem 0.5rem',
                borderRadius: 10,
                background: isActive
                  ? 'linear-gradient(180deg, rgba(240,192,64,0.20) 0%, rgba(240,192,64,0.05) 100%)'
                  : 'rgba(6,6,4,0.7)',
                border: `1px solid ${isActive ? 'rgba(240,192,64,0.48)' : NEUTRAL_BORDER}`,
                borderTop: `1px solid ${isActive ? 'rgba(240,192,64,0.78)' : NEUTRAL_BORDER_TOP}`,
                color: isActive ? '#f0c040' : NEUTRAL_TEXT,
                fontSize: '0.72rem',
                cursor: 'pointer',
                boxShadow: isActive ? '0 0 14px rgba(240,192,64,0.20)' : 'none',
                transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
              }}
            >
              {SECTIONS[key].label}
            </button>
          )
        })}
      </div>

      {/* ── Sub-filter pills — only the boards belonging to the active
            section. Pills go neutral by default; podium ranks (top 3)
            light up in gold/silver/bronze. Teaser is the rank, not the
            score. ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: '1.25rem' }}>
        {SECTIONS[section].boards.map(key => {
          const b = BOARDS[key]
          const isActive = activeTab === key
          const myRank = rankOf(key)
          const podiumColor = myRank != null && myRank <= 3 ? PODIUM_COLORS[myRank] : null
          const pillAccent  = podiumColor
          const teaser      = myRank == null ? '—' : `Rank ${myRank}`
          const teaserColor = podiumColor ?? (myRank == null ? '#5a5856' : '#9a9488')

          const borderColor = isActive
            ? (pillAccent ? `${pillAccent}90` : 'rgba(255,255,255,0.30)')
            : (pillAccent ? `${pillAccent}50` : NEUTRAL_BORDER)
          const borderTopColor = isActive
            ? (pillAccent ? `${pillAccent}c0` : 'rgba(255,255,255,0.42)')
            : (pillAccent ? `${pillAccent}70` : NEUTRAL_BORDER_TOP)
          const bgColor = isActive
            ? (pillAccent ? `${pillAccent}1a` : 'rgba(255,255,255,0.05)')
            : 'rgba(6,6,4,0.7)'
          const glow = isActive && pillAccent ? `0 0 12px ${pillAccent}35` : 'none'

          return (
            <button
              key={b.key}
              onClick={() => setActiveTab(b.key)}
              style={{
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                padding: '0.55rem 0.75rem 0.55rem 0.85rem',
                borderRadius: 10,
                background: bgColor,
                border: `1px solid ${borderColor}`,
                borderTop: `1px solid ${borderTopColor}`,
                boxShadow: glow,
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                textAlign: 'left',
                overflow: 'hidden',
              }}
            >
              {/* Left-edge stripe — only renders when podium-ranked */}
              {pillAccent && (
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
                  background: pillAccent, opacity: isActive ? 1 : 0.7,
                }} />
              )}
              <p className="font-karla font-700" style={{
                fontSize: '0.72rem',
                color: isActive ? '#f0ede8' : NEUTRAL_TEXT,
                lineHeight: 1.1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {b.label}
              </p>
              <p className="font-cinzel font-700" style={{
                fontSize: '0.74rem',
                color: teaserColor,
                lineHeight: 1,
                flexShrink: 0,
              }}>
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
      {activeTab === 'raidScore' && (
        <LeaderboardSection
          label="Raid Score — Strongest Loadout"
          accent="#c8704a"
          unit={n => n.toLocaleString()}
          subUnit={() => 'combat rating'}
          data={raidScore}
          myScore={myScores.raidScore}
          currentUserId={currentUserId}
          avatars={avatars}
        />
      )}
    </div>
  )
}
