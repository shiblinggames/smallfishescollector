'use client'

// ── THE ONE DOOR CARD ───────────────────────────────────────────────────────
//
// Every game and puzzle behind a Mainland door is entered through this card:
// the Den's three tables, the Chart Room's four puzzles, the Parlor's three
// games, the Tavern's contests. Thirteen doors, one shape.
//
// IT USED TO BE THIRTEEN SHAPES. Each card carried its own three-stop
// gradient and its own painted backdrop: velvet red for Blackjack, felt green
// for Roulette, violet for the slots, parchment for the Hold, night water for
// the Minefield. The idea was that a row of distinct places would read better
// than a row of identical buttons. What it read as was thirteen different
// games, none of which looked like the sea outside, and a captain crossing
// two rooms in a minute felt the floor change under them twice.
//
// So the card wears what the Mainland chooser wears, which is what every
// panel on the chart wears: a solid dark base, the door's accent as a tint at
// the top, a soft glow behind the art. The ART is still the card's own, and
// it is the only thing that is. Blackjack keeps its table, the Hold keeps its
// cargo grid, the Capstan keeps its wheel; they sit in the same frame now.
//
// AND EVERY DOOR SAYS WHAT IS BEHIND IT. A title on its own told a new captain
// nothing: "The Hold", "Lay the Rigging", "Pirate King" are names, and a name
// is not a reason to press. One line under each, plain and literal, saying
// what you do in there and what it pays.

import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'

/** The art box. Scenes position themselves inside it from the top. */
export const SCENE_H = 96

interface Props {
  href: string
  title: string
  /** What you do in there, in one plain line. What it pays if that is short. */
  blurb: string
  /** Border, tint and glow. */
  accent: string
  /** A status pill over the art's top-right: the week's progress, a lock, a
   *  jackpot. The card draws the pill; pass only the words. */
  chip?: { text: string; lit?: boolean; locked?: boolean }
  /** A status pill over the art's top-centre (a reset countdown). */
  badge?: React.ReactNode
  /** Navigate via a plain window.open instead of the router (external links). */
  external?: boolean
  /** Fired INSTEAD of navigating (a card that opens a popup). */
  onActivate?: () => void
  /** `data-coach` handle, for a tour pointing at this door. */
  coach?: string
  /** The scene: absolutely positioned inside a SCENE_H box, centred. */
  children?: React.ReactNode
}

export default function ScenicCard({ href, title, blurb, accent, chip, badge, external, onActivate, coach, children }: Props) {
  const router = useRouter()
  const handleActivate = () => {
    if (onActivate) { onActivate(); return }
    if (external) window.open(href, '_blank', 'noopener,noreferrer')
    else router.push(href)
  }
  return (
    <motion.div
      role="link"
      tabIndex={0}
      data-coach={coach}
      onClick={handleActivate}
      onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      style={{
        position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        height: '100%', minHeight: 214,
        padding: '0.65rem 0.65rem 0.8rem',
        borderRadius: 'var(--card-r)',
        // The same surface as the six doors on the Mainland chooser: a solid
        // base, the accent as a tint that fades out by the art's foot.
        background: `linear-gradient(180deg, ${accent}24 0%, rgba(4,10,18,0.72) 46%, rgba(3,8,14,0.96) 100%), #06101a`,
        border: `1px solid ${accent}5c`,
        boxShadow: `0 4px 12px rgba(0,0,0,0.4), 0 0 18px ${accent}14`,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* THE SCENE. A fixed box so every card's title lands at the same
          height whatever its art is doing. The glow is a gradient, not a
          filter: these cards animate, and a filtered subtree is re-rastered
          every frame of that. */}
      <div style={{ position: 'relative', width: '100%', height: SCENE_H, flexShrink: 0, marginBottom: 8 }}>
        <div aria-hidden style={{
          position: 'absolute', left: '50%', top: '50%', width: 132, height: 104, marginLeft: -66, marginTop: -52,
          borderRadius: '50%',
          background: `radial-gradient(ellipse at center, ${accent}4a 0%, ${accent}1c 48%, transparent 72%)`,
          pointerEvents: 'none',
        }} />
        {children}
        {badge && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 3, pointerEvents: 'none' }}>
            {badge}
          </div>
        )}
        {chip && (
          <span
            className="font-karla font-700"
            style={{
              position: 'absolute', top: 0, right: 0, zIndex: 3,
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: '0.56rem', letterSpacing: '0.04em', lineHeight: 1, whiteSpace: 'nowrap',
              color: chip.lit || chip.locked ? '#f0c040' : `${accent}ee`,
              background: 'rgba(5,10,16,0.82)',
              border: `1px solid ${chip.lit || chip.locked ? 'rgba(240,192,64,0.5)' : `${accent}55`}`,
              borderRadius: 999, padding: '0.28rem 0.5rem',
              pointerEvents: 'none',
            }}
          >
            {chip.locked && (
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.8" strokeLinecap="round" aria-hidden><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            )}
            {chip.text}
          </span>
        )}
      </div>

      <p className="font-cinzel font-800" style={{ fontSize: '0.98rem', color: '#f0ede8', lineHeight: 1.12, textShadow: `0 1px 4px rgba(0,0,0,0.6), 0 0 12px ${accent}40` }}>
        {title}
      </p>
      <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: 'rgba(226,214,190,0.82)', marginTop: 4, lineHeight: 1.38 }}>
        {blurb}
      </p>
    </motion.div>
  )
}
