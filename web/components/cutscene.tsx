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
import { FINN_AVATAR } from '@/lib/finn'

export const GOLD = '#f0c040'
/** Finn, cropped to boat-and-fish: his raw fishing sprite carries a dangling
 *  line off to the left and ~425px of empty sky above his head, which framed
 *  him tiny in every shot he appeared in. Every Finn insert draws from this one
 *  so the silhouette, the reveal and the sinister fallback all match. */
const FINN_PORTRAIT = '/finn_portrait.png'
const TYPE_MS = 22          // per character
const PUNCT_MS = 190        // a line breathes where it should
const COMMA_MS = 80

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * A soft painterly establishing backdrop behind a scene (public/scenes/*). Full-bleed
 * cover image, a slow Ken-Burns push-in so it is never a photograph, and a legibility
 * scrim that darkens the top (under the title bar) and the bottom (under the dialogue
 * plate) while keeping the middle readable. Sits at the very back, below the
 * LivingFrame and the cast; scenes without one keep the plain dark gradient.
 */
export function SceneBackdrop({ src, reduced }: { src: string; reduced?: boolean }) {
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img
        src={src} alt="" decoding="async"
        initial={{ scale: reduced ? 1.06 : 1.05 }}
        animate={{ scale: reduced ? 1.06 : 1.15 }}
        transition={{ duration: 32, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
      />
      <div style={{ position: 'absolute', inset: 0, background:
        'linear-gradient(180deg, rgba(4,4,7,0.86) 0%, rgba(4,4,7,0.40) 16%, rgba(4,4,7,0.30) 40%, rgba(4,4,7,0.34) 56%, rgba(4,4,7,0.64) 76%, rgba(4,4,7,0.93) 100%)' }} />
    </div>
  )
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

/** The asterisks are markup, not letters. Strip them for anything that MEASURES text. */
export function stripEmphasis(text: string): string {
  return text.replace(/\*([^*]+)\*/g, '$1')
}

/**
 * The dialogue body, at a CONSTANT height for the entire scene.
 *
 * It used to size to whatever was currently TYPED, so the plate grew line by line as
 * the characters arrived and then jumped again between a short line and a long one.
 * The box flexed constantly while you were trying to read it.
 *
 * Every line of the scene is rendered into the SAME grid cell, invisible. The tallest
 * one sets the row height, the visible line overlays it, and the plate is therefore
 * exactly one size from the first character of the scene to the last. Nothing moves.
 */
export function TypedBody({ all, text, shown, typing, accent, italic, quoted, size = '1.05rem', align = 'left' }: {
  /** Every line in this scene, so the tallest can reserve the height. */
  all: string[]
  text: string
  shown: number
  typing: boolean
  accent: string
  italic?: boolean
  quoted?: boolean
  size?: string
  align?: 'left' | 'center'
}) {
  // Sizers always measure at the LARGER (non-italic character-line) metrics, so a
  // narrator line can never reserve less room than a spoken one would need.
  const metrics: React.CSSProperties = { fontSize: size, lineHeight: 1.62, margin: 0, whiteSpace: 'pre-wrap', textAlign: align }
  return (
    // The reserved height is the scene's LONGEST line, which for a scene with a big
    // narrator opener is genuinely tall. Cap it and scroll the overflow: without this
    // the plate can grow past what the frame has to give, and on a short phone the
    // bottom of it ends up behind the letterbox bar.
    <div style={{ display: 'grid', maxHeight: '34vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
      {all.map((t, i) => (
        <p key={i} aria-hidden className="font-karla"
          style={{ ...metrics, gridArea: '1 / 1', visibility: 'hidden', pointerEvents: 'none' }}>
          {quoted ? `“${stripEmphasis(t)}”` : stripEmphasis(t)}
        </p>
      ))}
      <p className="font-karla" style={{
        ...metrics, gridArea: '1 / 1',
        fontStyle: italic ? 'italic' : 'normal',
        color: italic ? 'rgba(240,237,232,0.86)' : '#f4f0e8',
      }}>
        {quoted && shown > 0 && <span style={{ color: `${accent}bb` }}>&ldquo;</span>}
        {renderEmphasis(text.slice(0, shown), accent)}
        {quoted && !typing && <span style={{ color: `${accent}bb` }}>&rdquo;</span>}
        {typing && <Caret accent={accent} />}
      </p>
    </div>
  )
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

/** ── INSERT SHOT ─────────────────────────────────────────────────────────────
 *  A stylized OBJECT the frame pushes into on a marquee reveal — no art, pure
 *  CSS/type. The cast steps aside and the thing itself takes the screen: the F
 *  signing the margin, a wax-sealed letter. Slow push-in; the key mark ignites
 *  in the scene accent. Extend the switch to add new objects. */
const PARCHMENT = 'linear-gradient(160deg, #e9ddc2 0%, #d9c9a6 55%, #ccb991 100%)'

export function InsertShot({ kind, wax, accent, reduced }: { kind: string; wax?: string; accent: string; reduced?: boolean }) {
  if (kind === 'ledger-f') return <LedgerFInsert accent={accent} reduced={reduced} />
  if (kind === 'sealed-letter') return <SealedLetterInsert wax={wax ?? ''} accent={accent} reduced={reduced} />
  if (kind === 'finn-silhouette') return <FinnSilhouetteInsert accent={accent} reduced={reduced} />
  if (kind === 'finn-unmasked') return <FinnUnmaskedInsert accent={accent} reduced={reduced} />
  if (kind === 'finn-sinister') return <FinnSinisterInsert accent={accent} reduced={reduced} />
  if (kind === 'ancient-harvest') return <AncientHarvestInsert accent={accent} reduced={reduced} />
  if (kind === 'finn-becoming') return <FinnBecomingInsert accent={accent} reduced={reduced} />
  return null
}

/*  FINN SILHOUETTE — the "not the final boss" sting after the Don. Reuses Finn's
 *  own CharacterAvatar (ruby, mirrored to face the player) blacked to a pure
 *  silhouette and risen from below, backlit by a cold deep-water glow so only
 *  the SHAPE reads. Recognizable to a fishing player who's met him; deniable to
 *  everyone else. NO art added, and Finn is never named — the full reveal stays
 *  for the merge cutscene. See [[project_finn_finndicate_twist]]. */
function FinnSilhouetteInsert({ accent, reduced }: { accent: string; reduced?: boolean }) {
  const sprite = FINN_PORTRAIT
  return (
    <div style={{ position: 'relative', width: 'min(74vw, 300px)', aspectRatio: '1 / 1', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
      {/* cold deep-water backlight so the black shape separates from the scene */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: reduced ? 0.85 : [0, 0.9, 0.72], scale: reduced ? 1 : [0.7, 1.08, 1] }}
        transition={{ duration: reduced ? 0.6 : 3.4, ease: 'easeOut', delay: 0.2 }}
        style={{ position: 'absolute', left: '50%', top: '44%', width: '78%', aspectRatio: '1', transform: 'translate(-50%, -50%)', borderRadius: '50%',
          background: `radial-gradient(circle at 50% 45%, ${accent}cc 0%, ${accent}44 42%, transparent 70%)`,
          filter: 'blur(6px)' }} />
      {/* Finn's own sprite, mirrored to face the player, risen from below and
          blacked to a pure silhouette. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img src={sprite} alt="" aria-hidden decoding="async"
        initial={{ opacity: 0, y: reduced ? 0 : 54 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ opacity: { duration: 0.5, delay: 0.25 }, y: { duration: reduced ? 0.4 : 2.4, ease: 'easeOut' } }}
        style={{ position: 'relative', height: '90%', width: 'auto', objectFit: 'contain',
          transform: FINN_AVATAR.mirrored ? 'scaleX(-1)' : 'none',
          filter: 'brightness(0) drop-shadow(0 0 12px rgba(0,0,0,0.75))' }} />
      {/* the waterline the deep folds back over him */}
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: '9%', height: 2,
        background: `linear-gradient(90deg, transparent, ${accent}66, transparent)` }} />
    </div>
  )
}

/** THE reveal shot. Deliberately the SAME sprite and stance as the Ch IV
 *  silhouette, so this reads as that shape finally lit rather than as a new
 *  character walking on: the black drains out of him over a long beat while the
 *  cold deep-water backlight warms to daylight. He was standing there the whole
 *  time. Uses his existing sprite, so no new art. */
function FinnUnmaskedInsert({ accent, reduced }: { accent: string; reduced?: boolean }) {
  const sprite = FINN_PORTRAIT
  return (
    <div style={{ position: 'relative', width: 'min(74vw, 300px)', aspectRatio: '1 / 1', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
      {/* the light comes UP on him: cold abyss glow warming to open daylight */}
      <motion.div aria-hidden
        initial={{ opacity: 0.85, scale: 1 }}
        animate={{ opacity: reduced ? 0.6 : [0.85, 0.55, 0.62], scale: reduced ? 1.1 : [1, 1.35, 1.28] }}
        transition={{ duration: reduced ? 0.6 : 4.2, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '44%', width: '86%', aspectRatio: '1', transform: 'translate(-50%, -50%)', borderRadius: '50%',
          background: `radial-gradient(circle at 50% 45%, ${accent}aa 0%, rgba(255,214,140,0.34) 44%, transparent 72%)`,
          filter: 'blur(7px)' }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img src={sprite} alt="" aria-hidden decoding="async"
        initial={{ opacity: 1, filter: 'brightness(0) drop-shadow(0 0 12px rgba(0,0,0,0.75))' }}
        animate={{ filter: reduced
          ? 'brightness(1) drop-shadow(0 0 14px rgba(0,0,0,0.5))'
          : ['brightness(0) drop-shadow(0 0 12px rgba(0,0,0,0.75))', 'brightness(0.35) drop-shadow(0 0 13px rgba(0,0,0,0.6))', 'brightness(1) drop-shadow(0 0 14px rgba(0,0,0,0.5))'] }}
        transition={{ duration: reduced ? 0.5 : 3.6, ease: 'easeInOut', times: reduced ? undefined : [0, 0.45, 1] }}
        style={{ position: 'relative', height: '90%', width: 'auto', objectFit: 'contain',
          transform: FINN_AVATAR.mirrored ? 'scaleX(-1)' : 'none' }} />
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: '9%', height: 2,
        background: `linear-gradient(90deg, transparent, ${accent}66, transparent)` }} />
    </div>
  )
}

/** THE HARVEST. The six Ancient Deep giants the player spent the whole fishing
 *  arc landing, pulled out of the hold and emptied one at a time.
 *
 *  This is the biggest spectacle in the campaign and it should be: those six are
 *  the hardest thing in the fishing track, and this beat turns the player's
 *  proudest shelf into the villain's fuel. So it is not a grid that greys out.
 *  They hang in a RING around him, and each in turn flares, throws everything it
 *  has down a line into the middle, and is left drifting grey and hollow while
 *  the core it fed grows brighter.
 *
 *  Staged on ONE clock (STEP seconds per giant), so streams, shockwaves, core
 *  growth and husks all land on the same beat. Existing catalogue art, no new
 *  assets.
 *
 *  Every element that MOVES is an inner motion node inside a plain positioned
 *  wrapper. Centering lives on the wrapper as ordinary CSS; animating scale on
 *  the same node would overwrite translate(-50%,-50%) and fling it off-centre. */
const ANCIENT_GIANTS = [
  '/fish/megalodon.png', '/fish/plesiosaurus.png', '/fish/dunkleosteus.png',
  '/fish/mosasaurus.png', '/fish/basilosaurus.png', '/fish/shastasaurus.png',
]
const HARVEST_STEP = 1.15
const HARVEST_TOTAL = HARVEST_STEP * ANCIENT_GIANTS.length
const HARVEST_RING = 33

function AncientHarvestInsert({ accent, reduced }: { accent: string; reduced?: boolean }) {
  const seats = ANCIENT_GIANTS.map((src, n) => {
    const deg = (n / ANCIENT_GIANTS.length) * 360 - 90
    const rad = (deg * Math.PI) / 180
    return { src, deg, x: 50 + Math.cos(rad) * HARVEST_RING, y: 50 + Math.sin(rad) * HARVEST_RING }
  })

  // Reduced motion gets the END STATE, not the journey: a lit core and six
  // husks. The story beat survives without anything moving.
  if (reduced) {
    return (
      <div style={{ position: 'relative', width: 'min(84vw, 340px)', aspectRatio: '1 / 1' }}>
        <div aria-hidden style={{
          position: 'absolute', left: '50%', top: '50%', width: '54%', aspectRatio: '1',
          transform: 'translate(-50%, -50%)', borderRadius: '50%',
          background: `radial-gradient(circle, #ffffff 0%, ${accent}dd 30%, ${accent}33 60%, transparent 78%)`,
          filter: 'blur(6px)',
        }} />
        {seats.map(s => (
          <div key={s.src} style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: '30%', transform: 'translate(-50%, -50%)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.src} alt="" aria-hidden decoding="async"
              style={{ width: '100%', objectFit: 'contain', filter: 'grayscale(1) brightness(0.34)', opacity: 0.4 }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: 'min(84vw, 340px)', aspectRatio: '1 / 1' }}>
      {/* THE CORE — swells across the whole drain, so the thing being fed is
          visibly bigger with every giant that goes into it. */}
      <div aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: '56%', aspectRatio: '1', transform: 'translate(-50%, -50%)', zIndex: 3 }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.05 }}
          animate={{ opacity: [0, 0.55, 0.8, 1], scale: [0.05, 0.42, 0.78, 1.18] }}
          transition={{ duration: HARVEST_TOTAL, ease: 'easeIn', times: [0, 0.3, 0.65, 1] }}
          style={{
            width: '100%', height: '100%', borderRadius: '50%',
            background: `radial-gradient(circle, #ffffff 0%, ${accent}dd 28%, ${accent}55 55%, transparent 76%)`,
            filter: 'blur(6px)',
          }} />
      </div>
      {/* A tight white heart, so the middle reads SOLID rather than as haze. */}
      <div aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: '17%', aspectRatio: '1', transform: 'translate(-50%, -50%)', zIndex: 4 }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.1 }}
          animate={{ opacity: [0, 0.7, 1], scale: [0.1, 0.5, 1] }}
          transition={{ duration: HARVEST_TOTAL, ease: 'easeIn' }}
          style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle, #ffffff 0%, #ffffffcc 45%, transparent 72%)', filter: 'blur(2px)' }} />
      </div>

      {seats.map((s, n) => {
        const t0 = n * HARVEST_STEP
        return (
          <div key={s.src}>
            {/* THE STREAM — pinned at the middle, rotated to point at this
                giant, collapsing inward as the giant empties. */}
            <div aria-hidden style={{
              position: 'absolute', left: '50%', top: '50%', width: `${HARVEST_RING}%`, height: 3,
              transformOrigin: '100% 50%', transform: `translateY(-50%) rotate(${s.deg}deg)`, zIndex: 2,
            }}>
              <motion.div
                initial={{ opacity: 0, scaleX: 1 }}
                animate={{ opacity: [0, 0.95, 0.9, 0], scaleX: [1, 1, 0.15, 0.05] }}
                transition={{ duration: HARVEST_STEP * 1.5, delay: t0, ease: 'easeIn', times: [0, 0.18, 0.8, 1] }}
                style={{ width: '100%', height: '100%', transformOrigin: '0% 50%', background: `linear-gradient(90deg, #ffffff, ${accent}, transparent)`, filter: 'blur(1px)' }} />
            </div>

            {/* THE GIANT — flares white-hot on its turn, then the colour goes
                out of it and what is left is a shell. */}
            <div style={{ position: 'absolute', left: `${s.x}%`, top: `${s.y}%`, width: '30%', transform: 'translate(-50%, -50%)', zIndex: 1 }}>
              <motion.img
                src={s.src} alt="" aria-hidden decoding="async"
                initial={{ opacity: 0.95, scale: 1 }}
                animate={{
                  opacity: [0.95, 1, 1, 0.38],
                  scale: [1, 1.16, 0.9, 0.97],
                  filter: [
                    'grayscale(0) brightness(1)',
                    `grayscale(0) brightness(1.9) drop-shadow(0 0 18px ${accent})`,
                    'grayscale(0.7) brightness(0.7)',
                    'grayscale(1) brightness(0.3)',
                  ],
                }}
                transition={{ duration: HARVEST_STEP * 2.2, delay: t0, ease: 'easeInOut', times: [0, 0.14, 0.55, 1] }}
                style={{ width: '100%', objectFit: 'contain', display: 'block' }} />
            </div>

            {/* SHOCKWAVE — one per giant, fired as its power lands, so six
                separate hits read as six. */}
            <div aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: '60%', aspectRatio: '1', transform: 'translate(-50%, -50%)', zIndex: 5, pointerEvents: 'none' }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.1 }}
                animate={{ opacity: [0, 0.5, 0], scale: [0.1, 1.5, 2.1] }}
                transition={{ duration: 1.1, delay: t0 + HARVEST_STEP * 0.55, ease: 'easeOut' }}
                style={{ width: '100%', height: '100%', borderRadius: '50%', border: `2px solid ${accent}` }} />
            </div>
            <motion.div aria-hidden
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.22, 0] }}
              transition={{ duration: 0.5, delay: t0 + HARVEST_STEP * 0.5, ease: 'easeOut' }}
              style={{ position: 'absolute', inset: '-10%', borderRadius: '50%', zIndex: 6, pointerEvents: 'none', background: 'radial-gradient(circle, #ffffff 0%, transparent 62%)' }} />
          </div>
        )
      })}
    </div>
  )
}

/** Finn's TRUE form, the moment the dock-hand costume comes off.
 *
 *  This is the bespoke art: crowned, plated, twin-axed, still wearing that
 *  same grin. It stands in deliberate contrast to the plain dock-hand sprite
 *  the scene opens on, which is why the reveal lands. The fallback below stays
 *  wired in case the file ever goes missing, so the beat plays rather than
 *  rendering a hole. If the transformation ever becomes multi-stage, this is
 *  the place to grow it (cross-fade the stages on the same timeline). */
const FINN_SINISTER_ART = '/finn_final.png'

function FinnSinisterInsert({ accent, reduced }: { accent: string; reduced?: boolean }) {
  const fallback = FINN_PORTRAIT
  const [src, setSrc] = useState(FINN_SINISTER_ART)
  const usingFallback = src !== FINN_SINISTER_ART
  return (
    <div style={{ position: 'relative', width: 'min(78vw, 320px)', aspectRatio: '1 / 1', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
      {/* The light does not fall on him, it bends AWAY: the glow inverts to a
          spreading dark that eats the ordinary morning he was standing in. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: reduced ? 0.95 : [0, 0.85, 0.95], scale: reduced ? 1.5 : [0.5, 1.6, 1.9] }}
        transition={{ duration: reduced ? 0.6 : 3.2, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '46%', width: '110%', aspectRatio: '1', transform: 'translate(-50%, -50%)', borderRadius: '50%',
          background: 'radial-gradient(circle at 50% 48%, rgba(4,2,10,0.94) 0%, rgba(6,3,14,0.72) 46%, transparent 74%)' }} />
      {/* a cold rim so the shape still separates from the dark it is making */}
      <motion.div aria-hidden
        initial={{ opacity: 0 }} animate={{ opacity: reduced ? 0.5 : [0, 0.65, 0.45] }}
        transition={{ duration: reduced ? 0.5 : 3.2, ease: 'easeOut', delay: 0.3 }}
        style={{ position: 'absolute', left: '50%', top: '46%', width: '72%', aspectRatio: '1', transform: 'translate(-50%, -50%)', borderRadius: '50%',
          background: `radial-gradient(circle at 50% 45%, ${accent}66 0%, transparent 66%)`, filter: 'blur(10px)' }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img src={src} alt="" aria-hidden decoding="async"
        onError={() => setSrc(fallback)}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: reduced ? 1 : [0.94, 1.06, 1.02] }}
        transition={{ opacity: { duration: 0.45 }, scale: { duration: reduced ? 0.4 : 3.2, ease: 'easeOut' } }}
        style={{ position: 'relative', height: '94%', width: 'auto', objectFit: 'contain',
          // The fallback is his ordinary sprite, so it needs pushing somewhere
          // cold and wrong. Bespoke art is shown exactly as drawn.
          transform: usingFallback && FINN_AVATAR.mirrored ? 'scaleX(-1)' : 'none',
          filter: usingFallback
            ? 'brightness(0.24) contrast(1.5) saturate(0.35) drop-shadow(0 0 22px rgba(0,0,0,0.9))'
            : 'drop-shadow(0 0 26px rgba(0,0,0,0.8))' }} />
    </div>
  )
}

/** THE BECOMING. The warp itself, between the harvest and the form that walks
 *  out of it.
 *
 *  The transformation used to be one cross-fade, which asked the player to
 *  accept the biggest turn in the game as a dissolve. This gives it a shape:
 *  he SHUDDERS, the colour drains until he is a silhouette, the silhouette
 *  SWELLS past his old size, light cracks open along it, and the whole plate
 *  blows to white. The final form resolves out of that blowout.
 *
 *  The white blowout at the seam is doing real work: the two pieces of art are
 *  framed differently, and a straight cross-fade between them would read as a
 *  swap. Nothing survives the white, so nothing has to line up. */
const BECOMING_TOTAL = 5.2

function FinnBecomingInsert({ accent, reduced }: { accent: string; reduced?: boolean }) {
  if (reduced) {
    return (
      <div style={{ position: 'relative', width: 'min(78vw, 320px)', aspectRatio: '1 / 1', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FINN_SINISTER_ART} alt="" aria-hidden decoding="async"
          style={{ height: '94%', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 0 26px rgba(0,0,0,0.8))' }} />
      </div>
    )
  }
  return (
    <div style={{ position: 'relative', width: 'min(78vw, 320px)', aspectRatio: '1 / 1', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
      {/* STAGE 1 — the dock hand, shuddering, the colour going out of him and
          the shape going black. He is still recognisably the angler right up
          until he is not. */}
      <motion.img
        src={FINN_PORTRAIT} alt="" aria-hidden decoding="async"
        initial={{ opacity: 1, scale: 1, x: 0 }}
        animate={{
          opacity: [1, 1, 1, 0],
          scale: [1, 1.04, 1.3, 1.5],
          x: [0, -3, 3, -2, 2, 0],
          filter: [
            'brightness(1) saturate(1)',
            'brightness(0.6) saturate(0.5) contrast(1.3)',
            'brightness(0) saturate(0)',
            'brightness(0) saturate(0)',
          ],
        }}
        transition={{
          duration: BECOMING_TOTAL * 0.62, ease: 'easeIn',
          opacity: { duration: BECOMING_TOTAL * 0.62, times: [0, 0.4, 0.8, 1] },
          filter:  { duration: BECOMING_TOTAL * 0.62, times: [0, 0.35, 0.7, 1] },
          scale:   { duration: BECOMING_TOTAL * 0.62, times: [0, 0.3, 0.72, 1] },
          x:       { duration: 0.34, repeat: 8, ease: 'linear' },
        }}
        style={{ position: 'absolute', bottom: '3%', height: '92%', width: 'auto', objectFit: 'contain', zIndex: 2 }} />

      {/* CRACKS — light opening along the silhouette just before it goes. Four
          slivers rather than a neat radial burst, so it reads as something
          splitting rather than a lens flare. */}
      {[18, 74, 126, 202, 288, 331].map((deg, i) => (
        <div key={deg} aria-hidden style={{ position: 'absolute', left: '50%', top: '52%', width: '46%', height: 2, transformOrigin: '0% 50%', transform: `rotate(${deg}deg)`, zIndex: 3 }}>
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: [0, 0.9, 0], scaleX: [0, 1, 1] }}
            transition={{ duration: 1.1, delay: BECOMING_TOTAL * 0.34 + i * 0.09, ease: 'easeOut' }}
            style={{ width: '100%', height: '100%', transformOrigin: '0% 50%', background: `linear-gradient(90deg, #ffffff, ${accent}, transparent)`, filter: 'blur(1px)' }} />
        </div>
      ))}

      {/* THE BLOWOUT — the seam. Nothing survives it, so the two differently
          framed pieces of art never have to line up. */}
      <motion.div aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1, 0.25, 0] }}
        transition={{ duration: BECOMING_TOTAL, ease: 'easeInOut', times: [0, 0.44, 0.58, 0.72, 0.9] }}
        style={{ position: 'absolute', inset: '-20%', zIndex: 5, pointerEvents: 'none', background: `radial-gradient(circle at 50% 52%, #ffffff 0%, #ffffff 34%, ${accent}88 60%, transparent 78%)` }} />

      {/* STAGE 2 — what walks out of it. Comes in oversized and settles, so he
          reads as having GROWN rather than having been swapped. */}
      <motion.img
        src={FINN_SINISTER_ART} alt="" aria-hidden decoding="async"
        initial={{ opacity: 0, scale: 1.42 }}
        animate={{ opacity: [0, 0, 1, 1], scale: [1.42, 1.35, 1.06, 1] }}
        transition={{ duration: BECOMING_TOTAL, ease: 'easeOut', times: [0, 0.52, 0.78, 1] }}
        style={{ position: 'absolute', bottom: '3%', height: '94%', width: 'auto', objectFit: 'contain', zIndex: 4, filter: 'drop-shadow(0 0 26px rgba(0,0,0,0.85))' }} />

      {/* The dark he brings with him, arriving after the light dies. */}
      <motion.div aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0.85] }}
        transition={{ duration: BECOMING_TOTAL, ease: 'easeIn', times: [0, 0.62, 1] }}
        style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 55%, transparent 80%)' }} />
    </div>
  )
}


function LedgerFInsert({ accent, reduced }: { accent: string; reduced?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, rotate: -1.5 }}
      animate={{ opacity: 1, scale: reduced ? 1 : 1.06, rotate: 0 }}
      transition={{ opacity: { duration: 0.5 }, scale: { duration: 6.5, ease: 'easeOut' }, rotate: { duration: 0.6 } }}
      style={{ position: 'relative', width: 'min(72vw, 300px)', aspectRatio: '4 / 5', borderRadius: 5,
        background: PARCHMENT, transformOrigin: 'center',
        boxShadow: '0 18px 46px rgba(0,0,0,0.6), inset 0 0 46px rgba(80,52,16,0.28)',
        border: '1px solid rgba(60,40,15,0.45)' }}>
      <div aria-hidden style={{ position: 'absolute', inset: '11% 8% 9%', backgroundImage: 'repeating-linear-gradient(rgba(60,40,15,0.16) 0 1px, transparent 1px 16px)' }} />
      <div aria-hidden style={{ position: 'absolute', top: '9%', bottom: '9%', right: '24%', width: 1, background: 'rgba(60,40,15,0.4)' }} />
      {/* faded ledger entries — abstract ink strokes, never fake numbers */}
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} aria-hidden style={{ position: 'absolute', left: '12%', right: '28%', top: `${17 + i * 8}%`, height: 3, borderRadius: 2,
          background: `rgba(50,35,12,${0.3 - (i % 3) * 0.06})`, transform: `scaleX(${0.55 + ((i * 37) % 42) / 100})`, transformOrigin: 'left' }} />
      ))}
      {/* the patient F, small in the margin, igniting in the accent */}
      <motion.span className="font-pirata"
        initial={{ opacity: 0.55, color: '#3a2a10' }}
        animate={reduced ? { opacity: 1, color: accent } : { opacity: [0.55, 1], color: ['#3a2a10', accent] }}
        transition={{ delay: 0.9, duration: 1.4, ease: 'easeOut' }}
        style={{ position: 'absolute', right: '8%', top: '41%', fontSize: 'clamp(30px, 10vw, 50px)', lineHeight: 1, textShadow: `0 0 18px ${accent}66` }}>
        F
      </motion.span>
    </motion.div>
  )
}

function SealedLetterInsert({ wax, accent, reduced }: { wax: string; accent: string; reduced?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: reduced ? 1 : 1.05 }}
      transition={{ opacity: { duration: 0.5 }, scale: { duration: 6, ease: 'easeOut' } }}
      style={{ position: 'relative', width: 'min(72vw, 300px)', aspectRatio: '5 / 3.4', borderRadius: 4,
        background: PARCHMENT, transformOrigin: 'center',
        boxShadow: '0 18px 46px rgba(0,0,0,0.6), inset 0 0 40px rgba(80,52,16,0.22)',
        border: '1px solid rgba(60,40,15,0.4)' }}>
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'rgba(60,40,15,0.22)' }} />
      <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(60,40,15,0.18)' }} />
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 260, damping: 18 }}
        style={{ position: 'absolute', left: '50%', top: '50%', width: '30%', aspectRatio: '1', marginLeft: '-15%', marginTop: '-15%',
          borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, #b0203a, #7a1226 72%)',
          boxShadow: `0 3px 10px rgba(0,0,0,0.5), 0 0 18px ${accent}44`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="font-cinzel font-800" style={{ fontSize: 'clamp(11px, 3.4vw, 16px)', letterSpacing: '0.06em', color: '#f2d7b0' }}>{wax}</span>
      </motion.div>
    </motion.div>
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
