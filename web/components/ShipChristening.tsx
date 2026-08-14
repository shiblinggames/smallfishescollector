'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { hapticReward } from '@/lib/haptics'

/**
 * THE CHRISTENING. Plays once, when a captain buys a new hull.
 *
 * Buying a ship is the largest single purchase in the game (240,000 doubloons
 * at the top) and it used to close a modal and call router.refresh(): the
 * numbers were simply different afterwards. Forging an Abyssal, bought with
 * fathoms you earn passively, got a full ember sequence. This is the correction.
 *
 * PERFORMANCE. This is a MOMENT, not a state, which is the whole reason it can
 * be lavish. It mounts on a purchase a player makes maybe eight times in their
 * entire run, holds for ~4s, and unmounts. Nothing here loops, nothing here
 * survives the sequence, and it never renders on the fishing or combat screens
 * that are already carrying 25 and 23 infinite animations respectively.
 *
 * Everything animated is TRANSFORM or OPACITY, so the compositor owns it and
 * the main thread does no per-frame work. No animated box-shadow, no filter, no
 * blur: those repaint, and this draws over a full-screen backdrop where a
 * repaint is the whole viewport.
 *
 * Tap anywhere to skip. prefers-reduced-motion drops the motion and shows the
 * result immediately, because the INFORMATION here (what the new hull is, what
 * it bought you) matters and should never be locked behind an animation.
 */

export interface ChristeningStat {
  label: string
  from: number
  to: number
}

export interface ChristeningData {
  fromName: string
  toName: string
  toImage: string
  stats: ChristeningStat[]
}

const HOLD_MS = 4200

/** Counts to `to`, easing out. Cheap: one rAF chain, and it stops. */
function CountUp({ to, ms = 900, delay = 0 }: { to: number; ms?: number; delay?: number }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf = 0
    let start = 0
    const t = window.setTimeout(() => {
      const tick = (now: number) => {
        if (!start) start = now
        const p = Math.min(1, (now - start) / ms)
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))))
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, delay)
    return () => { window.clearTimeout(t); cancelAnimationFrame(raf) }
  }, [to, ms, delay])
  return <>{v}</>
}

export default function ShipChristening({ data, onDone }: { data: ChristeningData | null; onDone: () => void }) {
  const [mounted, setMounted] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!data) return
    hapticReward()
    const t = window.setTimeout(() => doneRef.current(), HOLD_MS)
    return () => window.clearTimeout(t)
  }, [data])

  if (!data || !mounted) return null

  const reduced = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  return createPortal(
    <motion.div
      data-any-key
      onClick={onDone}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        // Solid, not a tint. This sits over a painted screen and a translucent
        // ground would read as a grey film rather than a curtain.
        background: 'radial-gradient(ellipse 80% 55% at 50% 38%, #10233a 0%, #060b14 62%, #03060c 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '2rem 1.4rem calc(env(safe-area-inset-bottom, 0px) + 2rem)',
        textAlign: 'center', cursor: 'pointer', overflow: 'hidden',
      }}
    >
      {/* A slow swell behind the hull. One element, one transform, no loop. */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0, scaleX: 0.6 }}
        animate={{ opacity: reduced ? 0.25 : [0, 0.4, 0.25], scaleX: 1 }}
        transition={{ duration: reduced ? 0 : 2.4, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: '-10%', right: '-10%', top: '46%', height: 200,
          background: 'radial-gradient(ellipse 50% 100% at 50% 0%, rgba(120,180,240,0.30) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <p className="font-karla font-800 uppercase"
        style={{ fontSize: '0.56rem', letterSpacing: '0.3em', color: '#7fa8d8', marginBottom: 4 }}>
        {data.fromName} is retired
      </p>

      {/* The new hull sails in from the left and settles. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src={data.toImage} alt={data.toName}
        initial={reduced ? { opacity: 1 } : { opacity: 0, x: -90, scale: 0.82 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: reduced ? 0 : 1.1, ease: [0.16, 0.9, 0.28, 1], delay: reduced ? 0 : 0.15 }}
        style={{ width: 'min(78vw, 340px)', height: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.7))' }}
      />

      <motion.p
        className="font-cinzel font-800"
        initial={reduced ? { opacity: 1 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.85 }}
        style={{ fontSize: '2rem', lineHeight: 1.05, color: '#f7efd8', marginTop: 10, textShadow: '0 3px 18px rgba(0,0,0,0.9), 0 0 30px rgba(240,192,64,0.22)' }}
      >
        {data.toName}
      </motion.p>

      <motion.p
        className="font-karla font-700 uppercase"
        initial={reduced ? { opacity: 1 } : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.4, delay: reduced ? 0 : 1.05 }}
        style={{ fontSize: '0.6rem', letterSpacing: '0.22em', color: '#c8aa6a', marginTop: 6 }}
      >
        She is yours
      </motion.p>

      {/* What she bought you. The reason the hull cost what it did. */}
      <motion.div
        initial={reduced ? { opacity: 1 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 1.25 }}
        style={{
          display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center',
          marginTop: 22, padding: '0.9rem 1.1rem', borderRadius: 16,
          background: 'rgba(0,0,0,0.34)', border: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        {data.stats.map((st, i) => {
          const delta = st.to - st.from
          return (
            <div key={st.label} style={{ minWidth: 54 }}>
              <p className="font-karla font-800 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)' }}>{st.label}</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', lineHeight: 1.1, color: '#ecdcbd', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {reduced ? st.to : <CountUp to={st.to} delay={1350 + i * 90} />}
              </p>
              <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: delta > 0 ? '#7fdfa3' : 'transparent', fontVariantNumeric: 'tabular-nums' }}>
                {delta > 0 ? `+${delta}` : '+0'}
              </p>
            </div>
          )
        })}
      </motion.div>

      <motion.p
        className="font-karla uppercase"
        initial={{ opacity: 0 }} animate={{ opacity: 0.5 }}
        transition={{ duration: 0.4, delay: reduced ? 0 : 2 }}
        style={{ fontSize: '0.52rem', letterSpacing: '0.18em', color: '#8a96a8', marginTop: 20 }}
      >
        Tap to continue
      </motion.p>
    </motion.div>,
    document.body,
  )
}
