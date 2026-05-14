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
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.3 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.5rem' }}
      >
        <p className="font-karla font-700 uppercase tracking-[0.22em]" style={{ fontSize: '0.55rem', color: '#7a8aa0' }}>
          Approaching
        </p>
        <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f0c040', textShadow: '0 0 18px rgba(240,192,64,0.35)', marginTop: 4 }}>
          {raidTitle}
        </p>
      </motion.div>

      <div
        style={{
          width: '100%', maxWidth: 460,
          background: 'rgba(6,12,20,0.95)',
          border: '1px solid rgba(240,192,64,0.20)',
          borderTop: '1px solid rgba(240,192,64,0.42)',
          borderRadius: 16,
          padding: '1.1rem 1.1rem 1.2rem',
          minHeight: 200,
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Portraits row — boss on left, player on right. The non-speaking
            side gets dimmed. Narrator lines hide both. */}
        {!isNarrator && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: '0.85rem' }}>
            {/* Boss side */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: showBossPortrait ? 1 : 0.32, transition: 'opacity 0.18s' }}>
              {boss.portrait ? (
                <div style={{
                  width: 54, height: 54, borderRadius: '50%',
                  border: `2px solid ${showBossPortrait ? '#fbbf24' : 'rgba(255,255,255,0.18)'}`,
                  overflow: 'hidden',
                  background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.08) 0%, rgba(20,40,60,0.85) 70%)',
                  boxShadow: showBossPortrait ? '0 0 14px rgba(251,191,36,0.45)' : 'none',
                  transition: 'border-color 0.18s, box-shadow 0.18s',
                }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={boss.portrait} alt={boss.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(120,80,30,0.4)', border: '2px solid #fbbf24' }} />
              )}
              <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: showBossPortrait ? '#fbbf24' : '#6a6764' }}>
                {boss.name}
              </p>
            </div>

            {/* Player side */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: showPlayerPortrait ? 1 : 0.32, transition: 'opacity 0.18s' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: showPlayerPortrait ? '#4ade80' : '#6a6764' }}>
                {playerLabel}
              </p>
              <div style={{
                borderRadius: '50%',
                boxShadow: showPlayerPortrait ? '0 0 14px rgba(74,222,128,0.4)' : 'none',
                transition: 'box-shadow 0.18s',
              }}>
                <CharacterAvatar
                  characterColor={playerCharacterColor}
                  equippedHat={playerEquippedHat}
                  bgColor={playerAvatarBg ?? undefined}
                  ringColor={showPlayerPortrait ? '#4ade80' : (playerAvatarBorder ?? undefined)}
                  size={54}
                />
              </div>
            </div>
          </div>
        )}

        {/* Speaker label for non-narrator (small caption above the line). */}
        {!isNarrator && speakerName && (
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{
            fontSize: '0.55rem',
            color: showBossPortrait ? '#fbbf24' : '#4ade80',
            marginBottom: 6,
          }}>
            {speakerName}
          </p>
        )}

        {/* Dialogue text — each line fades in on advance. */}
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className={isNarrator ? 'font-karla' : 'font-karla'}
            style={{
              fontSize: isNarrator ? '0.82rem' : '0.92rem',
              color: isNarrator ? '#8a9bb0' : '#e8e4de',
              lineHeight: 1.6,
              fontStyle: isNarrator ? 'italic' : 'normal',
              textAlign: isNarrator ? 'center' : 'left',
              flex: 1,
            }}
          >
            {current.text}
          </motion.p>
        </AnimatePresence>

        {/* Progress dots + advance hint */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: '1rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {lines.map((_, i) => (
              <div key={i} style={{
                width: i === index ? 18 : 6, height: 4,
                borderRadius: 2,
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
              padding: '8px 18px',
              borderRadius: 9,
              cursor: 'pointer',
              background: isLast ? 'linear-gradient(180deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.06) 100%)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${isLast ? 'rgba(239,68,68,0.50)' : 'rgba(255,255,255,0.18)'}`,
              borderTop: `1px solid ${isLast ? 'rgba(239,68,68,0.75)' : 'rgba(255,255,255,0.28)'}`,
              color: isLast ? '#ef4444' : '#d8d4cf',
              fontSize: '0.68rem',
              boxShadow: isLast ? '0 0 16px rgba(239,68,68,0.20)' : 'none',
            }}
          >
            {isLast ? 'Engage' : 'Next ›'}
          </motion.button>
        </div>
      </div>

      <p className="font-karla font-400 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.32)', marginTop: '1rem' }}>
        tap anywhere to advance
      </p>
    </motion.div>
  )
}
