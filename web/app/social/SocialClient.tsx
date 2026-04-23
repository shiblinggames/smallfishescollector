'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { searchUsers } from '@/app/u/actions'
import { addCrewMember, removeCrewMember, type CrewMember } from './actions'

interface SearchResult {
  username: string
}

export default function SocialClient({ initialCrew }: { initialCrew: CrewMember[] }) {
  const [crew, setCrew] = useState<CrewMember[]>(initialCrew)
  const crewSet = new Set(crew.map(m => m.username.toLowerCase()))

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [pending, startTransition] = useTransition()
  const [loadingUsername, setLoadingUsername] = useState<string | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearched(true)
    const data = await searchUsers(query.trim())
    setResults(data)
    setSearching(false)
  }

  function handleAdd(username: string) {
    setLoadingUsername(username)
    startTransition(async () => {
      await addCrewMember(username)
      setCrew(prev => [...prev, { username, fotdStreak: 0 }])
      setLoadingUsername(null)
    })
  }

  function handleRemove(username: string) {
    setLoadingUsername(username)
    startTransition(async () => {
      await removeCrewMember(username)
      setCrew(prev => prev.filter(m => m.username.toLowerCase() !== username.toLowerCase()))
      setLoadingUsername(null)
    })
  }

  return (
    <div className="px-6 max-w-sm mx-auto flex flex-col gap-8 pb-24 sm:pb-12">

      {/* Search */}
      <div>
        <p className="sg-eyebrow mb-3" style={{ color: '#9a9488' }}>Find a Crew Member</p>
        <form onSubmit={handleSearch} className="flex gap-2 mb-3">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by username…"
            className="sg-input font-karla font-600 tracking-[0.08em] text-sm flex-1"
            style={{ padding: '0.5rem 1rem' }}
            spellCheck={false}
            maxLength={30}
          />
          <button type="submit" disabled={searching} className="btn-ghost text-xs shrink-0" style={{ padding: '0 1rem' }}>
            {searching ? '…' : 'Search'}
          </button>
        </form>

        {searched && !searching && results.length === 0 && (
          <p className="font-karla font-300 text-[#6a6764] text-sm">No crew found.</p>
        )}

        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            {results.map(r => {
              const inCrew = crewSet.has(r.username.toLowerCase())
              const isLoading = loadingUsername === r.username
              return (
                <div
                  key={r.username}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <Link href={`/u/${r.username}`} className="font-cinzel font-700 text-[#f0ede8] hover:text-[#f0c040] transition-colors" style={{ fontSize: '0.85rem' }}>
                    {r.username}
                  </Link>
                  <button
                    onClick={() => inCrew ? handleRemove(r.username) : handleAdd(r.username)}
                    disabled={isLoading || pending}
                    className="font-karla font-600 uppercase tracking-[0.10em] transition-colors disabled:opacity-40"
                    style={{ fontSize: '0.6rem', color: inCrew ? '#6a6764' : '#f0c040' }}
                  >
                    {isLoading ? '…' : inCrew ? 'Remove' : '+ Add'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Crew list */}
      <div>
        <p className="sg-eyebrow mb-3" style={{ color: '#9a9488' }}>
          Your Crew {crew.length > 0 && `· ${crew.length}`}
        </p>

        {crew.length === 0 ? (
          <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.82rem' }}>
            No crew yet — search for players above to add them.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {crew.map(member => {
              const isLoading = loadingUsername === member.username
              return (
                <div
                  key={member.username}
                  className="flex items-center justify-between px-4 py-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/u/${member.username}`}
                      className="font-cinzel font-700 text-[#f0ede8] hover:text-[#f0c040] transition-colors"
                      style={{ fontSize: '0.85rem' }}
                    >
                      {member.username}
                    </Link>
                    {member.fotdStreak > 0 && (
                      <span className="font-karla text-[#f0c040]" style={{ fontSize: '0.65rem' }}>
                        {member.fotdStreak}d streak
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemove(member.username)}
                    disabled={isLoading || pending}
                    className="font-karla font-600 uppercase tracking-[0.10em] text-[#6a6764] hover:text-[#f87171] transition-colors disabled:opacity-40"
                    style={{ fontSize: '0.6rem' }}
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
