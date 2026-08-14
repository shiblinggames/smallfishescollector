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

import { useEffect, useState, useMemo, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GOLD, TypedBody, Letterbox, LivingFrame, FlashOut, SceneProgress, InsertShot, SceneBackdrop, useTypewriter, lineHaptic, prefersReducedMotion } from '@/components/cutscene'
import type { SceneLine, SceneInsert } from '@/lib/raidMap'

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

export default function StoryScene({ title, lines, ctaLabel, pending, accent, background, renderInsert, onComplete, onSkip, allowSkip = true }: {
  title: string
  lines: SceneLine[]
  ctaLabel: string
  pending?: boolean
  /** The scene's color temperature (node.sceneAccent). Gold when unset. */
  accent?: string
  /** Optional painterly establishing backdrop (public/scenes/*). Plain dark when unset. */
  background?: string
  /** Optional custom insert renderer — lets a caller supply its own insert-shot
   *  visual (e.g. a live dial demo) without teaching the shared kit about it.
   *  Return null to fall back to the built-in InsertShot for that kind. */
  renderInsert?: (insert: SceneInsert) => ReactNode
  onComplete: () => void
  onSkip: () => void
  /** Show the Skip button. FALSE on a first watch: the beat is the payoff for
   *  everything that led to it, and a one-tap Skip sitting in the top bar from
   *  line one is very easy to hit by accident and impossible to undo in the
   *  moment. Once the scene has been seen through, Skip comes back for replays
   *  and for anyone re-reading from the map. */
  allowSkip?: boolean
}) {
  const ACCENT = accent ?? GOLD
  const [idx, setIdx] = useState(0)
  const [flash, setFlash] = useState(0)
  const reduced = useMemo(() => prefersReducedMotion(), [])

  const line = lines[idx]
  // The backdrop can CHANGE mid-scene. Walk back from the current line to the
  // most recent one that set it, so the world stays changed after the beat
  // that changed it, and fall back to the node-level backdrop before that.
  const activeBackdrop = (() => {
    for (let k = idx; k >= 0; k--) { const b = lines[k]?.backdrop; if (b) return b }
    return background
  })()
  const last = idx === lines.length - 1

  // Shared typewriter (kit) — the beat/haptic/flash fire from onBegin so story
  // nodes and boss dialogue read identically.
  const { shown, typing, held, finish } = useTypewriter(line?.text ?? '', idx, {
    pause: line?.pause,
    reduced,
    onBegin: () => {
      if (line?.fx === 'flash') setFlash(f => f + 1)
      lineHaptic(line?.fx, !!line?.speaker)
    },
  })

  // Lock body scroll while the scene owns the viewport.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  /** One tap finishes the line. The next one moves on. Never both at once — a tap
   *  that both completed AND advanced would eat lines on a fast tapper. */
  function tap() {
    if (typing) { finish(); return }
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
  const allText = useMemo(() => lines.map(l => l.text), [lines])
  const shake = line?.fx === 'shake' && !reduced && !held
  // Insert = an object beat; the cast steps aside. Close-up = the speaker looms.
  const insertActive = !!line?.insert
  const closeupActive = !!line?.closeup && hasCast

  // ── THE BUST ────────────────────────────────────────────────────────────────
  // It used to enter and then stand perfectly still forever, which is the difference
  // between an actor and a cardboard cutout. Now it BREATHES (a slow float that never
  // stops), LEANS IN when it takes a line, JOLTS on a shake, and creeps forward
  // through a held pause so a silence has something to build on.
  const bust = (c: StageChar | null, side: 'left' | 'right') => {
    if (!c) return null
    const lit = speaking === c.speaker
    // Lean on the line, jolt on the hit, creep during the beat before it, and
    // LOOM on a close-up. Step off-stage entirely for an insert shot.
    const emphasis = lit && closeupActive ? 1.55 : lit && shake ? 1.06 : lit && held ? 1.03 : lit ? 1 : 0.93
    return (
      <motion.div
        key={`${side}-${c.speaker}`}
        initial={{ opacity: 0, x: side === 'left' ? -46 : 46, scale: 0.9 }}
        animate={{
          opacity: insertActive ? 0 : lit ? 1 : closeupActive ? 0.06 : 0.4,
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
      data-any-key
      onClick={tap}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100, overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 38%, #171208 0%, #0a0705 62%, #040303 100%)',
        cursor: last && !typing ? 'default' : 'pointer',
        WebkitTapHighlightColor: 'transparent', userSelect: 'none',
      }}
    >
      {/* Painterly establishing backdrop (when the node sets one), sitting at the
          very back below the frame and cast. */}
      {activeBackdrop && <SceneBackdrop key={activeBackdrop} src={activeBackdrop} reduced={reduced} />}

      {/* The frame is alive (push-in + motes + breathing vignette), the flash on
          an earned beat, and the letterbox — all from the shared cutscene kit so
          story nodes, boss dialogue and Finn read as one film. */}
      <LivingFrame accent={ACCENT} reduced={reduced} />
      <FlashOut k={flash} />
      <Letterbox />

      {/* Beat title + skip, riding the top bar. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, zIndex: 7,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.1rem' }}>
        <span className="font-karla font-700 uppercase truncate" style={{ fontSize: '0.55rem', letterSpacing: '0.18em', color: 'rgba(240,237,232,0.42)' }}>
          {title}
        </span>
        {allowSkip && (
          <button onClick={e => { e.stopPropagation(); onSkip() }} className="font-karla font-700 uppercase tap"
            style={{ flexShrink: 0, fontSize: '0.55rem', letterSpacing: '0.14em', padding: '0.3rem 0.6rem', borderRadius: 7,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,237,232,0.5)', cursor: 'pointer' }}>
            Skip
          </button>
        )}
      </div>

      {/* ── THE SHOT: stage + dialogue, rocked together when a line hits. ────── */}
      <motion.div
        animate={shake ? { x: [0, -9, 8, -6, 4, 0], y: [0, 4, -3, 2, 0] } : { x: 0, y: 0 }}
        transition={shake ? { duration: 0.42 } : { duration: 0.3 }}
        style={{
          position: 'absolute', top: 44, left: 0, right: 0,
          // Clear the bottom letterbox AND the home indicator.
          bottom: 'calc(44px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column',
          justifyContent: hasCast ? 'flex-end' : 'center',
        }}
      >
        {/* ── INSERT SHOT — the object takes the frame (cast dimmed to 0 above). */}
        {insertActive && line?.insert && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            paddingBottom: hasCast ? '22%' : '8%', zIndex: 2, pointerEvents: 'none' }}>
            {renderInsert?.(line.insert) ?? <InsertShot kind={line.insert.kind} wax={'wax' in line.insert ? line.insert.wax : undefined} accent={ACCENT} reduced={reduced} />}
          </div>
        )}
        {/* ── TITLE CARD — a scene with no cast. Words in the dark, nothing else. */}
        {!hasCast && (
          <div style={{ padding: '0 1.6rem', textAlign: 'center' }}>
            <motion.div
              animate={{ scale: shake ? 1.04 : held ? 1.05 : 1 }}
              transition={
                shake ? { duration: 0.42 }
                : held ? { duration: (line?.pause ?? 600) / 1000, ease: 'easeInOut' }
                : { duration: 0.5, ease: 'easeOut' }
              }
              style={{ maxWidth: 500, margin: '0 auto', textShadow: '0 2px 20px rgba(0,0,0,0.8)' }}>
              <TypedBody
                all={allText} text={line?.text ?? ''} shown={shown} typing={typing}
                accent={ACCENT} italic align="center" size="1.22rem"
              />
            </motion.div>
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
        <motion.div
          animate={{ scale: shake ? 1.04 : held ? 1.05 : 1 }}
          transition={
            shake ? { duration: 0.42 }
            : held ? { duration: (line?.pause ?? 600) / 1000, ease: 'easeInOut' }
            : { duration: 0.5, ease: 'easeOut' }
          }
          style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <AnimatePresence>{bust(left, 'left')}</AnimatePresence>
          <AnimatePresence>{bust(right, 'right')}</AnimatePresence>
        </motion.div>

        {/* The dialogue plate. */}
        {/* flexShrink 0 — see BossDialogueModal. The plate holds its height; the
            stage above gives up the room. */}
        <div style={{ position: 'relative', zIndex: 3, flexShrink: 0, padding: '0 1rem 1.15rem' }}>
          <div
            style={{
              position: 'relative', width: '100%', maxWidth: 540, margin: '0 auto',
              padding: '1.05rem 1.15rem 1.15rem',
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

            {/* One height for the whole scene: every line reserves it, the tallest
                wins. The box never grows as the text types, and never jumps between a
                short line and a long one. */}
            <TypedBody
              all={allText} text={line?.text ?? ''} shown={shown} typing={typing}
              accent={ACCENT} italic={!speaking} quoted={!!speaking}
            />

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
          </div>
        </div>
        </>)}
      </motion.div>

      <SceneProgress idx={idx} total={lines.length} accent={ACCENT} />
    </motion.div>
  )

  return createPortal(scene, document.body)
}
