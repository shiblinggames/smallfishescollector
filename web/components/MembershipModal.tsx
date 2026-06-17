'use client'

// Global membership purchase popup. Mounted once in the app shell; every
// "Become a member" CTA across the app just dispatches a window
// `open-membership` event and this modal opens with Stripe's Embedded
// Checkout (card + Apple/Google Pay) right inside the popup — no leaving the
// app. Payment is fulfilled by the Stripe webhook (it flips is_premium); the
// modal polls until that lands, then refreshes so the whole app updates.

import { Component, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { createMembershipCheckout, checkMembership } from '@/app/actions/membership'

const GOLD = '#f0c040'
const PUBLISHABLE = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
const stripePromise = PUBLISHABLE ? loadStripe(PUBLISHABLE) : null

// Without this, a render crash inside Stripe's EmbeddedCheckout (bad
// publishable key, stripe.js failing to init the session) unmounts the whole
// modal subtree and the popup just vanishes. The boundary catches it and hands
// the message back so we can show it instead.
class CheckoutBoundary extends Component<{ onError: (msg: string) => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) {
    this.props.onError(err instanceof Error ? err.message : 'Checkout failed to load.')
  }
  render() { return this.state.failed ? null : this.props.children }
}

/** Open the membership popup from anywhere. */
export function openMembership() {
  window.dispatchEvent(new CustomEvent('open-membership'))
}

export default function MembershipModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('open-membership', onOpen)
    return () => window.removeEventListener('open-membership', onOpen)
  }, [])

  // Spin up a fresh checkout session each time the popup opens.
  useEffect(() => {
    if (!open) return
    setClientSecret(null); setError(null); setPaid(false)
    if (!stripePromise) { setError('Payments are not configured yet.'); return }
    let alive = true
    // Watchdog: if the session call hangs (network), don't spin forever.
    const watchdog = window.setTimeout(() => {
      if (alive) setError('Checkout is taking too long. Check your connection and try again.')
    }, 15000)
    createMembershipCheckout().then(r => {
      window.clearTimeout(watchdog)
      if (!alive) return
      if ('error' in r) setError(r.error)
      else setClientSecret(r.clientSecret)
    }).catch((e) => { window.clearTimeout(watchdog); if (alive) setError(e instanceof Error ? e.message : 'Could not start checkout.') })
    return () => { alive = false; window.clearTimeout(watchdog) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Stripe fires this when payment succeeds. Poll until the webhook grants
  // membership (≈ a second or two), then refresh the app.
  const onComplete = useCallback(() => {
    setPaid(true)
    let tries = 0
    const poll = async () => {
      tries++
      try {
        const { isMember } = await checkMembership()
        if (isMember || tries > 12) { router.refresh(); return }
      } catch { /* keep polling */ }
      window.setTimeout(poll, 1000)
    }
    poll()
  }, [router])

  function close() { setOpen(false); router.refresh() }

  if (!open) return null

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(2,4,8,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto',
        background: 'linear-gradient(180deg, #14110b 0%, #0a0807 100%)',
        border: `1px solid ${GOLD}40`, borderTop: `2px solid ${GOLD}`,
        borderRadius: 18, padding: '1.15rem 1.1rem 1.25rem',
        boxShadow: `0 18px 60px rgba(0,0,0,0.6), 0 0 40px ${GOLD}12`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.56rem', color: `${GOLD}cc` }}>Membership</p>
            <h2 className="font-cinzel font-800" style={{ fontSize: '1.4rem', color: '#f5ecd6', lineHeight: 1.1 }}>Become a Member</h2>
          </div>
          <button onClick={close} aria-label="Close" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#b2aca3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a89e86', lineHeight: 1.5, marginBottom: 14 }}>
          <span className="font-cinzel font-800" style={{ color: GOLD, fontSize: '0.95rem' }}>$10</span> once, yours for life. More daily gems, premium bait, a gold weekly crate, two Captain&apos;s Board picks, a bigger Den purse, and members-only games. Cosmetic and convenience only, never pay-to-win.
        </p>

        {paid ? (
          <div style={{ textAlign: 'center', padding: '1.6rem 0.5rem' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 12px', borderRadius: '50%', background: `${GOLD}1f`, border: `1px solid ${GOLD}66`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <p className="font-cinzel font-800" style={{ fontSize: '1.25rem', color: GOLD }}>You&apos;re aboard!</p>
            <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a89e86', marginTop: 6, lineHeight: 1.5 }}>Welcome to the crew. Your perks are unlocking now.</p>
            <button onClick={close} className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ marginTop: 18, padding: '0.7rem 1.8rem', borderRadius: 12, background: `${GOLD}26`, border: `1px solid ${GOLD}66`, color: GOLD, fontSize: '0.78rem', cursor: 'pointer' }}>Set sail</button>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '1.4rem 0.5rem' }}>
            <p className="font-karla" style={{ fontSize: '0.85rem', color: '#f0a890', lineHeight: 1.5 }}>{error}</p>
            <button onClick={() => setOpen(true)} className="font-karla font-700 uppercase tracking-[0.08em]" style={{ marginTop: 14, padding: '0.6rem 1.4rem', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfc9bf', fontSize: '0.72rem', cursor: 'pointer' }}>Try again</button>
          </div>
        ) : clientSecret && stripePromise ? (
          <div style={{ borderRadius: 12, overflow: 'hidden' }}>
            <CheckoutBoundary onError={setError}>
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret, onComplete }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </CheckoutBoundary>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2.4rem 0.5rem' }}>
            <p className="font-karla" style={{ fontSize: '0.8rem', color: '#8a857c' }}>Loading secure checkout…</p>
          </div>
        )}
      </div>
    </div>
  )
}
