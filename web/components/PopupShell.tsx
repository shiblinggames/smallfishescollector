'use client'

// Reusable scroll wrapper for popup modals. Use this for every full-screen
// modal so the content always clears the fixed Nav header (top) AND the
// MobileTabBar (bottom) — plus the iOS safe-area insets on both ends — when
// it's tall enough to scroll. Solo modals that don't use this shell keep
// rediscovering the bug where the top is hidden under the header or the
// bottom is clipped behind the tab bar.
//
// Shape is intentionally minimal: backdrop + scroll wrapper + click-empty to
// close. No opinion on the inner modal "card" so each modal still themes
// itself (rarity colors, dark glass, full-bleed, etc.). Drop your content
// inside; it auto-centers via `margin: auto` on the child.
//
// Usage:
//
//   import PopupShell from '@/components/PopupShell'
//
//   <PopupShell open={open} onClose={() => setOpen(false)}>
//     <motion.div
//       initial={{ opacity: 0, scale: 0.96, y: 8 }}
//       animate={{ opacity: 1, scale: 1, y: 0 }}
//       exit={{ opacity: 0, scale: 0.96, y: 4 }}
//       transition={{ duration: 0.18 }}
//       style={{
//         margin: 'auto', width: '100%', maxWidth: 420,
//         background: 'rgba(8,14,24,0.98)',
//         border: '1px solid rgba(255,255,255,0.12)',
//         borderRadius: 18, padding: '1.1rem 1rem 1.25rem',
//       }}
//     >
//       ...your content...
//     </motion.div>
//   </PopupShell>

import { motion, AnimatePresence } from 'framer-motion'
import { createContext, useContext, type ReactNode } from 'react'

/**
 * ── HOW DEEP THIS ONE IS ────────────────────────────────────────────────────
 *
 * Every modal in the game is the same width now (`--modal-w`), which was the
 * point — and it broke nesting. A confirm opened from inside a panel used to be
 * 300px against the panel's 480, so on a phone it sat visibly inside its host.
 * At one width they are the same width, and a sheet over a sheet at identical
 * edges does not read as ON it, it reads as having REPLACED it.
 *
 * So depth insets. Each shell tells its children how deep they are and adds a
 * step of side padding per level, which narrows anything inside it without any
 * modal having to know it is nested — a component that opens from two places
 * cannot know, and asking it to would put the answer in the wrong file.
 *
 * `PopupShell` does not portal, so a nested one is a real DOM descendant and
 * the context reaches it. A hand-rolled overlay is on its own.
 */
const ModalDepth = createContext(0)

/** How much narrower each level goes, per side. Enough to read as an edge at a
 *  phone's width without a third-level dialog becoming a slot. */
const DEPTH_STEP = 16
const DEPTH_MAX = 2

export interface PopupShellProps {
  open: boolean
  onClose: () => void
  /** Scroll-wrapper z-index. Backdrop sits one below. Default 111. */
  zIndex?: number
  /** Backdrop color/alpha. Default rgba(0,0,0,0.7). */
  backdropColor?: string
  /** Tag the wrapper data-any-key so a keypress closes it (KeyboardAdvance).
   *  Opt-in, for sheets that say Tap anywhere to close - NOT for management
   *  drawers, where a stray key would eat the panel. */
  anyKey?: boolean
  /** Optional override for the bottom padding (in case a modal lives above
   *  the MobileTabBar already, e.g. inside the raid combat region). */
  paddingBottom?: string
  /** Optional override for the top padding. */
  paddingTop?: string
  children: ReactNode
}

export default function PopupShell({
  open,
  onClose,
  zIndex = 111,
  anyKey = false,
  backdropColor = 'rgba(0,0,0,0.7)',
  paddingTop = 'calc(env(safe-area-inset-top, 0px) + 76px)',
  paddingBottom = 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
  children,
}: PopupShellProps) {
  const depth = useContext(ModalDepth)
  const inset = Math.min(depth, DEPTH_MAX) * DEPTH_STEP
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="popup-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              position: 'fixed', inset: 0,
              background: backdropColor,
              zIndex: zIndex - 1,
              pointerEvents: 'none',
            }}
          />
          {/* Scroll wrapper is a KEYED motion element, not a plain div, so
              AnimatePresence keeps it (and the card nested inside) mounted through
              the close. Otherwise a plain wrapper unmounts the instant `open` flips
              false and the card cuts while only the backdrop fades — the classic
              "modal doesn't close smoothly". Fading the wrapper carries the card out
              even when a caller forgets an `exit` on its own inner card. Opacity is
              safe for any `position: fixed` children (unlike transform/filter). */}
          <motion.div
            key="popup-wrapper"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            {...(anyKey ? { 'data-any-key': true } : {})}
            // THE SEA IS NOT UNDER THIS. The chart steers on pointerdown and
            // captures the pointer for the rest of the gesture, so a modal
            // mounted inside it did two wrong things at once: the press sailed
            // the boat, and the capture meant the click never arrived here at
            // all. One attribute, on the shell every modal is built from, so
            // this is answered once rather than per dialogue.
            data-no-steer
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
            style={{
              position: 'fixed', inset: 0, zIndex,
              display: 'flex',
              paddingTop,
              // ── INSET BY DEPTH ────────────────────────────────────────
              // See ModalDepth. The base rem is the phone's own margin; the
              // step is what makes a modal-over-a-modal look like one.
              paddingLeft: `calc(1rem + ${inset}px)`,
              paddingRight: `calc(1rem + ${inset}px)`,
              // AND THE CARD ITSELF STEPS IN, which is what makes nesting read
              // on a DESKTOP: a phone is bound by the padding above, but at 560
              // inside 560 the two edges land on each other. Computed from
              // `--modal-w-base` rather than from `--modal-w`, because a custom
              // property that reads itself is a cycle and resolves to nothing.
              ...(inset > 0 ? { ['--modal-w' as string]: `calc(var(--modal-w-base) - ${inset * 2}px)` } : null),
              paddingBottom,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              overscrollBehavior: 'contain',
            }}
          >
            <ModalDepth.Provider value={depth + 1}>{children}</ModalDepth.Provider>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
