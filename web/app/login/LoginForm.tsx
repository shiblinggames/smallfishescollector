'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import GoogleButton from '@/components/GoogleButton'

export default function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/packs'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push(next)
      router.refresh()
    }
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

      <div className="space-y-1.5">
        <label className="sg-eyebrow block">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="sg-input"
          placeholder="••••••••"
        />
      </div>

      <button type="submit" disabled={loading} className="btn-gold w-full">
        {loading ? 'Signing In…' : 'Sign In'}
      </button>

      <p className="text-center text-xs font-karla text-[#8a8880] tracking-wide">
        No account?{' '}
        <Link href="/register" className="text-[#f0c040] hover:text-[#ffd966] transition-colors">
          Create one
        </Link>
      </p>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
        <span className="font-karla font-300 text-[#8a8880] text-xs tracking-widest">OR</span>
        <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
      </div>

      <GoogleButton />
    </form>
  )
}
