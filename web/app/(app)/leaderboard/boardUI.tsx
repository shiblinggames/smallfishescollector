'use client'

// Shared leaderboard rendering — used by the full /leaderboard page
// (LeaderboardClient) and the in-section LeaderboardModal so both stay
// visually identical. Pure presentational; no data fetching here.

import Link from 'next/link'
import FisherPose from '@/components/FisherPose'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getLevelFromXP as getExpeditionLevel } from '@/lib/expeditionLevel'
import CharacterAvatar from '@/components/CharacterAvatar'
import RankMedallion from '@/components/RankMedallion'

// Harbor-ledger palette (2026-07-12 warmth pass): the boards read as names
// entered in a ledger on timber, not a cold dashboard — warm dark wood, brass
// rules between rows, drawn metal medallions on the podium.
const LEDGER_BG = 'linear-gradient(180deg, rgba(34,26,12,0.72) 0%, rgba(18,13,7,0.85) 100%)'
const LEDGER_BORDER = '1px solid rgba(196,169,106,0.28)'
const LEDGER_RULE = '1px solid rgba(196,169,106,0.12)'

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
  | 'fishingLevel' | 'perfectStreak' | 'chartingPoints'
  | 'fishSlots' | 'blackjack' | 'roulette' | 'expedition' | 'raidProgress'
  | 'gauntletDepth' | 'gauntletHardcore' | 'gauntletBigHit' | 'gauntletDonsDepth' | 'gauntletDonsHardcore' | 'achievementPoints'
  | 'parlorPoints' | 'exchangeNet' | 'exchangeWeek'
  | 'species' | 'fishSold' | 'trophies' | 'bountyPoints'

export type AvatarMap = Record<string, {
  characterColor: string | null
  equippedHat: string | null
  avatarBg: string | null
  avatarBorder: string | null
  /** The rest of the fisher, for the podium. See PodiumStage. */
  equippedBoat?: string | null
  equippedPet?: string | null
  rodTier?: number
  reelTier?: number
  hookTier?: number
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
  gauntletHardcore: { label: 'Hardcore Gauntlet', accent: '#e0555a', unit: n => `Depth ${n}`,             subUnit: () => 'hardcore' },
  gauntletBigHit:{ label: 'Biggest Hit',     accent: '#f87171', unit: n => `${n.toLocaleString()}`,       subUnit: () => 'in one blow' },
  gauntletDonsDepth: { label: "Don's Gauntlet", accent: '#3fbf82', unit: n => `Depth ${n}`,               subUnit: () => 'cashed out' },
  // Don's green crossed with hardcore's blood red. Both halves of what the
  // board is, and distinct from either parent at a glance in the picker.
  gauntletDonsHardcore: { label: "Don's Hardcore", accent: '#b8703f', unit: n => `Depth ${n}`,            subUnit: () => 'hardcore' },
  achievementPoints: { label: 'Achievement Points', accent: '#e6b94a', unit: n => `${n.toLocaleString()}`, subUnit: n => `point${n === 1 ? '' : 's'}` },
  species:       { label: 'Fish Collection', accent: '#4ec9a8', unit: n => `${n.toLocaleString()}`, subUnit: n => `species${n === 1 ? '' : ''} caught` },
  fishSold:      { label: 'Biggest Earner',  accent: '#f0c040', unit: n => `${n.toLocaleString()} ⟡`, subUnit: () => 'earned selling fish' },
  trophies:      { label: 'Trophy Catches',  accent: '#e78a68', unit: n => `${n.toLocaleString()}`, subUnit: n => `trophy catch${n === 1 ? '' : 'es'}` },
  bountyPoints:  { label: 'Bounty Points',   accent: '#c9a0f5', unit: n => `${n.toLocaleString()}`, subUnit: n => `bounty point${n === 1 ? '' : 's'}` },
  parlorPoints:  { label: 'Parlor Points',  accent: '#b46fd4', unit: n => `${n.toLocaleString()}`,       subUnit: n => `parlor point${n === 1 ? '' : 's'}` },
  // Reads like the Den boards because it IS that shape: lifetime net, signed,
  // winners green and losers red. A single lucky payout is not a trader; being
  // ahead across a run of contracts priced at a house edge is.
  // Same score, scoped to the week. Its own board rather than a filter on the
  // other one, because a captain who has been down for a month can still win a
  // Monday, and that is the board most people can actually get onto.
  exchangeWeek:  {
    label: 'Traders This Week',
    accent: '#38bdf8',
    unit:    n => `${n > 0 ? '+' : ''}${n.toLocaleString()} ⟡`,
    subUnit: n => n > 0 ? 'net this week' : n < 0 ? 'down this week' : 'break-even',
    valueColor: n => n > 0 ? '#7fd49a' : n < 0 ? '#e07070' : '#a09988',
  },
  exchangeNet:   {
    label: 'Top Traders',
    accent: '#38bdf8',
    unit:    n => `${n > 0 ? '+' : ''}${n.toLocaleString()} ⟡`,
    subUnit: n => n > 0 ? 'net on the board' : n < 0 ? 'net loss' : 'break-even',
    valueColor: n => n > 0 ? '#7fd49a' : n < 0 ? '#e07070' : '#a09988',
  },
}

/** Canonical grouping of every board into a category — the single source of
 *  truth for the scalable board picker. Add a new board here (once) and it
 *  slots into the dropdown everywhere. */
export const LEADERBOARD_SECTIONS: { label: string; boards: BoardKey[] }[] = [
  { label: 'Achievements', boards: ['achievementPoints'] },
  { label: 'Fishing',      boards: ['perfectStreak', 'fishingLevel', 'species', 'trophies', 'fishSold'] },
  { label: 'Expeditions',  boards: ['raidProgress', 'expedition', 'bountyPoints', 'gauntletDepth', 'gauntletHardcore', 'gauntletDonsDepth', 'gauntletDonsHardcore', 'gauntletBigHit'] },
  { label: 'Charting',     boards: ['chartingPoints'] },
  { label: 'The Parlor',   boards: ['parlorPoints'] },
  { label: 'The Den',      boards: ['blackjack', 'fishSlots', 'roulette'] },
  { label: 'The Exchange', boards: ['exchangeWeek', 'exchangeNet'] },
]

/** Group a subset of boards into their sections (order preserved, empty
 *  sections dropped) — feeds the picker on both the page and the modal. */
export function groupBoards(boards: BoardKey[]): { label: string; boards: BoardKey[] }[] {
  const want = new Set(boards)
  return LEADERBOARD_SECTIONS
    .map(s => ({ label: s.label, boards: s.boards.filter(b => want.has(b)) }))
    .filter(s => s.boards.length > 0)
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
  /** Draw the top three as whole fishers on a stage instead of three ledger
   *  rows. The Achievement Points board: it is the one that asks who the
   *  best captain is, and the answer should be allowed to stand there. */
  stage?: boolean
  showZone?: boolean
  avatars: AvatarMap
  /** Optional per-row value text color from the score. When provided,
   *  used for ranks 4+ and the "you outside top 50" tile (top 3 keep
   *  their medal colors since those are positional indicators). */
  valueColor?: (n: number) => string
}

export function LeaderboardSection({ accent, unit, subUnit, data, myScore, currentUserId, stage = false, showZone, avatars, valueColor }: SectionProps) {
  const top3 = data.slice(0, 3)
  const rest = data.slice(3)
  const myRank = data.findIndex(e => e.user_id === currentUserId) + 1
  const inTop50 = myRank > 0

  return (
    <div>
      {data.length === 0 && (
        <p className="font-karla text-center py-10" style={{ color: 'rgba(230,215,180,0.45)', fontSize: '0.82rem', fontStyle: 'italic' }}>
          No names on this board yet. Be the first the sea remembers.
        </p>
      )}

      {/* ── THE STAGE ── the top three as whole fishers, when asked for. */}
      {stage && top3.length > 0 && (
        <PodiumStage top3={top3} accent={accent} unit={unit} currentUserId={currentUserId} avatars={avatars} />
      )}

      {/* Top 3 — drawn metal medallions, no rank stripes; the podium reads as
          the top of a harbor ledger. */}
      {!stage && top3.length > 0 && (
        <div style={{
          background: LEDGER_BG, border: LEDGER_BORDER,
          borderRadius: 14, overflow: 'hidden', marginBottom: 6,
          boxShadow: 'inset 0 1px 0 rgba(240,220,180,0.06)',
        }}>
          {top3.map((entry, i) => {
            const rank = (i + 1) as 1 | 2 | 3
            const isMe = entry.user_id === currentUserId
            const rankColor = ['#f0c040', '#c0c8d4', '#c47a3a'][i]
            return (
              <Link
                key={entry.user_id}
                href={`/u/${entry.username}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0.8rem 1rem',
                  borderBottom: i < top3.length - 1 ? LEDGER_RULE : 'none',
                  background: isMe ? `${accent}0d` : 'transparent',
                  textDecoration: 'none',
                }}
              >
                <RankMedallion rank={rank} size={rank === 1 ? 27 : 23} />
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
          background: LEDGER_BG, border: LEDGER_BORDER,
          borderRadius: 14, overflow: 'hidden',
          boxShadow: 'inset 0 1px 0 rgba(240,220,180,0.06)',
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
                  borderBottom: i < rest.length - 1 ? LEDGER_RULE : 'none',
                  background: isMe ? `${accent}0d` : 'transparent',
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                }}
              >
                <span className="font-cinzel font-600 shrink-0" style={{ width: 22, textAlign: 'right', fontSize: '0.66rem', color: 'rgba(196,169,106,0.5)' }}>
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
                  <p className="font-cinzel font-600" style={{ fontSize: '0.75rem', color: valueColor ? valueColor(entry.score) : (isMe ? accent : '#8a8072') }}>
                    {unit(entry.score)}
                  </p>
                  <p className="font-karla font-300" style={{ fontSize: '0.48rem', color: 'rgba(196,169,106,0.4)' }}>
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

// ── THE PODIUM ──────────────────────────────────────────────────────────────
//
// Three whole fishers: character, hat, boat, rod, reel, hook, pet, the same
// composite the profile and the gear screen draw, so a captain on the stage
// looks exactly as they look on their own page. Gold stands in the middle
// and a little taller; silver and bronze flank. Under each, the medallion,
// the name and the score, and the whole figure is the link to the profile.
//
// The glows are off (`noGlow`): three infinite drop-shadow loops for a
// decorative row is a real cost for a halo nobody would see at this size.
//
// It replaces the three ledger rows for the board it is on rather than
// sitting above them, because the rows would then say the same three names
// again directly underneath.
export function PodiumStage({ top3, accent, unit, currentUserId, avatars }: {
  top3: LeaderboardEntry[]
  accent: string
  unit: (n: number) => string
  currentUserId: string
  avatars: AvatarMap
}) {
  // Silver, gold, bronze left to right, so gold stands in the middle. A board
  // with fewer than three keeps the order and leaves the missing place empty.
  const order = [top3[1], top3[0], top3[2]]
  const rankOf = (e: LeaderboardEntry) => (top3.indexOf(e) + 1) as 1 | 2 | 3
  const METAL = ['#f0c040', '#c0c8d4', '#c47a3a']
  return (
    <div style={{
      background: LEDGER_BG, border: LEDGER_BORDER,
      borderRadius: 14, overflow: 'hidden', marginBottom: 6,
      boxShadow: 'inset 0 1px 0 rgba(240,220,180,0.06)',
      // NO BOTTOM PADDING AND NO COLUMN GAP: the three blocks have to meet
      // each other and the card's bottom edge, or they are three floating
      // bars rather than one stepped plinth.
      padding: '0.85rem 0.5rem 0',
      display: 'grid', gridTemplateColumns: '1fr 1.16fr 1fr', alignItems: 'end', gap: 0,
    }}>
      {order.map((entry, col) => {
        if (!entry) return <div key={`empty-${col}`} />
        const rank = rankOf(entry)
        const a = avatars[entry.user_id]
        const isMe = entry.user_id === currentUserId
        const gold = rank === 1
        const metal = METAL[rank - 1]
        // The step. Heights say first, second, third before any numeral does.
        const step = rank === 1 ? 46 : rank === 2 ? 34 : 26
        return (
          <Link key={entry.user_id} href={`/u/${entry.username}`} className="tap" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0,
            textDecoration: 'none', padding: '0 0.22rem',
          }}>
            {/*
              A FIXED WINDOW, NOT A NEGATIVE MARGIN.
              FisherPose reserves its whole 900x800 canvas and the figure sits
              in the bottom half of it. The first cut cropped that with
              `marginTop: -30%` -- and a percentage margin resolves against the
              container's WIDTH, so the three columns (one of them 1.16fr and
              wider) each pulled up by a different number of pixels and the
              three figures came out cropped to different heights and sitting
              at different levels. This is a window of fixed ASPECT instead: it
              crops identically at any column width.

              The maths, from the gear screen's measurement of the same sprite:
              dead space is 37.4% of width above the hat and 2.1% below the
              hull, and the whole canvas is 0.889x as tall as it is wide. That
              leaves the figure occupying 0.494w, so a window 0.52w tall holds
              it with a little air, and the pose is dropped 4% of that window's
              height to put the dead strip under the hull out of sight.
            */}
            <div style={{
              position: 'relative', width: '100%', aspectRatio: '1 / 0.52',
              overflow: 'hidden',
            }}>
              {/* A soft ground in the medal's colour so the figure is standing
                  ON something rather than floating over the ledger. */}
              <div aria-hidden style={{
                position: 'absolute', left: '6%', right: '6%', bottom: 0, height: '26%',
                borderRadius: '50%', zIndex: 1,
                background: `radial-gradient(ellipse at center, ${metal}3a 0%, transparent 70%)`,
              }} />
              <div style={{ position: 'absolute', left: 0, width: '100%', bottom: '-4%' }}>
                <FisherPose
                  characterColor={a?.characterColor ?? 'default'}
                  equippedHat={a?.equippedHat ?? null}
                  equippedBoat={a?.equippedBoat ?? null}
                  equippedPet={a?.equippedPet ?? null}
                  rodTier={a?.rodTier ?? 0}
                  reelTier={a?.reelTier ?? 0}
                  hookTier={a?.hookTier ?? 0}
                  noGlow
                />
              </div>
            </div>

            <p className="font-karla font-700 truncate" style={{
              fontSize: gold ? '0.84rem' : '0.74rem', color: isMe ? '#f0ede8' : '#c8c8c2',
              minWidth: 0, maxWidth: '100%', marginTop: 5,
            }}>
              {entry.username}
              {isMe && <span style={{ color: accent, fontSize: '0.55rem', marginLeft: 4 }}>you</span>}
            </p>
            <p className="font-cinzel font-700" style={{
              fontSize: gold ? '0.92rem' : '0.78rem', color: metal, marginTop: 1, marginBottom: 6,
            }}>
              {unit(entry.score)}
            </p>

            {/*
              THE BLOCK, AND THE NUMERAL IS ON IT.
              The numeral used to float over the head at `top: 30%` of the
              pose box -- which, after the crop above it, was off the top of
              the card, and the card clips. On the plinth is where a podium
              number actually goes, it cannot be clipped, and it gives the
              block something to be.
            */}
            <div style={{
              width: '100%', height: step,
              borderRadius: '3px 3px 0 0',
              background: `linear-gradient(180deg, ${metal}59 0%, ${metal}1f 100%)`,
              borderTop: `2px solid ${metal}cc`,
              borderLeft: `1px solid ${metal}33`, borderRight: `1px solid ${metal}33`,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 -8px 18px ${metal}1f`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RankMedallion rank={rank} size={gold ? 26 : 21} />
            </div>
          </Link>
        )
      })}
    </div>
  )
}
