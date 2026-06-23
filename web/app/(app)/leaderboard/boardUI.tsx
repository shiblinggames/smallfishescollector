'use client'

// Shared leaderboard rendering — used by the full /leaderboard page
// (LeaderboardClient) and the in-section LeaderboardModal so both stay
// visually identical. Pure presentational; no data fetching here.

import Link from 'next/link'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel } from '@/lib/expeditionLevel'
import CharacterAvatar from '@/components/CharacterAvatar'

export interface LeaderboardEntry {
  user_id: string
  username: string
  score: number
  zone?: string | null
  /** Optional pre-formatted secondary line; overrides the board's subUnit when
   *  present (e.g. the Gauntlet's run time under "Depth N"). */
  sub?: string
}

export type BoardKey =
  | 'fishingLevel' | 'perfectStreak' | 'tideRun' | 'chartingPoints'
  | 'fishSlots' | 'blackjack' | 'roulette' | 'expedition' | 'raidProgress'
  | 'gauntletDepth'

export type AvatarMap = Record<string, {
  characterColor: string | null
  equippedHat: string | null
  avatarBg: string | null
  avatarBorder: string | null
}>

/** Per-board display metadata. Single source of truth for label, accent,
 *  and how a raw score renders (unit / sub-unit / zone badges).
 *  Optional valueColor overrides the value text color per-row from the
 *  score itself — used by Blackjack so winners read green and losers
 *  read red regardless of which rank they're sitting at. */
export const BOARD_META: Record<BoardKey, {
  label: string
  accent: string
  unit: (n: number) => string
  subUnit: (n: number) => string
  showZone?: boolean
  valueColor?: (n: number) => string
}> = {
  fishingLevel:  { label: 'Fishing Level',  accent: '#f0c040', unit: n => `Lv ${getLevelFromXP(n)}`,     subUnit: n => `${n.toLocaleString()} XP` },
  perfectStreak: { label: 'Perfect Streak', accent: '#fb923c', unit: n => `${n}×`,                       subUnit: () => 'perfect', showZone: true },
  tideRun:       { label: 'Tide Run',       accent: '#5da7d4', unit: n => `${n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`, subUnit: () => 'best run' },
  // The three Den boards all read identically: lifetime net across every
  // hand/spin, signed, with winners green and losers red.
  fishSlots:     {
    label: 'Fish Slots',
    accent: '#34d399',
    unit:    n => `${n > 0 ? '+' : ''}${n.toLocaleString()} ⟡`,
    subUnit: n => n > 0 ? 'net winnings' : n < 0 ? 'net loss' : 'break-even',
    valueColor: n => n > 0 ? '#7fd49a' : n < 0 ? '#e07070' : '#a09988',
  },
  blackjack:     {
    label: 'Blackjack',
    accent: '#c63838',
    unit:    n => `${n > 0 ? '+' : ''}${n.toLocaleString()} ⟡`,
    subUnit: n => n > 0 ? 'net winnings' : n < 0 ? 'net loss' : 'break-even',
    valueColor: n => n > 0 ? '#7fd49a' : n < 0 ? '#e07070' : '#a09988',
  },
  roulette:      {
    label: 'Roulette',
    accent: '#e8a33d',
    unit:    n => `${n > 0 ? '+' : ''}${n.toLocaleString()} ⟡`,
    subUnit: n => n > 0 ? 'net winnings' : n < 0 ? 'net loss' : 'break-even',
    valueColor: n => n > 0 ? '#7fd49a' : n < 0 ? '#e07070' : '#a09988',
  },
  expedition:    { label: 'Navigator Level',accent: '#7090c0', unit: n => `Lv ${getExpeditionLevel(n)}`, subUnit: n => `${n.toLocaleString()} XP` },
  raidProgress:  { label: 'Raid Progress',  accent: '#7fd0a0', unit: n => `${n.toLocaleString()}`,       subUnit: n => `${n === 1 ? 'node' : 'nodes'} cleared` },
  chartingPoints:{ label: 'Charting Points',accent: '#d8a24a', unit: n => `${n.toLocaleString()}`,       subUnit: n => `charting point${n === 1 ? '' : 's'}` },
  gauntletDepth: { label: 'Deepest Descent', accent: '#5eead4', unit: n => `Depth ${n}`,                  subUnit: () => 'cashed out' },
}

const AVATAR_COLORS = ['#0e7490', '#0d9488', '#7c3aed', '#b45309', '#0369a1', '#be185d']
function avatarColor(str: string) {
  let h = 0
  for (const c of str) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function Avatar({ username, size = 36, characterColor: charColor, equippedHat, avatarBg, avatarBorder }: {
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
  accent: string
  unit: (n: number) => string
  subUnit: (n: number) => string
  data: LeaderboardEntry[]
  /** Player's score. null = player has no entry on this board (hasn't
   *  played / no score yet); a number (incl. 0 or negative for boards
   *  that accept signed scores like Blackjack) means they have a rank. */
  myScore: number | null
  currentUserId: string
  showZone?: boolean
  avatars: AvatarMap
  /** Optional per-row value text color from the score. When provided,
   *  used for ranks 4+ and the "you outside top 50" tile (top 3 keep
   *  their medal colors since those are positional indicators). */
  valueColor?: (n: number) => string
}

export function LeaderboardSection({ accent, unit, subUnit, data, myScore, currentUserId, showZone, avatars, valueColor }: SectionProps) {
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
                <div className="flex-1 min-w-0" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <p className="font-karla font-700 truncate" style={{ fontSize: rank === 1 ? '0.88rem' : '0.8rem', color: isMe ? '#f0ede8' : '#c8c8c2', minWidth: 0 }}>
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
                <div className="flex-1 min-w-0" style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <p className="font-karla font-600 truncate" style={{ fontSize: '0.8rem', color: isMe ? '#f0ede8' : '#a0a09a', minWidth: 0 }}>
                    {entry.username}
                    {isMe && <span style={{ color: accent, fontSize: '0.55rem', marginLeft: 6 }}>you</span>}
                  </p>
                  {showZone && <ZoneBadge zone={entry.zone} />}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="font-cinzel font-600" style={{ fontSize: '0.75rem', color: valueColor ? valueColor(entry.score) : (isMe ? accent : '#6a6764') }}>
                    {unit(entry.score)}
                  </p>
                  <p className="font-karla font-300" style={{ fontSize: '0.48rem', color: '#3a3835' }}>
                    {entry.sub ?? subUnit(entry.score)}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* You if outside top 50 — shown whenever the player has a score
          on the board (myScore !== null), including 0 / negative on
          boards that allow signed scores (e.g. Blackjack). */}
      {!inTop50 && myScore !== null && (
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
              <p className="font-cinzel font-600" style={{ fontSize: '0.75rem', color: valueColor ? valueColor(myScore) : accent }}>{unit(myScore)}</p>
              <p className="font-karla font-300" style={{ fontSize: '0.48rem', color: (valueColor ? valueColor(myScore) : accent) + '80' }}>{subUnit(myScore)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
