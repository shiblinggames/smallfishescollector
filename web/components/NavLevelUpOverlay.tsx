'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { navLevelBonuses } from '@/lib/expeditionLevel'

// Reusable Nav-level level-up celebration. Same visual language as the
// fishing level-up (ring bursts + sparkles + big level number) but with a
// stat-delta breakdown underneath, since Nav levels grant raid-side stat
// bonuses (see lib/expeditionLevel.navLevelBonuses). Use after a successful
// raid kill or voyage payout — pass the old and new Nav level numbers and
// the component figures out the deltas.

export interface NavLevelUpInfo {
  fromLevel: number
  toLevel: number
}

interface Props {
  info: NavLevelUpInfo | null
  onDismiss: () => void
}

export default function NavLevelUpOverlay({ info, onDismiss }: Props) {
  const deltas = info ? diffBonuses(info.fromLevel, info.toLevel) : null
  return (
    <AnimatePresence>
      {info && deltas && (
        <motion.div
          key="navlevelup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          transition={{ duration: 0.25 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(ellipse 80% 65% at 50% 50%, rgba(96,165,250,0.22) 0%, rgba(0,0,0,0.9) 100%)',
            cursor: 'pointer',
            padding: '1.5rem',
          }}
        >
          {/* Ring bursts — same staggered triple-ring as fishing level-up */}
          {[0, 0.12, 0.24].map((delay, i) => (
            <motion.div key={`ring-${i}`}
              initial={{ scale: 0.1, opacity: 0.85 - i * 0.2 }}
              animate={{ scale: 4.5 - i * 0.6, opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeOut', delay }}
              style={{
                position: 'absolute',
                width: 110, height: 110, borderRadius: '50%',
                border: `${2 - i}px solid ${i % 2 === 0 ? 'rgba(96,165,250,0.75)' : 'rgba(240,192,64,0.6)'}`,
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* Sparkles */}
          {([
            { x: -60, delay: 0.08 },
            { x: 60,  delay: 0.14 },
            { x: -30, delay: 0.22 },
            { x: 35,  delay: 0.06 },
            { x: 0,   delay: 0.18 },
          ] as { x: number; delay: number }[]).map((s, i) => (
            <motion.span key={`sp-${i}`}
              initial={{ opacity: 0, y: 0, x: s.x, scale: 0 }}
              animate={{ opacity: [0, 1, 0], y: -80 - i * 14, x: s.x * 1.4, scale: [0, 1.4, 0.4] }}
              transition={{ duration: 1.2, delay: s.delay, ease: 'easeOut' }}
              style={{ position: 'absolute', color: i % 2 === 0 ? '#60a5fa' : '#f0c040', fontSize: '0.9rem', pointerEvents: 'none' }}
            >✦</motion.span>
          ))}

          <motion.div
            initial={{ scale: 0.55, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ duration: 0.28, ease: 'easeOut', delay: 0.06 }}
            style={{ textAlign: 'center', position: 'relative', maxWidth: 320 }}
          >
            <p className="font-cinzel font-700 uppercase tracking-[0.25em]"
              style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.35rem', textShadow: '0 0 18px rgba(255,255,255,0.95), 0 0 48px rgba(96,165,250,0.6)' }}>
              Nav Level Up!
            </p>
            <p className="font-cinzel font-700"
              style={{
                fontSize: '5rem', lineHeight: 1, color: '#f0c040',
                textShadow: '0 0 40px rgba(240,192,64,1), 0 0 90px rgba(240,192,64,0.5)',
              }}>
              {info.toLevel}
            </p>

            {/* Stat-delta rows */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.3, ease: 'easeOut' }}
              style={{ marginTop: '1.1rem', display: 'flex', flexDirection: 'column', gap: 6 }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#5a7a9a', marginBottom: 2 }}>
                Captain&apos;s Bonus
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {deltas.hp > 0 && (
                  <StatDeltaRow label="Max HP"     delta={deltas.hp}     color="#ef4444" />
                )}
                {deltas.power > 0 && (
                  <StatDeltaRow label="Power"      delta={deltas.power}  color="#f87171" />
                )}
                {deltas.navigation > 0 && (
                  <StatDeltaRow label="Navigation" delta={deltas.navigation} color="#60a5fa" />
                )}
                {deltas.fortune > 0 && (
                  <StatDeltaRow label="Fortune"    delta={deltas.fortune} color="#f0c040" />
                )}
              </div>
            </motion.div>

            <motion.p
              className="font-karla font-400"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
              style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.32)', marginTop: '1rem', letterSpacing: '0.08em' }}>
              tap to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StatDeltaRow({ label, delta, color }: { label: string; delta: number; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 14, padding: '0.4rem 0.85rem',
      background: 'rgba(6,12,20,0.7)', border: `1px solid ${color}55`,
      borderRadius: 10,
    }}>
      <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.62rem', color }}>{label}</span>
      <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0ede8' }}>+{delta}</span>
    </div>
  )
}

function diffBonuses(from: number, to: number) {
  if (to <= from) return null
  const before = navLevelBonuses(from)
  const after  = navLevelBonuses(to)
  const d = {
    hp:         after.hp         - before.hp,
    power:      after.power      - before.power,
    navigation: after.navigation - before.navigation,
    fortune:    after.fortune    - before.fortune,
  }
  if (d.hp <= 0 && d.power <= 0 && d.navigation <= 0 && d.fortune <= 0) return null
  return d
}
