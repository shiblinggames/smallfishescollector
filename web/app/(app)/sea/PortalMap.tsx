'use client'

// ── THE PORTAL, AS A CHART ──────────────────────────────────────────────────
//
// It was two lists of names. Names are the wrong shape for this: what a captain
// is choosing is a PLACE, and every one of these places already has a position
// on a map they have spent hours sailing. "The Deep" is a word you have to
// translate; a ring three quarters of the way out is the thing itself.
//
// So it is a plan of the sea, at true proportions, and you click where you want
// to go.
//
// ── A BAND IS AN ARC, NOT A DOT ─────────────────────────────────────────────
//
// The five waters are RINGS around the Mainland, and the warp rolls a spot
// somewhere in the one you pick — `warpPoint` has always done that. Drawing
// them as five dots would state the opposite: that each one has a place you
// arrive at. Drawing them as the rings they are says the true thing and makes
// the whole southern sea legible in one shape.
//
// The berths are dots, because a berth genuinely is one point: it is the water
// beside a named island, and it is the same water every time.

import { useState } from 'react'
import { PLACES, NORTH_WALL, OUTER_EDGE, EXP_ORIGIN, EXP_EDGE, SORTIE } from './chart'
import { PORTAL_TIERS, PORTAL_PORTS, type PortalTier, type PortalPort } from '@/lib/seaPortal'

type Pick =
  | { kind: 'band'; tier: PortalTier }
  | { kind: 'port'; port: PortalPort }

const BANDS = PLACES.filter(p => p.kind === 'water' && p.inner != null && p.outer != null)
const PORTS = PLACES.filter(p => p.kind === 'port')

/** The plan's world box. South to the chart's edge, north far enough to hold
 *  the anchorage — the Gunwharf berth is up there and a map that cut it off
 *  would be a map missing the most expensive thing on it. */
const PAD = 1400
const Y0 = SORTIE.y - 1200
const Y1 = OUTER_EDGE + PAD
const X0 = -OUTER_EDGE - PAD
const X1 = OUTER_EDGE + PAD

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
      <svg viewBox={`${X0} ${Y0} ${X1 - X0} ${Y1 - Y0}`}
        style={{
          width: '100%', display: 'block', borderRadius: 14,
          background: 'radial-gradient(ellipse at 50% 30%, #0d1a26 0%, #070c14 70%)',
          border: '1px solid rgba(150,130,240,0.22)',
          touchAction: 'manipulation',
        }}>

        {/* ── THE FIVE WATERS ──
            Each drawn as the ring it is, from its inner radius to its outer, so
            the picture is the same picture the chart draws. A ring you own is
            lit in its own accent; one you cannot reach yet is a faint line, so
            the shape of what is left is visible from the first minute. */}
        {[...BANDS].reverse().map(b => {
          const t = PORTAL_TIERS.find(x => x.band === b.id)
          if (!t) return null
          const owned = bandOwned(t)
          const next = bandNext(t)
          const on = sel?.kind === 'band' && sel.tier.tier === t.tier
          const mid = ((b.inner ?? 0) + (b.outer ?? 0)) / 2
          const w = (b.outer ?? 0) - (b.inner ?? 0)
          return (
            <g key={b.id} style={{ cursor: owned || next ? 'pointer' : 'default' }}
              onClick={() => (owned || next) && setSel({ kind: 'band', tier: t })}>
              {/* SOUTH HALF ONLY. The bands do not exist north of the reef, and
                  a full circle would draw water over the anchorage. */}
              <path
                d={`M ${-mid} 0 A ${mid} ${mid} 0 0 0 ${mid} 0`}
                fill="none"
                stroke={owned ? `${t.accent}${on ? 'ee' : '99'}` : 'rgba(150,170,190,0.16)'}
                strokeWidth={w * (on ? 0.92 : 0.66)} />
              <text x={0} y={mid} textAnchor="middle"
                fill={owned ? '#f0ede8' : 'rgba(200,214,228,0.45)'}
                fontSize={1250} style={{ pointerEvents: 'none' }}>
                {t.name.replace(/^The /, '')}
              </text>
            </g>
          )
        })}

        {/* ── THE REEF ── the line the whole chart is split by. */}
        <line x1={X0} y1={NORTH_WALL} x2={X1} y2={NORTH_WALL}
          stroke="rgba(226,138,120,0.4)" strokeWidth={140} strokeDasharray="900 700" />

        {/* ── THE ANCHORAGE ── everything north of the reef, in outline. */}
        <circle cx={EXP_ORIGIN.x} cy={EXP_ORIGIN.y} r={EXP_EDGE}
          fill="rgba(60,96,120,0.22)" stroke="rgba(196,169,106,0.3)" strokeWidth={110} />

        {/* ── THE ISLANDS ── every port drawn, so the map is the sea rather
            than a menu with a compass on it. The ones the portal can be taught
            are marked; the rest are scenery, and being scenery is the point —
            it is how you can see that the Gunwharf is somewhere else. */}
        {PORTS.map(p => {
          const berth = PORTAL_PORTS.find(x => x.id === p.id)
          if (!berth) {
            return <circle key={p.id} cx={p.x} cy={p.y} r={330}
              fill="rgba(200,214,228,0.22)" />
          }
          const owned = portOwned(berth)
          const on = sel?.kind === 'port' && sel.port.id === berth.id
          return (
            <g key={p.id} style={{ cursor: 'pointer' }}
              onClick={() => setSel({ kind: 'port', port: berth })}>
              {on && <circle cx={p.x} cy={p.y} r={1500} fill={`${berth.accent}22`} />}
              <circle cx={p.x} cy={p.y} r={on ? 720 : 520}
                fill={owned ? berth.accent : 'rgba(120,134,150,0.75)'}
                stroke={on ? '#f0ede8' : 'rgba(8,12,20,0.8)'} strokeWidth={on ? 190 : 90} />
            </g>
          )
        })}
      </svg>

      {/* ── WHAT YOU HAVE PICKED ──
          One footer rather than a control on every node: at this scale a button
          per destination would be eleven buttons on a picture, and the picture
          is the thing doing the explaining. */}
      <div style={{
        marginTop: 10, minHeight: 74,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0.6rem 0.75rem', borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.09)',
      }}>
        {!sel ? (
          <p className="font-karla" style={{
            margin: 0, fontSize: '0.8rem', color: 'rgba(190,212,228,0.6)', lineHeight: 1.5,
          }}>
            Pick a water or an island. The rings are the fishing grounds; the dots are
            berths the portal can be taught.
          </p>
        ) : sel.kind === 'band' ? (
          <BandFoot t={sel.tier} owned={bandOwned(sel.tier)} next={bandNext(sel.tier)}
            stone={stoneFor(sel.tier.tier)} busy={busy}
            onSail={() => onSail(sel.tier.to.x, sel.tier.to.y, sel.tier.accent)}
            onBuy={onBuyTier} />
        ) : (
          <PortFoot p={sel.port} owned={portOwned(sel.port)} busy={busy}
            onSail={() => onSail(sel.port.to.x, sel.port.to.y, sel.port.accent)}
            onBuy={() => onBuyPort(sel.port.id)} />
        )}
      </div>
    </div>
  )
}

function BandFoot({ t, owned, next, stone, busy, onSail, onBuy }: {
  t: PortalTier; owned: boolean; next: boolean; stone: boolean; busy: boolean
  onSail: () => void; onBuy: () => void
}) {
  return (
    <>
      <span aria-hidden style={{
        width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
        background: t.accent, boxShadow: owned ? `0 0 12px ${t.accent}` : 'none',
        opacity: owned ? 1 : 0.45,
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#ecdcbd', margin: 0 }}>
          {t.name}
        </p>
        <p className="font-karla" style={{
          fontSize: '0.72rem', margin: '1px 0 0', color: 'rgba(214,226,236,0.65)', lineHeight: 1.45,
        }}>
          {owned ? 'The portal knows this water.'
            : next ? `${t.cost.toLocaleString()} ⟡ · ${stone ? 'stone in hand' : `needs the stone from ${t.name}`}`
              : 'Build the stages before it first.'}
        </p>
      </div>
      {owned ? (
        <Act label="Sail" accent={t.accent} onClick={onSail} />
      ) : next ? (
        <Act label={busy ? 'Working…' : stone ? 'Build' : 'No stone'} gold
          disabled={busy || !stone} onClick={onBuy} />
      ) : null}
    </>
  )
}

function PortFoot({ p, owned, busy, onSail, onBuy }: {
  p: PortalPort; owned: boolean; busy: boolean; onSail: () => void; onBuy: () => void
}) {
  return (
    <>
      <span aria-hidden style={{
        width: 14, height: 14, borderRadius: 4, flexShrink: 0,
        background: p.accent, boxShadow: owned ? `0 0 12px ${p.accent}` : 'none',
        opacity: owned ? 1 : 0.45,
      }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#ecdcbd', margin: 0 }}>
          {p.name}
        </p>
        <p className="font-karla" style={{
          fontSize: '0.72rem', margin: '1px 0 0', color: 'rgba(214,226,236,0.65)', lineHeight: 1.45,
        }}>
          {owned ? 'The portal knows this berth.'
            : `${p.cost.toLocaleString()} ⟡${p.id === 'gunwharf' ? ' · the far side of the reef' : ''}`}
        </p>
      </div>
      {owned
        ? <Act label="Sail" accent={p.accent} onClick={onSail} />
        : <Act label={busy ? 'Working…' : 'Teach it'} gold disabled={busy} onClick={onBuy} />}
    </>
  )
}

function Act({ label, accent, gold, disabled, onClick }: {
  label: string; accent?: string; gold?: boolean; disabled?: boolean; onClick: () => void
}) {
  return (
    <button type="button" data-no-steer disabled={disabled} onClick={onClick}
      className={`tap font-cinzel font-700`} style={{
        flexShrink: 0, padding: '0.5rem 0.9rem', borderRadius: 10,
        cursor: disabled ? 'default' : 'pointer',
        background: gold ? 'rgba(240,192,64,0.16)' : `${accent}22`,
        border: `1px solid ${gold ? 'rgba(240,192,64,0.5)' : `${accent}66`}`,
        color: gold ? '#f6dfa0' : '#eef4f8', fontSize: '0.82rem',
        opacity: disabled ? 0.5 : 1,
      }}>{label}</button>
  )
}
