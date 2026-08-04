'use client'

import type { CSSProperties } from 'react'

/**
 * THE close button. One of these, everywhere a panel closes.
 *
 * Before this there were 23 of them, hand-rolled across ten files, and most
 * were a bare `✕` glyph in a <button> with about 5px of padding. That is a
 * ~14px target, well under the ~44px a thumb actually needs, so closing a sheet
 * on a phone was a coin flip. The ones that HAD been done properly (the boss
 * sheet, the voyage sheet) each reinvented the same 32px circle independently,
 * with slightly different plates and stroke weights.
 *
 * The glyph is an SVG path, not the character ✕. The character renders at the
 * mercy of whatever font resolves it, so it landed at a different size and
 * optical weight on iOS than on Android.
 *
 * Variants are about what sits BEHIND the button, not about size. `plate` for a
 * panel, `onArt` for a painted header band where the button needs its own dark
 * disc to stay visible. The target is 32px in both.
 */
export default function CloseButton({
  onClick, variant = 'plate', size = 32, label = 'Close', style, title,
}: {
  onClick: () => void
  /** `plate` on a panel surface, `onArt` over a painted image. */
  variant?: 'plate' | 'onArt'
  /** Only shrink this below 32 when the button is inside an already-small chip.
   *  It is a thumb target, not a decoration. */
  size?: number
  label?: string
  style?: CSSProperties
  title?: string
}) {
  const onArt = variant === 'onArt'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      style={{
        width: size, height: size, flexShrink: 0,
        borderRadius: '50%', padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: onArt ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${onArt ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.14)'}`,
        color: onArt ? '#e6e0d4' : 'rgba(255,255,255,0.6)',
        touchAction: 'manipulation',
        ...(onArt ? { backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' } : null),
        ...style,
      }}
    >
      <svg
        width={Math.round(size * 0.42)} height={Math.round(size * 0.42)}
        viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round" aria-hidden
      >
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  )
}
