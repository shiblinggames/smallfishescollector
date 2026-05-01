'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { searchUsers } from '@/app/u/actions'
import { addCrewMember, removeCrewMember, type CrewMember } from './actions'
import { getLevelFromXP } from '@/lib/fishingLevel'
import ChallengeSection, { ChallengeButton } from './ChallengeSection'
import type { PendingChallenge } from './challengeActions'

interface SearchResult {
  username: string
}

interface Props {
  initialCrew: CrewMember[]
  username: string
  initialChallenges: PendingChallenge[]
  wlRecord: { wins: number; losses: number; ties: number }
  myDoubloons: number
}

const AVATAR_COLORS = ['#0e7490', '#0d9488', '#7c3aed', '#b45309', '#0369a1', '#be185d']
function avatarColor(str: string) {
  let h = 0
  for (const c of str) h = c.charCodeAt(0) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function Avatar({ username, size = 40 }: { username: string; size?: number }) {
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

export default function SocialClient({ initialCrew, username, initialChallenges, wlRecord, myDoubloons }: Props) {
  const router = useRouter()
  const [crew, setCrew] = useState<CrewMember[]>(initialCrew)
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

  function handleAdd(u: string) {
    setLoadingUsername(u)
    startTransition(async () => {
      await addCrewMember(u)
      setCrew(prev => [...prev, { username: u, fishingXP: 0 }])
      setAddedSet(prev => new Set(prev).add(u.toLowerCase()))
      setLoadingUsername(null)
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

  return (
    <div className="px-6 max-w-xl mx-auto pb-14 flex flex-col gap-10">

      {/* ── Challenges ── */}
      {(initialChallenges.length > 0 || wlRecord.wins + wlRecord.losses + wlRecord.ties > 0) && (
        <div>
          <p className="font-karla font-600 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.55rem', color: '#9a9488' }}>Challenges</p>
          <ChallengeSection challenges={initialChallenges} wlRecord={wlRecord} myDoubloons={myDoubloons} />
        </div>
      )}

      {/* ── Find crew ── */}
      <div>
        <p className="font-karla font-600 uppercase tracking-[0.14em] mb-3" style={{ fontSize: '0.55rem', color: '#9a9488' }}>
          Find a Crew Member
        </p>

        {/* Search input */}
        <div style={{ position: 'relative' }}>
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="rgba(255,255,255,0.3)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
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
            style={{ paddingLeft: '2.4rem', paddingRight: query ? '2.4rem' : '1rem', fontSize: '0.88rem' }}
            spellCheck={false}
            maxLength={30}
            autoComplete="off"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setSearched(false) }}
              style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 2,
              }}
            >×</button>
          )}
        </div>

        {/* Results */}
        {query.trim() && (
          <div style={{ marginTop: 8 }}>
            {searching && (
              <p className="font-karla font-300" style={{ fontSize: '0.72rem', color: '#4a4845', padding: '0.5rem 0' }}>Searching…</p>
            )}
            {searched && !searching && results.length === 0 && (
              <p className="font-karla font-300" style={{ fontSize: '0.72rem', color: '#4a4845', padding: '0.5rem 0' }}>No players found.</p>
            )}
            {results.length > 0 && (
              <div style={{ background: 'rgba(4,10,20,0.8)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, overflow: 'hidden' }}>
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
                        padding: '0.75rem 1rem',
                        borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                      }}
                    >
                      <Avatar username={r.username} size={36} />
                      <Link
                        href={`/u/${r.username}`}
                        className="flex-1 font-cinzel font-700"
                        style={{ fontSize: '0.82rem', color: '#f0ede8', textDecoration: 'none' }}
                      >
                        {r.username}
                      </Link>
                      {isMe ? (
                        <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#4a4845' }}>You</span>
                      ) : inCrew || justAdded ? (
                        <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: '#34d399' }}>In crew ✓</span>
                      ) : (
                        <button
                          onClick={() => handleAdd(r.username)}
                          disabled={isLoading || pending}
                          className="font-karla font-700 uppercase tracking-[0.1em]"
                          style={{
                            fontSize: '0.55rem', padding: '0.3rem 0.75rem', borderRadius: 8,
                            background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.35)',
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

      {/* ── Your crew ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#9a9488' }}>
            Your Friends{crew.length > 0 && ` · ${crew.length}`}
          </p>
        </div>

        {crew.length === 0 ? (
          <div style={{
            background: 'rgba(4,10,20,0.5)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14, padding: '2rem 1.5rem', textAlign: 'center',
          }}>
            <p className="font-karla font-600" style={{ fontSize: '0.82rem', color: '#4a4845', marginBottom: 6 }}>
              No crew yet
            </p>
            <p className="font-karla font-300" style={{ fontSize: '0.72rem', color: '#3a3835', lineHeight: 1.5 }}>
              Search for other players above to add them
            </p>
          </div>
        ) : (
          <div style={{ background: 'rgba(4,10,20,0.6)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
            {crew.map((member, i) => {
              const isLoading = loadingUsername === member.username
              return (
                <div
                  key={member.username}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '0.8rem 1rem',
                    borderBottom: i < crew.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                  }}
                >
                  <Avatar username={member.username} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/u/${member.username}`}
                      className="font-cinzel font-700"
                      style={{ fontSize: '0.88rem', color: '#f0ede8', textDecoration: 'none', display: 'block' }}
                    >
                      {member.username}
                    </Link>
                    <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#f0c04077', marginTop: 2, display: 'block' }}>
                      Lv {getLevelFromXP(member.fishingXP)}
                    </span>
                  </div>
                  <ChallengeButton username={member.username} myDoubloons={myDoubloons} onCreated={() => router.refresh()} />
                  <Link
                    href={`/u/${member.username}`}
                    className="font-karla font-600"
                    style={{ fontSize: '0.6rem', color: '#4a4845', textDecoration: 'none', flexShrink: 0 }}
                  >
                    View →
                  </Link>
                  <button
                    onClick={() => handleRemove(member.username)}
                    disabled={isLoading || pending}
                    className="font-karla font-600"
                    style={{
                      fontSize: '0.6rem', color: '#3a3835', background: 'none', border: 'none',
                      cursor: 'pointer', opacity: isLoading ? 0.5 : 1, flexShrink: 0,
                      padding: '0.25rem 0.4rem',
                    }}
                  >
                    {isLoading ? '…' : 'Remove'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
