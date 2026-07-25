'use client'

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'

interface Props {
  href: string
  title: string
  /** Three-stop gradient stops: top atmospheric → middle → bottom deep.
   *  Each card defines its own scene tint (sea blue for Tide Run,
   *  velvet red for Blackjack, etc.) so the hub reads as a row of
   *  distinct places rather than identical buttons. */
  gradient: readonly [string, string, string]
  /** Border + glow accent — should match the gradient family so the
   *  card's edge feels like part of the same scene. */
  accent: string
  /** Card height in pixels. Defaults to 168 (the tavern hub size);
   *  pass higher for hero placements like Fish Market in the
   *  marketplace where the card sits alone in its row. */
  height?: number
  /** If true, the click navigates to an external URL via a plain
   *  anchor instead of router.push (used for Shopify product links
   *  from the marketplace). */
  external?: boolean
  /** When set, tapping fires this instead of navigating to `href` — used by
   *  cards that open an in-app popup (e.g. the membership purchase modal). */
  onActivate?: () => void
  /** Optional status pill rendered top-center over the art (e.g. a reset
   *  countdown once a daily reward is claimed / a cap is reached). */
  badge?: React.ReactNode
  /** Optional full-bleed painterly backdrop (a hand-painted "place" for the
   *  card), rendered behind `children` and clipped to the card. The gradient
   *  stays as the base tint / fallback; scenes layer their animated props on
   *  top for depth. Compose these DARK in the lower third so the title reads. */
  bgImage?: string
  /** Bespoke scene art rendered absolute inside the card. ScenicCard
   *  owns the gradient bg, border, bottom scrim, title, and tap feel
   *  — scenes just supply the illustration + animation. */
  children: React.ReactNode
}

/** Shared chrome for the new "scenic" cards used on the tavern hub +
 *  marketplace. Same outer dimensions as the legacy compact GameCard
 *  by default (168px tall, fills its grid cell). Pass `external` to
 *  navigate via <a target="_blank"> instead of next/navigation
 *  router.push — used by the marketplace's Shopify links. */
export default function ScenicCard({ href, title, gradient, accent, height = 168, external, onActivate, badge, bgImage, children }: Props) {
  const router = useRouter()
  const handleActivate = () => {
    if (onActivate) { onActivate(); return }
    if (external) {
      window.open(href, '_blank', 'noopener,noreferrer')
    } else {
      router.push(href)
    }
  }
  return (
    <motion.div
      role="link"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      style={{
        position: 'relative',
        height,
        borderRadius: 18,
        overflow: 'hidden',
        background: `linear-gradient(180deg, ${gradient[0]} 0%, ${gradient[1]} 55%, ${gradient[2]} 100%)`,
        border: `1px solid ${accent}80`,
        borderTop: `1px solid ${accent}e0`,
        cursor: 'pointer',
        userSelect: 'none',
        boxShadow: `0 4px 12px rgba(0,0,0,0.4), 0 0 18px ${accent}1a`,
      }}
    >
      {/* Painterly backdrop — full-bleed behind everything, clipped by the
          card's overflow:hidden. Sits over the gradient (its base tint) with
          the animated scene props + scrim + title layering on top. */}
      {bgImage && (
        <img
          src={bgImage}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
        />
      )}
      {children}
      {/* Status pill — top-center over the art (reset countdown, etc.). */}
      {badge && (
        <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', justifyContent: 'center', zIndex: 3, pointerEvents: 'none' }}>
          {badge}
        </div>
      )}
      {/* Bottom scrim — gradient fade from transparent to near-opaque
          dark so the title reads cleanly against busy art. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          height: 70,
          background: 'linear-gradient(180deg, transparent 0%, rgba(6,15,28,0.85) 55%, rgba(6,15,28,0.98) 100%)',
          pointerEvents: 'none',
        }}
      />
      <p
        className="font-cinzel font-700"
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 14,
          textAlign: 'center',
          fontSize: '1.2rem',
          color: '#ffffff',
          letterSpacing: '0.02em',
          textShadow: `0 2px 6px rgba(0,0,0,0.7), 0 0 14px ${accent}59`,
        }}
      >
        {title}
      </p>
    </motion.div>
  )
}
