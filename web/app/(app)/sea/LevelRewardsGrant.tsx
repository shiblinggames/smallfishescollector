'use client'

// WHAT YOU WERE OWED FOR LEVELLING.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// Fishing level rewards are granted by claimFishingLevelRewards, which is
// idempotent and state-based: it compares claimed_fishing_levels against the
// level your XP actually implies and hands over the difference. It was called
// from exactly one place, on the fishing screen's mount — and the fishing
// screen now redirects every captain to the chart. So the rewards accrued
// correctly and were never handed to anybody who sails.
//
// The chart calls it now, on arrival and again whenever a rod is stowed, and
// this is what says so. Because the grant is state-based rather than fired on
// the moment of levelling, a captain who has been owed three levels' worth for
// a fortnight gets all three at once the next time they open the sea.

import { motion, AnimatePresence } from 'framer-motion'
import { rewardLabel, type LevelReward } from '@/lib/levelRewards'

export type Granted = { level: number; reward: LevelReward }[]

export default function LevelRewardsGrant({ granted, onDone }: {
  granted: Granted
  onDone: () => void
}) {
  const top = granted[granted.length - 1]?.level ?? 0
  const many = granted.length > 1
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onDone}
        style={{
          position: 'fixed', inset: 0, zIndex: 90,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1.5rem', background: 'rgba(2,8,14,0.72)', backdropFilter: 'blur(4px)',
        }}>
        <motion.div onClick={e => e.stopPropagation()}
          initial={{ y: 18, scale: 0.97 }} animate={{ y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          style={{
            width: '100%', maxWidth: 380, borderRadius: 20, padding: '1.25rem 1.15rem 1.1rem',
            textAlign: 'center',
            // An opaque floor. This sits over the chart, which is painted.
            background: 'linear-gradient(180deg, rgba(30,44,26,0.6) 0%, rgba(10,18,14,0.7) 100%), rgba(8,14,20,0.98)',
            border: '1px solid rgba(240,192,64,0.45)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
          <p className="font-karla font-700 uppercase" style={{
            fontSize: '0.7rem', letterSpacing: '0.18em', color: 'rgba(240,192,64,0.8)',
          }}>{many ? `${granted.length} levels earned` : 'Level earned'}</p>

          <p className="font-cinzel font-700" style={{
            fontSize: '1.6rem', color: '#f4ecd8', marginTop: 4, lineHeight: 1.1,
          }}>Fishing {top}</p>

          <div style={{ marginTop: 12, textAlign: 'left' }}>
            {granted.map(g => (
              <div key={g.level} style={{
                display: 'flex', alignItems: 'baseline', gap: 10,
                padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.07)',
              }}>
                <span className="font-karla font-700" style={{
                  flexShrink: 0, minWidth: 28, fontSize: '0.78rem',
                  color: 'rgba(190,212,228,0.55)', fontVariantNumeric: 'tabular-nums',
                }}>{g.level}</span>
                <span className="font-karla font-600" style={{
                  flex: 1, fontSize: '0.85rem', color: '#e6e2dc', lineHeight: 1.45,
                }}>{rewardLabel(g.reward)}</span>
              </div>
            ))}
          </div>

          {many && (
            // SAY WHY IT ARRIVED IN A HEAP. Several levels at once looks like a
            // bug unless somebody explains it, and the honest explanation is
            // that they were owed.
            <p className="font-karla font-600" style={{
              fontSize: '0.78rem', color: 'rgba(190,212,228,0.55)', marginTop: 10, lineHeight: 1.55,
            }}>
              These were waiting for you. Everything you earn is held until you
              are back at the chart to collect it.
            </p>
          )}

          <button type="button" onClick={onDone} className="font-cinzel font-700"
            style={{
              marginTop: 14, width: '100%', padding: '0.7rem', borderRadius: 12,
              fontSize: '1rem', color: '#f2ead8',
              background: 'rgba(240,192,64,0.16)',
              border: '1px solid rgba(240,192,64,0.45)', cursor: 'pointer',
            }}>
            Take it aboard
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
