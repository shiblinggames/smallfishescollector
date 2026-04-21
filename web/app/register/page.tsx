'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import GoogleButton from '@/components/GoogleButton'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm sg-card p-10">
          <p className="sg-eyebrow mb-4">Check Your Email</p>
          <h2 className="font-cinzel font-700 text-[#f0ede8] text-2xl mb-4">Confirmation Sent.</h2>
          <p className="font-karla font-300 text-[#f0ede8] opacity-70 leading-relaxed">
            We sent a link to <span className="text-[#f0c040]">{email}</span>.
            Click it to activate your account, then{' '}
            <Link href="/login" className="text-[#f0c040] hover:text-[#ffd966] transition-colors">
              sign in
            </Link>.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <p className="sg-eyebrow text-center mb-4">Digital Collectibles</p>
        <h1 className="font-cinzel font-black text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-2"
            style={{ fontSize: 'clamp(2rem, 6vw, 3rem)' }}>
          Small Fishes.
        </h1>
        <p className="font-cinzel italic text-[#f0c040] text-center mb-10">
          Seas the Booty.
        </p>

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

          <div className="space-y-1.5">
            <label className="sg-eyebrow block">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="sg-input"
              placeholder="6+ characters"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-gold w-full">
            {loading ? 'Creating Account…' : 'Create Account'}
          </button>

          <p className="text-center text-xs font-karla text-[#8a8880] tracking-wide">
            Already have one?{' '}
            <Link href="/login" className="text-[#f0c040] hover:text-[#ffd966] transition-colors">
              Sign in
            </Link>
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
            <span className="font-karla font-300 text-[#8a8880] text-xs tracking-widest">OR</span>
            <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
          </div>

          <GoogleButton />
        </form>
      </div>
    </main>
  )
}
