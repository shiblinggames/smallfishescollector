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
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'

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

/**
 * ── WHAT A DESKTOP EXPECTS OF A DIALOG, ANSWERED ONCE ───────────────────────
 *
 * Built for a phone, this shell did one of the six things a dialog owes a
 * desktop: clicking the empty backdrop closed it. Escape did nothing in any
 * of the twenty-odd sheets built on it, the page behind kept scrolling under a
 * mouse wheel the moment the sheet's own content fit, and focus never moved,
 * so Tab walked straight out into the page underneath. The sea answered
 * Escape for its own sheets with a hand-maintained chain of twenty-three
 * branches, and the one sheet that was not on the list (the fishing result)
 * silently had no key at all.
 *
 * So the shell owns three of those now, and every sheet built on it gets them
 * without knowing:
 *
 *   ESCAPE closes the TOPMOST open shell and only that one. A module-level
 *   stack says which is on top. The listener runs in the CAPTURE phase and
 *   stops the event there, so the sea's chain, KeyboardAdvance and anything
 *   else on window never see the same press, and one press closes one sheet.
 *   Closing calls the same `onClose` the backdrop does, so a caller that
 *   blocks the backdrop while busy blocks Escape for free.
 *
 *   THE PAGE BEHIND STOPS SCROLLING. `overflow: hidden` on body, refcounted so
 *   nested shells restore it once, with the scrollbar's width padded back in
 *   so the page does not shift sideways on Windows. Not lib/bodyScrollLock:
 *   that one pins the body to the top for combat screens and would jump a
 *   scrolled tavern page to zero on every open.
 *
 *   FOCUS MOVES IN, AND BACK. The wrapper takes focus on open (so the next
 *   Tab starts inside the dialog and Escape has somewhere to land), and
 *   whatever had focus before gets it back on close. Not a full trap: Tab can
 *   still leave, which is wrong in theory and right in practice for a game
 *   where the "page behind" is usually a canvas with nothing to focus.
 *
 * `role="dialog"` and `aria-modal` sit on the wrapper for the same reason: it
 * is the one element every sheet shares.
 */
const openShells: symbol[] = []

let bodyLocks = 0
let bodyPrev = { overflow: '', paddingRight: '' }
function lockBody(): () => void {
  if (bodyLocks++ === 0) {
    const b = document.body.style
    bodyPrev = { overflow: b.overflow, paddingRight: b.paddingRight }
    const gutter = window.innerWidth - document.documentElement.clientWidth
    b.overflow = 'hidden'
    if (gutter > 0) b.paddingRight = `${gutter}px`
  }
  return () => {
    if (--bodyLocks === 0) {
      const b = document.body.style
      b.overflow = bodyPrev.overflow
      b.paddingRight = bodyPrev.paddingRight
    }
  }
}

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

  const idRef = useRef<symbol | null>(null)
  if (idRef.current === null) idRef.current = Symbol('popup-shell')
  const wrapRef = useRef<HTMLDivElement>(null)
  // The latest onClose, so the one listener registered per open never calls
  // a stale closure and callers need not memoise theirs.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const id = idRef.current as symbol
    openShells.push(id)
    const before = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
    const raf = requestAnimationFrame(() => {
      try { wrapRef.current?.focus({ preventScroll: true }) } catch { /* fine */ }
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (openShells[openShells.length - 1] !== id) return
      e.stopImmediatePropagation()
      e.preventDefault()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    const unlock = lockBody()
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey, true)
      const i = openShells.indexOf(id)
      if (i >= 0) openShells.splice(i, 1)
      unlock()
      // Only if focus is still where we put it, or nowhere: a caller that
      // moved focus on purpose (a picker that focuses its result) keeps it.
      const now = document.activeElement
      if (before && before.isConnected && (now === null || now === document.body || now === wrapRef.current)) {
        try { before.focus({ preventScroll: true }) } catch { /* fine */ }
      }
    }
  }, [open])

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
            ref={wrapRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
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
              outline: 'none',
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
