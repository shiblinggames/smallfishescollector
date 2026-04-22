'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GoogleButton from '@/components/GoogleButton'

export default function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/packs'
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
    }
  }

  if (sent) {
    return (
      <div className="sg-card p-8 text-center space-y-3">
        <p className="sg-eyebrow">Check Your Email</p>
        <p className="font-karla font-400 text-[#f0ede8] leading-relaxed">
          We sent a sign-in link to{' '}
          <span className="text-[#f0c040]">{email}</span>.
        </p>
        <p className="font-karla font-300 text-[#8a8880] text-sm">
          Click the link in the email to sign in. You can close this tab.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="sg-card p-8 space-y-6">
      {error && (
        <p className="text-sm font-karla border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400">
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <label className="sg-eyebrow block">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="sg-input"
          placeholder="you@example.com"
        />
      </div>

      <button type="submit" disabled={loading} className="btn-gold w-full">
        {loading ? 'Sending…' : 'Send Sign-In Link'}
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
        <span className="font-karla font-300 text-[#8a8880] text-xs tracking-widest">OR</span>
        <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
      </div>

      <GoogleButton next={next} />
    </form>
  )
}
