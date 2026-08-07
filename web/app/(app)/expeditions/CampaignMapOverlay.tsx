'use client'

// The story map (RaidsSection) used to sit permanently at the bottom of the
// Expeditions page. It now surfaces as a full-screen overlay when the Campaign
// hub card is tapped (or any 'expedition:open-campaign-map' event fires — the
// Captain's Orders / Opportunity nudges + the ShipHero loadout "go to map"
// button all point here). The map + its node sheets are unchanged; this is just
// the shell.
//
// A custom full-screen shell (not PopupShell) so the header — and its close
// button — stays FIXED while a tall chapter map scrolls in the body below.
// zIndex 111 matches the app's modal layer, sitting above Nav / the tab bar
// (both z50). The map's own node sheets are PopupShells rendered inside here,
// so as DOM descendants they still paint above the map. The map mounts only
// while open, so its SVG measures correctly and its effects don't run behind a
// closed panel.

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function CampaignMapOverlay({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  // The portal target (document.body) only exists after mount — guard SSR.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener('expedition:open-campaign-map', onOpen)
    return () => window.removeEventListener('expedition:open-campaign-map', onOpen)
  }, [])

  // ARRIVING WITH A BOSS IN HAND. The forge's build planner links a component to
  // the fight that drops it with /expeditions?boss=<nodeId>, and RaidsSection
  // reads that param on ITS mount to open the card.
  //
  // That worked when the map lived permanently at the bottom of the page. Now
  // the map mounts only while this overlay is open, so a deep link landed on the
  // hub, RaidsSection never mounted, the effect never ran, and the param died
  // unread. The link looked like it did nothing.
  //
  // So the overlay answers the param too: if the URL names a boss, open on
  // arrival. The param is left ALONE here — RaidsSection is the one that
  // consumes and strips it, and stripping it first would just move the bug.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('boss')) setOpen(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open || !mounted) return null

  // Portal to <body> so the overlay escapes the page's `zIndex: 1` content
  // stacking context. Otherwise the fixed Nav header (a root-level z50 sibling)
  // paints OVER the top of the overlay and clips the close button.
  return createPortal(
    <div
      role="dialog"
      aria-modal
      style={{
        position: 'fixed', inset: 0, zIndex: 111,
        display: 'flex', flexDirection: 'column',
        // Campaign scene backdrop for the whole overlay, under a heavy scrim so
        // the map + node cards stay legible. Painted on the fixed root (not the
        // scrolling body), so it holds still behind the map without the iOS jank
        // of background-attachment: fixed.
        background: 'linear-gradient(180deg, rgba(11,8,6,0.93) 0%, rgba(6,5,4,0.96) 55%, rgba(6,5,4,0.99) 100%), url(/exp-campaign.jpg) top center / cover no-repeat',
      }}
    >
      {/* Fixed header — always-reachable close, even down a long chapter map. */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'calc(env(safe-area-inset-top, 0px) + 0.7rem) 1rem 0.7rem',
        background: 'rgba(12,9,6,0.96)',
        borderBottom: '1px solid rgba(196,169,106,0.18)',
      }}>
        <div>
          <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: 'rgba(196,169,106,0.72)', marginBottom: 1 }}>
            Campaign
          </p>
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0e8d0' }}>
            The Sunken Hand
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          style={{
            width: 34, height: 34, borderRadius: '50%', padding: 0, flexShrink: 0,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.18)',
            color: '#cfcabf', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable map body. overscroll-behavior contain keeps the scroll from
          chaining to the page underneath (iOS rubber-band). */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: 'auto',
        WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain',
        padding: 'calc(env(safe-area-inset-bottom, 0px) + 4rem) 1rem',
        paddingTop: '1rem',
      }}>
        <div style={{ maxWidth: 520, margin: '0 auto' }}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
