'use client'

/**
 * ── THE BOUNTY BOARD, WHEREVER IT IS POSTED ──────────────────────────────
 *
 * The board opens in two places: the Expeditions hub card, and mooring at the
 * Posting House out in the anchorage. It is ONE component because two copies
 * of a panel would drift the first time either was touched.
 *
 * ── IT WEARS WHAT THE LEVEL PANEL WEARS ──────────────────────────────────
 *
 * The bounty board is also a section of the Navigation level now (see
 * SkillPanel's `extra`), so a captain meets it in two frames: as part of that
 * panel, and on its own when they moor at the Posting House. Those two were a
 * dark parchment card and a painted oak plate, which read as two different
 * features holding the same notices. This is the level panel's own shell --
 * same ground, same gold hairline, same radius, same cap -- so mooring at the
 * island gives you exactly the section you already know, and nothing else.
 *
 * `BountiesPanel` fetches its own board. It draws `embedded`, without its own
 * header, because the header here is the panel's.
 */

import { motion } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import BountiesPanel from './BountiesPanel'

const GOLD = '#f0c040'

export default function BountyBoardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <PopupShell open={open} onClose={onClose}>
      <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        style={{
          position: 'relative', margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
          // Never taller than the room the shell left, the same cap the level
          // panel takes.
          maxHeight: 'min(80vh, 620px, 100%)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRadius: 20,
          background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
          border: '1px solid rgba(196,169,106,0.34)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}
      >
        <CloseButton onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 4 }} />

        {/* The title, in the level panel's own hand. */}
        <div style={{ flexShrink: 0, padding: '1.05rem 1.05rem 0.6rem' }}>
          <h2 className="font-cinzel font-800 uppercase" style={{
            margin: 0, fontSize: '0.82rem', letterSpacing: '0.14em', color: '#f4efe4', paddingRight: 34,
          }}>The Posting House</h2>
          <p className="font-karla font-800 uppercase" style={{
            margin: '0.5rem 0 0', fontSize: '0.5rem', letterSpacing: '0.2em', color: `${GOLD}cc`,
          }}>Bounties</p>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 1.05rem 1rem' }}>
          {open && <BountiesPanel embedded onClose={onClose} />}
        </div>
      </motion.div>
    </PopupShell>
  )
}
