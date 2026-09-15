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

  // ── IT LIVES INSIDE THE CARD NOW ──────────────────────────────────────────
  //
  // Both of these used to bring their own panel: a dark rounded box with a blur
  // behind it, because the form was floating on the background painting by
  // itself. It sits inside the door's own card (see SignInStage), so a second
  // one is a card in a card. What is left is the words and the controls.
  if (sent) {
    return (
      <div style={{ textAlign: 'center', padding: '0.4rem 0 0.2rem' }}>
        <p className="font-karla font-600 uppercase" style={{
          fontSize: '0.56rem', letterSpacing: '0.18em', color: '#5a9aaa', margin: 0,
        }}>Check your email</p>
        <p className="font-cinzel font-700" style={{
          fontSize: '1.1rem', color: '#f0ede8', margin: '6px 0 6px',
        }}>Link sent.</p>
        <p className="font-karla font-300" style={{
          fontSize: '0.82rem', lineHeight: 1.6, color: '#a0a09a', margin: 0,
        }}>
          It is on its way to <span style={{ color: '#f0c040' }}>{email}</span>.
          <br />Press the link and you are aboard. This tab can go.
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* The press almost everybody makes. */}
      <GoogleButton next={next} />

      {!showEmail ? (
        <button
          type="button"
          onClick={() => setShowEmail(true)}
          className="font-karla font-400 transition-colors"
          style={{
            fontSize: '0.82rem', color: '#7a8a94', background: 'none',
            border: 'none', cursor: 'pointer', padding: '0.15rem', alignSelf: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#b0c0ca')}
          onMouseLeave={e => (e.currentTarget.style.color = '#7a8a94')}
        >
          or use an email link instead
        </button>
      ) : (
        <form onSubmit={handleSubmit} style={{
          display: 'flex', flexDirection: 'column', gap: '0.7rem',
          // A hairline above it, not a box around it: the form is a second
          // half of the card rather than a thing sitting on it.
          borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.85rem',
        }}>
          {error && (
            <p className="font-karla" style={{
              fontSize: '0.78rem', lineHeight: 1.5, margin: 0,
              color: '#f2b0b0', background: 'rgba(220,90,90,0.12)',
              border: '1px solid rgba(220,90,90,0.34)', borderRadius: 9,
              padding: '0.5rem 0.65rem',
            }}>{error}</p>
          )}
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="sg-input"
            style={{ borderRadius: 10 }}
            placeholder="your@email.com"
          />
          <button type="submit" disabled={loading} className="btn-gold w-full">
            {loading ? 'Sending…' : 'Send the link'}
          </button>
        </form>
      )}
    </div>
  )
}
