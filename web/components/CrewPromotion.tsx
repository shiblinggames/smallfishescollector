'use client'

// ── PROMOTED ────────────────────────────────────────────────────────────────
//
// The one crew-levelling moment that takes the screen (Kong, 2026-09-26): a
// hand's Special stepping up a tier, at Lv 10 / 25 / 40 / 75 / 100. Their art
// in their class colour, the tier stamped on, and what the Special did before
// against what it does now, in plain words. Ordinary levels never come here.
//
// NOT SPAM, BY CONSTRUCTION:
//   - five of these in a hand's whole life, and each shows once, remembered on
//     the account (crewPromotionActions);
//   - several at once are ONE card you step through, not a stack;
//   - it WAITS while you are busy: a fight or a reel on the chart (the
//     `.sea-frozen` surface), a raid or gauntlet page, a tour holding the
//     screen. It shows the moment you are free.
//
// It asks the server on arrival, on page changes (15s floor), on returning to
// the tab, and every 45 seconds while visible, which is how a promotion earned
// mid-fight on the chart is found once the fight is over.

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import type { Promotion } from '@/app/(app)/crewPromotionActions'
import { vibrate } from '@/lib/haptics'

const MIN_GAP_MS = 15_000

function busy(pathname: string | null): boolean {
  if (typeof document === 'undefined') return true
  if (pathname?.startsWith('/raids')) return true
  if (document.querySelector('.sea-frozen, .sea-tour-lock')) return true
  if (document.body.classList.contains('coach-lock')) return true
  return false
}

export default function CrewPromotion() {
  const pathname = usePathname()
  const [queue, setQueue] = useState<Promotion[]>([])
  const [free, setFree] = useState(false)
  const lastAt = useRef(0)
  const inFlight = useRef(false)

  const check = useCallback(async (force = false) => {
    const now = Date.now()
    if (inFlight.current || (!force && now - lastAt.current < MIN_GAP_MS)) return
    // Not while a fight, a reel or a tour has the screen: nothing could show,
    // and the check can wait until it can.
    if (busy(window.location.pathname)) return
    inFlight.current = true
    lastAt.current = now
    try {
      // A route, not a server action: see app/api/promotions.
      const res = await fetch('/api/promotions', { method: 'POST' })
      const got: Promotion[] = res.ok ? await res.json() : []
      if (got.length) setQueue(q => [...q, ...got.filter(p => !q.some(x => x.key === p.key))])
    } catch { /* the next check catches it */ }
    finally { inFlight.current = false }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { void check() }, 3000)
    return () => clearTimeout(t)
  }, [pathname, check])

  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void check() }
    const onEvt = () => { void check(true) }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('crew-changed', onEvt)
    window.addEventListener('promotions-check', onEvt)
    const id = setInterval(() => { if (document.visibilityState === 'visible') void check() }, 45_000)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('crew-changed', onEvt)
      window.removeEventListener('promotions-check', onEvt)
      clearInterval(id)
    }
  }, [check])

  // Hold the card while the captain is busy; look again every second.
  useEffect(() => {
    if (queue.length === 0) { setFree(false); return }
    const tick = () => setFree(!busy(pathname))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [queue.length, pathname])

  const cur = free ? queue[0] : undefined
  useEffect(() => { if (cur) vibrate([0, 30, 40, 60]) }, [cur?.key])

  const next = () => setQueue(q => q.slice(1))
  // A keyboard steps through too: Enter, Space or Escape.
  useEffect(() => {
    if (!cur) return
    // CAPTURED and stopped: Space is also the chart's "act" key, and a key
    // that dismissed this card must not cast a line underneath it.
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation()
        setQueue(q => q.slice(1))
      }
    }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [cur?.key])

  return (
    <AnimatePresence>
      {cur && (
        <motion.div key="crew-promotion"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          data-no-steer
          onClick={next}
          style={{
            position: 'fixed', inset: 0, zIndex: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
            // Clear of the notch and the home bar on a phone.
            padding: 'max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom))',
            background: 'rgba(3,5,9,0.74)',
          }}>
          <motion.div key={cur.key}
            initial={{ opacity: 0, y: 24, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={e => e.stopPropagation()}
            className="promo-card"
            role="dialog" aria-modal aria-label={`${cur.name} promoted to Tier ${cur.tier}`}
            style={{
              position: 'relative', borderRadius: 20, overflow: 'hidden',
              display: 'flex', flexDirection: 'column', maxHeight: '100%',
              background: '#0b0d12', border: `1px solid ${cur.color}88`,
              boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 44px ${cur.color}33`,
            }}>
            {/* The hand, large, on a pool of their class colour. */}
            {/* The art takes what the screen can spare (.promo-art): a short
                phone keeps the words and the button in view. */}
            <div className="promo-art" style={{ position: 'relative', flexShrink: 1, minHeight: 150, background: `radial-gradient(90% 80% at 50% 30%, ${cur.color}55, #0b0d12 75%)` }}>
              {cur.art && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cur.art} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
              )}
              <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,13,18,0) 45%, rgba(11,13,18,0.85) 85%, #0b0d12 100%)' }} />
              <p className="font-karla font-800 uppercase" style={{
                position: 'absolute', top: 14, left: 0, right: 0, textAlign: 'center', margin: 0,
                fontSize: '0.62rem', letterSpacing: '0.3em', color: '#fff4dc', textShadow: '0 2px 8px rgba(0,0,0,0.9)',
              }}>Promoted</p>
              {/* THE TIER, stamped on. */}
              <motion.div
                initial={{ scale: 2.2, opacity: 0, rotate: -14 }}
                animate={{ scale: 1, opacity: 1, rotate: -8 }}
                transition={{ delay: 0.28, type: 'spring', stiffness: 420, damping: 18 }}
                style={{
                  position: 'absolute', right: 16, top: 38, width: 70, height: 70, borderRadius: '50%',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: `radial-gradient(circle at 40% 35%, ${cur.color}, ${cur.color}99 70%)`,
                  border: '2px solid rgba(255,255,255,0.55)', boxShadow: `0 0 20px ${cur.color}88, 0 4px 12px rgba(0,0,0,0.6)`,
                }}>
                <span className="font-karla font-800 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.16em', color: '#140d04' }}>Tier</span>
                <span className="font-cinzel font-800" style={{ fontSize: '1.35rem', lineHeight: 1, color: '#140d04' }}>{cur.tier}</span>
              </motion.div>
              <div style={{ position: 'absolute', left: 16, right: 16, bottom: 10 }}>
                <p className="font-cinzel font-800 promo-name" style={{ margin: 0, color: '#fff', lineHeight: 1.1, textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>{cur.name}</p>
                <p className="font-karla font-700 uppercase" style={{ margin: '4px 0 0', fontSize: '0.62rem', letterSpacing: '0.16em', color: cur.color }}>
                  {cur.className} · Level {cur.level}
                </p>
              </div>
            </div>

            <div className="promo-body" style={{ flexShrink: 0 }}>
              {/* What the Special did, against what it does now. */}
              {cur.from && (
                <p className="font-karla" style={{ margin: '0 0 6px', fontSize: '0.78rem', color: 'rgba(214,220,230,0.5)', lineHeight: 1.4, textDecoration: 'line-through', textDecorationColor: 'rgba(214,220,230,0.3)' }}>
                  {cur.from}
                </p>
              )}
              <p className="font-karla font-700 promo-now" style={{ margin: 0, color: '#f4efe4', lineHeight: 1.4 }}>
                <span style={{ color: cur.color, marginRight: 6 }}>Now:</span>{cur.to}
              </p>
              <motion.button type="button" onClick={next} whileTap={{ scale: 0.97 }} autoFocus
                className="font-cinzel font-800 uppercase tracking-[0.12em]"
                style={{
                  width: '100%', marginTop: 14, padding: '0.72rem', borderRadius: 11, fontSize: '0.88rem', cursor: 'pointer',
                  background: `linear-gradient(180deg, ${cur.color}40, ${cur.color}18)`, border: `1px solid ${cur.color}99`, color: '#fbf5e8',
                }}>
                {queue.length > 1 ? `Next (${queue.length - 1} more)` : 'Aye'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
