'use client'

import { useState, useEffect } from 'react'
import { searchUsers } from '@/app/u/actions'
import Link from 'next/link'

const LAST_QUERY_KEY = 'sf-last-crew-search'

interface Result {
  username: string
}

export default function FriendSearch() {
  const [query, setQuery] = useState('')
  const [lastQuery, setLastQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(LAST_QUERY_KEY)
    if (saved) setLastQuery(saved)
  }, [])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setSearched(true)
    setLastQuery(query.trim())
    localStorage.setItem(LAST_QUERY_KEY, query.trim())
    const data = await searchUsers(query.trim())
    setResults(data)
    setLoading(false)
  }

  return (
    <div className="sg-card px-5 py-3 space-y-2">
      <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764]" style={{ fontSize: '0.65rem' }}>Find a Crew Member</p>
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="username"
          className="sg-input font-karla font-600 tracking-[0.12em] text-sm flex-1"
          style={{ padding: '0.5rem 1rem' }}
          spellCheck={false}
          maxLength={30}
        />
        <button type="submit" disabled={loading} className="btn-ghost text-xs shrink-0" style={{ padding: '0 1rem' }}>
          {loading ? '…' : 'Search'}
        </button>
      </form>

      {lastQuery && !loading && (
        <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.65rem' }}>
          Last search: <span className="text-[#a0a09a]">{lastQuery}</span>
        </p>
      )}

      {searched && !loading && results.length === 0 && (
        <p className="font-karla font-300 text-[#6a6764] text-xs">No crew found.</p>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {results.map(r => (
            <Link
              key={r.username}
              href={`/u/${r.username}`}
              className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.13)' }}
            >
              <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '0.8rem' }}>{r.username}</p>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4a4845" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
