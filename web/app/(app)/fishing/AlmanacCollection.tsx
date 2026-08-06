'use client'

// The Collection room: every species, under the water it comes from.
//
// Each habitat opens with a BANNER cut from that zone's painted plate, the
// same art the zone selector and the fishing screen use. A flat coloured rule
// and a label made five near-identical grey grids; the banner makes scrolling
// this feel like descending, and ties a species to a place you have actually
// been rather than to a word.
//
// An uncaught species shows its real silhouette rather than a locked box, so
// a gap reads as a specific missing fish. Name, stats and flavour stay hidden
// until you land one.

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import { ZONE_LABEL, ZONE_COLOR, ZONE_ORDER, ZONE_BG, ZONE_TAGLINE } from './zoneData'
import { RARITY_LABEL, RARITY_COLOR, fishArt, isGiant, shortDate } from '@/lib/almanac'
import { tierForLength, TIER_LABEL, TIER_COLOR, formatFishLength } from '@/lib/fishSize'
import type { AlmanacData, AlmanacEntry } from './almanacActions'

const GOLD = '#f0c040'

export default function AlmanacCollection({ data }: { data: AlmanacData }) {
  const [detail, setDetail] = useState<AlmanacEntry | null>(null)

  // The six Giants have their own room; listing them here too would make the
  // Ancient Deep read as 18 species when only 12 are fishable stock.
  const byZone = useMemo(() => {
    const m = new Map<string, AlmanacEntry[]>()
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
        const pct = got / list.length

        return (
          <div key={zone} style={{ marginBottom: '1.5rem' }}>

            {/* ── Habitat banner ── the zone's own water, cropped to a band. */}
            <div style={{ position: 'relative', height: 74, borderRadius: 13, overflow: 'hidden', marginBottom: 9, border: `1px solid ${color}44` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ZONE_BG[zone]} alt="" aria-hidden loading="lazy" decoding="async"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 8%' }} />
              <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, rgba(6,6,12,0.88) 0%, rgba(6,6,12,0.55) 55%, rgba(6,6,12,0.30) 100%)` }} />
              <div style={{ position: 'absolute', inset: 0, padding: '0.55rem 0.75rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: '#fdf7e8', lineHeight: 1.1, textShadow: `0 2px 7px rgba(0,0,0,0.95), 0 0 16px ${color}55` }}>{ZONE_LABEL[zone]}</p>
                  <span className="font-karla font-700" style={{ fontSize: '0.66rem', color: done ? GOLD : color, fontVariantNumeric: 'tabular-nums', textShadow: '0 1px 4px rgba(0,0,0,0.9)', whiteSpace: 'nowrap' }}>
                    {done ? '✦ all charted' : `${got}/${list.length}`}
                  </span>
                </div>
                <p className="font-karla font-400 italic" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.62)', marginTop: 1, textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>{ZONE_TAGLINE[zone]}</p>
                <div style={{ height: 3, borderRadius: 999, background: 'rgba(0,0,0,0.5)', marginTop: 6, maxWidth: 150, overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    style={{ height: '100%', borderRadius: 999, background: done ? GOLD : color }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
              {list.map(e => <SpeciesCard key={e.id} entry={e} onOpen={() => e.count > 0 && setDetail(e)} />)}
            </div>
          </div>
        )
      })}

      <SpeciesSheet entry={detail} onClose={() => setDetail(null)} goldens={data.goldens} />
    </>
  )
}

function SpeciesCard({ entry, onOpen }: { entry: AlmanacEntry; onOpen: () => void }) {
  const caught = entry.count > 0
  const rc = RARITY_COLOR[entry.rarity]
  const tier = caught && entry.pbLength != null && entry.lengthMin != null && entry.lengthMax != null
    ? tierForLength(entry.pbLength, entry.lengthMin, entry.lengthMax) : null
  const big = tier === 'trophy' || tier === 'large'
  // Golden species take the gold; everything else wears its rarity.
  const c = caught ? (entry.everGolden ? GOLD : rc) : 'rgba(255,255,255,0.14)'

  return (
    <motion.button type="button" onClick={onOpen} disabled={!caught}
      whileTap={caught ? { scale: 0.94 } : undefined}
      whileHover={caught ? { y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 520, damping: 30 }}
      style={{
        // The profile's trophy plaque, which is the treatment that works: a
        // centred column, the fish FLOATING on a tinted ground under its own
        // coloured drop-shadow, and the name under it. The previous card boxed
        // the art at 62px over a dark plinth, which made every fish look
        // small and pinned rather than mounted.
        position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '0.75rem 0.4rem 0.6rem', borderRadius: 12, textAlign: 'center',
        background: caught
          ? `linear-gradient(180deg, ${c}22, rgba(0,0,0,0.30))`
          : 'rgba(255,255,255,0.02)',
        border: `1px solid ${caught ? c + '4d' : 'rgba(255,255,255,0.055)'}`,
        boxShadow: entry.everGolden ? `inset 0 1px 0 ${GOLD}33` : undefined,
        cursor: caught ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}>

      {big && (
        <span aria-hidden title={TIER_LABEL[tier!]}
          style={{ position: 'absolute', top: 5, right: 5, width: 5, height: 5, borderRadius: 5, background: TIER_COLOR[tier!], boxShadow: `0 0 5px ${TIER_COLOR[tier!]}` }} />
      )}

      {/* A plain flex box with NO padding of its own, so the fish sits on the
          exact centre line. The old one had 0.3rem of top padding against 0
          bottom and every fish rode low because of it. */}
      <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fishArt(entry.name)} alt="" aria-hidden loading="lazy" decoding="async"
          style={{
            maxWidth: 72, maxHeight: 56, objectFit: 'contain',
            // Silhouette, not a lock: the shape of what is missing is the hook.
            filter: caught ? `drop-shadow(0 3px 10px ${c}80)` : 'brightness(0) opacity(0.4)',
          }} />
      </div>

      <p className="font-cinzel font-700" style={{ width: '100%', fontSize: '0.62rem', lineHeight: 1.14, color: caught ? '#f0ebe1' : '#8a83ad', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {caught ? entry.name : '???'}
      </p>
      <span className="font-karla font-700 uppercase" style={{ fontSize: '0.64rem', letterSpacing: '0.1em', color: caught ? c : rc + 'aa' }}>
        {RARITY_LABEL[entry.rarity]}
      </span>
      {caught && (
        <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#b3abcc', fontVariantNumeric: 'tabular-nums' }}>×{entry.count}</span>
      )}
    </motion.button>
  )
}

/** The full record for one species: what it is, and what you have done to it. */
function SpeciesSheet({ entry, onClose, goldens }: {
  entry: AlmanacEntry | null
  onClose: () => void
  goldens: AlmanacData['goldens']
}) {
  const mine = useMemo(() => entry ? goldens.filter(g => g.fishId === entry.id) : [], [entry, goldens])
  if (!entry) return null

  const color = ZONE_COLOR[entry.habitat] ?? '#a78bfa'
  const rc = RARITY_COLOR[entry.rarity]
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
          border: `1px solid ${entry.everGolden ? GOLD + '66' : color + '55'}`,
        }}>

        {/* Plate — the fish over its own water, so the sheet opens on a place. */}
        <div style={{ position: 'relative', height: 168, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ZONE_BG[entry.habitat]} alt="" aria-hidden
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 8%' }} />
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,8,16,0.45) 0%, rgba(10,9,19,0.72) 62%, rgba(10,9,19,0.97) 100%)' }} />
          {entry.everGolden && (
            <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 44%, rgba(240,192,64,0.22), transparent 64%)' }} />
          )}
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '0.6rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fishArt(entry.name)} alt="" aria-hidden
              style={{ maxWidth: '68%', maxHeight: '92%', objectFit: 'contain', filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.7))' }} />
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ position: 'absolute', top: 9, right: 9, width: 28, height: 28, borderRadius: '50%', padding: 0, background: 'rgba(6,6,12,0.72)', border: '1px solid rgba(255,255,255,0.2)', color: '#cfcabf', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
          <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ position: 'absolute', left: 12, top: 11, fontSize: '0.66rem', color, textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}>
            {ZONE_LABEL[entry.habitat] ?? entry.habitat}
          </span>
        </div>

        <div style={{ padding: '0.2rem 1rem 1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 2 }}>
            <p className="font-cinzel font-800" style={{ fontSize: '1.25rem', color: '#f2eeff', lineHeight: 1.1 }}>{entry.name}</p>
            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.66rem', padding: '0.12rem 0.4rem', borderRadius: 999, color: rc, background: rc + '1c', border: `1px solid ${rc}55` }}>
              {RARITY_LABEL[entry.rarity]}
            </span>
            {entry.everGolden && (
              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.66rem', padding: '0.12rem 0.4rem', borderRadius: 999, color: GOLD, background: 'rgba(240,192,64,0.12)', border: `1px solid ${GOLD}88` }}>
                Golden taken
              </span>
            )}
          </div>
          {entry.scientificName && (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.68rem', color: '#a49dc0', marginBottom: 10 }}>{entry.scientificName}</p>
          )}

          {/* Your record with this fish. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
            <Cell label="Caught" value={`${entry.count}`} />
            <Cell label="Goldens" value={`${mine.length}`} accent={mine.length ? GOLD : undefined} />
            <Cell label="Worth" value={`${entry.sellValue.toLocaleString()} ⟡`} accent={GOLD} />
          </div>

          {/* Personal best against the whole possible range. */}
          {entry.pbLength != null && entry.lengthMin != null && entry.lengthMax != null && (
            <div style={{ marginBottom: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 11, padding: '0.6rem 0.7rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                <span className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.66rem', color: '#9a93b8' }}>Your best</span>
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
                <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#8a83ad' }}>{formatFishLength(entry.lengthMin)}</span>
                <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#8a83ad' }}>{formatFishLength(entry.lengthMax)}</span>
              </div>
            </div>
          )}

          {entry.funFact && (
            <p className="font-karla font-400 italic" style={{ fontSize: '0.74rem', color: '#a8a0c0', lineHeight: 1.45, marginBottom: 10 }}>{entry.funFact}</p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 16, rowGap: 5 }}>
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
      <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.64rem', color: '#9a93b8', marginBottom: 2 }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', lineHeight: 1, color: accent ?? '#ded8ee', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#9a93b8', whiteSpace: 'nowrap' }}>{label}</span>
      <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: accent ?? '#c8c2dc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  )
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
