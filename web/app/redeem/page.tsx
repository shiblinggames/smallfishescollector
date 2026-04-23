'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { createClient } from '@/lib/supabase/client'

export default function RedeemPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const normalized = code.trim().toUpperCase()

    const { data: row, error } = await supabase
      .from('redemption_codes')
      .select('id, redeemed_by, packs_granted')
      .eq('code', normalized)
      .single()

    if (error || !row) {
      setStatus('error')
      setMessage('Code not found. Double-check and try again.')
      return
    }
    if (row.redeemed_by) {
      setStatus('error')
      setMessage('This code has already been redeemed.')
      return
    }

    const { error: updateCodeErr } = await supabase
      .from('redemption_codes')
      .update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updateCodeErr) {
      setStatus('error')
      setMessage('Something went wrong. Please try again.')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('packs_available')
      .eq('id', user.id)
      .single()

    await supabase
      .from('profiles')
      .update({ packs_available: (profile?.packs_available ?? 0) + row.packs_granted })
      .eq('id', user.id)

    setStatus('success')
    setMessage(`✦ ${row.packs_granted} pack${row.packs_granted > 1 ? 's' : ''} added to your account.`)
    setCode('')
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 flex items-center justify-center px-6 pb-24 sm:pb-0">
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

            <button type="submit" disabled={status === 'loading'} className="btn-gold w-full">
              {status === 'loading' ? 'Checking…' : 'Redeem Code'}
            </button>

            {status === 'success' && (
              <button type="button" onClick={() => router.push('/packs')} className="btn-ghost w-full">
                Open Your Pack
              </button>
            )}
          </form>
        </div>
      </main>
    </div>
  )
}
