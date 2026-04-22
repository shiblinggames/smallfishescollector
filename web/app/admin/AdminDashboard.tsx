'use client'

import { useActionState, useRef } from 'react'
import { generateTokens } from './actions'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://smallfishescollector.vercel.app'

type Result = { email: string; packs: number; token: string }
type State = { results: Result[]; error?: string }

const INITIAL: State = { results: [] }

export default function AdminDashboard() {
  const [state, action, pending] = useActionState(generateTokens, INITIAL)
  const copiedRef = useRef(false)

  function claimUrl(token: string) {
    return `${BASE_URL}/claim?token=${token}`
  }

  function copyAll() {
    const text = state.results
      .map((r) => `${r.email}\t${r.packs} pack${r.packs !== 1 ? 's' : ''}\t${claimUrl(r.token)}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    copiedRef.current = true
  }

  return (
    <div className="space-y-8">
      <form action={action} className="sg-card p-8 space-y-6">
        <div className="space-y-1.5">
          <label className="sg-eyebrow block">Bulk Input</label>
          <p className="font-karla font-300 text-[#8a8880] text-xs mb-2">
            One customer per line: <span className="text-[#f0ede8]">email, packs</span>
          </p>
          <textarea
            name="bulk"
            required
            rows={10}
            className="sg-input font-karla text-sm leading-relaxed resize-y"
            placeholder={"customer1@gmail.com, 3\ncustomer2@gmail.com, 5\nbacker@email.com, 10"}
            spellCheck={false}
          />
        </div>
        {state.error && (
          <p className="text-sm font-karla border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400">
            {state.error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn-gold w-full">
          {pending ? 'Generating…' : 'Generate Links'}
        </button>
      </form>

      {state.results.length > 0 && (
        <div className="sg-card p-8 space-y-4">
          <div className="flex items-center justify-between">
            <p className="sg-eyebrow">{state.results.length} links generated</p>
            <button onClick={copyAll} className="btn-ghost text-xs px-4 py-2">
              Copy All (TSV)
            </button>
          </div>
          <div className="space-y-2">
            {state.results.map((r) => (
              <div key={r.token} className="flex items-center gap-3 border border-[rgba(255,255,255,0.06)] px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-karla font-400 text-[#f0ede8] text-sm truncate">{r.email}</p>
                  <p className="font-karla font-300 text-[#8a8880] text-xs truncate">{claimUrl(r.token)}</p>
                </div>
                <span className="font-karla font-600 text-[#f0c040] text-sm shrink-0">
                  {r.packs}p
                </span>
                <button
                  onClick={() => navigator.clipboard.writeText(claimUrl(r.token))}
                  className="font-karla font-600 text-[0.65rem] uppercase tracking-[0.10em] text-[#8a8880] hover:text-[#f0ede8] transition-colors shrink-0"
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
