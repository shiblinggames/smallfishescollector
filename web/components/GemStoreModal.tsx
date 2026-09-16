'use client'

// ── THE PURSER ──────────────────────────────────────────────────────────────
//
// Gem packs, for money. The server half of this has existed for a while
// (lib/gemPacks, app/actions/gems, the webhook) and nothing in the client ever
// opened it: the packs were priced, the checkout built, the fulfilment made
// exactly-once, and there was no door. This is the door.
//
// ── THE SAME SHAPE AS THE MEMBERSHIP CARD, ON PURPOSE ───────────────────────
//
// Same event to open it, same embedded Checkout with the same hosted fallback,
// same boundary around Stripe's iframe, same poll after payment. Two ways to
// take money should not be two different experiences of handing it over, and
// everything that was learned making the first one (the CSP allowlist, the
// nine-second watchdog, the escape link) is inherited rather than rediscovered.
//
// ── WHAT IT SAYS ABOUT ITSELF ───────────────────────────────────────────────
//
// Plainly, because real money is at the end of it: what gems buy, and that
// nothing they buy is out of reach on gems earned by playing. That second line
// is the house rule (never pay-to-win) said where the payment is, which is the
// only place saying it counts.
//
// ── AFTER PAYING ────────────────────────────────────────────────────────────
//
// The grant is the WEBHOOK's; the modal only waits for the balance to move,
// then tells the Nav (the gems-changed event) and refreshes the route. The
// starting balance is read when the modal opens, so "it moved" is a comparison
// against a number rather than a guess.

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { CheckoutBoundary, stripePromise } from '@/components/MembershipModal'
import { createGemCheckout, createGemHostedCheckout, currentGems } from '@/app/actions/gems'
import { GEM_PACKS, packPrice, gemsPerDollar, type GemPack } from '@/lib/gemPacks'
import { vibrate } from '@/lib/haptics'

const GEM = '#a78bfa'
const GOLD = '#f0c040'

export function openGemStore() {
  window.dispatchEvent(new CustomEvent('open-gem-store'))
}

export default function GemStoreModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'packs' | 'pay'>('packs')
  const [pack, setPack] = useState<GemPack | null>(null)
  const [paid, setPaid] = useState<number | null>(null)          // gems granted, once seen
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [startBalance, setStartBalance] = useState<number | null>(null)

  useEffect(() => {
    const onOpen = () => {
      setStep('packs'); setPack(null); setPaid(null); setError(null); setLoading(false); setClientSecret(null)
      setOpen(true)
      void currentGems().then(r => setStartBalance(r.gems)).catch(() => setStartBalance(null))
    }
    window.addEventListener('open-gem-store', onOpen)
    return () => window.removeEventListener('open-gem-store', onOpen)
  }, [])

  // Back from the HOSTED page (success_url ?gems=success).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const g = params.get('gems')
    if (g !== 'success' && g !== 'cancelled') return
    params.delete('gems')
    const q = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : ''))
    if (g !== 'success') return
    setOpen(true); setStep('pay')
    pollGems(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  /** Wait for the webhook's grant to land, then tell the rest of the app. */
  function pollGems(from: number | null) {
    let tries = 0
    const poll = async () => {
      tries++
      try {
        const { gems } = await currentGems()
        const moved = from === null ? tries > 2 : gems > from
        if (moved || tries > 15) {
          setPaid(from === null ? 0 : Math.max(0, gems - from))
          window.dispatchEvent(new CustomEvent('gems-changed', { detail: gems }))
          router.refresh()
          return
        }
      } catch { /* keep polling */ }
      window.setTimeout(poll, 1000)
    }
    poll()
  }

  const goHosted = useCallback(async (p: GemPack) => {
    setLoading(true); setError(null)
    try {
      const r = await createGemHostedCheckout(p.id)
      if ('error' in r) { setError(r.error); setLoading(false); return }
      window.location.href = r.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.'); setLoading(false)
    }
  }, [])

  const choose = useCallback(async (p: GemPack) => {
    vibrate(10)
    setPack(p); setError(null); setLoading(true)
    if (stripePromise) {
      try {
        const r = await createGemCheckout(p.id)
        if (!('error' in r)) { setClientSecret(r.clientSecret); setStep('pay'); setLoading(false); return }
        if (/sign in|not for sale/i.test(r.error)) { setError(r.error); setLoading(false); return }
      } catch { /* fall through to hosted */ }
    }
    await goHosted(p)
  }, [goHosted])

  const onComplete = useCallback(() => { pollGems(startBalance) }, [startBalance]) // eslint-disable-line react-hooks/exhaustive-deps

  function close() { setOpen(false) }

  if (!open) return null

  const showEmbedded = step === 'pay' && !!stripePromise && !!clientSecret && paid === null

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <motion.div onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{
          width: '100%', maxWidth: 'var(--modal-w)', maxHeight: '92vh', overflowY: 'auto',
          background: 'linear-gradient(180deg, #120f1c 0%, #08070d 100%)',
          border: `1px solid ${GEM}40`, borderTop: `2px solid ${GEM}`,
          borderRadius: 18, padding: '1.15rem 1.1rem 1.25rem',
          boxShadow: `0 18px 60px rgba(0,0,0,0.6), 0 0 40px ${GEM}14`,
        }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {showEmbedded && (
              <button onClick={() => { setStep('packs'); setClientSecret(null) }} aria-label="Back" style={{ marginTop: 2, flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#b2aca3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
            )}
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.56rem', color: `${GEM}cc` }}>The Purser</p>
              <h2 className="font-cinzel font-800" style={{ fontSize: '1.5rem', color: '#ece6f8', lineHeight: 1.1 }}>
                {showEmbedded && pack ? pack.name : 'Gems'}
              </h2>
            </div>
          </div>
          <button onClick={close} aria-label="Close" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#b2aca3', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {paid !== null ? (
          <div style={{ textAlign: 'center', padding: '1.6rem 0.5rem' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 12px', borderRadius: '50%', background: `${GEM}1f`, border: `1px solid ${GEM}66`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GEM} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <p className="font-cinzel font-800" style={{ fontSize: '1.3rem', color: GEM }}>
              {paid > 0 ? `+${paid.toLocaleString()} ◆` : 'Paid'}
            </p>
            <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a89ec0', marginTop: 6, lineHeight: 1.5 }}>
              {paid > 0 ? 'In your purse now.' : 'The gems are on their way. Your purse will update in a moment.'}
            </p>
            <button onClick={close} className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ marginTop: 18, padding: '0.7rem 1.8rem', borderRadius: 12, background: `${GEM}26`, border: `1px solid ${GEM}66`, color: GEM, fontSize: '0.78rem', cursor: 'pointer' }}>Back to it</button>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '1.4rem 0.5rem' }}>
            <p className="font-karla" style={{ fontSize: '0.85rem', color: '#f0a890', lineHeight: 1.5 }}>{error}</p>
            <button onClick={close} className="font-karla font-700 uppercase tracking-[0.08em]" style={{ marginTop: 14, padding: '0.6rem 1.4rem', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#cfc9bf', fontSize: '0.72rem', cursor: 'pointer' }}>Close</button>
          </div>
        ) : showEmbedded && pack ? (
          <>
            <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a89ec0', margin: '6px 0 0' }}>
              {pack.gems.toLocaleString()} ◆ for {packPrice(pack)}. One payment, no subscription.
            </p>
            <div style={{ borderRadius: 12, overflow: 'hidden', minHeight: 240, marginTop: 10 }}>
              <CheckoutBoundary onError={() => { void goHosted(pack) }}>
                <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret, onComplete }}>
                  <EmbeddedCheckout />
                </EmbeddedCheckoutProvider>
              </CheckoutBoundary>
            </div>
            <button type="button" onClick={() => { void goHosted(pack) }} disabled={loading} className="font-karla" style={{ display: 'block', width: '100%', textAlign: 'center', marginTop: 10, fontSize: '0.66rem', color: '#8a857c', background: 'none', border: 'none', cursor: 'pointer' }}>
              {loading ? 'Opening…' : 'Trouble loading? Pay on Stripe’s secure page →'}
            </button>
          </>
        ) : (
          <>
            <p className="font-karla" style={{ fontSize: '0.82rem', color: '#b3a9c9', lineHeight: 1.5, margin: '8px 0 14px' }}>
              Gems buy skins for your crew, a Renown respec, and a charge for the Accelerator.
              Nothing they buy is out of reach on gems earned by playing. A pack is a shortcut, not a key.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {GEM_PACKS.map(p => (
                <button key={p.id} type="button" disabled={loading} onClick={() => { void choose(p) }}
                  className="tap"
                  style={{
                    width: '100%', textAlign: 'left', cursor: loading ? 'default' : 'pointer', font: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 12, padding: '0.7rem 0.85rem', borderRadius: 13,
                    background: p.best ? `${GEM}1a` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${p.best ? `${GEM}80` : 'rgba(255,255,255,0.12)'}`,
                    opacity: loading && pack?.id !== p.id ? 0.6 : 1,
                    position: 'relative',
                  }}>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '1.05rem', color: GEM, lineHeight: 1.15 }}>
                      {p.gems.toLocaleString()} ◆
                      {p.bonusPct && (
                        <span className="font-karla font-700" style={{ marginLeft: 8, fontSize: '0.6rem', letterSpacing: '0.08em', color: GOLD, verticalAlign: 'middle' }}>+{p.bonusPct}%</span>
                      )}
                    </span>
                    <span className="font-karla" style={{ display: 'block', fontSize: '0.72rem', color: '#8f86a6', marginTop: 2 }}>
                      {p.name} · {p.blurb}
                    </span>
                  </span>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="font-cinzel font-800" style={{ display: 'block', fontSize: '1rem', color: '#ece6f8' }}>
                      {loading && pack?.id === p.id ? '…' : packPrice(p)}
                    </span>
                    <span className="font-karla" style={{ display: 'block', fontSize: '0.58rem', color: '#6f6784', marginTop: 1 }}>
                      {gemsPerDollar(p)} per dollar
                    </span>
                  </span>
                  {p.best && (
                    <span className="font-karla font-800 uppercase" style={{ position: 'absolute', top: -8, left: 12, fontSize: '0.5rem', letterSpacing: '0.14em', color: '#14101c', background: GOLD, borderRadius: 999, padding: '0.14rem 0.5rem' }}>Best value</span>
                  )}
                </button>
              ))}
            </div>
            <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6f6784', textAlign: 'center', lineHeight: 1.4 }}>
              Secure checkout by Stripe. One payment, no subscription. Packs stop at $19.99 on purpose, and nothing here is needed to finish the game.
            </p>
          </>
        )}
      </motion.div>
    </div>
  )
}
