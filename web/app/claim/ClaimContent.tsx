'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Status = 'loading' | 'success' | 'needs_login' | 'error'

export default function ClaimContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  const [status, setStatus] = useState<Status>('loading')
  const [packs, setPacks] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMsg('This link is invalid.')
      return
    }

    async function claim() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setStatus('needs_login')
        return
      }

      const { data, error } = await supabase.rpc('claim_token', { p_token: token })

      if (error) {
        setStatus('error')
        setErrorMsg('Something went wrong. Please try again.')
        return
      }

      const result = data as { status: string; packs?: number }

      if (result.status === 'ok') {
        setPacks(result.packs ?? 0)
        setStatus('success')
      } else if (result.status === 'already_claimed') {
        setStatus('error')
        setErrorMsg('This link has already been used.')
      } else if (result.status === 'expired') {
        setStatus('error')
        setErrorMsg('This link has expired.')
      } else if (result.status === 'email_mismatch') {
        setStatus('error')
        setErrorMsg('This link was sent to a different email address. Make sure you\'re signed in with the right account.')
      } else {
        setStatus('error')
        setErrorMsg('This link is invalid or does not exist.')
      }
    }

    claim()
  }, [token])

  if (status === 'loading') {
    return (
      <div className="sg-card p-8 text-center">
        <p className="font-karla font-300 text-[#8a8880] text-sm">Validating link…</p>
      </div>
    )
  }

  if (status === 'needs_login') {
    const loginUrl = `/login?next=${encodeURIComponent(`/claim?token=${token}`)}`
    return (
      <div className="sg-card p-8 space-y-6 text-center">
        <p className="font-karla font-400 text-[#f0ede8] text-sm leading-relaxed">
          Sign in to claim your booster packs.
        </p>
        <Link href={loginUrl} className="btn-gold block w-full text-center">
          Sign In
        </Link>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="sg-card p-8 space-y-6 text-center">
        <div className="border border-[rgba(240,192,64,0.38)] bg-[rgba(240,192,64,0.06)] px-4 py-5 space-y-1">
          <p className="font-cinzel font-700 text-[#f0c040] text-lg">✦ {packs} Pack{packs !== 1 ? 's' : ''} Added</p>
          <p className="font-karla font-300 text-[#8a8880] text-xs tracking-wide">Ready to open in your account</p>
        </div>
        <button onClick={() => router.push('/packs')} className="btn-gold w-full">
          Open Packs
        </button>
      </div>
    )
  }

  return (
    <div className="sg-card p-8 space-y-4 text-center">
      <p className="text-sm font-karla border border-red-500/30 bg-red-500/10 px-3 py-3 text-red-400 leading-relaxed">
        {errorMsg}
      </p>
      <Link href="/packs" className="btn-ghost block w-full text-center">
        Go to Packs
      </Link>
    </div>
  )
}
