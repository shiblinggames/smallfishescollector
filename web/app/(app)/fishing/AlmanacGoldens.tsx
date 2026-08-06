'use client'

// The Goldens room.
//
// Every other room in the Almanac is per SPECIES. This one is per CATCH,
// because shiny_catches keeps a row for each golden ever landed with its own
// size and date, and it survives selling the fish. So a golden is a thing that
// happened on a day, not a checkbox, and the room is a wall of them newest
// first rather than a grid of species with a gold border.

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ZONE_LABEL, ZONE_COLOR } from './zoneData'
import { fishArt, shortDate, compact } from '@/lib/almanac'
import { formatFishLength } from '@/lib/fishSize'
import { SHINY_ODDS } from '@/lib/shiny'
import type { AlmanacData } from './almanacActions'

const GOLD = '#f0c040'

export default function AlmanacGoldens({ data }: { data: AlmanacData }) {
  const { goldens } = data

  // THE WALL IS WHAT YOU STILL HAVE. A sold golden is gone, and seventeen
  // greyed-out ghosts of fish someone else owns is not a trophy room. They
  // still count in the tally above, because landing one happened and the
  // doubloons were real, but they do not get a mount.
  //
  // 'mounted' is the game's existing word for this: fish_collection.is_golden
  // drives the Logbook's "Golden {name}" plate.
  const mounted = useMemo(() => goldens.filter(g => g.status !== 'sold'), [goldens])
  const soldCount = goldens.length - mounted.length
  const soldFor = goldens.reduce((n, g) => n + (g.soldFor ?? 0), 0)
  // Biggest of the ones on the wall, not of all time, so the callout always
  // points at something you can still look at.
  const biggest = useMemo(() => mounted.reduce<typeof goldens[number] | null>(
    (best, g) => (g.sizeIn != null && (!best || (best.sizeIn ?? 0) < g.sizeIn)) ? g : best, null), [mounted])
  const speciesCount = new Set(mounted.map(g => g.fishId)).size

  if (mounted.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#c9c2e0', marginBottom: 6 }}>
          {goldens.length === 0 ? 'No goldens yet' : 'Nothing on the wall'}
        </p>
        <p className="font-karla font-400" style={{ fontSize: '0.74rem', color: '#a49dc0', lineHeight: 1.5 }}>
          {goldens.length === 0
            ? `A perfect catch rolls 1 in ${SHINY_ODDS.toLocaleString()} for a golden. Land enough perfects and the sea pays one out.`
            : `You have landed ${goldens.length} in your time and sold every one. Keep the next.`}
        </p>
      </div>
    )
  }

  return (
    <>
      {/* The tally. Held vs sold matters here in a way it does not anywhere
          else: a sold golden still counts as caught, and the doubloons it
          fetched are part of the story. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: '1.1rem' }}>
        <Tally label="Mounted" value={`${mounted.length}`} accent={GOLD} />
        <Tally label="Species" value={`${speciesCount}`} />
        <Tally label="Ever landed" value={`${goldens.length}`} />
        <Tally label={soldCount > 0 ? `${soldCount} sold for` : 'Sold for'} value={soldFor > 0 ? `${compact(soldFor)} ⟡` : '0 ⟡'} accent={soldFor > 0 ? GOLD : undefined} />
      </div>

      {biggest?.sizeIn != null && (
        <div style={{ marginBottom: '1.1rem', borderRadius: 12, padding: '0.7rem 0.85rem', background: 'linear-gradient(180deg, rgba(240,192,64,0.10) 0%, rgba(240,192,64,0.03) 100%)', border: '1px solid rgba(240,192,64,0.34)' }}>
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.66rem', color: GOLD, marginBottom: 3 }}>Largest golden</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f7ecd0' }}>
            {biggest.name} <span style={{ color: GOLD }}>{formatFishLength(biggest.sizeIn)}</span>
          </p>
          <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#b7ac95', marginTop: 1 }}>{shortDate(biggest.caughtAt)}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {mounted.map((g, i) => {
          const zc = ZONE_COLOR[g.habitat] ?? GOLD
          return (
            <motion.div key={g.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.4) }}
              style={{
                position: 'relative', borderRadius: 12, overflow: 'hidden',
                padding: '0.6rem 0.6rem 0.65rem',
                background: 'linear-gradient(180deg, rgba(28,22,10,0.92) 0%, rgba(14,11,6,0.95) 100%)',
                border: '1px solid rgba(240,192,64,0.55)',
              }}>
              <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 34%, rgba(240,192,64,0.22), transparent 66%)', pointerEvents: 'none' }} />
              {/* A hairline of the water it came out of, along the top edge. */}
              <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: `linear-gradient(90deg, transparent, ${zc}, transparent)` }} />
              {/* Floated on its ground under a gold drop-shadow, the way the
                  profile mounts a trophy. A pixel cap rather than 100%/100%
                  keeps a wide fish and a tall one the same visual weight. */}
              <div style={{ position: 'relative', height: 74, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 5 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fishArt(g.name)} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ maxWidth: 92, maxHeight: 74, objectFit: 'contain', filter: 'saturate(1.25) drop-shadow(0 3px 11px rgba(240,192,64,0.6))' }} />
              </div>
              <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#f7ecd0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
                <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
                  {g.sizeIn != null ? formatFishLength(g.sizeIn) : 'unmeasured'}
                </span>
                <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: zc, whiteSpace: 'nowrap' }}>{ZONE_LABEL[g.habitat] ?? g.habitat}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
                <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#ab9f86' }}>{shortDate(g.caughtAt)}</span>
                <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.6rem', color: GOLD }}>Mounted</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </>
  )
}

function Tally({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.4rem 0.45rem', textAlign: 'center' }}>
      <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.64rem', color: '#9a93b8', marginBottom: 2 }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', lineHeight: 1, color: accent ?? '#ded8ee', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  )
}
