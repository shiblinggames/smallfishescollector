'use client'

import { useRouter } from 'next/navigation'

interface Props {
  href: string
  /** Optional uppercase tag above the title. Omit for a cleaner card
   *  where the title alone carries the label. ✓ Done badge still
   *  renders on its own row when the eyebrow is missing. */
  eyebrow?: string
  title: string
  /** Optional subtext under the title. Drop it for a more compact card —
   *  the eyebrow + title + ✓ Done badge usually carry enough meaning. */
  statusText?: string
  info?: string[]
  icon?: React.ReactNode
  streak?: number
  variant?: 'default' | 'featured' | 'compact'
  art?: string
  /** Override the compact-card art's max height (default 96). Useful for
   *  art that reads better at a smaller size — e.g. the Tide Run boat. */
  artMaxHeight?: number
  /** Custom JSX to render in the compact-card art slot in place of `art`.
   *  Use when the visual needs more than a single `<img>` — e.g. the
   *  Fish of the Day silhouette + red question mark composite. */
  customArt?: React.ReactNode
  accent?: string
}

export default function GameCard({ href, eyebrow, title, statusText, streak, variant = 'default', art, artMaxHeight = 96, customArt, accent = '#f0c040' }: Props) {
  const router = useRouter()
  const featured = variant === 'featured'
  const compact = variant === 'compact'

  if (compact) {
    return (
      <div
        role="link"
        tabIndex={0}
        onClick={() => router.push(href)}
        onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
        style={{
          display: 'flex', flexDirection: 'column',
          background: 'rgba(6,12,20,0.92)',
          border: `1px solid ${accent}30`,
          borderTop: `1px solid ${accent}55`,
          borderRadius: 18,
          padding: '0.9rem 0.7rem 0.95rem',
          cursor: 'pointer',
          userSelect: 'none',
          // Locked height tight to art + centered title — bumped down
          // from 188 since we no longer render the eyebrow / subtext /
          // streak / ✓ Done badge that used to live below the title.
          // Same height across all cards so the grid stays uniform
          // across Daily / Featured / Arcade rows.
          height: 168,
        }}
      >
        {/* Top: art. No drop-shadow filter here — at compact sizes the
            shadow reads as a rectangular halo around the image box
            rather than tracing the silhouette (the PNGs' anti-aliased
            edges leak into the alpha pass). The card's own accent
            border + top-edge highlight already frame the art. */}
        {customArt ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 96, marginBottom: 4,
          }}>
            {customArt}
          </div>
        ) : art && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 96, marginBottom: 4 }}>
            <img
              src={art}
              alt=""
              loading="lazy"
              decoding="async"
              style={{
                width: '100%',
                height: artMaxHeight,
                objectFit: 'contain',
                opacity: 0.95,
              }}
            />
          </div>
        )}
        {/* Title block fills the remaining vertical space below the
            art and centers itself in it — keeps the layout symmetric
            whether the title is one line ("Blackjack") or two ("Fish
            of the Day"). */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, textAlign: 'center' }}>
          {eyebrow && (
            <p className="font-karla font-700 uppercase tracking-[0.12em]"
              style={{ fontSize: '0.52rem', color: accent + 'cc' }}>
              {eyebrow}
            </p>
          )}
          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#ffffff', lineHeight: 1.18 }}>
            {title}
          </p>
          {statusText && (
            <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#a8a5a0', lineHeight: 1.45 }}>
              {statusText}
            </p>
          )}
          {streak != null && streak > 0 && (
            <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: accent }}>
              {streak}d streak
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => e.key === 'Enter' && router.push(href)}
      style={{
        display: 'flex', alignItems: 'stretch', gap: '1rem',
        background: 'rgba(6,12,20,0.92)',
        border: `1px solid ${featured ? `${accent}40` : `${accent}28`}`,
        borderTop: `1px solid ${featured ? `${accent}66` : `${accent}44`}`,
        borderRadius: 20,
        padding: '1.3rem 1.4rem 1.25rem',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Left: text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <p className="font-karla font-600 uppercase tracking-[0.12em] mb-2"
            style={{ fontSize: '0.56rem', color: accent + 'cc' }}>
            {eyebrow}
          </p>
        )}

        <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#ffffff', lineHeight: 1.2, marginBottom: statusText ? '0.35rem' : 0 }}>
          {title}
        </p>

        {statusText && (
          <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: '#b0ada8', lineHeight: 1.5 }}>
            {statusText}
          </p>
        )}

        {streak != null && streak > 0 && (
          <p className="font-karla font-600 mt-1.5" style={{ fontSize: '0.65rem', color: accent }}>
            {streak}d streak
          </p>
        )}
      </div>

      {/* Right: image */}
      {art && (
        <div style={{
          flexShrink: 0, width: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src={art}
            alt=""
            loading="lazy"
            decoding="async"
            style={{
              width: '100%',
              height: 110,
              objectFit: 'contain',
              opacity: 0.88,
              filter: `drop-shadow(0 4px 16px ${accent}50)`,
            }}
          />
        </div>
      )}
    </div>
  )
}
