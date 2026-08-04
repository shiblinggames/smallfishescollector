'use client'

import { motion } from 'framer-motion'
import type { CSSProperties, ReactNode } from 'react'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'

/**
 * THE modal sheet: backdrop, safe areas, card, and a close button.
 *
 * PopupShell already owned the hard part (clearing the fixed Nav and the mobile
 * tab bar, plus the iOS safe-area insets, and keeping the card mounted through
 * the exit animation). What it deliberately did NOT own was the card itself, so
 * every caller hand-rolled the same object anyway:
 *
 *     margin auto, width 100%, a maxWidth, a near-opaque base, radius 18,
 *     padding, maxHeight 88vh, overflowY auto, touch scrolling,
 *     overscroll contain, and an absolutely positioned close
 *
 * That is ten properties nobody should be retyping, and retyping them is how
 * the radii drifted (4 through 18 all in use) and how closes ended up as bare
 * glyphs in some sheets and real buttons in others.
 *
 * The base is SOLID by default, not a tint. These sheets open over painted
 * backgrounds, and a translucent panel on top of art reads as a grey film.
 *
 * Two shapes:
 *
 *   default   padding on the card, content flows and the whole card scrolls.
 *             The common case.
 *
 *   flush     no padding, `header` and `footer` pinned, only the middle
 *             scrolls. For sheets with an art band at the top or an action row
 *             at the bottom that must not scroll away.
 */
export default function ModalSheet({
  open, onClose, children,
  maxWidth = 440,
  header, footer,
  flush = false,
  padding = '0.95rem 0.9rem 1.1rem',
  background = 'rgba(8,14,24,0.98)',
  border = '1px solid rgba(255,255,255,0.12)',
  borderRadius = 18,
  maxHeight = '88vh',
  boxShadow = '0 24px 60px rgba(0,0,0,0.62)',
  closeVariant = 'plate',
  showClose = true,
  zIndex,
  style,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  maxWidth?: number
  /** Pinned above the scroll region. Implies the flush layout. */
  header?: ReactNode
  /** Pinned below it. Action rows belong here so they never scroll away. */
  footer?: ReactNode
  flush?: boolean
  padding?: string
  background?: string
  border?: string
  borderRadius?: number
  maxHeight?: string
  boxShadow?: string
  /** `onArt` when the close sits over a painted band rather than the panel. */
  closeVariant?: 'plate' | 'onArt'
  showClose?: boolean
  zIndex?: number
  style?: CSSProperties
}) {
  const pinned = flush || !!header || !!footer

  return (
    <PopupShell open={open} onClose={onClose} zIndex={zIndex}>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ duration: 0.18 }}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'relative', margin: 'auto', width: '100%', maxWidth,
            background, border, borderRadius, boxShadow, maxHeight,
            ...(pinned
              // minHeight:0 on the scroll child, or a flex column never scrolls,
              // it just grows the card past maxHeight.
              ? { display: 'flex', flexDirection: 'column', overflow: 'hidden' }
              : { padding, overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }),
            ...style,
          }}
        >
          {showClose && (
            <CloseButton
              onClick={onClose}
              variant={closeVariant}
              style={{ position: 'absolute', top: 8, right: 8, zIndex: 6 }}
            />
          )}
          {pinned ? (
            <>
              {header}
              <div style={{
                flex: 1, minHeight: 0, overflowY: 'auto',
                WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain',
                padding,
              }}>
                {children}
              </div>
              {footer}
            </>
          ) : children}
        </motion.div>
      )}
    </PopupShell>
  )
}
