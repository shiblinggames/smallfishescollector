'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { TypedBody, FlashOut, useTypewriter, lineHaptic, prefersReducedMotion } from '@/components/cutscene'
import { FINN_NAME, FINN_AVATAR, type FinnSceneLine } from '@/lib/finn'

/**
 * Finn's encounter overlay. Shows the rival's portrait + cinematic dialogue
 * (typewriter, timed pauses, *italic* emphasis, a frame-flicker when the mask
 * slips — same kit as his ancient-catch cutscenes), optionally followed by a
 * challenge offer with Accept/Pass buttons. Reused for offer, result, reveal.
 *
 * Portrait is mirrored (scaleX(-1)) so Finn faces the player.
 */

type Mode = 'offer' | 'result' | 'reveal'
const FINN_AMBER = '#c8a060'

interface ChallengeOffer {
  type: 'perfect_streak' | 'speed_catch'
  tier: 1 | 2 | 3
  targetText: string   // e.g. "Land 3 perfects in a row"
  rewardText: string   // e.g. "+150 ⟡"
}

interface Props {
  visible: boolean
  /** Plain strings (quips) or staged FinnSceneLines (beats) — normalized below. */
  lines: (string | FinnSceneLine)[]
  mode: Mode
  challenge?: ChallengeOffer
  resultKind?: 'won' | 'lost'
  rewardText?: string
  onAccept?: () => void
  onPass?: () => void
  onDismiss?: () => void
}

// Owns the per-character reveal so a keystroke re-renders ONLY the text, not the
// whole card. Reports typing/held up a handful of times per line (start, pause
// end, done) so the parent can flip the tap affordance without re-rendering per
// char. Mirrors FinnScene's TypewriterPlate.
function TypedLine({ line, lineKey, accent, allText, reduced, onBegin, onState, finishRef }: {
  line: FinnSceneLine
  lineKey: number
  accent: string
  allText: string[]
  reduced: boolean
  onBegin: () => void
  onState: (typing: boolean, held: boolean) => void
  finishRef: React.MutableRefObject<() => void>
}) {
  const { shown, typing, held, finish } = useTypewriter(line.text, lineKey, { pause: line.pause, reduced, onBegin })
  finishRef.current = finish
  useEffect(() => { onState(typing, held) }, [typing, held, onState])
  return <TypedBody all={allText} text={line.text} shown={shown} typing={typing} accent={accent} size="0.95rem" />
}

export default function FinnEncounter({
  visible, lines, mode, challenge, resultKind, rewardText, onAccept, onPass, onDismiss,
}: Props) {
  const reduced = useMemo(prefersReducedMotion, [])
  // Normalize: plain quips become a single un-staged line.
  const sceneLines: FinnSceneLine[] = useMemo(
    () => lines.map(l => (typeof l === 'string' ? { text: l } : l)),
    [lines],
  )
  const allText = useMemo(() => sceneLines.map(l => l.text), [sceneLines])

  const [index, setIndex] = useState(0)
  const [typing, setTyping] = useState(true)
  const [held, setHeld] = useState(false)
  const [flash, setFlash] = useState(0)
  const finishRef = useRef<() => void>(() => {})

  // Reset to the first line whenever a new dialogue arrives. lines reference
  // changes on every parent render, so key on the content, not identity.
  const linesKey = allText.join('\n')
  useEffect(() => { setIndex(0) }, [linesKey])

  const isLast = index >= sceneLines.length - 1
  const line = sceneLines[index] ?? { text: '' }
  const shake = line.fx === 'shake' && !reduced && !held

  const onState = useCallback((t: boolean, h: boolean) => { setTyping(t); setHeld(h) }, [])
  const onBegin = () => {
    if (line.fx === 'flash') setFlash(f => f + 1)
    lineHaptic(line.fx, true)
  }

  // One tap finishes the typing line; the next advances. Never both.
  function advance() {
    if (typing) { finishRef.current(); return }
    if (!isLast) { setIndex(i => i + 1); return }
    if (mode === 'offer') return   // Accept/Pass owns the dismissal
    onDismiss?.()
  }

  function handleBackdropClick() {
    if (typing) { finishRef.current(); return }
    if (mode === 'offer' && isLast) return  // require a button choice
    advance()
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            key="finn-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            data-any-key
            onClick={handleBackdropClick}
            style={{
              position: 'fixed', inset: 0, zIndex: 100, cursor: 'pointer',
              background: 'linear-gradient(180deg, rgba(6,10,18,0.66) 0%, rgba(6,10,18,0.72) 100%), url(/scenes/dock-dusk.jpg) center/cover no-repeat',
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
            }}
          />
          <motion.div
            key="finn-card"
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', zIndex: 101,
              top: '50%', left: '1rem', right: '1rem',
              transform: 'translateY(-50%)',
              maxWidth: 380, margin: '0 auto',
              background: 'linear-gradient(180deg, #0e1a2b 0%, #06101c 100%)',
              border: '1px solid rgba(200,168,80,0.32)',
              borderTop: '1px solid rgba(200,168,80,0.60)',
              borderRadius: 16,
              padding: '1.1rem 1.1rem 1rem',
              boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
              overflow: 'hidden',
            }}
          >
            {/* Mask-flicker — a blown-out frame the instant a tell lands. */}
            <AnimatePresence><FlashOut k={flash} /></AnimatePresence>

            {/* The card content rocks on a 'shake' line. */}
            <motion.div
              animate={shake ? { x: [0, -7, 6, -4, 3, 0], y: [0, 3, -2, 0] } : { x: 0, y: 0 }}
              transition={shake ? { duration: 0.42 } : { duration: 0.25 }}
            >
            {/* Header — eyebrow + portrait + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.85rem' }}>
              <div style={{
                transform: FINN_AVATAR.mirrored ? 'scaleX(-1)' : 'none',
                flexShrink: 0,
                boxShadow: '0 0 16px rgba(200,168,80,0.28)',
                borderRadius: '50%',
              }}>
                <CharacterAvatar
                  characterColor={FINN_AVATAR.characterColor}
                  equippedHat={FINN_AVATAR.equippedHat ?? null}
                  bgColor={FINN_AVATAR.bgColor}
                  ringColor={FINN_AVATAR.borderColor}
                  size={62}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.55rem', color: '#c8a060', letterSpacing: '0.20em', marginBottom: 3,
                }}>
                  Rival
                </p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '1.2rem', color: '#f0ede8', lineHeight: 1,
                  textShadow: '0 0 12px rgba(200,168,80,0.30)',
                }}>
                  {FINN_NAME}
                </p>
              </div>
              {/* Progress dots when multi-line */}
              {sceneLines.length > 1 && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {sceneLines.map((_, i) => (
                    <span key={i} style={{
                      width: i === index ? 16 : 5, height: 4, borderRadius: 999,
                      background: i === index ? '#c8a060' : i < index ? 'rgba(200,168,80,0.45)' : 'rgba(255,255,255,0.18)',
                      transition: 'width 0.22s, background 0.22s',
                    }} />
                  ))}
                </div>
              )}
            </div>

            {/* Result outcome badge — win/loss screens only. */}
            {mode === 'result' && resultKind && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  marginBottom: '0.85rem',
                  padding: '0.5rem 0.85rem',
                  background: resultKind === 'won'
                    ? 'linear-gradient(180deg, rgba(74,222,128,0.22) 0%, rgba(74,222,128,0.06) 100%), #0a1a0e'
                    : 'linear-gradient(180deg, rgba(120,130,160,0.16) 0%, rgba(120,130,160,0.04) 100%), #0e1018',
                  border: `1px solid ${resultKind === 'won' ? 'rgba(74,222,128,0.50)' : 'rgba(120,130,160,0.40)'}`,
                  borderTop: `1px solid ${resultKind === 'won' ? 'rgba(74,222,128,0.78)' : 'rgba(120,130,160,0.65)'}`,
                  borderRadius: 10,
                  boxShadow: resultKind === 'won' ? '0 0 16px rgba(74,222,128,0.22)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: '0.9rem', lineHeight: 1 }}>
                    {resultKind === 'won' ? '✓' : '✕'}
                  </span>
                  <p className="font-karla font-700 uppercase" style={{
                    fontSize: '0.62rem',
                    letterSpacing: '0.22em',
                    color: resultKind === 'won' ? '#86efac' : '#aab0c0',
                  }}>
                    {resultKind === 'won' ? 'Challenge Won' : 'Challenge Lost'}
                  </p>
                </div>
                {resultKind === 'won' && rewardText && (
                  <p className="font-cinzel font-700" style={{
                    fontSize: '0.95rem', color: '#f0c040',
                    textShadow: '0 0 12px rgba(240,192,64,0.5)', lineHeight: 1,
                  }}>
                    {rewardText}
                  </p>
                )}
              </motion.div>
            )}

            {/* Dialogue — typewriter with pauses + *italic* emphasis. */}
            <div style={{ marginBottom: '0.85rem' }}>
              <TypedLine
                line={line} lineKey={index} accent={FINN_AMBER} allText={allText} reduced={reduced}
                onBegin={onBegin} onState={onState} finishRef={finishRef}
              />
            </div>

            {/* Challenge card — shown on the LAST line of offer mode. */}
            {mode === 'offer' && isLast && challenge && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                style={{
                  background: 'linear-gradient(180deg, rgba(240,192,64,0.10) 0%, rgba(240,192,64,0.02) 100%), #0e0a04',
                  border: '1px solid rgba(240,192,64,0.30)',
                  borderTop: '1px solid rgba(240,192,64,0.55)',
                  borderRadius: 12,
                  padding: '0.7rem 0.85rem',
                  marginBottom: '0.85rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p className="font-karla font-700 uppercase" style={{
                    fontSize: '0.52rem', color: '#a88a48', letterSpacing: '0.18em', marginBottom: 3,
                  }}>
                    Challenge · Tier {challenge.tier}
                  </p>
                  <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#f0ede8', lineHeight: 1.3 }}>
                    {challenge.targetText}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p className="font-karla font-700 uppercase" style={{
                    fontSize: '0.52rem', color: '#a88a48', letterSpacing: '0.14em', marginBottom: 2,
                  }}>
                    Reward
                  </p>
                  <p className="font-cinzel font-700" style={{
                    fontSize: '1.05rem', color: '#f0c040', lineHeight: 1,
                    textShadow: '0 0 12px rgba(240,192,64,0.4)',
                  }}>
                    {challenge.rewardText}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              {mode === 'offer' && isLast && !typing ? (
                <>
                  <button
                    onClick={() => onPass?.()}
                    className="font-karla font-700 uppercase tracking-[0.1em]"
                    style={{
                      flex: 1, padding: '0.65rem',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      color: 'rgba(240,237,232,0.6)',
                      borderRadius: 10, fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                  >
                    Pass
                  </button>
                  <button
                    onClick={() => onAccept?.()}
                    className="font-cinzel font-700 uppercase tracking-[0.12em]"
                    style={{
                      flex: 2, padding: '0.7rem',
                      background: 'linear-gradient(180deg, rgba(240,192,64,0.30) 0%, rgba(240,192,64,0.10) 100%)',
                      border: '1px solid rgba(240,192,64,0.55)',
                      borderTop: '1px solid rgba(240,192,64,0.85)',
                      color: '#f0c040',
                      borderRadius: 10, fontSize: '0.78rem',
                      cursor: 'pointer',
                      boxShadow: '0 0 16px rgba(240,192,64,0.22)',
                    }}
                  >
                    Take the Bet
                  </button>
                </>
              ) : (
                <button
                  onClick={advance}
                  className="font-cinzel font-700 uppercase tracking-[0.12em]"
                  style={{
                    flex: 1, padding: '0.7rem',
                    background: 'linear-gradient(180deg, rgba(200,168,80,0.22) 0%, rgba(200,168,80,0.06) 100%)',
                    border: '1px solid rgba(200,168,80,0.45)',
                    borderTop: '1px solid rgba(200,168,80,0.70)',
                    color: '#e8c48a',
                    borderRadius: 10, fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  {typing ? 'Skip ▸' : isLast ? (mode === 'reveal' ? 'Go fishing' : 'Continue') : 'Next ›'}
                </button>
              )}
            </div>

            {/* Tap-anywhere hint */}
            {(!isLast || typing) && (
              <p className="font-karla font-400 uppercase tracking-[0.14em] text-center"
                style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.32)', marginTop: '0.7rem' }}>
                {typing ? 'tap to skip' : 'tap to advance'}
              </p>
            )}
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
