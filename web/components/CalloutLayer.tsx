'use client'

// THE LABELS ON THE PREVIEW, and the hairlines to what they name.
//
// One layer over the whole hero panel rather than an SVG inside the art plus a
// row of chips under it. That split was what forced the chips into even columns
// — they were in a different box from the thing they pointed at, so the only
// coordinate they could share was "somewhere below". With one box, both ends of
// every callout are a percentage of the same rectangle, and either end can go
// anywhere.
//
// Which is what makes /shipyard/calibrate possible: it renders this same layer
// with both ends draggable and prints the table back out.

import { CALLOUTS, type Callout } from '@/lib/callouts'
import type { SlotKey } from '@/app/(app)/fishing/GearScreen'
import { vibrate } from '@/lib/haptics'

/** The chip, drawn identically here and in the calibrator. Exported so the two
 *  cannot drift into looking like different controls. */
export function CalloutChip({ label, name, dim }: { label: string; name: string; dim?: boolean }) {
  return (
    <span style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '0.3rem 0.55rem', borderRadius: 10,
      // An opaque floor. These sit on painted art, where a translucent chip
      // reads as a smear — the house rule for anything drawn over the world.
      background: 'rgba(6,14,22,0.88)',
      border: `1px solid ${dim ? 'rgba(240,192,64,0.6)' : 'rgba(180,214,232,0.26)'}`,
      whiteSpace: 'nowrap',
    }}>
      <span className="font-karla font-700 uppercase" style={{
        fontSize: 'var(--sy-1)', letterSpacing: '0.12em', lineHeight: 1.1,
        color: 'rgba(190,212,228,0.6)',
      }}>{label}</span>
      <span className="font-cinzel font-700" style={{
        maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
        fontSize: 'var(--sy-2)', lineHeight: 1.25, color: '#e6e2dc',
      }}>{name}</span>
    </span>
  )
}

/** The hairlines. Separate from the chips so the SVG can sit under them: a line
 *  that crosses a label should pass BEHIND it. */
export function CalloutLines({ list = CALLOUTS }: { list?: Callout[] }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
      {list.map(c => (
        <g key={c.slot}>
          {/* non-scaling-stroke, or stretching a 0-100 box onto a wide panel
              turns a hairline into a wedge. */}
          <line x1={c.chip.x} y1={c.chip.y} x2={c.at.x} y2={c.at.y}
            stroke="rgba(180,214,232,0.42)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <circle cx={c.at.x} cy={c.at.y} r={1.1}
            fill="rgba(220,238,246,0.9)" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  )
}

export default function CalloutLayer({ nameFor, onPick }: {
  nameFor: (slot: SlotKey) => string
  onPick: (slot: SlotKey) => void
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
      <CalloutLines />
      {CALLOUTS.map(c => (
        <button key={c.slot} type="button" className="tap"
          onClick={() => { vibrate(8); onPick(c.slot) }}
          title={`${c.label}: ${nameFor(c.slot)}`}
          style={{
            position: 'absolute', left: `${c.chip.x}%`, top: `${c.chip.y}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto', cursor: 'pointer', padding: 0,
            background: 'none', border: 'none',
          }}>
          <CalloutChip label={c.label} name={nameFor(c.slot)} />
        </button>
      ))}
    </div>
  )
}
