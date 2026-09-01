'use client'

// ── THE SETTINGS DISC, TOP RIGHT ────────────────────────────────────────────
//
// Three switches, and every one of them turns something OFF that is on by
// default. That is the whole shape of this panel and it is why there is no
// "restore defaults": the defaults are what you get by not touching it.
//
// ── ON THE RIGHT, ALONE ─────────────────────────────────────────────────────
//
// The rest of the HUD is a run of discs down the left: the clock, the chart,
// the day's orders, the trawls, the Salt Road. Every one of those is a place
// you are going or a thing waiting for you, and they close up on each other as
// their conditions come and go.
//
// This is neither. It is not part of the game, it is the knobs on the outside
// of it, and putting it at the end of that run would say it was another
// destination. The far corner says what it is by being nowhere near them.
//
// ── SWITCHES, NOT SLIDERS ───────────────────────────────────────────────────
//
// A volume slider is the better control for somebody who wants the music
// quieter, and a worse one for everybody else: on a phone it is a drag target
// in a corner your thumb reaches by accident, and the audio underneath ramps to
// one fixed level rather than an arbitrary gain. Two switches answer the
// question people actually have, which is "make it stop".

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import { allSettings, setSetting, type SeaSetting } from '@/lib/seaSettings'

const SEA = 'rgba(180,214,232'

function Switch({ on, onToggle, label, note }: {
  on: boolean; onToggle: () => void; label: string; note: string
}) {
  return (
    <button type="button" onClick={onToggle} data-no-steer
      role="switch" aria-checked={on} aria-label={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, width: '100%',
        padding: '0.6rem 0.2rem', background: 'none', border: 'none',
        borderTop: `1px solid ${SEA},0.1)`, cursor: 'pointer', textAlign: 'left',
      }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="font-cinzel font-700" style={{
          display: 'block', fontSize: '0.92rem', color: '#e8f2ea', lineHeight: 1.2,
        }}>{label}</span>
        <span className="font-karla" style={{
          display: 'block', fontSize: '0.68rem', color: `${SEA},0.5)`, marginTop: 2, lineHeight: 1.35,
        }}>{note}</span>
      </span>
      {/* A TRACK AND A KNOB, not a tick. A switch has to say what it will do
          next as well as what it is now, and a checkmark only ever says now. */}
      <span aria-hidden style={{
        position: 'relative', flexShrink: 0,
        width: 42, height: 24, borderRadius: 999,
        background: on ? 'rgba(150,206,172,0.28)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${on ? 'rgba(150,206,172,0.7)' : `${SEA},0.22)`}`,
        transition: 'background 0.16s, border-color 0.16s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 20 : 2,
          width: 18, height: 18, borderRadius: '50%',
          background: on ? '#a8d98a' : 'rgba(200,214,224,0.5)',
          transition: 'left 0.16s ease, background 0.16s',
        }} />
      </span>
    </button>
  )
}

export default function SeaSettings({ size, top }: {
  /** The HUD's disc size, so this matches the run on the other side. */
  size: number
  /** Same vertical as that run. */
  top: number
}) {
  const [open, setOpen] = useState(false)
  const [s, setS] = useState(() => allSettings())
  const wrap = useRef<HTMLDivElement | null>(null)

  // Read again on open. Nothing else writes these today, but the panel is the
  // only place that shows them and a stale switch is worse than no switch.
  useEffect(() => { if (open) setS(allSettings()) }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    // Tapping the sea closes it. `data-no-steer` on the wrapper already stops
    // the chart taking the press as a helm order, so this only has to notice
    // that the press landed elsewhere.
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  const flip = useCallback((k: SeaSetting) => {
    setS(prev => {
      const next = !prev[k]
      setSetting(k, next)
      return { ...prev, [k]: next }
    })
    vibrate(8)
  }, [])

  return (
    <div ref={wrap} data-no-steer
      onPointerDown={e => e.stopPropagation()}
      style={{ position: 'absolute', top, right: 12, zIndex: 40 }}>
      <button type="button" aria-label="Settings" title="Settings"
        onClick={() => { vibrate(8); setOpen(o => !o) }}
        style={{
          width: size, height: size, borderRadius: '50%', padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: open ? 'rgba(24,38,50,0.95)' : 'rgba(8,16,24,0.72)',
          border: `1px solid ${SEA},${open ? 0.45 : 0.22})`,
          color: `${SEA},${open ? 0.95 : 0.72})`,
          backdropFilter: 'blur(2px)',
        }}>
        <svg width={Math.round(size * 0.52)} height={Math.round(size * 0.52)}
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', top: size + 8, right: 0,
              // Wide enough for the longest note on one or two lines, and
              // capped against the viewport so it cannot hang off a phone.
              width: 'min(78vw, 268px)',
              // An OPAQUE base. This floats over painted, moving water and a
              // translucent panel over the sea reads as a smear.
              background: 'rgba(8,14,22,0.98)',
              border: `1px solid ${SEA},0.28)`,
              borderRadius: 14, padding: '0.8rem 0.9rem 0.5rem',
              boxShadow: '0 18px 48px rgba(0,0,0,0.6)',
            }}>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.56rem', letterSpacing: '0.18em',
              color: `${SEA},0.5)`, margin: '0 0 0.2rem',
            }}>Settings</p>

            <Switch label="Music" note="The sea's own soundtrack."
              on={s.music} onToggle={() => flip('music')} />
            <Switch label="Sound effects" note="Casts, catches and the dial."
              on={s.sfx} onToggle={() => flip('sfx')} />
            <Switch label="Bite timer" note="The running count while you wait on a bite."
              on={s.biteTimer} onToggle={() => flip('biteTimer')} />
            <Switch label="Sea motion" note="Foam and spray streaming past as you sail. Turn it off if the movement is too much."
              on={s.motion} onToggle={() => flip('motion')} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
