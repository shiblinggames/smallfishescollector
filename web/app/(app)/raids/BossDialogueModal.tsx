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
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import {
  GOLD, useTypewriter, prefersReducedMotion,
  TypedBody, Letterbox, LivingFrame, FlashOut, SceneProgress, lineHaptic,
} from '@/components/cutscene'
import type { BossDialogueLine, BroadsideEnemy } from '@/lib/bossRaids'

interface Props {
  boss: BroadsideEnemy
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
  const isCrew     = line.speaker === 'crew'
  const isNarrator = line.speaker === 'narrator'
  const shake = line.fx === 'shake' && !reduced && !held

  // The RIGHT wing is "your side": the most recent player-or-crew speaker holds
  // it, so a crew member busts in to answer the villain and the camera returns
  // to whoever last spoke on your deck when the boss talks. Boss keeps the left.
  const yourSide: { kind: 'player' | 'crew'; name: string; portrait?: string } = (() => {
    for (let i = idx; i >= 0; i--) {
      const l = lines[i]
      if (l.speaker === 'player') return { kind: 'player', name: playerLabel }
      if (l.speaker === 'crew' && l.crew) return { kind: 'crew', name: l.crew.name, portrait: l.crew.portrait }
    }
    return { kind: 'player', name: playerLabel }
  })()
  const rightLit = isPlayer || isCrew

  /** A bust on the stage — big, bottom-anchored, breathing, lit and forward when
   *  it speaks and dimmed-but-present when it doesn't. The SAME stage StoryScene
   *  uses, so a boss scene and a story node read as one film (not a slideshow of
   *  portrait medallions). */
  const bustStage = (side: 'left' | 'right', lit: boolean, keyId: string, content: React.ReactNode) => (
    <motion.div
      key={`${side}-${keyId}`}
      initial={{ opacity: 0, x: side === 'left' ? -46 : 46, scale: 0.9 }}
      animate={{
        opacity: lit ? 1 : 0.4,
        x: shake && lit ? [0, -6, 5, -3, 0] : 0,
        scale: lit && shake ? 1.06 : lit && held ? 1.03 : lit ? 1 : 0.93,
        y: lit ? 0 : 8,
        filter: lit ? 'grayscale(0) brightness(1)' : 'grayscale(0.8) brightness(0.5)',
      }}
      transition={{
        scale: { type: 'spring', stiffness: 260, damping: 20 },
        x: shake && lit ? { duration: 0.4 } : { type: 'spring', stiffness: 220, damping: 26 },
        default: { type: 'spring', stiffness: 220, damping: 26 },
      }}
      style={{
        // ── THE BUSTS STAND IN A ROOM, NOT IN THE CORNERS ─────────────────
        //
        // Capped at 200px and pinned 2% from each screen edge, a desktop put
        // two small figures a metre apart with a field of empty scene between
        // them — a conversation held across a car park. `clamp` grows them with
        // the window instead of stopping dead, and the offset pulls them into a
        // centred band once the window is wider than that band, so the two
        // speakers stay in the same room however wide the monitor is.
        //
        // Both fall back to the old numbers on a phone, where 2% and 44vw were
        // right all along: `max` picks the 2% and the clamp picks its floor.
        position: 'absolute', bottom: 0,
        [side]: 'max(2%, calc(50% - 540px))',
        width: 'clamp(170px, 27vw, 360px)', aspectRatio: '1 / 1',
        zIndex: lit ? 2 : 1, pointerEvents: 'none',
        transformOrigin: side === 'left' ? 'bottom left' : 'bottom right',
      }}
    >
      <motion.div
        animate={reduced ? {} : { y: [0, -5, 0] }}
        transition={{ duration: lit ? 3.4 : 4.8, repeat: Infinity, ease: 'easeInOut' }}
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      >
        {content}
      </motion.div>
    </motion.div>
  )

  const bustImg = (src: string, glow: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom', filter: glow }} />
  )
  const bossContent = boss.portrait
    ? bustImg(boss.portrait, isBoss
        ? `drop-shadow(0 0 30px ${ACCENT}55) drop-shadow(0 12px 30px rgba(0,0,0,0.78))`
        : 'drop-shadow(0 10px 24px rgba(0,0,0,0.7))')
    : <div style={{ width: '70%', height: '84%', alignSelf: 'flex-end', borderRadius: 14, background: `${ACCENT}18`, border: `2px solid ${ACCENT}55` }} />
  const rightContent = yourSide.kind === 'crew' && yourSide.portrait
    ? bustImg(yourSide.portrait, rightLit
        ? 'drop-shadow(0 0 30px rgba(74,222,128,0.4)) drop-shadow(0 12px 30px rgba(0,0,0,0.78))'
        : 'drop-shadow(0 10px 24px rgba(0,0,0,0.7))')
    : (
      <div style={{ filter: isPlayer ? 'drop-shadow(0 0 26px rgba(74,222,128,0.4))' : 'drop-shadow(0 10px 24px rgba(0,0,0,0.7))' }}>
        <CharacterAvatar
          characterColor={playerCharacterColor}
          equippedHat={playerEquippedHat}
          bgColor={playerAvatarBg ?? undefined}
          ringColor={isPlayer ? '#4ade80' : (playerAvatarBorder ?? undefined)}
          // Grows with the busts opposite it. A fixed 168 beside a portrait
          // that now reaches 360 makes the captain the small one in their own
          // scene. Read once, at open: a cutscene is not resized mid-line.
          size={typeof window !== 'undefined' && window.innerWidth >= 900 ? 260 : 168}
        />
      </div>
    )
  // Nameplate rides the plate (StoryScene style), not under each bust.
  const speakerName = isBoss ? boss.name : isPlayer ? playerLabel : isCrew ? (line.crew?.name ?? null) : null
  const nameColor = (isPlayer || isCrew) ? '#4ade80' : ACCENT

  // Portal to <body> — same as StoryScene. Rendered inline in the raid tree, the
  // fixed overlay anchors to a transformed ancestor and the plate clips at the
  // bottom; on <body> it fills the real viewport (see transform-breaks-fixed).
  const modal = (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      data-any-key
      onClick={tap}
      style={{
        // ABOVE THE FIGHT, WHEREVER THE FIGHT IS. This portals to <body>, so it
        // escapes the stacking context of whatever mounted it — and over the
        // sea that mount is RaidSheet, itself a <body> portal sitting higher
        // than this was. The cutscene ended up UNDER the fight: no button could
        // be pressed, and every tap meant for it went to the chart instead.
        position: 'fixed', inset: 0, zIndex: 130, overflow: 'hidden',
        background: 'radial-gradient(ellipse at 50% 38%, #171208 0%, #0a0705 62%, #040303 100%)',
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
        style={{
          position: 'absolute', top: 44, left: 0, right: 0,
          // Clear the bottom letterbox AND the home indicator. `inset: 44px 0` only
          // cleared the bar, so on a device with a safe area the plate sat right on
          // top of it with nothing to breathe.
          bottom: 'calc(44px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
        }}
      >
        <motion.div
          animate={{ scale: shake ? 1.04 : held ? 1.05 : 1 }}
          transition={
            shake ? { duration: 0.42 }
            : held ? { duration: (line.pause ?? 600) / 1000, ease: 'easeInOut' }
            : { duration: 0.5, ease: 'easeOut' }
          }
          style={{ position: 'relative', flex: 1, minHeight: 0 }}
        >
          {/* The stage: busts sit BEHIND the dialogue plate and are overlapped by
              it, which puts them in the room instead of on a card. */}
          <AnimatePresence>{bustStage('left', isBoss, 'boss', bossContent)}</AnimatePresence>
          <AnimatePresence>{bustStage('right', rightLit, yourSide.kind === 'crew' ? yourSide.name : 'player', rightContent)}</AnimatePresence>
        </motion.div>

        {/* flexShrink 0: the plate reserves the scene's tallest line, and as a flex
            item it would otherwise SHRINK to fit and spill its content out the bottom,
            under the letterbox. The wings give up the room instead. They can. */}
        <div style={{ position: 'relative', zIndex: 3, flexShrink: 0, padding: '0 1rem 1.15rem' }}>
          <div style={{
            position: 'relative',
            width: '100%', maxWidth: 540, margin: '0 auto',
            padding: '1.05rem 1.15rem 1.15rem', borderRadius: 16,
            background: 'linear-gradient(180deg, rgba(12,10,7,0.94), rgba(5,4,4,0.97))',
            border: `1px solid ${isNarrator ? 'rgba(255,255,255,0.12)' : `${isPlayer || isCrew ? '#4ade80' : ACCENT}55`}`,
            boxShadow: '0 -8px 40px rgba(0,0,0,0.7)',
            backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          }}>
            {/* Nameplate — a tab on the plate's shoulder, same as StoryScene. */}
            <AnimatePresence>
              {speakerName && (
                <motion.span key={speakerName}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="font-cinzel font-800 uppercase"
                  style={{ position: 'absolute', top: -11, left: 16, fontSize: '0.62rem', letterSpacing: '0.16em',
                    color: '#1a1206', padding: '0.2rem 0.7rem', borderRadius: 999,
                    background: `linear-gradient(180deg, ${nameColor}, ${nameColor}cc)`, boxShadow: `0 0 16px ${nameColor}44` }}>
                  {speakerName}
                </motion.span>
              )}
            </AnimatePresence>
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

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}
