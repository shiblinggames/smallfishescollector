'use client'

/**
 * ── THE BOUNTY BOARD, WHEREVER IT IS POSTED ──────────────────────────────
 *
 * The board opens in two places now: the Expeditions hub card, and mooring at
 * the Posting House out in the anchorage. It is ONE component because two
 * copies of a painted plate, a scrim and a max-width would drift the first
 * time either was touched, and the chart's copy would quietly stop looking
 * like the hub's.
 *
 * `BountiesPanel` fetches its own board and owns its own title row, so all
 * this carries is the plate it is pinned to.
 */

import { motion } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import BountiesPanel from './BountiesPanel'

export default function BountyBoardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <PopupShell open={open} onClose={onClose}>
      <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 6 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{
          margin: 'auto', width: '100%', maxWidth: 440,
          // THE ACTUAL BOARD. A painted plate in the same gouache idiom as
          // the voyage routes: salt-stained oak, an empty frame lit by one
          // lantern, old nails and the torn corners of notices long gone.
          // The middle is deliberately bare, because that is where ours go.
          //
          // A scrim over it, weighted to the FOOT. The lamp is at the top of
          // the plate and the wood falls to near-black at the bottom, so the
          // header reads against the lit half and the footnote against the
          // dark, without flattening the painting in between.
          //
          // Solid colour under it so the panel is never translucent while the
          // plate loads.
          backgroundColor: '#150e09',
          backgroundImage: 'linear-gradient(180deg, rgba(12,8,5,0.30) 0%, rgba(12,8,5,0.16) 34%, rgba(10,7,4,0.62) 100%), url(/bounty-board.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          border: '1px solid rgba(120,88,52,0.55)',
          borderTop: '1px solid rgba(190,146,92,0.55)',
          borderRadius: 20, padding: '0.4rem 0.4rem 0.6rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.75)',
        }}
      >
        {/* BountiesPanel owns its own title row, so the gem count can sit
            beside the title instead of taking a bar of its own. */}
        {open && <BountiesPanel onClose={onClose} />}
      </motion.div>
    </PopupShell>
  )
}
