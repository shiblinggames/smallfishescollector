'use client'

// ─── THE FISHING XP BAR ──────────────────────────────────────────────────────
// Lifted out of FishingGame so the SEA MAP's cast overlay wears the same one.
// Nothing changed in the move.
//
// It matters more than it looks: the bar is how a player reads what a cast is
// FOR. Casting on the map without it meant XP went somewhere invisible, and the
// map's fishing stopped feeling like the same activity as the fishing screen's.

import { motion } from 'framer-motion'
import { IconFlame } from '@/components/GameIcons'
import { getXPProgress, MAX_LEVEL } from '@/lib/fishingLevel'
import { nextLevelReward, rewardLabel, LEVEL_REWARD_MAX } from '@/lib/levelRewards'
import { renownProgress } from '@/lib/renown'

export function XPBarDisplay({ xp, bestStreak, renownAvailable, onOpenRenown }: {
  xp: number; bestStreak?: number
  /** Banked Renown points (post-100). When defined, MAX becomes a tappable
   *  "Renown N" chip + the bar tracks progress to the next Renown level. */
  renownAvailable?: number
  onOpenRenown?: () => void
}) {
  const { level, progress, xpInLevel, xpForLevel } = getXPProgress(xp)
  const isMax = level >= MAX_LEVEL
  const rn = isMax ? renownProgress('fishing', xp) : null
  const fillPct = isMax ? (rn ? rn.progress * 100 : 100) : progress * 100
  const toGo = xpForLevel - xpInLevel
  const c = isMax ? '#f0c040' : '#60a5fa'
  const clickable = isMax && !!onOpenRenown
  const hasPoints = isMax && (renownAvailable ?? 0) > 0
  return (
    <motion.div
      onClick={clickable ? onOpenRenown : undefined}
      className="flex items-center gap-2.5 px-3 py-2"
      animate={hasPoints ? { boxShadow: [`0 0 0px ${c}00`, `0 0 16px ${c}99`, `0 0 0px ${c}00`] } : { boxShadow: `0 0 0px ${c}00` }}
      transition={hasPoints ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      style={{ background: 'rgba(4,10,18,0.72)', border: `1px solid ${hasPoints ? c + '99' : c + '28'}`, borderRadius: 20, cursor: clickable ? 'pointer' : 'default' }}>
      <div className="shrink-0 flex items-baseline gap-0.5">
        <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: c + 'bb', letterSpacing: '0.08em' }}>LV</span>
        <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: c, lineHeight: 1 }}>{level}</span>
      </div>
      <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <motion.div
          key={isMax ? `rn-${rn?.level ?? 0}` : level}
          style={{
            height: '100%', borderRadius: 999,
            background: `linear-gradient(90deg, ${c}88 0%, ${c} 100%)`,
            boxShadow: `0 0 10px ${c}70`,
          }}
          initial={{ width: '0%' }}
          animate={{ width: `${fillPct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <div className="shrink-0 flex items-center gap-2">
        {isMax && rn ? (
          <span className="font-karla font-700 flex items-center gap-1.5" style={{ fontSize: '0.6rem', color: c, lineHeight: 1 }}>
            ✦ R{rn.level}
            {hasPoints && (
              <motion.span
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  fontSize: '0.52rem', color: '#0a0f1c', background: c, borderRadius: 999,
                  padding: '2px 6px', fontWeight: 800, whiteSpace: 'nowrap',
                }}>{renownAvailable} spend</motion.span>
            )}
          </span>
        ) : (
          // ── THE CARROT ──────────────────────────────────────────────────
          // "312 xp" told the player how far, and NOTHING about why. There was no
          // stated reason anywhere in the game to reach the next level. Now the bar
          // says what is waiting at the top of it, and lights gold on a milestone.
          (() => {
            const nx = nextLevelReward(level)
            const gold = '#f0c040'
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
                <p className="font-karla font-600"
                  style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.65)', textAlign: 'right', lineHeight: 1 }}>
                  {`${toGo.toLocaleString()} xp`}
                </p>
                {nx && (
                  <p className="font-karla font-700 truncate"
                    style={{
                      maxWidth: 116, fontSize: '0.52rem', lineHeight: 1, textAlign: 'right',
                      color: nx.reward.milestone ? gold : 'rgba(255,255,255,0.45)',
                      textShadow: nx.reward.milestone ? `0 0 10px ${gold}66` : 'none',
                    }}>
                    {nx.level === LEVEL_REWARD_MAX ? '★ Last reward · ' : nx.reward.milestone ? '★ ' : ''}{rewardLabel(nx.reward)}
                  </p>
                )}
              </div>
            )
          })()
        )}
        {(bestStreak ?? 0) > 0 && (
          <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: 'rgba(251,146,60,0.9)', lineHeight: 1 }}>
            <IconFlame size={10} />{bestStreak}
          </span>
        )}
      </div>
    </motion.div>
  )
}
