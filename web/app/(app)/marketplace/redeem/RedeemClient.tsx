'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { redeemCode } from './actions'

export default function RedeemClient() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    setMessage('')

    const result = await redeemCode(code)

    if (result.success) {
      setStatus('success')
      setMessage(result.message)
      setCode('')
      router.refresh()
    } else {
      setStatus('error')
      setMessage(result.message)
    }
  }

  return (
    <form onSubmit={handleRedeem} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="sg-input font-karla font-600 tracking-[0.16em] text-center text-sm uppercase flex-1"
          placeholder="FISH-XXXXX"
          spellCheck={false}
        />
        <button type="submit" disabled={status === 'loading'} className="btn-ghost shrink-0" style={{ padding: '0 1.25rem' }}>
          {status === 'loading' ? '…' : 'Redeem'}
        </button>
      </div>
      {status === 'success' && (
        <p className="font-karla font-600 text-[#f0c040] text-xs">{message}</p>
      )}
      {status === 'error' && (
        <p className="font-karla font-300 text-red-400 text-xs">{message}</p>
      )}
    </form>
  )
}
