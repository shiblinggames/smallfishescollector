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
import { SHINY_ODDS, SHINY_FISH_FILTER } from '@/lib/shiny'
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginBottom: '1.2rem', borderTop: '1px solid rgba(255,255,255,0.09)', borderBottom: '1px solid rgba(255,255,255,0.09)' }}>
        <Tally label="Mounted" value={`${mounted.length}`} accent={GOLD} />
        <Tally label="Species" value={`${speciesCount}`} />
        <Tally label="Ever landed" value={`${goldens.length}`} />
        <Tally label={soldCount > 0 ? `${soldCount} sold for` : 'Sold for'} value={soldFor > 0 ? `${compact(soldFor)} ⟡` : '0 ⟡'} accent={soldFor > 0 ? GOLD : undefined} />
      </div>

      {biggest?.sizeIn != null && (
        <div style={{ marginBottom: '1.3rem', padding: '0.1rem 0 0.2rem 0.75rem', borderLeft: `2px solid ${GOLD}` }}>
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.66rem', color: GOLD, marginBottom: 3 }}>Largest golden</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f7ecd0' }}>
            {biggest.name} <span style={{ color: GOLD }}>{formatFishLength(biggest.sizeIn)}</span>
          </p>
          <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#b7ac95', marginTop: 1 }}>{shortDate(biggest.caughtAt)}</p>
        </div>
      )}

      {/* No frames. A golden is the brightest thing in the book and it was
          sitting in a brown box; it stands in its own light now, with the
          date and the water as fine print under it. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem 0.3rem' }}>
        {mounted.map((g, i) => {
          const zc = ZONE_COLOR[g.habitat] ?? GOLD
          return (
            <motion.div key={g.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.4) }}
              style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0.4rem 0.2rem 0.6rem', minWidth: 0, maxWidth: '100%' }}>

              <div style={{ position: 'relative', width: '100%', height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span aria-hidden style={{
                  position: 'absolute', left: '50%', top: '46%', transform: 'translate(-50%, -50%)',
                  width: 112, height: 112, borderRadius: '50%', pointerEvents: 'none',
                  background: 'radial-gradient(circle, rgba(240,192,64,0.16) 0%, transparent 66%)',
                }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fishArt(g.name)} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ position: 'relative', maxWidth: 116, maxHeight: 90, objectFit: 'contain', filter: SHINY_FISH_FILTER }} />
                <span aria-hidden style={{
                  position: 'absolute', left: '50%', bottom: 2, transform: 'translateX(-50%)',
                  width: 58, height: 6, borderRadius: '50%', pointerEvents: 'none',
                  background: 'radial-gradient(ellipse, rgba(0,0,0,0.45) 0%, transparent 72%)',
                }} />
              </div>

              <p className="font-cinzel font-700" style={{ width: '100%', minWidth: 0, marginTop: 5, fontSize: '0.7rem', height: '0.95rem', lineHeight: '0.95rem', color: '#f7e6b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</p>
              <span className="font-cinzel font-700" style={{ marginTop: 1, fontSize: '0.78rem', color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
                {g.sizeIn != null ? formatFishLength(g.sizeIn) : 'unmeasured'}
              </span>
              <span aria-hidden style={{ marginTop: 5, width: 26, height: 1.5, borderRadius: 2, background: `linear-gradient(90deg, transparent, ${zc}, transparent)` }} />
              <span className="font-karla font-600" style={{ marginTop: 4, fontSize: '0.6rem', color: '#b7ac95', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {ZONE_LABEL[g.habitat] ?? g.habitat} · {shortDate(g.caughtAt)}
              </span>
            </motion.div>
          )
        })}
      </div>
    </>
  )
}

/** No box. Two rules across the set and hairlines between, which is enough
 *  structure for four numbers and none of the dated panel chrome. */
function Tally({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: '0.55rem 0.3rem', textAlign: 'center', borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
      <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', lineHeight: 1, color: accent ?? '#ded8ee', fontVariantNumeric: 'tabular-nums', marginBottom: 3 }}>{value}</p>
      <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.56rem', color: '#9a93b8' }}>{label}</p>
    </div>
  )
}
