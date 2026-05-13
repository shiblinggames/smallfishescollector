'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { searchUsers } from '@/app/u/actions'
import { addCrewMember, removeCrewMember, type CrewMember } from './actions'
import { getLevelFromXP as getFishingLevel } from '@/lib/fishingLevel'
import { getLevelFromXP as getNavLevel } from '@/lib/expeditionLevel'
import CharacterAvatar from '@/components/CharacterAvatar'
import ChallengeSection, { ChallengeButton } from './ChallengeSection'
import type { PendingChallenge } from './challengeActions'

interface SearchResult {
  username: string
}

interface Props {
  initialCrew: CrewMember[]
  username: string
  newFollowers: CrewMember[]
  initialChallenges: PendingChallenge[]
  wlRecord: { wins: number; losses: number; ties: number }
  myDoubloons: number
  myBait: number
}

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

export default function SocialClient({ initialCrew, username, newFollowers: initialNewFollowers, initialChallenges, wlRecord, myDoubloons, myBait }: Props) {
  const router = useRouter()
  const activeOpponents = new Set(
    initialChallenges
      .filter(c => ['pending', 'challenger_active', 'challenger_done', 'both_active', 'challenged_active'].includes(c.status))
      .map(c => c.isIncoming ? c.challengerUsername : c.challengedUsername)
  )
  const [crew, setCrew] = useState<CrewMember[]>(initialCrew)
  const [newFollowers, setNewFollowers] = useState(initialNewFollowers)
  const crewSet = new Set(crew.map(m => m.username.toLowerCase()))

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [pending, startTransition] = useTransition()
  const [loadingUsername, setLoadingUsername] = useState<string | null>(null)
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
      username: u, fishingXP: 0, expeditionXP: 0,
      characterColor: null, equippedHat: null, avatarBg: null, avatarBorder: null,
    })
  }

  function handleRemove(u: string) {
    setLoadingUsername(u)
    startTransition(async () => {
      await removeCrewMember(u)
      setCrew(prev => prev.filter(m => m.username.toLowerCase() !== u.toLowerCase()))
      setLoadingUsername(null)
    })
  }

  const totalChallenges = initialChallenges.length + wlRecord.wins + wlRecord.losses + wlRecord.ties

  return (
    <div className="px-6 max-w-xl mx-auto pb-14 flex flex-col gap-8">

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

      {/* ── 3. Your friends ── */}
      <div>
        <p className="font-karla font-700 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.58rem', color: '#7a7674' }}>
          Your friends{crew.length > 0 && ` · ${crew.length}`}
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
              Search for other players above to add them
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {crew.map(member => {
              const isLoading = loadingUsername === member.username
              return (
                <div
                  key={member.username}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '0.85rem 1rem',
                    background: 'rgba(6,12,20,0.78)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderTop: '1px solid rgba(255,255,255,0.16)',
                    borderRadius: 14,
                  }}
                >
                  <Link href={`/u/${member.username}`} style={{ flexShrink: 0, lineHeight: 0 }}>
                    <CrewAvatar member={member} size={48} />
                  </Link>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/u/${member.username}`}
                      className="font-cinzel font-700 truncate"
                      style={{ fontSize: '0.95rem', color: '#f0ede8', textDecoration: 'none', display: 'block' }}
                    >
                      {member.username}
                    </Link>
                    <LevelChips fishingXP={member.fishingXP} expeditionXP={member.expeditionXP} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <ChallengeButton username={member.username} myDoubloons={myDoubloons} onCreated={() => router.refresh()} hasActiveChallenge={activeOpponents.has(member.username)} />
                    <button
                      onClick={() => handleRemove(member.username)}
                      disabled={isLoading || pending}
                      aria-label={`Remove ${member.username}`}
                      style={{
                        width: 28, height: 28, borderRadius: 7, padding: 0,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                        color: '#6a6764', cursor: 'pointer', opacity: isLoading ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 4. Challenges (below friends) ── */}
      {totalChallenges > 0 && (
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.58rem', color: '#7a7674' }}>Challenges</p>
          <ChallengeSection challenges={initialChallenges} wlRecord={wlRecord} myDoubloons={myDoubloons} myBait={myBait} />
        </div>
      )}

    </div>
  )
}
