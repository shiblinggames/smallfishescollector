'use client'

// ── PRE-FIGHT BOSS DIALOGUE ──────────────────────────────────────────────────
// The last thing a captain sees before the guns open, and until now it was still a
// slideshow: text fading in whole, progress DOTS along the bottom, both portraits
// pinned in 104px circles, a static gradient, and "tap anywhere to advance".
//
// It missed the cutscene pass because it is a different component from StoryScene.
// That is precisely why the shared vocabulary now lives in components/cutscene —
// typewriter, letterbox, living frame, emphasis, progress. Both scenes drink from it,
// so the next change lands in both or neither.
//
// What this one does that a story node cannot: the PLAYER is a speaker. The boss holds
// the left wing as a bust; you hold the right as your own CharacterAvatar. Whoever is
// talking is lit and forward, the other dims but stays on stage, and the last line's
// button is Engage.

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import {
  GOLD, useTypewriter, prefersReducedMotion,
  TypedBody, Letterbox, LivingFrame, FlashOut, SceneProgress, lineHaptic,
} from '@/components/cutscene'
import type { BossDialogueLine, BroadsideEnemy } from '@/lib/bossRaids'

interface Props {
  boss: BroadsideEnemy
  bossDefeatedText: string
  raidTitle: string
  lines: BossDialogueLine[]
  playerLabel: string
  playerCharacterColor: string | null
  playerEquippedHat: string | null
  playerAvatarBg: string | null
  playerAvatarBorder: string | null
  /** The raid's dialogueAccent. Gold when unset. */
  accent?: string
  onComplete: () => void
}

export default function BossDialogueModal({
  boss, raidTitle, lines,
  playerLabel, playerCharacterColor, playerEquippedHat, playerAvatarBg, playerAvatarBorder,
  accent, onComplete,
}: Props) {
  const ACCENT = accent ?? GOLD
  const [idx, setIdx] = useState(0)
  const [flash, setFlash] = useState(0)
  const reduced = prefersReducedMotion()

  const line = lines[idx]
  const last = idx >= lines.length - 1
  // Every line, so the plate can reserve the tallest and never resize again.
  const allText = lines.map(l => l.text)

  const { shown, typing, held, finish } = useTypewriter(line.text, idx, {
    pause: line.pause,
    reduced,
    onBegin: () => {
      if (line.fx === 'flash') setFlash(f => f + 1)
      lineHaptic(line.fx, line.speaker !== 'narrator')
    },
  })

  /** One tap finishes the line. The next advances. Never both. */
  function tap() {
    if (typing) { finish(); return }
    if (last) onComplete()
    else setIdx(i => i + 1)
  }

  const isBoss     = line.speaker === 'boss'
  const isPlayer   = line.speaker === 'player'
  const isNarrator = line.speaker === 'narrator'
  const shake = line.fx === 'shake' && !reduced && !held

  /** A wing. Lit and forward when it speaks, dimmed but PRESENT when it does not,
   *  breathing either way, leaning on a hit. Nobody here is a photograph. */
  const wing = (side: 'left' | 'right', lit: boolean, name: string, art: React.ReactNode, color: string) => (
    <motion.div
      initial={{ opacity: 0, x: side === 'left' ? -40 : 40, scale: 0.92 }}
      animate={{
        opacity: lit ? 1 : 0.38,
        x: shake && lit ? [0, -6, 5, -3, 0] : 0,
        scale: lit && shake ? 1.05 : lit && held ? 1.03 : lit ? 1 : 0.92,
        y: lit ? 0 : 8,
        filter: lit ? 'grayscale(0) brightness(1)' : 'grayscale(0.8) brightness(0.5)',
      }}
      transition={{
        scale: { type: 'spring', stiffness: 260, damping: 20 },
        x: shake && lit ? { duration: 0.4 } : { type: 'spring', stiffness: 220, damping: 26 },
        default: { type: 'spring', stiffness: 220, damping: 26 },
      }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        zIndex: lit ? 2 : 1, pointerEvents: 'none',
      }}
    >
      <motion.div
        animate={reduced ? {} : { y: [0, -5, 0] }}
        transition={{ duration: lit ? 3.4 : 4.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        {art}
      </motion.div>
      <p className="font-cinzel font-700 truncate" style={{ maxWidth: 130, fontSize: '0.82rem', color: lit ? color : '#6a6764', textAlign: 'center' }}>
        {name}
      </p>
    </motion.div>
  )

  const bossArt = boss.portrait ? (
    <div style={{
      width: 118, height: 118, borderRadius: '50%', overflow: 'hidden',
      border: `3px solid ${isBoss ? ACCENT : 'rgba(255,255,255,0.16)'}`,
      background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.08) 0%, rgba(20,40,60,0.85) 70%)',
      boxShadow: isBoss ? `0 0 30px ${ACCENT}66` : 'none',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={boss.portrait} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  ) : (
    <div style={{ width: 118, height: 118, borderRadius: '50%', background: 'rgba(120,80,30,0.4)', border: `3px solid ${ACCENT}` }} />
  )

  const playerArt = (
    <div style={{ borderRadius: '50%', boxShadow: isPlayer ? '0 0 30px rgba(74,222,128,0.5)' : 'none', transition: 'box-shadow 0.2s' }}>
      <CharacterAvatar
        characterColor={playerCharacterColor}
        equippedHat={playerEquippedHat}
        bgColor={playerAvatarBg ?? undefined}
        ringColor={isPlayer ? '#4ade80' : (playerAvatarBorder ?? undefined)}
        size={118}
      />
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={tap}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 36%, #14100a 0%, #08060a 62%, #030304 100%)',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent', userSelect: 'none',
      }}
    >
      <LivingFrame accent={ACCENT} reduced={reduced} />
      <AnimatePresence><FlashOut k={flash} /></AnimatePresence>
      <Letterbox />

      {/* Top bar: who you are about to fight, and the way out. */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 44, zIndex: 7,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.1rem' }}>
        <span className="font-karla font-700 uppercase truncate" style={{ fontSize: '0.55rem', letterSpacing: '0.18em', color: `${ACCENT}99` }}>
          Approaching · {raidTitle}
        </span>
        <button onClick={e => { e.stopPropagation(); onComplete() }} className="font-karla font-700 uppercase tap"
          style={{ flexShrink: 0, fontSize: '0.55rem', letterSpacing: '0.14em', padding: '0.3rem 0.6rem', borderRadius: 7,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(240,237,232,0.5)', cursor: 'pointer' }}>
          Skip
        </button>
      </div>

      {/* ── THE SHOT ─────────────────────────────────────────────────────────
          The frame SHAKES as one (x/y), but the camera's push-in scale is applied to
          the WINGS ONLY. It used to scale this whole container, and the dialogue plate
          lives at the bottom of it: scaling about the center pushed the plate's bottom
          edge DOWN, straight under the black letterbox bar, and the box read as cut
          off. The plate is not part of the shot. It is the subtitle track, and a
          subtitle track does not move when the camera does. */}
      <motion.div
        animate={shake ? { x: [0, -9, 8, -6, 4, 0], y: [0, 4, -3, 2, 0] } : { x: 0, y: 0 }}
        transition={shake ? { duration: 0.42 } : { duration: 0.3 }}
        style={{ position: 'absolute', inset: '44px 0', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      >
        <motion.div
          animate={{ scale: shake ? 1.04 : held ? 1.05 : 1 }}
          transition={
            shake ? { duration: 0.42 }
            : held ? { duration: (line.pause ?? 600) / 1000, ease: 'easeInOut' }
            : { duration: 0.5, ease: 'easeOut' }
          }
          style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, padding: '0 6% 1.1rem' }}
        >
          {wing('left', isBoss, boss.name, bossArt, ACCENT)}
          {wing('right', isPlayer, playerLabel, playerArt, '#4ade80')}
        </motion.div>

        <div style={{ position: 'relative', zIndex: 3, padding: '0 1rem calc(env(safe-area-inset-bottom, 0px) + 1.15rem)' }}>
          <div style={{
            width: '100%', maxWidth: 540, margin: '0 auto',
            padding: '1.05rem 1.15rem 1.15rem', borderRadius: 16,
            background: 'linear-gradient(180deg, rgba(12,10,7,0.94), rgba(5,4,4,0.97))',
            border: `1px solid ${isNarrator ? 'rgba(255,255,255,0.12)' : `${isPlayer ? '#4ade80' : ACCENT}55`}`,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.7)',
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          }}>
            {/* One height for the whole scene: every line reserves it, the tallest
                wins. The box never grows as the text types and never jumps between a
                short line and a long one. */}
            <TypedBody
              all={allText}
              text={line.text}
              shown={shown}
              typing={typing}
              accent={ACCENT}
              italic={isNarrator}
              quoted={!isNarrator}
            />

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', minHeight: 34, alignItems: 'center' }}>
              {last && !typing ? (
                <button onClick={e => { e.stopPropagation(); onComplete() }}
                  className="font-cinzel font-800 uppercase tracking-[0.08em] tap"
                  style={{ width: '100%', padding: '0.85rem', borderRadius: 11, fontSize: '1rem',
                    color: '#fff', background: 'linear-gradient(180deg, rgba(239,68,68,0.9), rgba(185,28,28,0.85))',
                    border: '1px solid rgba(239,68,68,0.9)', cursor: 'pointer', boxShadow: '0 0 24px rgba(239,68,68,0.35)' }}>
                  Engage
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

      <SceneProgress idx={idx} total={lines.length} accent={ACCENT} />
    </motion.div>
  )
}
