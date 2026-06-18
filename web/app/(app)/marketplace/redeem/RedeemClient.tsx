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
      <input
        type="text"
        required
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="font-karla font-700 tracking-[0.22em] text-center uppercase"
        placeholder="FISH-XXXXX"
        spellCheck={false}
        style={{
          width: '100%', padding: '0.8rem 0.75rem', borderRadius: 11,
          background: 'rgba(4,7,12,0.7)',
          border: '1px solid rgba(196,169,106,0.32)',
          color: '#f4ecd8', fontSize: '0.95rem', outline: 'none',
        }}
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="font-karla font-700 uppercase tracking-[0.12em]"
        style={{
          width: '100%', padding: '0.8rem', borderRadius: 11,
          background: 'linear-gradient(180deg, rgba(240,192,64,0.28) 0%, rgba(240,192,64,0.14) 100%)',
          border: '1px solid rgba(240,192,64,0.6)',
          color: '#f0c040', fontSize: '0.8rem',
          cursor: status === 'loading' ? 'default' : 'pointer',
          opacity: status === 'loading' ? 0.6 : 1,
          boxShadow: '0 2px 10px rgba(240,192,64,0.14), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        {status === 'loading' ? 'Redeeming…' : 'Redeem Code'}
      </button>
      {status === 'success' && (
        <p className="font-karla font-600 text-[#f0c040] text-xs text-center">{message}</p>
      )}
      {status === 'error' && (
        <p className="font-karla font-300 text-red-400 text-xs text-center">{message}</p>
      )}
    </form>
  )
}
