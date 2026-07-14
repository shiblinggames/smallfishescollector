'use client'

// ── THE CUTSCENE KIT ─────────────────────────────────────────────────────────
// Shared vocabulary for every scene in the game: the story nodes on the raid map
// (StoryScene) and the pre-fight boss dialogue (BossDialogueModal).
//
// These two were BUILT SEPARATELY and drifted, which is exactly how the boss scenes
// ended up still being a slideshow while the story nodes became cutscenes. Anything
// both of them do lives here now, once, so the next change lands in both or neither.

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { vibrate } from '@/lib/haptics'

export const GOLD = '#f0c040'
const TYPE_MS = 22          // per character
const PUNCT_MS = 190        // a line breathes where it should
const COMMA_MS = 80

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** *Emphasis* → the scene's accent. A writer's hammer. */
export function renderEmphasis(text: string, accent: string) {
  return text.split(/(\*[^*]+\*)/g).map((seg, i) =>
    seg.startsWith('*') && seg.endsWith('*') && seg.length > 2
      ? <strong key={i} className="font-800" style={{ color: accent }}>{seg.slice(1, -1)}</strong>
      : <span key={i}>{seg}</span>
  )
}

/**
 * The typewriter, and the beat before it.
 *
 * Each character schedules the next, so punctuation buys itself an extra pause and a
 * line reads at the speed it should be read at. `pause` holds a silence BEFORE the
 * first character, which is the whole difference between a reveal and a sentence.
 *
 * `finish()` completes the current line instantly. Callers wire it so one tap
 * finishes and the NEXT one advances, never both, or a fast tapper eats lines.
 */
export function useTypewriter(
  text: string,
  key: number | string,
  opts: { pause?: number; onBegin?: () => void; reduced?: boolean } = {},
) {
  const { pause = 0, onBegin, reduced = false } = opts
  const [shown, setShown] = useState(0)
  const [held, setHeld] = useState(false)
  const timers = useRef<number[]>([])
  const beginRef = useRef(onBegin)
  beginRef.current = onBegin

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }

  useEffect(() => {
    clear()
    setShown(0)
    if (reduced) { setShown(text.length); setHeld(false); beginRef.current?.(); return }

    const type = (n: number) => {
      if (n >= text.length) return
      const ch = text[n]
      const delay = '.!?'.includes(ch) ? PUNCT_MS : ',;:'.includes(ch) ? COMMA_MS : TYPE_MS
      timers.current.push(window.setTimeout(() => { setShown(n + 1); type(n + 1) }, delay))
    }
    const begin = () => { setHeld(false); beginRef.current?.(); type(0) }

    if (pause > 0) { setHeld(true); timers.current.push(window.setTimeout(begin, pause)) }
    else begin()

    return clear
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced])

  const typing = held || shown < text.length
  const finish = () => { clear(); setHeld(false); setShown(text.length) }
  return { shown, typing, held, finish }
}

/** A blinking caret. The thing that says "words are arriving". */
export function Caret({ accent }: { accent: string }) {
  return (
    <motion.span aria-hidden
      animate={{ opacity: [1, 0.15, 1] }} transition={{ duration: 0.75, repeat: Infinity }}
      style={{ display: 'inline-block', width: 2, height: '1em', marginLeft: 2, verticalAlign: 'text-bottom', background: accent }} />
  )
}

/** Letterbox bars. The oldest trick there is for saying "this is a scene". */
export function Letterbox({ height = 44, z = 6 }: { height?: number; z?: number }) {
  return (
    <>
      <motion.div aria-hidden initial={{ height: 0 }} animate={{ height }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, background: '#000', zIndex: z }} />
      <motion.div aria-hidden initial={{ height: 0 }} animate={{ height }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#000', zIndex: z }} />
    </>
  )
}

/** Drifting motes, a slow push-in, and a vignette that breathes. Nothing loud. The
 *  job is only to stop the frame being a photograph. */
export function LivingFrame({ accent, reduced }: { accent: string; reduced?: boolean }) {
  return (
    <>
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
                borderRadius: '50%', background: i % 3 === 0 ? `${accent}88` : 'rgba(255,245,220,0.5)',
              }} />
          ))}
        </motion.div>
      )}
      <motion.div aria-hidden
        animate={reduced ? {} : { opacity: [0.6, 0.82, 0.6] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 45%, transparent 38%, rgba(2,2,3,0.85) 100%)' }} />
    </>
  )
}

/** A hard blow-out on a beat that earns it. Bump `k` to fire. */
export function FlashOut({ k }: { k: number }) {
  if (k <= 0) return null
  return (
    <motion.div key={k} aria-hidden
      initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
      style={{ position: 'absolute', inset: 0, background: '#fff6df', pointerEvents: 'none', zIndex: 8 }} />
  )
}

/** A thin progress line. The dots said "slide 4 of 9". */
export function SceneProgress({ idx, total, accent }: { idx: number; total: number; accent: string }) {
  return (
    <div aria-hidden style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, zIndex: 7, background: 'rgba(255,255,255,0.07)' }}>
      <motion.div
        animate={{ width: `${((idx + 1) / Math.max(1, total)) * 100}%` }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        style={{ height: '100%', background: `linear-gradient(90deg, ${accent}77, ${accent})` }} />
    </div>
  )
}

/** The haptic a line opens on. A character speaking hits harder than narration. */
export function lineHaptic(fx: string | undefined, isCharacter: boolean) {
  vibrate(fx === 'shake' ? [0, 40, 30, 60] : isCharacter ? 8 : 4)
}
