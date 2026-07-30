'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import { SPOILS_PRICE } from '@/lib/shipBerth'
import { chooseSpoil, buySpoil, type SpoilSide } from './spoilsActions'

/** THE SPOILS OF THE SUNKEN HAND.
 *
 *  Two things came up off his wreck and only one fits aboard today. This is a
 *  CHOICE first and a shop second, so it is built like the Accelerator bench
 *  rather than like a price list: each side is a living core with the item
 *  suspended in it, the two breathe at different rates depending on their
 *  state, and committing is a deliberate two-step rather than a single tap you
 *  can fat-finger into a permanent decision.
 *
 *  States a side can be in:
 *    open    nothing taken yet. Both cores idle-breathe, both are pickable.
 *    armed   you tapped it. It comes ALIVE and asks you to confirm.
 *    taken   yours. Locked bright, motes orbiting, item lit.
 *    priced  the one you passed on. Dimmed to embers, wearing its cost.
 *    ready   priced AND affordable. It starts breathing again to say so.
 */

const REEL = '#6fd3c7'   // fishing side: cold reel-teal
const MOUNT = '#e0a44a'  // nav side: warm gun-brass
const DIM = '#6d6a66'

type Side = { id: SpoilSide; title: string; item: string; art: string; blurb: string; accent: string }

const SIDES: Side[] = [
  {
    id: 'fishing',
    title: 'The Deep Reel',
    item: "The Angler's Patience",
    art: '/finn_final.png',
    blurb: 'A second special slot on your rig. His reel is the only thing that seats in it: bites come slower, and what comes up is rarer for the wait.',
    accent: REEL,
  },
  {
    id: 'nav',
    title: 'The Sixth Mount',
    item: 'The Borrowed Jaw',
    art: '/finn_final.png',
    blurb: 'One more raid item framed onto your hull. His jaw is the only thing that mounts there, and it bites hardest on the things that fight back.',
    accent: MOUNT,
  },
]

/** The bench core. Everything about its life is driven by `intensity`, so a
 *  side's state is legible from across the screen without reading a word. */
function SpoilCore({ size, accent, intensity, art }: {
  size: number; accent: string; intensity: 'idle' | 'armed' | 'taken' | 'cold'; art: string
}) {
  const cold = intensity === 'cold'
  const alive = intensity === 'armed' || intensity === 'taken'
  const motes = intensity === 'taken' ? 8 : intensity === 'armed' ? 5 : 0
  const col = cold ? DIM : accent
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <motion.div
        animate={alive
          ? { scale: [1, 1.12, 1], opacity: [0.82, 1, 0.82] }
          : cold ? { scale: 1, opacity: 0.28 } : { scale: [1, 1.05, 1], opacity: [0.5, 0.7, 0.5] }}
        transition={{ duration: intensity === 'taken' ? 1.1 : alive ? 1.5 : 2.6, repeat: cold ? 0 : Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: `radial-gradient(circle, #ffffff 0%, ${col}cc 26%, ${col}44 52%, transparent 74%)`,
          boxShadow: `0 0 ${alive ? 26 : 12}px ${col}${alive ? 'aa' : '44'}`,
        }} />
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: intensity === 'taken' ? 6 : 15, repeat: Infinity, ease: 'linear' }}
        style={{ position: 'absolute', inset: size * 0.09, borderRadius: '50%', border: `1.5px dashed ${col}88`, opacity: cold ? 0.2 : alive ? 0.7 : 0.36 }} />
      {Array.from({ length: motes }).map((_, i) => (
        <motion.div key={i}
          initial={{ rotate: (i / motes) * 360 }}
          animate={{ rotate: (i / motes) * 360 + 360 }}
          transition={{ duration: 3 + (i % 3), repeat: Infinity, ease: 'linear' }}
          style={{ position: 'absolute', inset: 0 }}>
          <div style={{ position: 'absolute', left: '50%', top: '3%', width: 4, height: 4, marginLeft: -2, borderRadius: '50%', background: col, boxShadow: `0 0 6px ${col}` }} />
        </motion.div>
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img src={art} alt="" aria-hidden decoding="async"
        animate={alive ? { y: [0, -3, 0], scale: intensity === 'taken' ? [1, 1.06, 1] : [1, 1.02, 1] } : {}}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: '20%', width: '60%', height: '60%', objectFit: 'contain',
          filter: cold ? 'grayscale(1) brightness(0.5)' : `drop-shadow(0 0 8px ${col}bb)`,
          zIndex: 1,
        }} />
    </div>
  )
}

export default function SpoilsBoard({ freeSide, paidSide, doubloons, onDone }: {
  freeSide: SpoilSide | null
  paidSide: SpoilSide | null
  doubloons: number
  onDone?: () => void
}) {
  const [armed, setArmed] = useState<SpoilSide | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState<SpoilSide | null>(null)

  const held = (s: SpoilSide) => freeSide === s || paidSide === s
  const picking = freeSide === null

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, side: SpoilSide) => {
    setBusy(true); setErr(null)
    const res = await fn()
    setBusy(false)
    if (!res.ok) { setErr(res.error ?? 'That did not take.'); vibrate([0, 40, 30, 40]); return }
    // The commit gets its own beat: a flare on the core you just claimed,
    // then the parent refreshes. Without it a permanent choice resolves with
    // nothing but a re-render.
    setArmed(null); setFlash(side); vibrate([0, 18, 40, 60])
    setTimeout(() => { setFlash(null); onDone?.() }, 900)
  }

  return (
    <div style={{ marginTop: '1.1rem' }}>
      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#7a7875', marginBottom: '0.55rem' }}>
        {picking ? 'Take One' : 'His Spoils'}
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {SIDES.map(s => {
          const mine = held(s.id)
          const isArmed = armed === s.id
          const isFlash = flash === s.id
          // The side you passed on: priced, and it only warms up again once you
          // can actually afford it.
          const priced = !mine && !picking
          const affordable = doubloons >= SPOILS_PRICE
          const intensity = mine ? 'taken' : isArmed ? 'armed' : priced && !affordable ? 'cold' : 'idle'
          const col = intensity === 'cold' ? DIM : s.accent

          return (
            <motion.div key={s.id}
              animate={isFlash ? { scale: [1, 1.03, 1] } : { scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              style={{
                position: 'relative', borderRadius: 14, overflow: 'hidden',
                padding: '0.8rem 0.85rem',
                background: mine
                  ? `linear-gradient(180deg, ${s.accent}18, rgba(8,12,18,0.5))`
                  : 'rgba(255,255,255,0.03)',
                border: `1px solid ${mine ? `${s.accent}66` : isArmed ? `${s.accent}99` : 'rgba(255,255,255,0.09)'}`,
                boxShadow: mine || isArmed ? `0 0 18px ${s.accent}33` : 'none',
              }}>
              {isFlash && (
                <motion.div aria-hidden
                  initial={{ opacity: 0.9, scale: 0.6 }} animate={{ opacity: 0, scale: 2.2 }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  style={{ position: 'absolute', left: '18%', top: '50%', width: 90, height: 90, marginTop: -45, marginLeft: -45, borderRadius: '50%', border: `2px solid ${s.accent}`, pointerEvents: 'none' }} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <SpoilCore size={72} accent={s.accent} intensity={intensity} art={s.art} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: intensity === 'cold' ? '#8a857c' : '#f0ede8' }}>{s.title}</span>
                    {mine && (
                      <span className="font-karla font-800 uppercase tracking-[0.12em]" style={{ fontSize: '0.5rem', color: s.accent }}>
                        {freeSide === s.id ? 'Claimed' : 'Bought'}
                      </span>
                    )}
                  </div>
                  <p className="font-karla" style={{ margin: '3px 0 0', fontSize: '0.68rem', lineHeight: 1.4, color: '#9a958c' }}>{s.blurb}</p>
                  <p className="font-karla font-700" style={{ margin: '4px 0 0', fontSize: '0.6rem', color: col }}>
                    Fits only: {s.item}
                  </p>
                </div>
              </div>

              {/* The commit. Arming first means a permanent choice always takes
                  two deliberate taps, never one stray thumb. */}
              {!mine && (
                <div style={{ marginTop: '0.7rem' }}>
                  {isArmed ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <motion.button whileTap={{ scale: 0.96 }} disabled={busy}
                        onClick={() => run(() => picking ? chooseSpoil(s.id) : buySpoil(s.id), s.id)}
                        className="font-cinzel font-700 uppercase tracking-[0.1em]"
                        style={{
                          flex: 1, height: 40, borderRadius: 11, cursor: 'pointer', border: 'none',
                          background: s.accent, color: '#10161d', fontSize: '0.74rem',
                          boxShadow: `0 4px 14px ${s.accent}55`, touchAction: 'manipulation',
                          opacity: busy ? 0.6 : 1,
                        }}>
                        {busy ? 'Hauling…' : picking ? 'Take it' : `Pay ${SPOILS_PRICE.toLocaleString()} ⟡`}
                      </motion.button>
                      <motion.button whileTap={{ scale: 0.96 }} onClick={() => { setArmed(null); setErr(null) }}
                        className="font-karla font-700 uppercase tracking-[0.1em]"
                        style={{ width: 92, height: 40, borderRadius: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: '#9a958c', fontSize: '0.62rem', touchAction: 'manipulation' }}>
                        Back
                      </motion.button>
                    </div>
                  ) : (
                    <motion.button whileTap={{ scale: 0.97 }}
                      disabled={priced && !affordable}
                      onClick={() => { vibrate([0, 12]); setArmed(s.id); setErr(null) }}
                      className="font-karla font-700 uppercase tracking-[0.1em]"
                      style={{
                        width: '100%', height: 38, borderRadius: 11,
                        cursor: priced && !affordable ? 'default' : 'pointer',
                        background: priced && !affordable ? 'rgba(255,255,255,0.03)' : `${s.accent}1f`,
                        border: `1px solid ${priced && !affordable ? 'rgba(255,255,255,0.08)' : `${s.accent}55`}`,
                        color: priced && !affordable ? '#6d6a66' : s.accent,
                        fontSize: '0.64rem', touchAction: 'manipulation',
                      }}>
                      {picking
                        ? 'Take this one'
                        : affordable
                          ? `Buy · ${SPOILS_PRICE.toLocaleString()} ⟡`
                          : `${SPOILS_PRICE.toLocaleString()} ⟡ · ${(SPOILS_PRICE - doubloons).toLocaleString()} short`}
                    </motion.button>
                  )}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>

      {err && (
        <p className="font-karla font-600" style={{ marginTop: 8, fontSize: '0.66rem', color: '#f0a0a0', textAlign: 'center' }}>{err}</p>
      )}
      {picking && (
        <p className="font-karla" style={{ marginTop: 8, fontSize: '0.62rem', color: '#7a7875', textAlign: 'center', lineHeight: 1.45 }}>
          One is free. The other keeps, at {SPOILS_PRICE.toLocaleString()} ⟡.
        </p>
      )}
    </div>
  )
}
