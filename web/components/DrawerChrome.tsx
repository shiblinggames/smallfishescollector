'use client'

// Bottom-sheet drawer chrome, shared. These were local to FishingGame until the
// collection drawer moved out of it and took them along; they are generic and
// four other drawers on that page already use them.

import React from 'react'

export function DrawerHandle({ dragHandleProps }: { dragHandleProps?: React.HTMLAttributes<HTMLDivElement> }) {
  // The drag area is enlarged via top/bottom padding so the visible 4px pill
  // sits inside a comfortable touch target. `touchAction: 'none'` keeps the
  // browser from claiming the gesture as a scroll before framer-motion's
  // drag-controls can start the drag.
  return (
    <div
      {...dragHandleProps}
      style={{
        display: 'flex', justifyContent: 'center', padding: '0.7rem 0 0.3rem',
        flexShrink: 0, cursor: 'grab', touchAction: 'none',
        ...dragHandleProps?.style,
      }}
    >
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
    </div>
  )
}

// Shared close button for the bottom-sheet drawers. The old inline ✕ was a
// near-invisible 17px glyph (#4a4845, no hit area) that was hard to find and
// hard to tap; this is a proper 34px circular target with a visible icon.
export function DrawerClose({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      style={{
        flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.16)',
        borderRadius: '50%',
        width: 34, height: 34, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#e0ddd8', cursor: 'pointer', touchAction: 'manipulation',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  )
}
