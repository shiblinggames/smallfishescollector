'use client'

// Global membership purchase popup. Mounted once in the app shell; every
// "Become a member" CTA across the app just dispatches a window
// `open-membership` event and this modal opens with the pitch + a single
// button that sends the player to Stripe's hosted checkout page. On success
// Stripe returns them to /marketplace?membership=success; this modal detects
// that, shows the welcome, and polls until the webhook flips is_premium, then
// refreshes so the whole app updates. Payment is only ever trusted from the
// webhook, never from the redirect.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createMembershipCheckout, checkMembership } from '@/app/actions/membership'

const GOLD = '#f0c040'

/** Open the membership popup from anywhere. */
export function openMembership() {
  window.dispatchEvent(new CustomEvent('open-membership'))
}

export default function MembershipModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)

  // Open from any CTA.
  useEffect(() => {
    const onOpen = () => { setError(null); setPaid(false); setLoading(false); setOpen(true) }
    window.addEventListener('open-membership', onOpen)
    return () => window.removeEventListener('open-membership', onOpen)
  }, [])

  // Detect the return from Stripe's hosted checkout. success_url appends
  // ?membership=success; show the welcome and poll until the webhook grants.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const m = params.get('membership')
    if (m !== 'success' && m !== 'cancelled') return
    // Strip the param so a refresh doesn't re-trigger.
    params.delete('membership')
    const q = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (q ? `?${q}` : ''))
    if (m !== 'success') return
    setOpen(true); setPaid(true)
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
  }, [router])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const startCheckout = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await createMembershipCheckout()
      if ('error' in r) { setError(r.error); setLoading(false); return }
      // Off to Stripe's secure hosted page. They return via success_url.
      window.location.href = r.url
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout.'); setLoading(false)
    }
  }, [])

  function close() { setOpen(false); router.refresh() }

  if (!open) return null

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(2,4,8,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, maxHeight: '92vh', overflowY: 'auto',
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

        {paid ? (
          <div style={{ textAlign: 'center', padding: '1.6rem 0.5rem' }}>
            <div style={{ width: 56, height: 56, margin: '0 auto 12px', borderRadius: '50%', background: `${GOLD}1f`, border: `1px solid ${GOLD}66`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
            </div>
            <p className="font-cinzel font-800" style={{ fontSize: '1.25rem', color: GOLD }}>You&apos;re aboard!</p>
            <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a89e86', marginTop: 6, lineHeight: 1.5 }}>Welcome to the crew. Your perks are unlocking now.</p>
            <button onClick={close} className="font-cinzel font-700 uppercase tracking-[0.08em]" style={{ marginTop: 18, padding: '0.7rem 1.8rem', borderRadius: 12, background: `${GOLD}26`, border: `1px solid ${GOLD}66`, color: GOLD, fontSize: '0.78rem', cursor: 'pointer' }}>Set sail</button>
          </div>
        ) : (
          <>
            <p className="font-karla" style={{ fontSize: '0.8rem', color: '#a89e86', lineHeight: 1.55, margin: '6px 0 14px' }}>
              <span className="font-cinzel font-800" style={{ color: GOLD, fontSize: '0.98rem' }}>$10</span> once, yours for life. More daily gems, premium bait, a gold weekly crate, two Captain&apos;s Board picks, a bigger Den purse, and members-only games. Cosmetic and convenience only, never pay-to-win.
            </p>

            {/* Perk list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
              {[
                '150 gems every day (3× the free 50)',
                'Premium chum bait daily',
                'A gold crate every week',
                'Two Captain’s Board picks a day',
                'A bigger daily Den purse',
                'Members-only games & rigging',
              ].map((perk) => (
                <div key={perk} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M20 6L9 17l-5-5" /></svg>
                  <span className="font-karla" style={{ fontSize: '0.76rem', color: '#cfc6b0', lineHeight: 1.35 }}>{perk}</span>
                </div>
              ))}
            </div>

            {error && (
              <p className="font-karla" style={{ fontSize: '0.74rem', color: '#f0a890', lineHeight: 1.45, marginBottom: 10, textAlign: 'center' }}>{error}</p>
            )}

            <button
              onClick={startCheckout}
              disabled={loading}
              className="font-cinzel font-700 uppercase tracking-[0.08em]"
              style={{
                width: '100%', padding: '0.85rem 1rem', borderRadius: 12,
                background: loading ? 'rgba(240,192,64,0.18)' : `${GOLD}28`,
                border: `1px solid ${GOLD}77`, color: GOLD, fontSize: '0.82rem',
                cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Opening secure checkout…' : 'Continue to checkout →'}
            </button>
            <p className="font-karla" style={{ fontSize: '0.62rem', color: '#6f6a60', textAlign: 'center', marginTop: 9, lineHeight: 1.4 }}>
              Secure payment by Stripe. You&apos;ll return here right after.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
