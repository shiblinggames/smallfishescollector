'use client'

// ── STORY SCENES ─────────────────────────────────────────────────────────────
// The writing was never the problem. The DELIVERY was: centered text on a static
// gradient, a 110px portrait in the same spot every line, and progress dots at the
// bottom telling the player they were on slide 4 of 9. It read as a slideshow
// because it was built like one.
//
// This is the cutscene vocabulary it was missing:
//
//   TEXT TYPES. Letter by letter. One tap finishes the line, the next advances. A
//   tap is pacing now instead of paging, and it is the single strongest signal that
//   this is a scene and not a page of prose.
//
//   CHARACTERS TAKE A STAGE. Portraits are big busts, entering from the wings and
//   holding their side. Whoever is talking is lit and forward; everyone else dims
//   and desaturates but STAYS ON STAGE, so a conversation looks like two people in
//   a room rather than two slides.
//
//   THE FRAME IS ALIVE. A slow push-in, drifting motes, a vignette that breathes.
//   Nothing loud. It just has to not be a photograph.
//
//   BEATS CAN LAND. `pause` holds a silence before a line (the difference between a
//   reveal and a sentence), `fx` shakes or blows out the frame, and *asterisks* hit
//   a word in the accent. All optional, so every existing scene still plays.
//
// Portaled to document.body — Nav has translateZ(0) and the node sheet is itself a
// fixed portal at z-1000, so the scene sits above both.

import { useEffect, useRef, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import type { SceneLine } from '@/lib/raidMap'

const GOLD = '#f0c040'
const TYPE_MS = 22          // per character
const PUNCT_MS = 190        // extra beat after . ! ? — the line breathes where it should
const COMMA_MS = 80

/** Who is on stage, and where. Two slots: a conversation, not a crowd. */
interface StageChar { speaker: string; portrait: string }

/**
 * Walk the scene up to `idx` and work out who is standing where. Deterministic, so
 * it recomputes cleanly on any index change (including a Skip-back or a replay) with
 * no refs to fall out of sync.
 *
 * First character to speak takes the LEFT. The next distinct one takes the RIGHT. A
 * third evicts whoever has been quiet longest, which is what a camera would do.
 */
function stageAt(lines: SceneLine[], idx: number): { left: StageChar | null; right: StageChar | null } {
  let left: StageChar | null = null
  let right: StageChar | null = null
  let lastSpokeLeft = -1
  let lastSpokeRight = -1

  for (let i = 0; i <= idx && i < lines.length; i++) {
    const l = lines[i]
    if (!l.speaker || !l.portrait) continue
    const c: StageChar = { speaker: l.speaker, portrait: l.portrait }
    if (left?.speaker === l.speaker) { lastSpokeLeft = i; continue }
    if (right?.speaker === l.speaker) { lastSpokeRight = i; continue }
    if (!left) { left = c; lastSpokeLeft = i }
    else if (!right) { right = c; lastSpokeRight = i }
    else if (lastSpokeLeft <= lastSpokeRight) { left = c; lastSpokeLeft = i }
    else { right = c; lastSpokeRight = i }
  }
  return { left, right }
}

/** *Emphasis* → accent. A writer's hammer. */
function renderText(text: string, accent: string) {
  return text.split(/(\*[^*]+\*)/g).map((seg, i) =>
    seg.startsWith('*') && seg.endsWith('*') && seg.length > 2
      ? <strong key={i} className="font-800" style={{ color: accent }}>{seg.slice(1, -1)}</strong>
      : <span key={i}>{seg}</span>
  )
}

export default function StoryScene({ title, lines, ctaLabel, pending, accent, onComplete, onSkip }: {
  title: string
  lines: SceneLine[]
  ctaLabel: string
  pending?: boolean
  /** The scene's color temperature (node.sceneAccent). Gold when unset. */
  accent?: string
  onComplete: () => void
  onSkip: () => void
}) {
  const ACCENT = accent ?? GOLD
  const [idx, setIdx] = useState(0)
  const [shown, setShown] = useState(0)      // characters revealed of the current line
  const [held, setHeld] = useState(false)    // inside a `pause` beat, before typing
  const [flash, setFlash] = useState(0)
  const timers = useRef<number[]>([])

  const line = lines[idx]
  const last = idx === lines.length - 1
  const full = line?.text.length ?? 0
  const typing = held || shown < full
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  // ── The typewriter. Each character schedules the next, so punctuation can buy
  //    itself an extra beat and the line reads at the speed it should be read at.
  useEffect(() => {
    clearTimers()
    setShown(0)
    if (!line) return
    if (reduced) { setShown(line.text.length); setHeld(false); return }

    const type = (n: number) => {
      if (n >= line.text.length) return
      const ch = line.text[n]
      const delay = '.!?'.includes(ch) ? PUNCT_MS : ',;:'.includes(ch) ? COMMA_MS : TYPE_MS
      timers.current.push(window.setTimeout(() => { setShown(n + 1); type(n + 1) }, delay))
    }

    // Hold the beat first, if the line asked for one.
    const begin = () => {
      setHeld(false)
      if (line.fx === 'flash') setFlash(f => f + 1)
      vibrate(line.fx === 'shake' ? [0, 40, 30, 60] : line.speaker ? 8 : 4)
      type(0)
    }
    if (line.pause && line.pause > 0) {
      setHeld(true)
      timers.current.push(window.setTimeout(begin, line.pause))
    } else {
      begin()
    }
    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, reduced])

  // Lock body scroll while the scene owns the viewport.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  /** One tap finishes the line. The next one moves on. Never both at once — a tap
   *  that both completed AND advanced would eat lines on a fast tapper. */
  function tap() {
    if (typing) { clearTimers(); setHeld(false); setShown(full); return }
    if (!last) setIdx(i => i + 1)
  }

  const { left, right } = stageAt(lines, idx)
  const speaking = line?.speaker ?? null
  // TWO SHOT TYPES, chosen once per scene so the layout never jumps mid-beat.
  //
  // 11 of the 19 scenes are pure narration with no portraits at all. Hanging a
  // dialogue plate at the bottom of an empty frame would look worse than what it
  // replaced, so a cast-less scene plays as a TITLE CARD: the words centered in the
  // dark, big, unboxed. A scene WITH a cast gets the visual-novel shot — busts on a
  // stage, plate at their feet. The variety is the point; a betrayal and a weather
  // report should not be framed identically.
  const hasCast = useMemo(() => lines.some(l => l.speaker && l.portrait), [lines])
  const shake = line?.fx === 'shake' && !reduced && !held

  // ── THE BUST ────────────────────────────────────────────────────────────────
  // It used to enter and then stand perfectly still forever, which is the difference
  // between an actor and a cardboard cutout. Now it BREATHES (a slow float that never
  // stops), LEANS IN when it takes a line, JOLTS on a shake, and creeps forward
  // through a held pause so a silence has something to build on.
  const bust = (c: StageChar | null, side: 'left' | 'right') => {
    if (!c) return null
    const lit = speaking === c.speaker
    // Lean on the line, jolt on the hit, creep during the beat before it.
    const emphasis = lit && shake ? 1.06 : lit && held ? 1.03 : lit ? 1 : 0.93
    return (
      <motion.div
        key={`${side}-${c.speaker}`}
        initial={{ opacity: 0, x: side === 'left' ? -46 : 46, scale: 0.9 }}
        animate={{
          opacity: lit ? 1 : 0.4,
          x: shake && lit ? [0, -6, 5, -3, 0] : 0,
          scale: emphasis,
          y: lit ? 0 : 8,
          filter: lit ? 'grayscale(0) brightness(1)' : 'grayscale(0.8) brightness(0.5)',
        }}
        transition={{
          scale: { type: 'spring', stiffness: 260, damping: 20 },
          x: shake && lit ? { duration: 0.4 } : { type: 'spring', stiffness: 220, damping: 26 },
          default: { type: 'spring', stiffness: 220, damping: 26 },
        }}
        style={{
          position: 'absolute', bottom: 0, [side]: '2%',
          width: 'min(44vw, 200px)', aspectRatio: '1 / 1',
          zIndex: lit ? 2 : 1, pointerEvents: 'none',
          transformOrigin: side === 'left' ? 'bottom left' : 'bottom right',
        }}
      >
        {/* The breath. Never stops, so nobody on this stage is ever a photograph. */}
        <motion.div
          animate={reduced ? {} : { y: [0, -5, 0], rotate: lit ? [0, 0.5, 0] : [0, 0.25, 0] }}
          transition={{ duration: lit ? 3.4 : 4.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: '100%', height: '100%' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.portrait} alt="" decoding="async"
            style={{
              width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom',
              filter: lit
                ? `drop-shadow(0 0 30px ${ACCENT}33) drop-shadow(0 12px 30px rgba(0,0,0,0.78))`
                : 'drop-shadow(0 10px 24px rgba(0,0,0,0.7))',
            }} />
        </motion.div>
      </motion.div>
    )
  }

  const scene = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={tap}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 38%, #171208 0%, #0a0705 62%, #040303 100%)',
        cursor: last && !typing ? 'default' : 'pointer',
        WebkitTapHighlightColor: 'transparent', userSelect: 'none',
      }}
    >
      {/* ── THE FRAME IS ALIVE ────────────────────────────────────────────────
          A slow push-in on the whole plate plus drifting motes. It is barely
          perceptible on purpose: the job is only to not be a photograph. */}
      {!reduced && (
        <motion.div aria-hidden
          animate={{ scale: [1, 1.07] }}
          transition={{ duration: 26, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
          style={{ position: 'absolute', inset: '-4%', pointerEvents: 'none' }}>
          {Array.from({ length: 14 }).map((_, i) => (
            <motion.span key={i}
              animate={{ y: [0, -26, 0], opacity: [0, 0.5, 0] }}
              transition={{ duration: 7 + (i % 5) * 2.4, repeat: Infinity, delay: i * 0.9, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                left: `${(i * 37) % 96 + 2}%`, top: `${(i * 53) % 78 + 10}%`,
                width: i % 4 === 0 ? 3 : 2, height: i % 4 === 0 ? 3 : 2,
                borderRadius: '50%', background: i % 3 === 0 ? `${ACCENT}88` : 'rgba(255,245,220,0.5)',
              }} />
          ))}
        </motion.div>
      )}
      {/* Vignette that breathes. */}
      <motion.div aria-hidden
        animate={reduced ? {} : { opacity: [0.6, 0.82, 0.6] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 45%, transparent 38%, rgba(2,2,3,0.85) 100%)' }} />

      {/* fx: flash — a hard blow-out on a beat that earns it. */}
      <AnimatePresence>
        {flash > 0 && (
          <motion.div key={flash} aria-hidden
            initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, background: '#fff6df', pointerEvents: 'none', zIndex: 8 }} />
        )}
      </AnimatePresence>

      {/* ── LETTERBOX. The oldest trick there is for saying "this is a scene". */}
      <motion.div aria-hidden initial={{ height: 0 }} animate={{ height: 44 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, background: '#000', zIndex: 6 }} />
      <motion.div aria-hidden initial={{ height: 0 }} animate={{ height: 44 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#000', zIndex: 6 }} />

      {/* Beat title + skip, riding the top bar. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, zIndex: 7,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.1rem' }}>
        <span className="font-karla font-700 uppercase truncate" style={{ fontSize: '0.55rem', letterSpacing: '0.18em', color: 'rgba(240,237,232,0.42)' }}>
          {title}
        </span>
        <button onClick={e => { e.stopPropagation(); onSkip() }} className="font-karla font-700 uppercase tap"
          style={{ flexShrink: 0, fontSize: '0.55rem', letterSpacing: '0.14em', padding: '0.3rem 0.6rem', borderRadius: 7,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,237,232,0.5)', cursor: 'pointer' }}>
          Skip
        </button>
      </div>

      {/* ── THE SHOT: stage + dialogue, rocked together when a line hits. ────── */}
      <motion.div
        animate={
          shake ? { x: [0, -9, 8, -6, 4, 0], y: [0, 4, -3, 2, 0], scale: 1.02 }
          : held ? { x: 0, y: 0, scale: 1.035 }     // the camera creeps in on a held beat
          : { x: 0, y: 0, scale: 1 }
        }
        transition={
          shake ? { duration: 0.42 }
          : held ? { duration: (line?.pause ?? 600) / 1000, ease: 'easeInOut' }
          : { duration: 0.5, ease: 'easeOut' }
        }
        style={{ position: 'absolute', inset: '44px 0', display: 'flex', flexDirection: 'column',
          justifyContent: hasCast ? 'flex-end' : 'center' }}
      >
        {/* ── TITLE CARD — a scene with no cast. Words in the dark, nothing else. */}
        {!hasCast && (
          <div style={{ padding: '0 1.6rem', textAlign: 'center' }}>
            <p className="font-karla" style={{
              maxWidth: 500, margin: '0 auto',
              fontSize: '1.22rem', lineHeight: 1.72,
              color: 'rgba(244,240,232,0.94)', fontStyle: 'italic',
              textShadow: '0 2px 20px rgba(0,0,0,0.8)',
              minHeight: '5.2em',
            }}>
              {renderText(line?.text.slice(0, shown) ?? '', ACCENT)}
              {typing && (
                <motion.span aria-hidden
                  animate={{ opacity: [1, 0.15, 1] }} transition={{ duration: 0.75, repeat: Infinity }}
                  style={{ display: 'inline-block', width: 2, height: '1em', marginLeft: 3,
                    verticalAlign: 'text-bottom', background: ACCENT }} />
              )}
            </p>
            <div style={{ marginTop: 26, minHeight: 52, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {last && !typing ? (
                <button onClick={e => { e.stopPropagation(); onComplete() }} disabled={pending}
                  className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
                  style={{ width: '100%', maxWidth: 340, padding: '0.85rem', borderRadius: 12, fontSize: '0.98rem',
                    color: '#1a1206', background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}cc)`,
                    border: `1px solid ${ACCENT}`, cursor: pending ? 'wait' : 'pointer', boxShadow: `0 0 22px ${ACCENT}33` }}>
                  {pending ? '…' : ctaLabel}
                </button>
              ) : (
                <motion.span className="font-karla font-700 uppercase"
                  animate={{ opacity: typing ? 0.3 : [0.4, 0.85, 0.4] }}
                  transition={typing ? { duration: 0.2 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ fontSize: '0.56rem', letterSpacing: '0.16em', color: 'rgba(240,237,232,0.6)' }}>
                  {typing ? 'Tap to skip ▸' : 'Tap ▸'}
                </motion.span>
              )}
            </div>
          </div>
        )}
        {hasCast && (<>
        {/* The stage. Busts sit BEHIND the dialogue plate and are overlapped by it,
            which is what puts them in the room instead of on a card. */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <AnimatePresence>{bust(left, 'left')}</AnimatePresence>
          <AnimatePresence>{bust(right, 'right')}</AnimatePresence>
        </div>

        {/* The dialogue plate. */}
        <div style={{ position: 'relative', zIndex: 3, padding: '0 1rem calc(env(safe-area-inset-bottom, 0px) + 1.15rem)' }}>
          <motion.div layout
            style={{
              position: 'relative', width: '100%', maxWidth: 540, margin: '0 auto',
              minHeight: 132, padding: '1.05rem 1.15rem 1.15rem',
              borderRadius: 16,
              background: 'linear-gradient(180deg, rgba(14,11,7,0.93), rgba(6,5,4,0.97))',
              border: `1px solid ${speaking ? `${ACCENT}55` : 'rgba(255,255,255,0.12)'}`,
              boxShadow: `0 -8px 40px rgba(0,0,0,0.7)${speaking ? `, 0 0 30px ${ACCENT}12` : ''}`,
              backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
            }}>
            {/* Nameplate — a tab on the plate's shoulder. */}
            <AnimatePresence>
              {speaking && (
                <motion.span key={speaking}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="font-cinzel font-800 uppercase"
                  style={{
                    position: 'absolute', top: -11, left: 16,
                    fontSize: '0.62rem', letterSpacing: '0.16em', color: '#1a1206',
                    padding: '0.2rem 0.7rem', borderRadius: 999,
                    background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}cc)`,
                    boxShadow: `0 0 16px ${ACCENT}44`,
                  }}>
                  {speaking}
                </motion.span>
              )}
            </AnimatePresence>

            <p className="font-karla" style={{
              fontSize: speaking ? '1.02rem' : '0.98rem',
              lineHeight: 1.62,
              color: speaking ? '#f4f0e8' : 'rgba(240,237,232,0.86)',
              fontStyle: speaking ? 'normal' : 'italic',
              textAlign: 'left', margin: 0, minHeight: '3.2em',
            }}>
              {speaking && shown > 0 && <span style={{ color: `${ACCENT}bb` }}>&ldquo;</span>}
              {renderText(line?.text.slice(0, shown) ?? '', ACCENT)}
              {speaking && !typing && <span style={{ color: `${ACCENT}bb` }}>&rdquo;</span>}
              {/* The cursor. It is the thing that says "words are arriving". */}
              {typing && (
                <motion.span aria-hidden
                  animate={{ opacity: [1, 0.15, 1] }} transition={{ duration: 0.75, repeat: Infinity }}
                  style={{ display: 'inline-block', width: 2, height: '1em', marginLeft: 2,
                    verticalAlign: 'text-bottom', background: ACCENT }} />
              )}
            </p>

            {/* Advance affordance / final CTA, in the plate where the eye already is. */}
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', minHeight: 34, alignItems: 'center' }}>
              {last && !typing ? (
                <button onClick={e => { e.stopPropagation(); onComplete() }} disabled={pending}
                  className="font-cinzel font-800 uppercase tracking-[0.06em] tap"
                  style={{ width: '100%', padding: '0.8rem', borderRadius: 11, fontSize: '0.95rem',
                    color: '#1a1206', background: `linear-gradient(180deg, ${ACCENT}, ${ACCENT}cc)`,
                    border: `1px solid ${ACCENT}`, cursor: pending ? 'wait' : 'pointer', boxShadow: `0 0 20px ${ACCENT}33` }}>
                  {pending ? '…' : ctaLabel}
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
          </motion.div>
        </div>
        </>)}
      </motion.div>

      {/* Progress. A hairline on the bottom bar — the dots said "slide 4 of 9". */}
      <div aria-hidden style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, zIndex: 7, background: 'rgba(255,255,255,0.07)' }}>
        <motion.div
          animate={{ width: `${((idx + 1) / lines.length) * 100}%` }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          style={{ height: '100%', background: `linear-gradient(90deg, ${ACCENT}77, ${ACCENT})` }} />
      </div>
    </motion.div>
  )

  return createPortal(scene, document.body)
}
