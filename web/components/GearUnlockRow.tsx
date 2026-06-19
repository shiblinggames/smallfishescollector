'use client'

import { motion } from 'framer-motion'
import type { UnlockedGear } from '@/lib/gearUnlocks'

// Shared "now buyable" thumbnail row for the fishing + nav level-up
// celebrations — shows the gear whose level gate the player just cleared.
// Gold-accented to match the celebration; renders nothing when empty.
export default function GearUnlockRow({ items, delay = 0.5 }: { items: UnlockedGear[]; delay?: number }) {
  if (items.length === 0) return null
  const shown = items.slice(0, 6)
  const extra = items.length - shown.length
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 18 }}
      style={{ marginTop: '0.95rem' }}
    >
      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', color: '#f0c040', letterSpacing: '0.2em', marginBottom: 7, textShadow: '0 0 12px rgba(240,192,64,0.4)' }}>
        Now Available to Buy
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {shown.map(g => (
          <div key={g.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, width: 56 }}>
            <div style={{ width: 50, height: 50, borderRadius: 11, background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.45)', boxShadow: '0 0 14px rgba(240,192,64,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {g.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={g.image} alt="" loading="lazy" decoding="async" style={{ width: '82%', height: '82%', objectFit: 'contain' }} />
                : <span style={{ fontSize: '1.1rem', color: '#f0c040' }}>✦</span>}
            </div>
            <span className="font-karla font-600" style={{ fontSize: '0.46rem', color: 'rgba(255,255,255,0.62)', textAlign: 'center', lineHeight: 1.1, maxWidth: 56, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</span>
          </div>
        ))}
        {extra > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 50, height: 50, borderRadius: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)' }}>
            <span className="font-cinzel font-700" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.7)' }}>+{extra}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
