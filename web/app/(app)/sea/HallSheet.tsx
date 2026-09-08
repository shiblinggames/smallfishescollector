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

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
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

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    // The map STEERS on click and starts a heading on pointerdown, so every
    // sheet over it needs this or dismissing also puts the helm over.
    <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
      <div className="fixed left-0 right-0 top-[var(--nav-h)] bottom-[60px] sm:bottom-0"
        style={{
          // THE HALL'S OWN PAINTING, which the page had all along — /crew's
          // entry in ClientBackground. The page is gone and the backdrop is not:
          // an interior you have sailed to should look like an interior, and a
          // flat dark panel would make the one crew room you have to travel for
          // the plainest of the five.
          background: 'linear-gradient(rgba(0,0,0,0.74) 0%, rgba(0,0,0,0.84) 50%, rgba(0,0,0,0.95) 100%), url(/crew-bg.jpg) center / cover no-repeat fixed',
          zIndex: 112, overflowY: 'auto', overscrollBehavior: 'contain',
        }}>
        {/* The way out. Ashore is somewhere you leave, and the sheet has no
            other edge to press — the chart underneath is covered. */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 3,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0.7rem 0.9rem',
          background: 'linear-gradient(180deg, rgba(6,6,8,0.96) 60%, rgba(6,6,8,0))',
        }}>
          <button type="button" onClick={onClose} aria-label="Back to the sea" className="tap"
            style={{
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: '50%', padding: 0, cursor: 'pointer',
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
              color: '#e0ddd8',
            }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <p className="font-pirata" style={{ fontSize: '1.5rem', letterSpacing: '0.03em', color: '#f0ede8', margin: 0 }}>
            The Crew Hall
          </p>
        </div>

        <div style={{ padding: '0 0.9rem 2.5rem' }}>
          {state ? (
            <CrewClient initial={state} embedded section="hall" />
          ) : (
            <p className="font-karla font-600 uppercase tracking-[0.16em]"
              style={{ fontSize: '0.62rem', color: err ? '#f87171' : '#c8ab7d', padding: '2rem 0', textAlign: 'center' }}>
              {err ?? 'Opening the hall…'}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
