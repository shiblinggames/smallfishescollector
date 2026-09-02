'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GoogleButton from '@/components/GoogleButton'

export default function LoginForm() {
  const searchParams = useSearchParams()
  // WAS '/packs', which is the retired pack economy — a default nobody had
  // looked at since that system was pulled.
  const next = searchParams.get('next') ?? '/sea'
  const [showEmail, setShowEmail] = useState(false)
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
        /**
         * BACK TO THE HOST YOU SIGNED IN FROM, whichever that is.
         *
         * This was built from NEXT_PUBLIC_SITE_URL, falling back to the APEX
         * domain — and the site serves on www: `seasthebooty.com` answers every
         * request with a 307 to `www.seasthebooty.com`. So every magic link
         * took a cross-host hop before it reached the callback.
         *
         * That hop is not free. The sign-in is PKCE, and the code verifier is
         * stored by the browser client against the ORIGIN that started it. A
         * link that lands on a different host arrives without the verifier it
         * needs, and the exchange fails on a link that looks perfectly valid.
         *
         * `window.location.origin` cannot be wrong about this: the round trip
         * ends where it began, on every domain, on previews, and on localhost,
         * with no environment variable to set correctly and no fallback to be
         * stale. This is a client component, so it is always available.
         */
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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
      <div className="text-center space-y-3" style={{
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        padding: '2rem 1.75rem',
        backdropFilter: 'blur(8px)',
      }}>
        <p className="font-karla font-600 uppercase tracking-[0.18em]" style={{ fontSize: '0.58rem', color: '#5a9aaa' }}>Check Your Email</p>
        <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.1rem' }}>Link sent.</p>
        <p className="font-karla font-300 text-[#a0a09a]" style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
          We sent a sign-in link to <span className="text-[#f0c040]">{email}</span>.<br />
          Click the link to sign in — you can close this tab.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Primary action */}
      <GoogleButton next={next} />

      {/* Email fallback */}
      {!showEmail ? (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="font-karla font-400 transition-colors"
          style={{ fontSize: '0.88rem', color: '#7a8a94', background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#b0c0ca')}
          onMouseLeave={e => (e.currentTarget.style.color = '#7a8a94')}
        >
          or sign in with email
        </button>
      ) : (
        <form onSubmit={handleSubmit} style={{
          background: 'rgba(0,0,0,0.45)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14,
          padding: '1.25rem',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.875rem',
        }}>
          {error && (
            <p className="font-karla text-sm border border-red-500/30 bg-red-500/10 px-3 py-2 text-red-400" style={{ borderRadius: 8 }}>
              {error}
            </p>
          )}
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="sg-input"
            placeholder="your@email.com"
          />
          <button type="submit" disabled={loading} className="btn-gold w-full">
            {loading ? 'Sending…' : 'Send Sign-In Link'}
          </button>
        </form>
      )}
    </div>
  )
}
