'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { FINN_NAME, FINN_AVATAR } from '@/lib/finn'

/**
 * Finn's encounter overlay. Shows the rival's portrait + dialogue lines
 * (tap to advance), optionally followed by a challenge offer with
 * Accept/Pass buttons. Reused for offer, result, and reveal modes.
 *
 * Portrait is mirrored (scaleX(-1)) so Finn faces the player.
 */

type Mode = 'offer' | 'result' | 'reveal'

interface ChallengeOffer {
  type: 'perfect_streak' | 'speed_catch'
  tier: 1 | 2 | 3
  targetText: string   // e.g. "Land 3 perfects in a row"
  rewardText: string   // e.g. "+150 ⟡"
}

interface Props {
  visible: boolean
  lines: string[]
  mode: Mode
  challenge?: ChallengeOffer
  onAccept?: () => void
  onPass?: () => void
  onDismiss?: () => void
}

export default function FinnEncounter({
  visible, lines, mode, challenge, onAccept, onPass, onDismiss,
}: Props) {
  const [index, setIndex] = useState(0)
  // Reset line index whenever a new dialogue arrives. lines reference
  // changes on every parent render, so use a stable content key.
  const linesKey = lines.join('\n')
  useEffect(() => { setIndex(0) }, [linesKey])

  const isLast = index >= lines.length - 1
  const line = lines[index] ?? ''

  function advance() {
    if (!isLast) {
      setIndex(i => i + 1)
      return
    }
    // Last line — different action per mode.
    if (mode === 'offer') {
      // Accept/Pass buttons handle dismissal in offer mode.
      return
    }
    onDismiss?.()
  }

  // Reset to first line when overlay re-opens with new content.
  // (React keys on AnimatePresence below should handle most cases, but this
  // covers the prop-change-without-remount edge case.)
  function handleBackdropClick() {
    if (mode === 'offer' && isLast) return  // require button choice
    advance()
  }

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            key="finn-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
            style={{
              position: 'fixed', inset: 0, zIndex: 100, cursor: 'pointer',
              background: 'rgba(0,0,0,0.55)',
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
              // Light-rival palette: maritime navy base with warm amber
              // trim — same chrome family as the rest of the game's
              // dialogue overlays. Drops the previous menacing red.
              background: 'linear-gradient(180deg, #0e1a2b 0%, #06101c 100%)',
              border: '1px solid rgba(200,168,80,0.32)',
              borderTop: '1px solid rgba(200,168,80,0.60)',
              borderRadius: 16,
              padding: '1.1rem 1.1rem 1rem',
              boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
            }}
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
              {lines.length > 1 && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {lines.map((_, i) => (
                    <span key={i} style={{
                      width: i === index ? 16 : 5, height: 4, borderRadius: 999,
                      background: i === index ? '#c8a060' : i < index ? 'rgba(200,168,80,0.45)' : 'rgba(255,255,255,0.18)',
                      transition: 'width 0.22s, background 0.22s',
                    }} />
                  ))}
                </div>
              )}
            </div>

            {/* Dialogue */}
            <AnimatePresence mode="wait">
              <motion.p
                key={`line-${index}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.20 }}
                className="font-karla"
                style={{
                  fontSize: '0.95rem', color: '#f0ede8', lineHeight: 1.55,
                  minHeight: '4.4rem',
                  marginBottom: '0.85rem',
                }}
              >
                {line}
              </motion.p>
            </AnimatePresence>

            {/* Challenge card — shown only on the LAST line of offer mode */}
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
              {mode === 'offer' && isLast ? (
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
                  {isLast ? (mode === 'reveal' ? 'Go fishing' : 'Continue') : 'Next ›'}
                </button>
              )}
            </div>

            {/* Tap-anywhere hint */}
            {!isLast && (
              <p className="font-karla font-400 uppercase tracking-[0.14em] text-center"
                style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.32)', marginTop: '0.7rem' }}>
                tap to advance
              </p>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
