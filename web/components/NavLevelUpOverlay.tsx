'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { navLevelBonuses } from '@/lib/expeditionLevel'
import { shipsUnlockedBetween } from '@/lib/gearUnlocks'
import GearUnlockRow from '@/components/GearUnlockRow'

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
  const shipUnlocks = info ? shipsUnlockedBetween(info.fromLevel, info.toLevel) : []
  return (
    <AnimatePresence>
      {info && deltas && (
        <motion.div
          key="navlevelup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          transition={{ duration: 0.25 }}
          data-any-key
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // Near-opaque dark backdrop so the underlying raid/voyage card
            // never bleeds through the NAV LEVEL UP text or stat deltas.
            // Matches the fishing level-up backdrop.
            background: 'radial-gradient(ellipse 80% 65% at 50% 50%, rgba(20,40,80,0.94) 0%, rgba(0,0,0,0.98) 100%)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
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

            {/* Stat-delta lines — match the celebration typography: Cinzel,
                gold numerators, soft white-on-blue text shadow. Cards out,
                plain text lines in. */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.3, ease: 'easeOut' }}
              style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.22em]"
                 style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.45)', marginBottom: '0.4rem', textShadow: '0 0 12px rgba(96,165,250,0.4)' }}>
                Captain&apos;s Bonus
              </p>
              {deltas.hp         > 0 && <StatDeltaLine label="Max HP"     delta={deltas.hp} />}
              {deltas.power      > 0 && <StatDeltaLine label="Power"      delta={deltas.power} />}
              {deltas.navigation > 0 && <StatDeltaLine label="Savvy"      delta={deltas.navigation} />}
              {deltas.fortune    > 0 && <StatDeltaLine label="Fortune"    delta={deltas.fortune} />}
            </motion.div>

            {/* Ships that just cleared their Nav-Level buy gate. */}
            <GearUnlockRow items={shipUnlocks} delay={0.5} />

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

function StatDeltaLine({ label, delta }: { label: string; delta: number }) {
  return (
    <p
      className="font-cinzel font-700"
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 10,
        fontSize: '1.05rem', lineHeight: 1.25,
        color: '#f0ede8',
        textShadow: '0 0 16px rgba(240,192,64,0.45), 0 0 30px rgba(96,165,250,0.22)',
      }}
    >
      <span style={{ color: '#f0c040' }}>+{delta}</span>
      <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.82rem', letterSpacing: '0.08em' }}>{label}</span>
    </p>
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
