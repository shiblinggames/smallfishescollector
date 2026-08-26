'use client'

// Global membership ("Captain") purchase popup. Mounted once in the app shell;
// every "Become a Captain" CTA dispatches a window `open-membership` event.
//
// Two-step flow:
//   STEP 1 "intro" — show ALL the Captain perks + a clear $9.99 CTA, so people
//     see what they get before any payment UI.
//   STEP 2 "pay" — tapping the CTA reveals Stripe's EMBEDDED card form right
//     inside the same modal (no leaving the app). If embedded can't be used
//     (no publishable key, a soft error, or a render crash) we seamlessly hand
//     off to Stripe's HOSTED page instead, so it can never dead-end.
//
// Fulfillment is ALWAYS the webhook (it flips is_premium); we never trust the
// client. Embedded completion polls checkMembership inline; the hosted path
// returns via /tavern?membership=success which we detect below.

import { Component, useCallback, useEffect, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { createEmbeddedCheckout, createHostedCheckout, checkMembership } from '@/app/actions/membership'

const GOLD = '#f0c040'
const PUBLISHABLE = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
const stripePromise = PUBLISHABLE ? loadStripe(PUBLISHABLE) : null

/** Open the membership popup from anywhere. */
export function openMembership() {
  window.dispatchEvent(new CustomEvent('open-membership'))
}

// Catches a render crash inside EmbeddedCheckout (bad key, stripe.js init
// failure) so the popup falls back to hosted instead of the whole subtree
// unmounting and vanishing.
class CheckoutBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

const PERKS = [
  ['150 gems a day', '3× the free haul'],
  ['Premium chum bait', 'every day'],
  ['A gold crate', 'every week'],
  ['2 Captain’s Board picks', 'a day'],
  ['A bigger Den purse', 'higher daily cap'],
  ['Captain-only games', 'the Rigging & more'],
  ['Sail with your crew', 'see them on the Seas'],
]

export default function MembershipModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'intro' | 'pay'>('intro')
  const [paid, setPaid] = useState(false)
  const [error, setError] = useState<string | null>(null)        // hard errors only (already a Captain, not signed in)
  const [loading, setLoading] = useState(false)                  // creating a session / opening checkout
  const [clientSecret, setClientSecret] = useState<string | null>(null)

  // Open from any CTA → reset to the perks step.
  useEffect(() => {
    const onOpen = () => {
      setStep('intro'); setPaid(false); setError(null); setLoading(false); setClientSecret(null)
      setOpen(true)
    }
    window.addEventListener('open-membership', onOpen)
    return () => window.removeEventListener('open-membership', onOpen)
  }, [])

  // Detect the return from a HOSTED checkout (success_url ?membership=success).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const m = params.get('membership')
    if (m !== 'success' && m !== 'cancelled') return
    params.delete('membership')
    const q = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : ''))
    if (m !== 'success') return
    setOpen(true); setPaid(true)
    pollMembership()
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  function pollMembership() {
    let tries = 0
    const poll = async () => {
      tries++
      try {
        const { isMember } = await checkMembership()
        if (isMember || tries > 15) { router.refresh(); return }
      } catch { /* keep polling */ }
      window.setTimeout(poll, 1000)
    }
    poll()
  }

  // Redirect to Stripe's hosted page (fallback whenever embedded can't run).
  const goHosted = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await createHostedCheckout()
      if ('error' in r) { setError(r.error); setLoading(false); return }
      window.location.href = r.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.'); setLoading(false)
    }
  }, [])

  // CTA from the perks step. Try embedded first (reveal the card form inline);
  // on no-key / soft error, seamlessly fall back to the hosted redirect.
  const startCheckout = useCallback(async () => {
    setError(null); setLoading(true)
    if (stripePromise) {
      try {
        const r = await createEmbeddedCheckout()
        if (!('error' in r)) { setClientSecret(r.clientSecret); setStep('pay'); setLoading(false); return }
        // Hard errors get shown; anything else falls through to hosted.
        if (/already a Captain|sign in/i.test(r.error)) { setError(r.error); setLoading(false); return }
      } catch { /* fall through to hosted */ }
    }
    await goHosted()
  }, [goHosted])

  // Embedded payment succeeded without leaving the app.
  const onComplete = useCallback(() => { setPaid(true); pollMembership() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function close() { setOpen(false); router.refresh() }

  if (!open) return null

  const showEmbedded = step === 'pay' && !!stripePromise && !!clientSecret

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <motion.div onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{
        width: '100%', maxWidth: 440, maxHeight: '92vh', overflowY: 'auto',
        background: 'linear-gradient(180deg, #14110b 0%, #0a0807 100%)',
        border: `1px solid ${GOLD}40`, borderTop: `2px solid ${GOLD}`,
        borderRadius: 18, padding: '1.15rem 1.1rem 1.25rem',
        boxShadow: `0 18px 60px rgba(0,0,0,0.6), 0 0 40px ${GOLD}12`,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {/* Back to perks from the pay step */}
            {showEmbedded && !paid && (
              <button onClick={() => { setStep('intro'); setClientSecret(null) }} aria-label="Back" style={{ marginTop: 2, flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#b2aca3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            )}
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.56rem', color: `${GOLD}cc` }}>The Full Experience</p>
              <h2 className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#f5ecd6', lineHeight: 1.1 }}>Become a Captain</h2>
            </div>
          </div>
          <button onClick={close} aria-label="Close" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#b2aca3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {paid ? (
          <div style={{ textAlign: 'center', padding: '1.6rem 0.5rem' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 12px', borderRadius: '50%', background: `${GOLD}1f`, border: `1px solid ${GOLD}66`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <p className="font-cinzel font-800" style={{ fontSize: '1.3rem', color: GOLD }}>Welcome aboard, Captain!</p>
            <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a89e86', marginTop: 6, lineHeight: 1.5 }}>The full game is yours now.</p>
            <button onClick={close} className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ marginTop: 18, padding: '0.7rem 1.8rem', borderRadius: 12, background: `${GOLD}26`, border: `1px solid ${GOLD}66`, color: GOLD, fontSize: '0.78rem', cursor: 'pointer' }}>Set sail</button>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '1.4rem 0.5rem' }}>
            <p className="font-karla" style={{ fontSize: '0.85rem', color: '#f0a890', lineHeight: 1.5 }}>{error}</p>
            <button onClick={close} className="font-karla font-700 uppercase tracking-[0.08em]" style={{ marginTop: 14, padding: '0.6rem 1.4rem', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfc9bf', fontSize: '0.72rem', cursor: 'pointer' }}>Close</button>
          </div>
        ) : showEmbedded ? (
          /* STEP 2 — embedded card form, in-app. */
          <>
            <div style={{ borderRadius: 12, overflow: 'hidden', minHeight: 240, marginTop: 10 }}>
              <CheckoutBoundary onError={goHosted}>
                <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret, onComplete }}>
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </CheckoutBoundary>
            </div>
            <button type="button" onClick={goHosted} disabled={loading} className="font-karla" style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 10, fontSize: '0.66rem', color: '#8a857c', background: 'none', border: 'none', cursor: 'pointer' }}>
              {loading ? 'Opening…' : 'Trouble loading? Pay on Stripe’s secure page →'}
            </button>
          </>
        ) : (
          /* STEP 1 — the perks, then the CTA. */
          <>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: '#b3a98f', lineHeight: 1.5, margin: '8px 0 14px' }}>
              Becoming a Captain opens up the full game. Every reward below is yours for life, for less than a sandwich.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 16 }}>
              {PERKS.map(([perk, sub]) => (
                <div key={perk} style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, alignSelf: 'center' }}><path d="M20 6L9 17l-5-5" /></svg>
                  <span className="font-karla" style={{ fontSize: '0.82rem', color: '#e6dcc4' }}>
                    <span className="font-700">{perk}</span>
                    <span style={{ color: '#8a8270' }}> · {sub}</span>
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={startCheckout}
              disabled={loading}
              className="font-cinzel font-700 uppercase tracking-[0.08em]"
              style={{
                width: '100%', padding: '0.85rem 1rem', borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: 'linear-gradient(180deg, rgba(240,192,64,0.26) 0%, rgba(196,169,106,0.12) 100%)',
                border: `1px solid ${GOLD}88`, color: '#f0d695',
                cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 14px rgba(0,0,0,0.35)',
              }}
            >
              {loading ? (
                <span style={{ fontSize: '0.82rem' }}>Opening checkout…</span>
              ) : (
                <>
                  <span style={{ fontSize: '0.85rem' }}>Become a Captain</span>
                  <span style={{ fontSize: '0.9rem', color: GOLD }}>$9.99</span>
                </>
              )}
            </button>
            <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6f6a60', textAlign: 'center', marginTop: 9, lineHeight: 1.4 }}>
              One payment, yours forever. Secure checkout by Stripe.
            </p>
          </>
        )}
      </motion.div>
    </div>
  )
}
