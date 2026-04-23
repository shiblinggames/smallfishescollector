'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MarketRedeemBar() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleRedeem(e: React.FormEvent) {
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

    if (error || !row) { setStatus('error'); setMessage('Code not found. Double-check and try again.'); return }
    if (row.redeemed_by) { setStatus('error'); setMessage('This code has already been redeemed.'); return }

    const { error: updateErr } = await supabase
      .from('redemption_codes')
      .update({ redeemed_by: user.id, redeemed_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updateErr) { setStatus('error'); setMessage('Something went wrong. Please try again.'); return }

    const { data: profile } = await supabase.from('profiles').select('packs_available').eq('id', user.id).single()
    await supabase.from('profiles').update({ packs_available: (profile?.packs_available ?? 0) + row.packs_granted }).eq('id', user.id)

    setStatus('success')
    setMessage(`✦ ${row.packs_granted} pack${row.packs_granted > 1 ? 's' : ''} added to your account.`)
    setCode('')
    router.refresh()
  }

  return (
    <div className="sg-card px-5 py-3 space-y-2">
      <p className="font-karla font-600 uppercase tracking-[0.12em] text-[#6a6764]" style={{ fontSize: '0.65rem' }}>Pack Code</p>
      <form onSubmit={handleRedeem} className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="FISH-XXXXX"
          className="sg-input font-karla font-600 tracking-[0.16em] text-center text-sm uppercase flex-1"
          style={{ padding: '0.5rem 1rem' }}
          spellCheck={false}
          maxLength={30}
        />
        <button type="submit" disabled={status === 'loading'} className="btn-ghost text-xs shrink-0" style={{ padding: '0 1rem' }}>
          {status === 'loading' ? '…' : 'Redeem'}
        </button>
      </form>
      {status === 'success' && (
        <p className="font-karla font-600 text-[#f0c040] text-xs">{message}</p>
      )}
      {status === 'error' && (
        <p className="font-karla font-300 text-red-400 text-xs">{message}</p>
      )}
    </div>
  )
}
