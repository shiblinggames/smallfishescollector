'use client'

// ── THE PORTAL'S DESTINATIONS, AS NODES ─────────────────────────────────────
//
// Two lists of names first, then a plan of the sea at true proportions. Both
// were wrong, in opposite directions.
//
// The names were wrong because what you are choosing is a PLACE. The true-scale
// map was wrong because the sea is not laid out for a picker: the Shallows are
// a ring 2,400 wide and the Ancient Deep is 6,600, so at any size that fits in
// a sheet the near waters collapse to a thread — and every island the portal
// can reach sits inside the innermost two thousand pixels, which put six berths
// in a pile you could not have hit with a thumb.
//
// So: NODES. Big, evenly spaced, one per destination, with the order that
// matters kept and the geography that does not thrown away. The waters run out
// from the Mainland in the order they are sailed, and that order is the only
// spatial fact worth keeping.
//
// ── SIZED FOR A THUMB ───────────────────────────────────────────────────────
//
// The whole tile is the target, not the dot inside it — 104px at the narrowest
// and taller than it is wide, which is well past the 44 a finger wants and
// leaves the label inside the same press. Nothing here is a small circle beside
// a word.

import { useState } from 'react'
import { PLACES } from './chart'
import { PORTAL_TIERS, PORTAL_PORTS, type PortalTier, type PortalPort } from '@/lib/seaPortal'

/**
 * WHAT A BERTH LOOKS LIKE, from the island itself.
 *
 * Every one of these is a place with a painting already: the shed, the wharf,
 * the town. A coloured square beside its name was a label for a thing that has
 * a face — and the face is what a captain actually recognises, because it is
 * what they have been sailing up to for hours.
 *
 * The BUILDING rather than the island plate where there is one. An island plate
 * is mostly grass with a small thing on it, which at 56px is a green blob; the
 * building is the bit you would point at. The Homestead has no separate
 * building — its house is a ladder of five paintings, one per rung — so it
 * falls back to the isle, which is the right picture for it anyway.
 *
 * Derived from PLACES rather than written down again, so a re-drawn island
 * arrives here on its own.
 */
function berthArt(id: string): string | null {
  const p = PLACES.find(x => x.id === id)
  return p?.buildings?.[0]?.art ?? (p?.art?.startsWith('/sea/') ? p.art : null)
}

type Pick =
  | { kind: 'band'; tier: PortalTier }
  | { kind: 'port'; port: PortalPort }

export default function PortalMap({
  tier, ports, stoneFor, busy, onSail, onBuyTier, onBuyPort,
}: {
  /** How far the band ladder reaches. */
  tier: number
  /** Berths already taught. */
  ports: string[]
  /** Is the stone for this rung in hand? */
  stoneFor: (t: number) => boolean
  busy: boolean
  onSail: (x: number, y: number, accent: string) => void
  onBuyTier: () => void
  onBuyPort: (id: string) => void
}) {
  const [sel, setSel] = useState<Pick | null>(null)

  const bandOwned = (t: PortalTier) => t.tier <= tier
  const bandNext = (t: PortalTier) => t.tier === tier + 1
  const portOwned = (p: PortalPort) => ports.includes(p.id)

  return (
    <div>
      <Heading>The waters</Heading>
      <Board>
        {PORTAL_TIERS.map(t => (
          <Node key={t.tier}
            label={t.name}
            accent={t.accent}
            round
            owned={bandOwned(t)}
            dim={!bandOwned(t) && !bandNext(t)}
            on={sel?.kind === 'band' && sel.tier.tier === t.tier}
            note={bandOwned(t) ? null : bandNext(t) ? `${short(t.cost)} ⟡` : 'Locked'}
            onClick={() => setSel({ kind: 'band', tier: t })} />
        ))}
      </Board>

      <Heading>The berths</Heading>
      <Board>
        {PORTAL_PORTS.map(p => (
          <Node key={p.id}
            label={p.name}
            accent={p.accent}
            art={berthArt(p.id)}
            owned={portOwned(p)}
            dim={false}
            on={sel?.kind === 'port' && sel.port.id === p.id}
            note={portOwned(p) ? null : `${short(p.cost)} ⟡`}
            onClick={() => setSel({ kind: 'port', port: p })} />
        ))}
      </Board>

      {/* ── WHAT YOU HAVE PICKED ──
          One footer rather than a button on every node: eleven buttons is a
          wall of buttons, eleven places and one verb is a choice.

          AND NOTHING UNTIL SOMETHING IS PICKED. It used to hold seventy pixels
          open to say "pick where you are going" — a caption on a board of
          eleven labelled buttons, telling a captain what they can already
          see. */}
      {sel && (
      <div style={{
        marginTop: 12,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0.6rem 0.75rem', borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
      }}>
        {sel.kind === 'band' ? (
          <Foot
            accent={sel.tier.accent} round
            name={sel.tier.name}
            owned={bandOwned(sel.tier)}
            line={bandOwned(sel.tier)
              ? 'The portal knows this water.'
              : bandNext(sel.tier)
                ? `${sel.tier.cost.toLocaleString()} ⟡ · ${stoneFor(sel.tier.tier) ? 'stone in hand' : `needs the stone from ${sel.tier.name}`}`
                : 'Build the waters before it first.'}
            action={bandOwned(sel.tier)
              ? { label: 'Sail', onClick: () => onSail(sel.tier.to.x, sel.tier.to.y, sel.tier.accent) }
              : bandNext(sel.tier)
                ? {
                  label: busy ? 'Working…' : stoneFor(sel.tier.tier) ? 'Build' : 'No stone',
                  gold: true,
                  disabled: busy || !stoneFor(sel.tier.tier),
                  onClick: onBuyTier,
                }
                : null} />
        ) : (
          <Foot
            accent={sel.port.accent}
            name={sel.port.name}
            owned={portOwned(sel.port)}
            line={portOwned(sel.port)
              ? 'The portal knows this berth.'
              : `${sel.port.cost.toLocaleString()} ⟡${sel.port.id === 'gunwharf' ? ' · the far side of the reef' : ''}`}
            action={portOwned(sel.port)
              ? { label: 'Sail', onClick: () => onSail(sel.port.to.x, sel.port.to.y, sel.port.accent) }
              : { label: busy ? 'Working…' : 'Teach it', gold: true, disabled: busy, onClick: () => onBuyPort(sel.port.id) }} />
        )}
      </div>
      )}
    </div>
  )
}

/** 300,000 rather than 300k would put six digits in a 104px tile and force the
 *  label to wrap under it. The footer carries the exact figure. */
function short(n: number) {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-karla font-700 uppercase" style={{
      fontSize: '0.56rem', letterSpacing: '0.18em',
      color: 'rgba(168,146,255,0.75)', margin: '0 0 0.5rem',
    }}>{children}</p>
  )
}

/** AUTO-FIT, so the board is three across on a phone and six on a desktop
 *  without either being told about the other. The minimum is the tap target. */
function Board({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
      gap: 10, marginBottom: '1rem',
    }}>{children}</div>
  )
}

function Node({ label, accent, art, note, owned, dim, on, round, onClick }: {
  label: string
  accent: string
  /** The island's own painting, for the berths. The waters have none — they are
   *  water — so those keep the coloured mark. */
  art?: string | null
  /** Price, or "Locked". Null once it is yours — a node you own needs no line. */
  note: string | null
  owned: boolean
  dim: boolean
  on: boolean
  /** Waters are circles and berths are squares, on the chart's own rule that
   *  shape carries the meaning and colour only reinforces it. */
  round?: boolean
  onClick: () => void
}) {
  return (
    <button type="button" data-no-steer onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
        padding: '0.7rem 0.4rem 0.6rem', borderRadius: 14, cursor: 'pointer',
        background: on ? `${accent}20` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${on ? `${accent}aa` : owned ? `${accent}44` : 'rgba(255,255,255,0.09)'}`,
        opacity: dim ? 0.5 : 1,
        WebkitTapHighlightColor: 'transparent',
      }}>
      {art ? (
        // A LIT PLATE UNDER IT, so a building with a lot of sky in its plate
        // still reads as a thing standing on something. Untaught berths go
        // grey and dim: the picture is still the answer to "which one is
        // that", and greying it is how it says "not yet" without a second
        // symbol.
        <span aria-hidden style={{
          position: 'relative', width: '100%', height: 54, flexShrink: 0,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <span aria-hidden style={{
            position: 'absolute', left: '50%', bottom: 0, width: 54, height: 14,
            transform: 'translateX(-50%)', borderRadius: '50%',
            background: owned
              ? `radial-gradient(ellipse, ${accent}55 0%, transparent 70%)`
              : 'radial-gradient(ellipse, rgba(6,12,18,0.5) 0%, transparent 70%)',
          }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art} alt="" draggable={false} decoding="async" style={{
            position: 'relative', maxWidth: '100%', maxHeight: 54, objectFit: 'contain',
            filter: owned
              ? `drop-shadow(0 3px 6px rgba(0,0,0,0.55)) drop-shadow(0 0 10px ${accent}55)`
              : 'grayscale(0.85) brightness(0.6) drop-shadow(0 3px 6px rgba(0,0,0,0.55))',
          }} />
        </span>
      ) : (
        <span aria-hidden style={{
          width: 30, height: 30, flexShrink: 0,
          borderRadius: round ? '50%' : 7,
          background: owned ? accent : 'transparent',
          border: `2px solid ${owned ? accent : 'rgba(160,176,192,0.55)'}`,
          boxShadow: owned ? `0 0 14px ${accent}88` : 'none',
        }} />
      )}
      <span className="font-cinzel font-700" style={{
        fontSize: '0.74rem', lineHeight: 1.15, textAlign: 'center',
        color: owned ? '#ecdcbd' : 'rgba(214,226,236,0.78)',
      }}>{label.replace(/^The /, '')}</span>
      {note && (
        <span className="font-karla font-600" style={{
          fontSize: '0.64rem', color: 'rgba(214,226,236,0.5)',
          fontVariantNumeric: 'tabular-nums',
        }}>{note}</span>
      )}
    </button>
  )
}

function Foot({ accent, round, name, line, owned, action }: {
  accent: string
  round?: boolean
  name: string
  line: string
  owned: boolean
  action: { label: string; gold?: boolean; disabled?: boolean; onClick: () => void } | null
}) {
  return (
    <>
      <span aria-hidden style={{
        width: 16, height: 16, flexShrink: 0,
        borderRadius: round ? '50%' : 4,
        background: accent, opacity: owned ? 1 : 0.45,
        boxShadow: owned ? `0 0 12px ${accent}` : 'none',
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#ecdcbd', margin: 0 }}>
          {name}
        </p>
        <p className="font-karla" style={{
          fontSize: '0.72rem', margin: '1px 0 0',
          color: 'rgba(214,226,236,0.65)', lineHeight: 1.45,
        }}>{line}</p>
      </div>
      {action && (
        <button type="button" data-no-steer disabled={action.disabled} onClick={action.onClick}
          className="tap font-cinzel font-700" style={{
            flexShrink: 0, padding: '0.55rem 0.95rem', borderRadius: 10,
            cursor: action.disabled ? 'default' : 'pointer',
            background: action.gold ? 'rgba(240,192,64,0.16)' : `${accent}22`,
            border: `1px solid ${action.gold ? 'rgba(240,192,64,0.5)' : `${accent}66`}`,
            color: action.gold ? '#f6dfa0' : '#eef4f8', fontSize: '0.82rem',
            opacity: action.disabled ? 0.5 : 1,
          }}>{action.label}</button>
      )}
    </>
  )
}
