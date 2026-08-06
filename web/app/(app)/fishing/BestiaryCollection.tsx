'use client'

// The Collection room: every species, grouped by the water it lives in.
//
// An uncaught species shows its real silhouette rather than a locked box, so
// the gaps in a habitat read as specific missing fish instead of a number you
// are behind on. Name, stats and flavour stay hidden until you land one.

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import { ZONE_LABEL, ZONE_COLOR, ZONE_ORDER } from './zoneData'
import { RARITY_LABEL, RARITY_COLOR, fishArt, isGiant, shortDate } from '@/lib/bestiary'
import { tierForLength, TIER_LABEL, TIER_COLOR, formatFishLength } from '@/lib/fishSize'
import type { BestiaryData, BestiaryEntry } from './bestiaryActions'

export default function BestiaryCollection({ data }: { data: BestiaryData }) {
  const [detail, setDetail] = useState<BestiaryEntry | null>(null)

  // The six Giants have their own room; showing them here too would make the
  // Ancient Deep read as 18 species when only 12 are fishable stock.
  const byZone = useMemo(() => {
    const m = new Map<string, BestiaryEntry[]>()
    for (const e of data.entries) {
      if (isGiant(e.sellValue, e.habitat)) continue
      const arr = m.get(e.habitat) ?? []
      arr.push(e); m.set(e.habitat, arr)
    }
    return m
  }, [data.entries])

  return (
    <>
      {ZONE_ORDER.map(zone => {
        const list = byZone.get(zone)
        if (!list?.length) return null
        const got = list.filter(e => e.count > 0).length
        const color = ZONE_COLOR[zone]
        const done = got === list.length
        return (
          <div key={zone} style={{ marginBottom: '1.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span aria-hidden style={{ width: 3, height: 15, borderRadius: 2, background: color, flexShrink: 0 }} />
              <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#e8e3f5', flex: 1, minWidth: 0 }}>{ZONE_LABEL[zone]}</p>
              <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: done ? '#f0c040' : '#6b6486', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {done ? '✦ all charted' : `${got}/${list.length}`}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
              {list.map(e => <SpeciesCard key={e.id} entry={e} color={color} onOpen={() => e.count > 0 && setDetail(e)} />)}
            </div>
          </div>
        )
      })}

      <SpeciesSheet entry={detail} onClose={() => setDetail(null)} goldens={data.goldens} />
    </>
  )
}

function SpeciesCard({ entry, color, onOpen }: { entry: BestiaryEntry; color: string; onOpen: () => void }) {
  const caught = entry.count > 0
  const tier = caught && entry.pbLength != null && entry.lengthMin != null && entry.lengthMax != null
    ? tierForLength(entry.pbLength, entry.lengthMin, entry.lengthMax) : null

  return (
    <motion.button type="button" onClick={onOpen} disabled={!caught}
      whileTap={caught ? { scale: 0.95 } : undefined}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      style={{
        position: 'relative', padding: '0.4rem 0.35rem 0.45rem', borderRadius: 11,
        background: caught ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${caught ? (entry.everGolden ? '#f0c04066' : color + '3a') : 'rgba(255,255,255,0.06)'}`,
        cursor: caught ? 'pointer' : 'default', textAlign: 'center',
        WebkitTapHighlightColor: 'transparent', overflow: 'hidden',
      }}>
      {/* A species you have taken a golden of keeps a permanent warm wash. It
          is the only per-card state worth carrying at this size. */}
      {entry.everGolden && (
        <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 32%, rgba(240,192,64,0.16), transparent 68%)', pointerEvents: 'none' }} />
      )}
      <div style={{ position: 'relative', height: 42, display: 'grid', placeItems: 'center', marginBottom: 3 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fishArt(entry.name)} alt="" aria-hidden loading="lazy" decoding="async"
          style={{
            maxWidth: '92%', maxHeight: '100%', objectFit: 'contain',
            // Silhouette, not a lock: you can see the shape of what is missing.
            filter: caught ? undefined : 'brightness(0) opacity(0.42)',
          }} />
      </div>
      <p className="font-karla font-700" style={{ fontSize: '0.53rem', lineHeight: 1.15, color: caught ? '#ded8ee' : '#4e4866', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {caught ? entry.name : '???'}
      </p>
      <p className="font-karla font-600" style={{ fontSize: '0.47rem', marginTop: 1, color: caught ? '#6b6486' : RARITY_COLOR[entry.rarity] + '99', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {caught
          ? `×${entry.count}${tier && (tier === 'trophy' || tier === 'large') ? '' : ''}`
          : RARITY_LABEL[entry.rarity]}
      </p>
      {caught && tier && (tier === 'trophy' || tier === 'large') && (
        <span aria-hidden style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: 6, background: TIER_COLOR[tier] }} title={TIER_LABEL[tier]} />
      )}
    </motion.button>
  )
}

/** The full record for one species: what it is, and what you have done to it. */
function SpeciesSheet({ entry, onClose, goldens }: {
  entry: BestiaryEntry | null
  onClose: () => void
  goldens: BestiaryData['goldens']
}) {
  const mine = useMemo(() => entry ? goldens.filter(g => g.fishId === entry.id) : [], [entry, goldens])
  if (!entry) return null

  const color = ZONE_COLOR[entry.habitat] ?? '#a78bfa'
  const tier = entry.pbLength != null && entry.lengthMin != null && entry.lengthMax != null
    ? tierForLength(entry.pbLength, entry.lengthMin, entry.lengthMax) : null
  // Where your best sits inside the species' possible range.
  const pbPct = entry.pbLength != null && entry.lengthMin != null && entry.lengthMax != null && entry.lengthMax > entry.lengthMin
    ? Math.max(0, Math.min(1, (entry.pbLength - entry.lengthMin) / (entry.lengthMax - entry.lengthMin))) : null

  return (
    <PopupShell open onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, margin: '0 auto', borderRadius: 18, overflow: 'hidden',
          // Solid base: this sits over the overlay's art.
          background: 'linear-gradient(180deg, #12101c 0%, #0a0913 100%)',
          border: `1px solid ${color}55`,
        }}>

        {/* Plate */}
        <div style={{ position: 'relative', height: 132, display: 'grid', placeItems: 'center', background: `radial-gradient(circle at 50% 42%, ${color}1f, transparent 70%)` }}>
          {entry.everGolden && (
            <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 42%, rgba(240,192,64,0.18), transparent 66%)' }} />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fishArt(entry.name)} alt="" aria-hidden style={{ maxWidth: '62%', maxHeight: '82%', objectFit: 'contain', position: 'relative' }} />
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ position: 'absolute', top: 9, right: 9, width: 28, height: 28, borderRadius: '50%', padding: 0, background: 'rgba(6,6,12,0.66)', border: '1px solid rgba(255,255,255,0.18)', color: '#cfcabf', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ padding: '0.9rem 1rem 1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 2 }}>
            <p className="font-cinzel font-800" style={{ fontSize: '1.25rem', color: '#f2eeff', lineHeight: 1.1 }}>{entry.name}</p>
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.48rem', padding: '0.12rem 0.4rem', borderRadius: 999, color: RARITY_COLOR[entry.rarity], background: RARITY_COLOR[entry.rarity] + '1c', border: `1px solid ${RARITY_COLOR[entry.rarity]}55` }}>
              {RARITY_LABEL[entry.rarity]}
            </span>
            {entry.everGolden && (
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.48rem', padding: '0.12rem 0.4rem', borderRadius: 999, color: '#f0c040', background: 'rgba(240,192,64,0.12)', border: '1px solid rgba(240,192,64,0.5)' }}>
                Golden taken
              </span>
            )}
          </div>
          {entry.scientificName && (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.68rem', color: '#6b6486', marginBottom: 10 }}>{entry.scientificName}</p>
          )}

          {/* Your record with this fish. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
            <Cell label="Caught" value={`${entry.count}`} />
            <Cell label="Goldens" value={`${mine.length}`} accent={mine.length ? '#f0c040' : undefined} />
            <Cell label="Worth" value={`${entry.sellValue.toLocaleString()} ⟡`} accent="#f0c040" />
          </div>

          {/* Personal best against the whole possible range. */}
          {entry.pbLength != null && entry.lengthMin != null && entry.lengthMax != null && (
            <div style={{ marginBottom: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11, padding: '0.6rem 0.7rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                <span className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.46rem', color: '#5b5478' }}>Your best</span>
                <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: tier ? TIER_COLOR[tier] : '#ded8ee' }}>
                  {formatFishLength(entry.pbLength)}{tier ? ` · ${TIER_LABEL[tier]}` : ''}
                </span>
              </div>
              <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.08)' }}>
                {pbPct != null && (
                  <motion.span aria-hidden initial={{ left: '0%' }} animate={{ left: `${pbPct * 100}%` }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    style={{ position: 'absolute', top: -3, width: 3, height: 12, borderRadius: 2, background: tier ? TIER_COLOR[tier] : '#ded8ee', transform: 'translateX(-50%)' }} />
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <span className="font-karla font-600" style={{ fontSize: '0.46rem', color: '#4e4866' }}>{formatFishLength(entry.lengthMin)}</span>
                <span className="font-karla font-600" style={{ fontSize: '0.46rem', color: '#4e4866' }}>{formatFishLength(entry.lengthMax)}</span>
              </div>
            </div>
          )}

          {entry.funFact && (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.74rem', color: '#a8a0c0', lineHeight: 1.45, marginBottom: 10 }}>{entry.funFact}</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 5 }}>
            <Row label="Water" value={ZONE_LABEL[entry.habitat] ?? entry.habitat} accent={color} />
            <Row label="Difficulty" value={`${entry.difficulty}/10`} />
            {entry.sizeCategory && <Row label="Size class" value={cap(entry.sizeCategory)} />}
            {entry.dietType && <Row label="Diet" value={cap(entry.dietType)} />}
            {entry.region && <Row label="Region" value={cap(entry.region)} />}
            {entry.firstCaughtAt && <Row label="First caught" value={shortDate(entry.firstCaughtAt)} />}
            {entry.lastCaughtAt && <Row label="Last caught" value={shortDate(entry.lastCaughtAt)} />}
            {entry.pbAt && <Row label="Best landed" value={shortDate(entry.pbAt)} />}
          </div>
        </div>
      </motion.div>
    </PopupShell>
  )
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '0.42rem 0.5rem', textAlign: 'center' }}>
      <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.44rem', color: '#5b5478', marginBottom: 2 }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', lineHeight: 1, color: accent ?? '#ded8ee', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#5b5478', whiteSpace: 'nowrap' }}>{label}</span>
      <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: accent ?? '#c8c2dc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
