'use client'

import { useState, useEffect, useTransition } from 'react'
import Link from 'next/link'
import { searchUsers } from '@/app/(app)/u/actions'
import { addCrewMember, removeCrewMember, type CrewMember } from './actions'
import { getLevelFromXP as getFishingLevel } from '@/lib/fishingLevel'
import { getLevelFromXP as getNavLevel } from '@/lib/expeditionLevel'
import CharacterAvatar from '@/components/CharacterAvatar'
import CrewSummarySheet from './CrewSummarySheet'

interface SearchResult {
  username: string
}

interface Props {
  initialCrew: CrewMember[]
  me: CrewMember
  username: string
  newFollowers: CrewMember[]
}

// Stats the crew leaderboard can rank by. All comparable head-to-head.
type LbKey = 'fishing' | 'nav' | 'streak' | 'species'
const LB_STATS: { key: LbKey; label: string; color: string; value: (m: CrewMember) => number; fmt: (v: number) => string }[] = [
  { key: 'fishing', label: 'Fishing', color: '#c4a96a', value: m => getFishingLevel(m.fishingXP),  fmt: v => `Lv ${v}` },
  { key: 'nav',     label: 'Nav',     color: '#7090c0', value: m => getNavLevel(m.expeditionXP),    fmt: v => `Lv ${v}` },
  { key: 'streak',  label: 'Streak',  color: '#fb923c', value: m => m.highestPerfectStreak,         fmt: v => `${v}×` },
  { key: 'species', label: 'Species', color: '#34d399', value: m => m.species,                      fmt: v => `${v}` },
]

/** Render the player's CharacterAvatar with sensible defaults for fields
 *  that might be null on legacy accounts. */
function CrewAvatar({ member, size = 44 }: { member: CrewMember; size?: number }) {
  return (
    <CharacterAvatar
      characterColor={member.characterColor}
      equippedHat={member.equippedHat}
      bgColor={member.avatarBg ?? undefined}
      ringColor={member.avatarBorder ?? undefined}
      size={size}
    />
  )
}

/** Two-level stat chip: fishing level + nav level side-by-side. */
function LevelChips({ fishingXP, expeditionXP }: { fishingXP: number; expeditionXP: number }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
      <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#c4a96a', whiteSpace: 'nowrap' }}>
        <span style={{ color: '#7a7674', marginRight: 4 }}>FISH</span>Lv {getFishingLevel(fishingXP)}
      </span>
      <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#7090c0', whiteSpace: 'nowrap' }}>
        <span style={{ color: '#7a7674', marginRight: 4 }}>NAV</span>Lv {getNavLevel(expeditionXP)}
      </span>
    </div>
  )
}

export default function SocialClient({ initialCrew, me, username, newFollowers: initialNewFollowers }: Props) {
  const [lbStat, setLbStat] = useState<LbKey>('fishing')
  const [crew, setCrew] = useState<CrewMember[]>(initialCrew)
  const [newFollowers, setNewFollowers] = useState(initialNewFollowers)
  const crewSet = new Set(crew.map(m => m.username.toLowerCase()))

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [pending, startTransition] = useTransition()
  const [loadingUsername, setLoadingUsername] = useState<string | null>(null)
  /** Whose summary sheet is open. Held as a USERNAME rather than the row object
   *  so the sheet keeps showing live data after a refresh reorders the board. */
  const [openMember, setOpenMember] = useState<string | null>(null)
  const [addedSet, setAddedSet] = useState<Set<string>>(new Set())

  // Debounced search as you type
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setSearched(false)
      return
    }
    const id = setTimeout(async () => {
      setSearching(true)
      const data = await searchUsers(trimmed)
      setResults(data)
      setSearched(true)
      setSearching(false)
    }, 380)
    return () => clearTimeout(id)
  }, [query])

  function handleAdd(member: CrewMember) {
    setLoadingUsername(member.username)
    startTransition(async () => {
      await addCrewMember(member.username)
      setCrew(prev => [...prev, member])
      setAddedSet(prev => new Set(prev).add(member.username.toLowerCase()))
      setLoadingUsername(null)
    })
  }

  function handleAddByUsername(u: string) {
    // Search result rows only carry a username — we don't have avatar data
    // for them, so add a placeholder CrewMember; it'll get refreshed next
    // page load via getCrew().
    handleAdd({
      username: u, fishingXP: 0, expeditionXP: 0, highestPerfectStreak: 0, species: 0,
      characterColor: null, equippedHat: null, avatarBg: null, avatarBorder: null,
    })
  }

  function handleRemove(u: string) {
    setLoadingUsername(u)
    startTransition(async () => {
      await removeCrewMember(u)
      setCrew(prev => prev.filter(m => m.username.toLowerCase() !== u.toLowerCase()))
      setLoadingUsername(null)
      // Close the sheet the removal was fired from — leaving it open on someone
      // who is no longer in the crew is the one state it must never sit in.
      setOpenMember(null)
    })
  }


  return (
    <div className="page-col pb-14 flex flex-col gap-8">

      {/* ── 1. Find a crew member (top) ── */}
      <div>
        <p className="font-karla font-700 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.58rem', color: '#7a7674' }}>
          Find a crew member
        </p>

        <div style={{ position: 'relative' }}>
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.32)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by username…"
            className="sg-input font-karla font-600 w-full"
            style={{ paddingLeft: '2.4rem', paddingRight: query ? '2.4rem' : '1rem', fontSize: '0.9rem' }}
            spellCheck={false}
            maxLength={30}
            autoComplete="off"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setSearched(false) }}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.36)', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: '1.05rem', lineHeight: 1, padding: 2,
              }}
            >×</button>
          )}
        </div>

        {query.trim() && (
          <div style={{ marginTop: 10 }}>
            {searching && (
              <p className="font-karla font-300" style={{ fontSize: '0.74rem', color: '#5a5856', padding: '0.5rem 0' }}>Searching…</p>
            )}
            {searched && !searching && results.length === 0 && (
              <p className="font-karla font-300" style={{ fontSize: '0.74rem', color: '#5a5856', padding: '0.5rem 0' }}>No players found.</p>
            )}
            {results.length > 0 && (
              <div style={{ background: 'rgba(6,12,20,0.78)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 12, overflow: 'hidden' }}>
                {results.map((r, i) => {
                  const inCrew = crewSet.has(r.username.toLowerCase())
                  const justAdded = addedSet.has(r.username.toLowerCase())
                  const isLoading = loadingUsername === r.username
                  const isMe = r.username.toLowerCase() === username.toLowerCase()
                  return (
                    <div
                      key={r.username}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '0.7rem 1rem',
                        borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      }}
                    >
                      <Link
                        href={`/u/${r.username}`}
                        className="flex-1 font-cinzel font-700"
                        style={{ fontSize: '0.86rem', color: '#f0ede8', textDecoration: 'none' }}
                      >
                        {r.username}
                      </Link>
                      {isMe ? (
                        <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: '#5a5856' }}>You</span>
                      ) : inCrew || justAdded ? (
                        <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.55rem', color: '#34d399' }}>✓ Friend</span>
                      ) : (
                        <button
                          onClick={() => handleAddByUsername(r.username)}
                          disabled={isLoading || pending}
                          className="font-karla font-700 uppercase tracking-[0.1em]"
                          style={{
                            fontSize: '0.58rem', padding: '0.32rem 0.8rem', borderRadius: 8,
                            background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.4)',
                            color: '#f0c040', cursor: 'pointer', opacity: isLoading ? 0.5 : 1,
                          }}
                        >
                          {isLoading ? '…' : '+ Add'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 2. Added you (pending follow-backs) ── */}
      {newFollowers.length > 0 && (
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.58rem', color: '#f0c040' }}>
            Added you · {newFollowers.length}
          </p>
          <div style={{ background: 'rgba(240,192,64,0.04)', border: '1px solid rgba(240,192,64,0.18)', borderRadius: 14, overflow: 'hidden' }}>
            {newFollowers.map((f, i) => (
              <div
                key={f.username}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '0.85rem 1rem',
                  borderBottom: i < newFollowers.length - 1 ? '1px solid rgba(240,192,64,0.10)' : 'none',
                }}
              >
                <CrewAvatar member={f} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={`/u/${f.username}`}
                    className="font-cinzel font-700 truncate"
                    style={{ fontSize: '0.92rem', color: '#f0ede8', textDecoration: 'none', display: 'block' }}
                  >
                    {f.username}
                  </Link>
                  <LevelChips fishingXP={f.fishingXP} expeditionXP={f.expeditionXP} />
                </div>
                <button
                  onClick={() => {
                    startTransition(async () => {
                      await addCrewMember(f.username)
                      setCrew(prev => [...prev, f])
                      setNewFollowers(prev => prev.filter(n => n.username !== f.username))
                    })
                  }}
                  disabled={pending}
                  className="font-karla font-700 uppercase tracking-[0.1em]"
                  style={{
                    fontSize: '0.58rem', padding: '0.4rem 0.85rem', borderRadius: 8, flexShrink: 0,
                    background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.4)',
                    color: '#f0c040', cursor: 'pointer', opacity: pending ? 0.5 : 1,
                  }}
                >
                  + Add Back
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3. Crew leaderboard (you + friends, ranked) ── */}
      <div>
        <p className="font-karla font-700 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.58rem', color: '#7a7674' }}>
          Crew Leaderboard{crew.length > 0 && ` · ${crew.length + 1}`}
        </p>

        {crew.length === 0 ? (
          <div style={{
            background: 'rgba(6,12,20,0.6)', border: '1px dashed rgba(255,255,255,0.10)',
            borderRadius: 14, padding: '1.75rem 1.5rem', textAlign: 'center',
          }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#8a8480', marginBottom: 6 }}>
              No friends yet
            </p>
            <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: '#5a5856', lineHeight: 1.5 }}>
              Add other players above to see how you stack up
            </p>
          </div>
        ) : (() => {
          const lb = LB_STATS.find(s => s.key === lbStat)!
          const myVal = lb.value(me)
          const board = [{ m: me, isMe: true }, ...crew.map(m => ({ m, isMe: false }))]
            .sort((a, b) => lb.value(b.m) - lb.value(a.m))
          return (
            <>
              {/* Stat selector */}
              <div className="flex gap-2 mb-3 flex-wrap">
                {LB_STATS.map(s => {
                  const active = lbStat === s.key
                  return (
                    <button key={s.key} onClick={() => setLbStat(s.key)}
                      className="font-karla font-700 uppercase tracking-[0.1em]"
                      style={{
                        fontSize: '0.56rem', padding: '0.32rem 0.7rem', borderRadius: 999, cursor: 'pointer',
                        background: active ? `${s.color}22` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${active ? s.color + '66' : 'rgba(255,255,255,0.1)'}`,
                        color: active ? s.color : '#7a7674',
                      }}>
                      {s.label}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {board.map(({ m, isMe }, i) => {
                  const rank = i + 1
                  const rankColor = rank === 1 ? '#f0c040' : rank === 2 ? '#c6ccd4' : rank === 3 ? '#cd7f32' : '#6a6764'
                  const val = lb.value(m)
                  const delta = val - myVal
                  return (
                    <div key={m.username || 'me'} style={{
                      display: 'flex', flexDirection: 'column', gap: 8,
                      padding: '0.7rem 0.85rem',
                      background: isMe ? 'rgba(240,192,64,0.07)' : 'rgba(6,12,20,0.78)',
                      border: `1px solid ${isMe ? 'rgba(240,192,64,0.3)' : 'rgba(255,255,255,0.10)'}`,
                      borderTop: `1px solid ${isMe ? 'rgba(240,192,64,0.42)' : 'rgba(255,255,255,0.16)'}`,
                      borderRadius: 14,
                    }}>
                      {/* The WHOLE row opens their sheet. It used to be three
                          separate targets — avatar, name, and an X that removed
                          them — competing inside 44px of height, so the tap that
                          meant "who is this" could just as easily drop them. One
                          row, one action; the sheet owns everything else. */}
                      <div
                        onClick={isMe ? undefined : () => setOpenMember(m.username)}
                        role={isMe ? undefined : 'button'}
                        tabIndex={isMe ? undefined : 0}
                        onKeyDown={isMe ? undefined : e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenMember(m.username) } }}
                        aria-label={isMe ? undefined : `${m.username}, tap for their summary`}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: isMe ? 'default' : 'pointer', touchAction: 'manipulation' }}
                      >
                        <span className="font-cinzel font-700" style={{ width: 18, textAlign: 'center', fontSize: '0.82rem', color: rankColor, flexShrink: 0 }}>{rank}</span>
                        <div style={{ flexShrink: 0, lineHeight: 0 }}><CrewAvatar member={m} size={44} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="flex items-center gap-1.5">
                            <span className="font-cinzel font-700 truncate" style={{ fontSize: '0.92rem', color: '#f0ede8' }}>{m.username || 'You'}</span>
                            {isMe && <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: '#f0c040', flexShrink: 0 }}>You</span>}
                          </div>
                          <LevelChips fishingXP={m.fishingXP} expeditionXP={m.expeditionXP} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, lineHeight: 1.15 }}>
                          <span className="font-cinzel font-700" style={{ fontSize: '0.98rem', color: lb.color }}>{lb.fmt(val)}</span>
                          {!isMe && (
                            delta === 0
                              ? <span className="font-karla font-600 uppercase tracking-[0.06em]" style={{ fontSize: '0.5rem', color: '#6a6764' }}>tied with you</span>
                              : <span className="font-karla font-700" style={{ fontSize: '0.52rem', color: delta > 0 ? '#4ade80' : '#f87171' }}>{delta > 0 ? `▲ ${delta}` : `▼ ${Math.abs(delta)}`} vs you</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )
        })()}
      </div>

      {/* The sheet, resolved from the LIVE crew each render so it can never show
          a stale copy of somebody, and dropped the moment they leave the crew. */}
      {(() => {
        if (!openMember) return null
        const idx = crew.findIndex(c => c.username.toLowerCase() === openMember.toLowerCase())
        if (idx === -1) return null
        const member = crew[idx]
        // Rank on the stat currently being compared, counting me, so the sheet
        // agrees with the row the captain just tapped.
        const lb = LB_STATS.find(s => s.key === lbStat)!
        const ordered = [me, ...crew].sort((a, b) => lb.value(b) - lb.value(a))
        const rank = ordered.findIndex(c => c.username === member.username) + 1
        return (
          <CrewSummarySheet
            member={member}
            me={me}
            rank={rank}
            crewSize={crew.length + 1}
            stats={LB_STATS}
            busy={loadingUsername === member.username || pending}
            onRemove={() => handleRemove(member.username)}
            onClose={() => setOpenMember(null)}
          />
        )
      })()}
    </div>
  )
}
