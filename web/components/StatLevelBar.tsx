'use client'

import { motion } from 'framer-motion'

// ONE shared level-bar pill, used at the top of the raids (Nav) and the fishing
// zone selector (Fishing) so the two read as the exact same element — same
// container, sizing, thin animated fill, and xp-to-next / MAX readout. Only the
// accent colour + short label change per stat (green NAV, gold FISH). Callers
// compute level/progress from their own XP curve and pass the results in.
export function StatLevelBar({
  level, progress, toGo, isMax, accent, label,
}: {
  level: number
  /** 0..1 progress through the current level. */
  progress: number
  /** XP remaining to the next level (ignored when isMax). */
  toGo: number
  isMax: boolean
  /** Accent hex, e.g. '#4ade80' (nav) or '#f0c040' (fishing). */
  accent: string
  /** Short uppercase tag, e.g. 'NAV' or 'FISH'. */
  label: string
}) {
  const c = accent
  const fillPct = isMax ? 100 : progress * 100
  return (
    <div className="flex items-center gap-2"
      style={{ background: 'rgba(4,10,18,0.72)', border: `1px solid ${c}28`, borderRadius: 16, padding: '0.35rem 0.75rem' }}>
      <div className="shrink-0 flex items-baseline gap-0.5">
        <span className="font-karla font-600" style={{ fontSize: '0.42rem', color: c + 'bb', letterSpacing: '0.08em' }}>{label}</span>
        <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: c, lineHeight: 1 }}>{level}</span>
      </div>
      <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <motion.div
          key={level}
          style={{
            height: '100%', borderRadius: 999,
            background: `linear-gradient(90deg, ${c}88 0%, ${c} 100%)`,
            boxShadow: `0 0 8px ${c}70`,
          }}
          initial={{ width: '0%' }}
          animate={{ width: `${fillPct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <p className="font-karla font-600 shrink-0"
        style={{ fontSize: '0.55rem', color: isMax ? c : 'rgba(255,255,255,0.55)', lineHeight: 1 }}>
        {isMax ? 'MAX' : `${toGo.toLocaleString()} xp`}
      </p>
    </div>
  )
}
