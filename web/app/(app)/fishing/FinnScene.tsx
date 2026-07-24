'use client'

// ── FINN ANCIENT-CATCH CUTSCENE ──────────────────────────────────────────────
// The cinematic Finn beat that plays after each of the 6 Ancient Deep giants is
// landed. Same vocabulary as the raid StoryScene rework — typewriter, letterbox,
// a living frame, beats that can hold a silence — but a ONE-HANDER: only Finn is on
// stage, addressing the silent captain. He rides in as his CharacterAvatar (no
// bust art needed), breathing and leaning into his lines. Megalodon's beat runs on
// a cold accent so the frame itself feels a shade wrong the moment the mask cracks.
//
// PERF: the typewriter's per-character setState used to re-render the WHOLE scene
// ~45x/sec — reconciling Finn's avatar AND the living-frame's 15 motion nodes every
// tick, on a portal sitting over the still-animating fishing game. That lagged hard.
// Now the typing lives in its own <TypewriterPlate> child, so a keystroke re-renders
// ONLY the text; the parent hears "typing/held" a handful of times per line via a
// callback, and the avatar + frame are memoized so its rare re-renders skip them.
//
// Portaled to document.body so it sits above the fishing scene and the result card.

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { TypedBody, Letterbox, LivingFrame, FlashOut, SceneBackdrop, useTypewriter, lineHaptic, prefersReducedMotion } from '@/components/cutscene'
import { FINN_NAME, FINN_AVATAR, type FinnAncientBeat, type FinnSceneLine } from '@/lib/finn'

// Owns the per-character reveal. Re-renders on every keystroke, but only paints the
// dialogue text — nothing else in the scene is in this subtree. Reports typing/held
// up so the parent can lean the bust and swap the tap affordance without itself
// re-rendering per char.
function TypewriterPlate({ line, lineKey, reduced, accent, allText, onBegin, onState, finishRef }: {
  line: FinnSceneLine
  lineKey: number
  reduced: boolean
  accent: string
  allText: string[]
  onBegin: () => void
  onState: (typing: boolean, held: boolean) => void
  finishRef: React.MutableRefObject<() => void>
}) {
  const { shown, typing, held, finish } = useTypewriter(line.text, lineKey, { pause: line.pause, reduced, onBegin })
  finishRef.current = finish
  useEffect(() => { onState(typing, held) }, [typing, held, onState])
  return <TypedBody all={allText} text={line.text} shown={shown} typing={typing} accent={accent} quoted />
}

export default function FinnScene({ beat, onComplete }: {
  beat: FinnAncientBeat
  onComplete: () => void
}) {
  const ACCENT = beat.accent ?? '#c8a060'
  const reduced = useMemo(prefersReducedMotion, [])
  const [idx, setIdx] = useState(0)
  const [flash, setFlash] = useState(0)
  // Mirrors of the child typewriter's state — updated a few times per line (start,
  // pause-end, done), NOT per character. Drive the bust lean + tap affordance.
  const [typing, setTyping] = useState(true)
  const [held, setHeld] = useState(false)
  const finishRef = useRef<() => void>(() => {})

  const line = beat.lines[idx]
  const last = idx === beat.lines.length - 1
  const allText = useMemo(() => beat.lines.map(l => l.text), [beat])
  const shake = line?.fx === 'shake' && !reduced && !held
  const lean = shake ? 1.05 : held ? 1.03 : typing ? 1.0 : 0.99
  const avatarSize = useMemo(() => Math.round(Math.min(220, typeof window !== 'undefined' ? window.innerWidth * 0.5 : 200)), [])

  // Own the viewport — no background scroll while the scene plays.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const onState = useCallback((t: boolean, h: boolean) => { setTyping(t); setHeld(h) }, [])
  const onBegin = () => {
    if (line?.fx === 'flash') setFlash(f => f + 1)
    lineHaptic(line?.fx, true)
  }

  // One tap finishes the line; the next advances. Never both — a fast tapper would
  // eat lines otherwise.
  function tap() {
    if (typing) { finishRef.current(); return }
    if (!last) setIdx(i => i + 1)
  }

  // Heavy statics, memoized so the parent's (now rare) re-renders never reconcile
  // the avatar or the 15 living-frame motion nodes — and the breathing loop never
  // restarts. This is the bulk of the perf win.
  const livingFrame = useMemo(() => <LivingFrame accent={ACCENT} reduced={reduced} />, [ACCENT, reduced])
  // The giants come up out of the black deep, so every ancient beat plays over the
  // last-fathom backdrop. Memoized so the per-keystroke re-renders never restart its
  // slow push-in (same perf reasoning as the frame + bust).
  const backdrop = useMemo(() => <SceneBackdrop src="/scenes/last-fathom.jpg" reduced={reduced} />, [reduced])
  const bust = useMemo(() => (
    // Mirror lives on a STATIC wrapper — framer animates the scale/y above, so a
    // scaleX(-1) up there would be clobbered by its generated transform.
    <div style={{ transform: FINN_AVATAR.mirrored ? 'scaleX(-1)' : 'none' }}>
      <motion.div animate={reduced ? {} : { y: [0, -6, 0] }} transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}>
        <CharacterAvatar
          characterColor={FINN_AVATAR.characterColor}
          equippedHat={FINN_AVATAR.equippedHat ?? null}
          bgColor={FINN_AVATAR.bgColor}
          ringColor={ACCENT}
          size={avatarSize}
        />
      </motion.div>
    </div>
  ), [ACCENT, reduced, avatarSize])

  const scene = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={tap}
      style={{
        position: 'fixed', inset: 0, zIndex: 9300, overflow: 'hidden',
        background: `radial-gradient(ellipse at 50% 40%, ${ACCENT}14 0%, #0a0d13 60%, #04050a 100%)`,
        cursor: last && !typing ? 'default' : 'pointer',
        WebkitTapHighlightColor: 'transparent', userSelect: 'none',
      }}
    >
      {backdrop}
      {livingFrame}
      <AnimatePresence><FlashOut k={flash} /></AnimatePresence>
      <Letterbox />

      {/* Eyebrow — he stays "Rival" even in the Megalodon beat; the wrongness is
          in the words and the cold light, never a label that tips the twist. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, zIndex: 7,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 1.1rem' }}>
        {!last && (
          <button onClick={e => { e.stopPropagation(); onComplete() }} className="font-karla font-700 uppercase tap"
            style={{ fontSize: '0.55rem', letterSpacing: '0.14em', padding: '0.3rem 0.6rem', borderRadius: 7,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,237,232,0.5)', cursor: 'pointer' }}>
            Skip
          </button>
        )}
      </div>

      {/* The shot: Finn above, dialogue plate at his feet, rocked together on a hit. */}
      <motion.div
        animate={shake ? { x: [0, -9, 8, -6, 4, 0], y: [0, 4, -3, 2, 0] } : { x: 0, y: 0 }}
        transition={shake ? { duration: 0.42 } : { duration: 0.3 }}
        style={{
          position: 'absolute', top: 44, left: 0, right: 0,
          bottom: 'calc(44px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }}
      >
        {/* Finn on stage. The avatar breathes so he is never a photograph, and
            leans into whatever he is saying. Mirrored so he faces the captain. */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: lean }}
            transition={{ scale: { type: 'spring', stiffness: 260, damping: 20 }, default: { type: 'spring', stiffness: 220, damping: 26 } }}
            style={{ marginBottom: 6, filter: `drop-shadow(0 0 34px ${ACCENT}33) drop-shadow(0 14px 30px rgba(0,0,0,0.8))` }}
          >
            {bust}
          </motion.div>
        </div>

        {/* Dialogue plate. */}
        <div style={{ position: 'relative', zIndex: 3, flexShrink: 0, padding: '0 1rem 1.15rem' }}>
          <div style={{
            position: 'relative', width: '100%', maxWidth: 540, margin: '0 auto',
            padding: '1.05rem 1.15rem 1.15rem', borderRadius: 16,
            background: 'linear-gradient(180deg, rgba(10,14,22,0.94), rgba(5,7,12,0.97))',
            border: `1px solid ${ACCENT}55`,
            boxShadow: `0 -8px 40px rgba(0,0,0,0.7), 0 0 30px ${ACCENT}12`,
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          }}>
            {/* Nameplate — a tab on the plate's shoulder. */}
            <span className="font-cinzel font-800 uppercase"
              style={{ position: 'absolute', top: -11, left: 16, fontSize: '0.62rem', letterSpacing: '0.16em', color: '#10151f',
                padding: '0.2rem 0.7rem', borderRadius: 999, background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}cc)`, boxShadow: `0 0 16px ${ACCENT}44` }}>
              {FINN_NAME}
            </span>

            <TypewriterPlate
              line={line} lineKey={idx} reduced={reduced} accent={ACCENT} allText={allText}
              onBegin={onBegin} onState={onState} finishRef={finishRef}
            />

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', minHeight: 34, alignItems: 'center' }}>
              {last && !typing ? (
                <button onClick={e => { e.stopPropagation(); onComplete() }}
                  className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
                  style={{ width: '100%', padding: '0.8rem', borderRadius: 11, fontSize: '0.95rem',
                    color: '#10151f', background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}cc)`,
                    border: `1px solid ${ACCENT}`, cursor: 'pointer', boxShadow: `0 0 20px ${ACCENT}33` }}>
                  {beat.ctaLabel ?? 'Back to the water'}
                </button>
              ) : (
                <motion.span className="font-karla font-700 uppercase"
                  animate={{ opacity: typing ? 0.35 : [0.4, 0.85, 0.4] }}
                  transition={typing ? { duration: 0.2 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ fontSize: '0.56rem', letterSpacing: '0.16em', color: 'rgba(240,237,232,0.6)' }}>
                  {typing ? 'Tap to skip ▸' : 'Tap ▸'}
                </motion.span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Progress hairline on the bottom bar. */}
      <div aria-hidden style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, zIndex: 7, background: 'rgba(255,255,255,0.07)' }}>
        <motion.div
          animate={{ width: `${((idx + 1) / beat.lines.length) * 100}%` }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ height: '100%', background: `linear-gradient(90deg, ${ACCENT}77, ${ACCENT})` }} />
      </div>
    </motion.div>
  )

  return createPortal(scene, document.body)
}
