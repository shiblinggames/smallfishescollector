'use client'

import { useRouter } from 'next/navigation'

interface Props {
  href: string
  eyebrow: string
  title: string
  /** Optional subtext under the title. Drop it for a more compact card —
   *  the eyebrow + title + ✓ Done badge usually carry enough meaning. */
  statusText?: string
  info?: string[]
  icon?: React.ReactNode
  completed?: boolean
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

export default function GameCard({ href, eyebrow, title, statusText, completed, streak, variant = 'default', art, artMaxHeight = 96, customArt, accent = '#f0c040' }: Props) {
  const router = useRouter()
  const done = !!completed
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
          border: `1px solid ${done ? 'rgba(255,255,255,0.08)' : `${accent}30`}`,
          borderTop: `1px solid ${done ? 'rgba(255,255,255,0.08)' : `${accent}55`}`,
          borderRadius: 18,
          padding: '0.9rem 0.9rem 1rem',
          cursor: 'pointer',
          opacity: done ? 0.55 : 1,
          userSelect: 'none',
          transition: 'opacity 0.15s',
          // No minHeight — cards hug their content. (Used to be 200px
          // so the statusText line had room; now that subtext is gone,
          // a fixed floor left dead space at the bottom.) Grid cells
          // auto-equalize row height side-by-side, so cards still line
          // up cleanly even when titles wrap differently.
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
            height: 96, marginBottom: 8,
            opacity: done ? 0.4 : 1,
          }}>
            {customArt}
          </div>
        ) : art && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 96, marginBottom: 8 }}>
            <img
              src={art}
              alt=""
              style={{
                width: '100%',
                height: artMaxHeight,
                objectFit: 'contain',
                opacity: done ? 0.4 : 0.95,
              }}
            />
          </div>
        )}
        {/* Eyebrow + done */}
        <div className="flex items-center gap-2 mb-1">
          <p className="font-karla font-700 uppercase tracking-[0.12em]"
            style={{ fontSize: '0.52rem', color: accent + 'cc', flex: 1 }}>
            {eyebrow}
          </p>
          {done && (
            <span className="font-karla font-700" style={{ fontSize: '0.55rem', color: '#4ade80', whiteSpace: 'nowrap' }}>✓ Done</span>
          )}
        </div>
        <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#ffffff', lineHeight: 1.15, marginBottom: statusText ? '0.3rem' : 0 }}>
          {title}
        </p>
        {statusText && (
          <p className="font-karla font-400" style={{ fontSize: '0.66rem', color: '#a8a5a0', lineHeight: 1.45 }}>
            {statusText}
          </p>
        )}
        {!done && streak != null && streak > 0 && (
          <p className="font-karla font-700 mt-1.5" style={{ fontSize: '0.58rem', color: accent }}>
            {streak}d streak
          </p>
        )}
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
        border: `1px solid ${done ? 'rgba(255,255,255,0.08)' : featured ? `${accent}40` : `${accent}28`}`,
        borderTop: `1px solid ${done ? 'rgba(255,255,255,0.08)' : featured ? `${accent}66` : `${accent}44`}`,
        borderRadius: 20,
        padding: '1.3rem 1.4rem 1.25rem',
        cursor: 'pointer',
        opacity: done ? 0.55 : 1,
        userSelect: 'none',
        transition: 'opacity 0.15s',
      }}
    >
      {/* Left: text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center gap-2 mb-2">
          <p className="font-karla font-600 uppercase tracking-[0.12em]"
            style={{ fontSize: '0.56rem', color: accent + 'cc', flex: 1 }}>
            {eyebrow}
          </p>
          {done && (
            <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: '#4ade80', whiteSpace: 'nowrap' }}>✓ Done</span>
          )}
        </div>

        <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#ffffff', lineHeight: 1.2, marginBottom: statusText ? '0.35rem' : 0 }}>
          {title}
        </p>

        {statusText && (
          <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: '#b0ada8', lineHeight: 1.5 }}>
            {statusText}
          </p>
        )}

        {!done && streak != null && streak > 0 && (
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
            style={{
              width: '100%',
              height: 110,
              objectFit: 'contain',
              opacity: done ? 0.4 : 0.88,
              filter: `drop-shadow(0 4px 16px ${accent}50)`,
            }}
          />
        </div>
      )}
    </div>
  )
}
