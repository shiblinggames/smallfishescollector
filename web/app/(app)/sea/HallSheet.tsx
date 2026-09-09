'use client'

// ── THE CREW HALL, WHERE THE CREW HALL IS ───────────────────────────────────
//
// Going ashore at the Crew Hall island used to be a `router.push('/crew')`:
// off the sea, onto a page, and a full rebuild of the chart on the way back.
// The four rooms of that page live in the crew panel now (see CrewHub), and
// this is the fifth, which deliberately did NOT go with them.
//
// ── WHY THE BUILDING STAYED ASHORE ──────────────────────────────────────────
//
// The hall's tier, its Drills and Stores ladder and its bunks are the building
// itself. There is a hall on the chart with a shore you tie up at and a
// painting that changes as you upgrade it; putting its upgrades in a panel you
// can open from the middle of the ocean would make the island scenery — a place
// you sail past on the way to a menu that does the same thing.
//
// So this is the one crew room you have to be somewhere to use, and the whole
// of it is the thing the island IS.
//
// SAME COMPONENT, unchanged: `CrewClient` in embedded mode with its hall
// section showing. One crew hall with two doors, not two crew halls.
//
// ── AND IT IS A PANEL, NOT A TAKEOVER ───────────────────────────────────────
//
// It was a full-bleed sheet, edge to edge and top to bottom, which is a page
// wearing a portal's clothes. Every other thing this chart opens is a panel at
// `--modal-w`, and the hall is the same kind of thing they are: somewhere you
// look at for a minute while your boat sits at the shore you tied it to. You
// can see the water around it now.

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import { getCrewState, type CrewState } from '@/app/(app)/crew/actions'

const CrewClient = dynamic(() => import('@/app/(app)/crew/CrewClient'), { ssr: false })

export default function HallSheet({ open, onClose }: {
  open: boolean
  onClose: () => void
}) {
  const [state, setState] = useState<CrewState | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // READ ON EVERY OPEN. Bunks are on clocks and the purse moves while you sail;
  // a payload kept from the first visit would offer to buy a tier you cannot
  // afford and show a stint that finished an hour ago as still running.
  useEffect(() => {
    if (!open) return
    let live = true
    setErr(null)
    getCrewState().then(r => {
      if (!live) return
      if (!r) setErr('The hall did not answer. Try again.')
      else setState(r)
    }, () => { if (live) setErr('The hall did not answer. Try again.') })
    return () => { live = false }
  }, [open])

  return (
    // The map STEERS on click and starts a heading on pointerdown, so every
    // panel over it needs this or dismissing also puts the helm over.
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <PopupShell open={open} onClose={onClose} zIndex={118}>
        <motion.div
          role="dialog" aria-modal onClick={e => e.stopPropagation()}
          // Opacity only — CrewClient opens its own fixed sheets, and a
          // transform here would resolve their `position: fixed` against this
          // card instead of the viewport.
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          style={{
            position: 'relative', margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
            maxHeight: 'min(84vh, 100%)', display: 'flex', flexDirection: 'column',
            borderRadius: 20, overflow: 'hidden',
            // THE HALL'S OWN PAINTING, which the page had all along — /crew's
            // entry in ClientBackground. An interior you have sailed to should
            // look like an interior, and a flat dark panel would make the one
            // crew room you have to travel for the plainest of the five.
            background: 'linear-gradient(rgba(6,8,12,0.86) 0%, rgba(4,6,10,0.93) 55%, rgba(3,4,7,0.97) 100%), url(/crew-bg.jpg) center / cover no-repeat',
            border: '1px solid rgba(196,169,106,0.3)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.65)',
          }}>
          <div style={{ flexShrink: 0, padding: '1rem 1.05rem 0.7rem' }}>
            <p className="font-pirata" style={{ fontSize: '1.5rem', letterSpacing: '0.03em', color: '#f0ede8', margin: 0, paddingRight: 34 }}>
              The Crew Hall
            </p>
          </div>
          <CloseButton onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 6 }} />

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', padding: '0 1.05rem 1rem' }}>
            {state ? (
              <CrewClient initial={state} embedded section="hall" />
            ) : (
              <p className="font-karla font-600 uppercase tracking-[0.16em]"
                style={{ fontSize: '0.62rem', color: err ? '#f87171' : '#c8ab7d', padding: '2rem 0', textAlign: 'center' }}>
                {err ?? 'Opening the hall…'}
              </p>
            )}
          </div>
        </motion.div>
      </PopupShell>
    </div>
  )
}
