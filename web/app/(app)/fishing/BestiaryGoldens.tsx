'use client'

// The Goldens room.
//
// Every other room in the Bestiary is per SPECIES. This one is per CATCH,
// because shiny_catches keeps a row for each golden ever landed with its own
// size and date, and it survives selling the fish. So a golden is a thing that
// happened on a day, not a checkbox, and the room is a wall of them newest
// first rather than a grid of species with a gold border.

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { ZONE_LABEL, ZONE_COLOR } from './zoneData'
import { fishArt, shortDate, compact } from '@/lib/bestiary'
import { formatFishLength } from '@/lib/fishSize'
import { SHINY_ODDS } from '@/lib/shiny'
import type { BestiaryData } from './bestiaryActions'

const GOLD = '#f0c040'

export default function BestiaryGoldens({ data }: { data: BestiaryData }) {
  const { goldens } = data

  // status is 'hold' or 'sold'. A held golden is literally still sitting in
  // your fish hold, which is why the card says so rather than "kept".
  const held = goldens.filter(g => g.status !== 'sold').length
  const soldFor = goldens.reduce((n, g) => n + (g.soldFor ?? 0), 0)
  const biggest = useMemo(() => goldens.reduce<typeof goldens[number] | null>(
    (best, g) => (g.sizeIn != null && (!best || (best.sizeIn ?? 0) < g.sizeIn)) ? g : best, null), [goldens])
  const speciesCount = new Set(goldens.map(g => g.fishId)).size

  if (goldens.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
        <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#5b5478', marginBottom: 6 }}>No goldens yet</p>
        <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#4e4866', lineHeight: 1.5 }}>
          A perfect catch rolls 1 in {SHINY_ODDS.toLocaleString()} for a golden. Land enough perfects and the sea pays one out.
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
        <Tally label="Landed" value={`${goldens.length}`} accent={GOLD} />
        <Tally label="Species" value={`${speciesCount}`} />
        <Tally label="In hold" value={`${held}`} />
        <Tally label="Sold for" value={soldFor > 0 ? `${compact(soldFor)} ⟡` : '0 ⟡'} accent={soldFor > 0 ? GOLD : undefined} />
      </div>

      {biggest?.sizeIn != null && (
        <div style={{ marginBottom: '1.1rem', borderRadius: 12, padding: '0.7rem 0.85rem', background: 'linear-gradient(180deg, rgba(240,192,64,0.10) 0%, rgba(240,192,64,0.03) 100%)', border: '1px solid rgba(240,192,64,0.34)' }}>
          <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.46rem', color: GOLD, marginBottom: 3 }}>Largest golden</p>
          <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f7ecd0' }}>
            {biggest.name} <span style={{ color: GOLD }}>{formatFishLength(biggest.sizeIn)}</span>
          </p>
          <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#8c8272', marginTop: 1 }}>{shortDate(biggest.caughtAt)}</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {goldens.map((g, i) => {
          const zc = ZONE_COLOR[g.habitat] ?? GOLD
          const sold = g.status === 'sold'
          return (
            <motion.div key={g.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.4) }}
              style={{
                position: 'relative', borderRadius: 12, overflow: 'hidden',
                padding: '0.6rem 0.6rem 0.65rem',
                background: 'linear-gradient(180deg, rgba(28,22,10,0.92) 0%, rgba(14,11,6,0.95) 100%)',
                border: `1px solid ${sold ? 'rgba(240,192,64,0.24)' : 'rgba(240,192,64,0.55)'}`,
                opacity: sold ? 0.78 : 1,
              }}>
              <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 34%, rgba(240,192,64,0.22), transparent 66%)', pointerEvents: 'none' }} />
              {/* A hairline of the water it came out of, along the top edge. */}
              <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, background: `linear-gradient(90deg, transparent, ${zc}, transparent)` }} />
              <div style={{ position: 'relative', height: 72, display: 'grid', placeItems: 'center', marginBottom: 5 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fishArt(g.name)} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', filter: sold ? 'saturate(0.75) opacity(0.85)' : 'saturate(1.3) drop-shadow(0 3px 10px rgba(240,192,64,0.55))' }} />
              </div>
              <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#f7ecd0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
                <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
                  {g.sizeIn != null ? formatFishLength(g.sizeIn) : 'unmeasured'}
                </span>
                <span className="font-karla font-600" style={{ fontSize: '0.5rem', color: zc, whiteSpace: 'nowrap' }}>{ZONE_LABEL[g.habitat] ?? g.habitat}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
                <span className="font-karla font-600" style={{ fontSize: '0.5rem', color: '#7a7264' }}>{shortDate(g.caughtAt)}</span>
                {sold
                  ? <span className="font-karla font-700" style={{ fontSize: '0.5rem', color: '#9a8b6a', whiteSpace: 'nowrap' }}>sold {g.soldFor ? `${compact(g.soldFor)} ⟡` : ''}</span>
                  : <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.46rem', color: GOLD }}>In hold</span>}
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
      <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.44rem', color: '#5b5478', marginBottom: 2 }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', lineHeight: 1, color: accent ?? '#ded8ee', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  )
}
