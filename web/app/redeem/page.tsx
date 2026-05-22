'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { redeemCode } from '@/app/marketplace/redeem/actions'

export default function RedeemPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    // The server action validates the code, claims it atomically, and deposits
    // gems via service role (client-side profile writes are blocked by RLS).
    const result = await redeemCode(code)

    if (result.success) {
      setStatus('success')
      setMessage(result.message)
      setCode('')
    } else {
      setStatus('error')
      setMessage(result.message)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 flex flex-col items-center px-6 pt-14 pb-24 sm:pb-14">
        <div className="w-full max-w-sm">
          <p className="sg-eyebrow text-center mb-4">Pack Code</p>
          <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-10"
              style={{ fontSize: 'clamp(2rem, 5vw, 3rem)' }}>
            Redeem.
          </h1>

          <form onSubmit={handleSubmit} className="sg-card p-8 space-y-6">
            {status === 'success' && (
              <div className="border border-[rgba(240,192,64,0.38)] bg-[rgba(240,192,64,0.06)] px-4 py-3 text-sm font-karla font-600 text-[#f0c040] text-center tracking-wide">
                {message}
              </div>
            )}
            {status === 'error' && (
              <p className="text-sm font-karla border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400">
                {message}
              </p>
            )}

            <div className="space-y-1.5">
              <label className="sg-eyebrow block">Enter Code</label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="sg-input font-karla font-600 tracking-[0.20em] text-center text-base uppercase"
                placeholder="FISH-XXXXX"
                spellCheck={false}
              />
            </div>

            <button type="submit" disabled={status === 'loading'} className="btn-ghost w-full">
              {status === 'loading' ? 'Checking…' : 'Redeem Code'}
            </button>

            {status === 'success' && (
              <button type="button" onClick={() => router.push('/packs')} className="btn-ghost w-full">
                Recruit Crew
              </button>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
