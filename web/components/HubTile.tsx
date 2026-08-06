'use client'

// The hub tile. ONE implementation, shared by the Expeditions hub and the
// Fishing hub so the two pages genuinely match instead of being lookalikes
// that drift apart the first time either one is touched.

import { motion } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import { IconLock } from '@/components/GameIcons'

/** The 2x2 grid the tiles live in. Both hubs use this so the gutters,
 *  column split and bottom margin can never disagree. */
export const HUB_GRID: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: '1.2rem',
}

export default function HubTile({
  bgImage, accent, title, status, statusColor, sub, subLock,
  locked = false, lockLabel = 'Coming Soon', muted = false, tag, onClick, progress, dot, glow, coachId, overlay,
}: {
  bgImage: string
  accent: string
  title: string
  status: string
  statusColor?: string
  sub?: string | null
  subLock?: boolean
  locked?: boolean
  lockLabel?: string
  /** PARKED, not merely locked. A locked tile is an invitation ("Clear Chapter
   *  2") and should still look like somewhere you are going. A parked one is
   *  not on the road at all, and reading as loud as the live tiles beside it
   *  makes the hub look like it has more doors than it does. Pushes the art
   *  most of the way to grey and takes the accent off the edge entirely. */
  muted?: boolean
  tag?: string
  onClick?: () => void
  progress?: number | null
  /** 'new' takes the tile's own accent, which is how a one-off unlock reads
   *  as different from the green "your crew is back" marker. */
  dot?: 'returned' | 'sailing' | 'new' | null
  glow?: boolean
  /** Onboarding coach target id (data-coach) so the tour can flash this tile. */
  coachId?: string
  /** Painted into the scene, above the art and under the bottom scrim — for a
   *  tile that should show something OF YOURS in the place it depicts (the
   *  Fishing tile puts your boat on the water). Not interactive: the whole
   *  tile is one button. */
  overlay?: React.ReactNode
}) {
  return (
    <motion.button
      type="button"
      data-coach={coachId}
      onClick={locked ? undefined : () => { vibrate([0, 14]); onClick?.() }}
      disabled={locked}
      // Match the Manage Crew/Ship cards' tactile press: a quick scale-down on
      // tap (0.94, same as .hub-manage-tap), a whisper of lift on hover, a soft
      // haptic tick on release, and a spring so it snaps back with life.
      whileTap={locked ? undefined : { scale: 0.94 }}
      whileHover={locked ? undefined : { scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      style={{
        position: 'relative', overflow: 'hidden', width: '100%',
        height: 200, borderRadius: 18, padding: 0,
        border: `1px solid ${muted ? 'rgba(255,255,255,0.07)' : `${accent}${locked ? '30' : '80'}`}`,
        borderTop: `1px solid ${muted ? 'rgba(255,255,255,0.10)' : `${accent}${locked ? '4a' : 'e0'}`}`,
        boxShadow: glow ? `0 0 18px ${accent}30` : undefined,
        cursor: locked ? 'default' : 'pointer', textAlign: 'left',
        opacity: muted ? 0.62 : locked ? 0.94 : 1,
        WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bgImage} alt="" aria-hidden loading="lazy" decoding="async"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: muted ? 'grayscale(0.95) brightness(0.42)' : locked ? 'grayscale(0.5) brightness(0.68)' : undefined }} />
      {overlay}
      {/* Bottom scrim so the title + status read over the art. */}
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 100, background: 'linear-gradient(180deg, transparent 0%, rgba(6,12,20,0.72) 45%, rgba(6,12,20,0.96) 100%)' }} />
      {tag && !locked && (
        <span className="font-karla font-700 uppercase tracking-[0.16em]" style={{ position: 'absolute', top: 9, right: 9, zIndex: 2, padding: '2px 7px', borderRadius: 999, fontSize: '0.44rem', color: '#04120f', background: accent, border: `1px solid ${accent}` }}>{tag}</span>
      )}
      {dot && !tag && (
        <span aria-hidden style={{ position: 'absolute', top: 10, right: 10, width: 9, height: 9, borderRadius: 9, background: dot === 'returned' ? '#4ade80' : accent, boxShadow: dot === 'returned' ? '0 0 8px rgba(74,222,128,0.75)' : `0 0 8px ${accent}b0`, animation: 'shop-pulse 1.6s ease-in-out infinite' }} />
      )}
      {/* The caption block is pinned to the BOTTOM, so it used to grow upward:
          a tile whose status wrapped, or that carried a `sub` line, pushed its
          own title higher than its neighbours and the four titles across the
          2x2 sat at different heights. The tiles were always the same size (the
          grid is 1fr 1fr and the height is a fixed 200) — it was the text
          moving inside them that read as misalignment.

          So the caption area is a FIXED box now and the meta lines live in a
          fixed-height slot under the title. The title lands on the same
          baseline on every tile whether it has one status line, a status and a
          sub, or a lock. Each line is one line: long copy ellipsises rather
          than wrapping and shoving everything up. */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 0.85rem 0.8rem' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#ffffff', lineHeight: 1.1, textShadow: `0 2px 6px rgba(0,0,0,0.8), 0 0 14px ${accent}44`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</p>
        <div style={{ height: 32, marginTop: 3, overflow: 'hidden' }}>
          {locked ? (
            <>
              <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.58rem', color: muted ? '#8b8781' : '#cfcac2', marginTop: 1, textShadow: '0 1px 4px rgba(0,0,0,0.9)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <IconLock size={10} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lockLabel}</span>
              </p>
              {/* A locked tile can still carry one line of tease under the lock
                  (what you already have waiting for it), and it fits inside the
                  same 32px slot as an unlocked tile's status + sub. */}
              {sub && (
                <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: muted ? '#7c7872' : '#a8a49c', lineHeight: 1.3, marginTop: 1, textShadow: '0 1px 3px rgba(0,0,0,0.95)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</p>
              )}
            </>
          ) : (
            <>
              {/* Two lines when it has the slot to itself, one when a sub is
                  sharing it. Either way it stays inside the 32px box, so the
                  title never moves — but a long node name ("Next: The
                  Quartermaster's Ghost") gets to wrap instead of being cut. */}
              <p className="font-karla font-700" style={{
                fontSize: '0.7rem', color: statusColor ?? accent, lineHeight: 1.3,
                textShadow: '0 1px 4px rgba(0,0,0,0.95)',
                display: '-webkit-box', WebkitBoxOrient: 'vertical',
                WebkitLineClamp: sub ? 1 : 2, overflow: 'hidden',
              }}>{status}</p>
              {sub && (
                <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#c2beb6', lineHeight: 1.3, marginTop: 1, textShadow: '0 1px 3px rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                  {subLock && <IconLock size={9} />}<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
                </p>
              )}
            </>
          )}
        </div>
      </div>
      {progress != null && (
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'rgba(0,0,0,0.5)' }}>
          <div style={{ width: `${Math.round(progress * 100)}%`, height: '100%', background: `linear-gradient(90deg, ${accent}, ${accent}cc)`, boxShadow: `0 0 6px ${accent}`, transition: 'width 0.5s' }} />
        </div>
      )}
    </motion.button>
  )
}
