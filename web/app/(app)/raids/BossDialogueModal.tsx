'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import type { BossDialogueLine, BroadsideEnemy } from '@/lib/bossRaids'

/**
 * RPG-style pre-fight dialogue modal. Shows speaker portraits + dialogue
 * lines from a BossRaidConfig.preFightDialogue array, one at a time, with
 * tap-to-advance. After the last line, calls onComplete() and the parent
 * mounts the actual combat.
 *
 * Speakers:
 *   - 'boss'     → enemy.portrait + enemy.name on the LEFT
 *   - 'player'   → CharacterAvatar + username on the RIGHT
 *   - 'narrator' → no portrait, italic text, centered
 */

interface Props {
  boss: BroadsideEnemy
  bossDefeatedText: string  // "Barnacle Pete Defeated" → derive raid title
  raidTitle: string         // "The Corsair's Reckoning"
  lines: BossDialogueLine[]
  playerLabel: string
  playerCharacterColor: string | null
  playerEquippedHat: string | null
  playerAvatarBg: string | null
  playerAvatarBorder: string | null
  onComplete: () => void
}

export default function BossDialogueModal({
  boss, raidTitle, lines,
  playerLabel,
  playerCharacterColor, playerEquippedHat, playerAvatarBg, playerAvatarBorder,
  onComplete,
}: Props) {
  const [index, setIndex] = useState(0)
  const current = lines[index]
  const isLast = index >= lines.length - 1

  function advance() {
    if (isLast) onComplete()
    else        setIndex(i => i + 1)
  }

  const speakerName =
    current.speaker === 'boss'   ? boss.name :
    current.speaker === 'player' ? playerLabel :
    null

  const showBossPortrait   = current.speaker === 'boss'
  const showPlayerPortrait = current.speaker === 'player'
  const isNarrator         = current.speaker === 'narrator'

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, rgba(6,12,20,0.88) 0%, rgba(2,4,8,0.97) 100%)',
        padding: '1.5rem',
      }}
      onClick={advance}
    >
      {/* Top bar — raid title centered, skip button on the right for
          farmers who've heard it before. */}
      <div style={{ width: '100%', maxWidth: 520, position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.3 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          <p className="font-karla font-700 uppercase tracking-[0.22em]" style={{ fontSize: '0.62rem', color: '#7a8aa0' }}>
            Approaching
          </p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0c040', textShadow: '0 0 18px rgba(240,192,64,0.35)', marginTop: 4 }}>
            {raidTitle}
          </p>
        </motion.div>
        <button
          onClick={e => { e.stopPropagation(); onComplete() }}
          className="font-karla font-700 uppercase tracking-[0.1em]"
          style={{
            position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#9a9488',
            borderRadius: 8,
            padding: '0.45rem 0.85rem',
            fontSize: '0.62rem',
            cursor: 'pointer',
          }}
        >
          Skip ›
        </button>
      </div>

      <div
        style={{
          width: '100%', maxWidth: 520,
          background: 'rgba(6,12,20,0.95)',
          border: '1px solid rgba(240,192,64,0.20)',
          borderTop: '1px solid rgba(240,192,64,0.42)',
          borderRadius: 18,
          padding: '1.4rem 1.4rem 1.4rem',
          minHeight: 260,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Portraits row — boss on left, player on right. Big enough to
            actually read the character art. Non-speaking side dims;
            narrator lines hide both. */}
        {!isNarrator && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: '1.1rem' }}>
            {/* Boss side */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: showBossPortrait ? 1 : 0.32, transition: 'opacity 0.18s' }}>
              {boss.portrait ? (
                <div style={{
                  width: 104, height: 104, borderRadius: '50%',
                  border: `3px solid ${showBossPortrait ? '#fbbf24' : 'rgba(255,255,255,0.18)'}`,
                  overflow: 'hidden',
                  background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.08) 0%, rgba(20,40,60,0.85) 70%)',
                  boxShadow: showBossPortrait ? '0 0 22px rgba(251,191,36,0.50)' : 'none',
                  transition: 'border-color 0.18s, box-shadow 0.18s',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={boss.portrait} alt={boss.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{ width: 104, height: 104, borderRadius: '50%', background: 'rgba(120,80,30,0.4)', border: '3px solid #fbbf24' }} />
              )}
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: showBossPortrait ? '#fbbf24' : '#6a6764', textAlign: 'center' }}>
                {boss.name}
              </p>
            </div>

            {/* Player side */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: showPlayerPortrait ? 1 : 0.32, transition: 'opacity 0.18s' }}>
              <div style={{
                borderRadius: '50%',
                boxShadow: showPlayerPortrait ? '0 0 22px rgba(74,222,128,0.45)' : 'none',
                transition: 'box-shadow 0.18s',
              }}>
                <CharacterAvatar
                  characterColor={playerCharacterColor}
                  equippedHat={playerEquippedHat}
                  bgColor={playerAvatarBg ?? undefined}
                  ringColor={showPlayerPortrait ? '#4ade80' : (playerAvatarBorder ?? undefined)}
                  size={104}
                />
              </div>
              <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: showPlayerPortrait ? '#4ade80' : '#6a6764', textAlign: 'center' }}>
                {playerLabel}
              </p>
            </div>
          </div>
        )}

        {/* Speaker label for non-narrator (small caption above the line). */}
        {!isNarrator && speakerName && (
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{
            fontSize: '0.7rem',
            color: showBossPortrait ? '#fbbf24' : '#4ade80',
            marginBottom: 8,
          }}>
            {speakerName}
          </p>
        )}

        {/* Dialogue text — each line fades in on advance. Bumped sizes
            substantially so the dialogue is comfortable to read on mobile. */}
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="font-karla"
            style={{
              fontSize: isNarrator ? '1.05rem' : '1.18rem',
              color: isNarrator ? '#9aaecc' : '#f0ede8',
              lineHeight: 1.55,
              fontStyle: isNarrator ? 'italic' : 'normal',
              textAlign: isNarrator ? 'center' : 'left',
              flex: 1,
            }}
          >
            {current.text}
          </motion.p>
        </AnimatePresence>

        {/* Progress dots + advance hint */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: '1.2rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {lines.map((_, i) => (
              <div key={i} style={{
                width: i === index ? 22 : 8, height: 5,
                borderRadius: 2.5,
                background: i === index ? '#f0c040' : i < index ? 'rgba(240,192,64,0.4)' : 'rgba(255,255,255,0.12)',
                transition: 'width 0.2s, background 0.2s',
              }} />
            ))}
          </div>
          <motion.button
            onClick={e => { e.stopPropagation(); advance() }}
            whileTap={{ scale: 0.97 }}
            className="font-cinzel font-700 uppercase tracking-[0.12em]"
            style={{
              padding: '12px 24px',
              borderRadius: 10,
              cursor: 'pointer',
              background: isLast ? 'linear-gradient(180deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.06) 100%)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isLast ? 'rgba(239,68,68,0.50)' : 'rgba(255,255,255,0.18)'}`,
              borderTop: `1px solid ${isLast ? 'rgba(239,68,68,0.75)' : 'rgba(255,255,255,0.28)'}`,
              color: isLast ? '#ef4444' : '#d8d4cf',
              fontSize: '0.85rem',
              boxShadow: isLast ? '0 0 16px rgba(239,68,68,0.20)' : 'none',
            }}
          >
            {isLast ? 'Engage' : 'Next ›'}
          </motion.button>
        </div>
      </div>

      <p className="font-karla font-400 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.32)', marginTop: '1.1rem' }}>
        tap anywhere to advance
      </p>
    </motion.div>
  )
}
