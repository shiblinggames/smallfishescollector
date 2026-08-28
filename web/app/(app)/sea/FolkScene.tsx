'use client'

// ── MEETING ONE OF THE REGULARS ─────────────────────────────────────────────
//
// The same cinematic kit Finn gets, for the same reason: a conversation with
// somebody you have sailed an hour to reach should not be a paragraph in the
// corner of a shop panel. Portrait, typewriter, letterbox, a choice at the end.
//
// It reuses `components/cutscene` outright rather than approximating it, so the
// rival and the regulars are lit by one renderer and cannot drift apart.
//
// ── WHAT THE SCENE HAS TO MAKE OBVIOUS ──────────────────────────────────────
//
// That the visit COUNTED. The first cut of rapport paid out in a number that
// changed inside a panel nobody was looking at, which meant the reward for
// sailing across the chart was a silent integer. So the gain is staged: the
// points fly up off the bar, the bar runs to its new mark, and crossing a tier
// takes over the whole card with the line they only say once. Three levels of
// feedback for three sizes of thing that just happened.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { TypedBody, Letterbox, useTypewriter, prefersReducedMotion } from '@/components/cutscene'
import { vibrate } from '@/lib/haptics'
import { TIER_NAME, TIER_AT, tierFor, type Folk, type FolkTier } from '@/lib/seaFolk'

export type SceneGain = {
  /** Points after the gain, so the bar can run to its new mark. */
  points: number
  /** What was added, for the number that flies off it. */
  gained: number
  tier: FolkTier
  /** Set only when this visit crossed a tier. Takes over the card. */
  tierUp: string | null
  /** Gifts say how well they landed; a chat does not. */
  how?: 'loved' | 'liked' | 'plain'
}

/** The bar, and the number leaving it. Reads the tier's own span rather than
 *  the whole ladder, so late tiers do not look like no progress at all. */
function RapportBar({ points, gained, accent }: {
  points: number; gained: number; accent: string
}) {
  const tier = tierFor(points)
  const floor = TIER_AT[tier]
  const ceil = tier === 4 ? TIER_AT[4] : TIER_AT[(tier + 1) as FolkTier]
  const span = Math.max(1, ceil - floor)
  const pct = tier === 4 ? 100 : Math.min(100, ((points - floor) / span) * 100)
  const was = tier === 4 ? 100 : Math.max(0, Math.min(100, ((points - gained - floor) / span) * 100))
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.56rem', letterSpacing: '0.18em', color: accent, opacity: 0.85, margin: 0,
        }}>{TIER_NAME[tier]}</p>
        <div style={{ position: 'relative' }}>
          <p className="font-karla" style={{
            fontSize: '0.62rem', color: 'rgba(226,238,246,0.45)', margin: 0,
          }}>{tier === 4 ? 'As far as it goes' : `${ceil - points} to go`}</p>
          {/* THE NUMBER LEAVING THE BAR. The one unmissable "that did
              something", and it is the only thing on this card that moves
              upward, so the eye goes to it. */}
          <AnimatePresence>
            {gained > 0 && (
              <motion.p
                key={`${points}:${gained}`}
                className="font-cinzel font-700"
                initial={{ opacity: 0, y: 4, scale: 0.8 }}
                animate={{ opacity: [0, 1, 1, 0], y: [-2, -14, -20, -30], scale: [0.9, 1.12, 1, 1] }}
                transition={{ duration: 1.5, times: [0, 0.18, 0.6, 1], ease: 'easeOut' }}
                style={{
                  position: 'absolute', right: 0, top: -2, margin: 0, whiteSpace: 'nowrap',
                  fontSize: '0.95rem', color: accent, pointerEvents: 'none',
                  textShadow: `0 0 14px ${accent}`,
                }}>+{gained}</motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div style={{
        height: 6, borderRadius: 999, marginTop: 5, overflow: 'hidden',
        background: 'rgba(255,255,255,0.09)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
      }}>
        <motion.div
          initial={{ width: `${was}%` }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          style={{
            height: '100%', borderRadius: 999,
            background: `linear-gradient(90deg, ${accent}99, ${accent})`,
            boxShadow: `0 0 12px ${accent}80`,
          }} />
      </div>
    </div>
  )
}

export default function FolkScene({
  folk, open, tier, points, line, gain, canChat, canGift, busy,
  onChat, onGift, onClose,
}: {
  folk: Folk | null
  open: boolean
  tier: FolkTier
  points: number
  /** What is on screen: their standing line, or what they just said. */
  line: string
  /** Set on the beat after a chat or a gift lands. */
  gain: SceneGain | null
  canChat: boolean
  canGift: boolean
  busy: boolean
  onChat: () => void
  onGift: () => void
  onClose: () => void
}) {
  const reduced = useMemo(prefersReducedMotion, [])
  const accent = folk?.accent ?? '#f0c040'
  const finishRef = useRef<() => void>(() => {})
  // Keyed on the line itself: a new thing said restarts the type-on, and the
  // same line re-rendered does not.
  const { shown, typing: isTyping, finish } = useTypewriter(line, line, { reduced })
  finishRef.current = finish

  // The tier-up takes the card over for a beat before the choices come back.
  const [crest, setCrest] = useState<string | null>(null)
  useEffect(() => {
    if (!gain?.tierUp) return
    setCrest(gain.tierUp)
    vibrate([0, 40, 60, 90])
    const t = setTimeout(() => setCrest(null), 3400)
    return () => clearTimeout(t)
  }, [gain?.tierUp])

  if (!folk) return null

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="folk-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (isTyping) finishRef.current() }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9300, cursor: isTyping ? 'pointer' : 'default',
              background: 'linear-gradient(180deg, rgba(5,9,16,0.74) 0%, rgba(4,7,13,0.86) 100%), url(/scenes/dock-dusk.jpg) center/cover no-repeat',
              backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
            }} />
          <Letterbox height={38} z={9301} />

          <motion.div
            key="folk-card"
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', zIndex: 9302,
              top: '50%', left: '1rem', right: '1rem',
              transform: 'translateY(-50%)',
              maxWidth: 400, margin: '0 auto',
              background: 'linear-gradient(180deg, #0e1a2b 0%, #06101c 100%)',
              border: `1px solid ${accent}40`,
              borderTop: `1px solid ${accent}99`,
              borderRadius: 16, padding: '1.1rem 1.1rem 1rem',
              boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 40px ${accent}18`,
              overflow: 'hidden',
            }}>

            {/* ── WHO IS TALKING ─────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.8rem' }}>
              <motion.div
                animate={gain ? { scale: [1, 1.07, 1] } : { scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{
                  transform: folk.face.mirrored ? 'scaleX(-1)' : 'none',
                  flexShrink: 0, borderRadius: '50%',
                  boxShadow: `0 0 18px ${accent}45`,
                }}>
                <CharacterAvatar
                  characterColor={folk.face.characterColor}
                  equippedHat={folk.face.hat}
                  bgColor={folk.face.bg}
                  ringColor={folk.face.ring}
                  size={64}
                />
              </motion.div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.55rem', color: accent, letterSpacing: '0.2em', marginBottom: 3,
                }}>{folk.role}</p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '1.2rem', color: '#f0ede8', lineHeight: 1,
                  textShadow: `0 0 12px ${accent}4d`,
                }}>{folk.name}</p>
              </div>
            </div>

            {/* ── WHAT THEY SAID ─────────────────────────────────────── */}
            <div style={{ minHeight: 92 }}>
              <TypedBody all={[line]} text={line} shown={shown} typing={isTyping}
                accent={accent} quoted size="1.02rem" />
            </div>

            {/* ── WHERE YOU STAND, AND WHAT JUST MOVED ───────────────── */}
            <RapportBar points={points} gained={gain?.gained ?? 0} accent={accent} />

            {/* ── THE BOND DEEPENING, over everything ────────────────── */}
            <AnimatePresence>
              {crest && (
                <motion.div
                  key="crest"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => setCrest(null)}
                  style={{
                    position: 'absolute', inset: 0, zIndex: 4, cursor: 'pointer',
                    background: 'linear-gradient(180deg, rgba(6,10,18,0.93) 0%, rgba(4,8,14,0.97) 100%)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    padding: '1.4rem 1.2rem', textAlign: 'center',
                  }}>
                  {!reduced && (
                    <motion.div
                      initial={{ scale: 0.2, opacity: 0.9 }}
                      animate={{ scale: 2.6, opacity: 0 }}
                      transition={{ duration: 1.1, ease: 'easeOut' }}
                      style={{
                        position: 'absolute', width: 140, height: 140, borderRadius: '50%',
                        border: `2px solid ${accent}`, pointerEvents: 'none',
                      }} />
                  )}
                  <motion.p
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                    className="font-karla font-700 uppercase"
                    style={{
                      fontSize: '0.58rem', letterSpacing: '0.24em', color: accent, margin: 0,
                    }}>You are now</motion.p>
                  <motion.p
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.16 }}
                    className="font-cinzel font-700"
                    style={{
                      fontSize: '1.5rem', color: '#f6ecd6', margin: '6px 0 12px',
                      textShadow: `0 0 22px ${accent}80`,
                    }}>{TIER_NAME[gain?.tier ?? tier]}</motion.p>
                  <motion.p
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="font-karla"
                    style={{
                      fontSize: '0.94rem', color: 'rgba(240,237,232,0.92)',
                      lineHeight: 1.55, margin: 0, fontStyle: 'italic',
                    }}>&ldquo;{gain?.tierUp}&rdquo;</motion.p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── WHAT YOU CAN DO ────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {canChat && (
                <button onClick={() => { if (!busy) { vibrate(10); onChat() } }}
                  disabled={busy}
                  className="font-cinzel font-700"
                  style={{
                    flex: 1.2, padding: '0.72rem', borderRadius: 11, fontSize: '1rem',
                    color: '#f2ead8', background: `${accent}26`,
                    border: `1px solid ${accent}73`,
                    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                  }}>{busy ? '…' : 'Have a word'}</button>
              )}
              {canGift && (
                <button onClick={() => { if (!busy) { vibrate(8); onGift() } }}
                  disabled={busy}
                  className="font-karla font-700"
                  style={{
                    flex: 1, padding: '0.72rem', borderRadius: 11, fontSize: '0.9rem',
                    color: '#cfe0ec', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.16)',
                    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                  }}>Give a fish</button>
              )}
              <button onClick={onClose}
                className="font-karla font-700"
                style={{
                  flex: canChat || canGift ? 0.8 : 1, padding: '0.72rem', borderRadius: 11,
                  fontSize: '0.9rem', color: '#cfe0ec',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
                }}>{canChat || canGift ? 'Later' : 'Sail on'}</button>
            </div>

            {/* Said plainly, because it is a mechanic. Only when both are spent
                and only as a fact, never as a warning about a streak. */}
            {!canChat && !canGift && (
              <p className="font-karla" style={{
                fontSize: '0.68rem', color: 'rgba(226,238,246,0.4)',
                textAlign: 'center', margin: '9px 0 0',
              }}>
                You have had your word and given your gift today. Nothing is lost by waiting.
              </p>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
