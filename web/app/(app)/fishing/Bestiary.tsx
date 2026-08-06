'use client'

// THE BESTIARY — what the whole fishing loop is in service of.
//
// Four rooms behind one masthead. The masthead is the career at a glance; the
// rooms are the four things worth showing off, each of which reads differently
// enough to deserve its own space rather than a section header in a long page:
//
//   Collection  152 species by water, silhouettes for what you have not met
//   Goldens     every individual golden, dated and measured
//   Giants      the six Ancient Deep mounts + your Trophy-size records
//   Pets        the 19 across 6 species
//
// Data loads ON OPEN (see bestiaryActions.ts), so the fishing page pays
// nothing for a room most visits never enter.

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { getBestiaryData, type BestiaryData } from './bestiaryActions'
import { compact } from '@/lib/bestiary'
import BestiaryCollection from './BestiaryCollection'
import BestiaryGoldens from './BestiaryGoldens'
import BestiaryGiants from './BestiaryGiants'
import BestiaryPets from './BestiaryPets'
import { PETS } from '@/lib/pets'
import { ZONE_LABEL, ZONE_ORDER } from './zoneData'
import { isGiant } from '@/lib/bestiary'

const ACCENT = '#a78bfa'

type Room = 'collection' | 'goldens' | 'giants' | 'pets'

export default function Bestiary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [data, setData] = useState<BestiaryData | null>(null)
  const [error, setError] = useState('')
  const [room, setRoom] = useState<Room>('collection')
  const [careerOpen, setCareerOpen] = useState(false)

  // Load once per open. Kept after close so reopening in the same session is
  // instant; a catch made in between is picked up on the next page load, which
  // is the same freshness the collection log always had.
  useEffect(() => {
    if (!open || data) return
    let alive = true
    getBestiaryData().then(res => {
      if (!alive) return
      if ('error' in res) setError(res.error)
      else setData(res)
    })
    return () => { alive = false }
  }, [open, data])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !mounted) return null

  const caught = data ? data.entries.filter(e => e.count > 0).length : 0
  const total = data ? data.entries.length : 0
  const giants = data ? data.entries.filter(e => isGiant(e.sellValue, e.habitat)) : []
  const giantsGot = giants.filter(e => e.count > 0).length
  const totalCatches = data ? data.entries.reduce((n, e) => n + e.count, 0) : 0

  const TABS: { key: Room; label: string; badge: string }[] = [
    { key: 'collection', label: 'Collection', badge: data ? `${caught}/${total}` : '' },
    { key: 'goldens', label: 'Goldens', badge: data ? `${data.goldens.length}` : '' },
    { key: 'giants', label: 'Giants', badge: data ? `${giantsGot}/${giants.length}` : '' },
    { key: 'pets', label: 'Pets', badge: data ? `${data.unlockedPets.length}/${PETS.length}` : '' },
  ]

  return createPortal(
    <div role="dialog" aria-modal
      style={{ position: 'fixed', inset: 0, zIndex: 111, background: '#07080f', display: 'flex', justifyContent: 'center' }}>
      <div className="relative w-full max-w-lg" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Backdrop — the logbook's own plate, heavily damped. A room, not a page. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fish-bestiary.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(7,8,15,0.86) 0%, rgba(7,8,15,0.95) 40%, rgba(5,6,11,0.99) 100%)' }} />
        </div>

        {/* ── Header ── matches the zone selector / campaign map shell. */}
        <div style={{
          position: 'relative', zIndex: 2, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'calc(env(safe-area-inset-top, 0px) + 0.7rem) 1rem 0.7rem',
          background: 'rgba(9,8,16,0.96)',
          borderBottom: `1px solid ${ACCENT}30`,
        }}>
          <div>
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: `${ACCENT}b8`, marginBottom: 1 }}>Fishing</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#efe9ff' }}>The Bestiary</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: '50%', padding: 0, flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {!data ? (
          <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'grid', placeItems: 'center' }}>
            <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: error ? '#f87171' : '#6b6486' }}>
              {error || 'Opening the logbook…'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Masthead ── the career, above the rooms, always visible. */}
            <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, padding: '0.85rem 1rem 0.7rem', background: 'rgba(9,8,16,0.82)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span className="font-cinzel font-800" style={{ fontSize: '1.9rem', lineHeight: 1, color: '#efe9ff', fontVariantNumeric: 'tabular-nums' }}>{caught}</span>
                  <span className="font-karla font-700" style={{ fontSize: '0.8rem', color: '#6b6486' }}>of {total} charted</span>
                </div>
                <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: ACCENT, fontVariantNumeric: 'tabular-nums' }}>
                  {total > 0 ? Math.round((caught / total) * 100) : 0}%
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden', marginBottom: 10 }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${total > 0 ? (caught / total) * 100 : 0}%` }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, #6d5bb0, ${ACCENT})` }} />
              </div>
              {/* Four headline numbers, and the rest of the career one tap
                  behind them. Everything the profile tracks about fishing is
                  in there; putting all twelve up here would bury the rooms. */}
              <button type="button" onClick={() => setCareerOpen(v => !v)}
                aria-label={careerOpen ? 'Hide career record' : 'Show career record'}
                style={{ display: 'block', width: '100%', padding: 0, background: 'none', border: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  <Stat label="Catches" value={compact(totalCatches)} />
                  <Stat label="Casts" value={compact(data.stats.casts)} />
                  <Stat label="Perfects" value={compact(data.stats.perfects)} accent="#7dd3fc" />
                  <Stat label="Trophies" value={compact(data.stats.trophySizeCatches)} accent="#fbbf24" />
                </div>
                <span className="font-karla font-600 uppercase tracking-[0.12em]" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: '0.46rem', color: '#5b5478', marginTop: 6 }}>
                  {careerOpen ? 'Hide the record' : 'The whole record'}
                  <span aria-hidden style={{ display: 'inline-block', transform: careerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.16s', fontSize: '0.5rem' }}>▼</span>
                </span>
              </button>

              <AnimatePresence initial={false}>
                {careerOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                    style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', columnGap: 14, rowGap: 4, marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                      <Line label="Best perfect streak" value={data.stats.bestPerfectStreak.toLocaleString()} accent="#7dd3fc" />
                      <Line label="Crates opened" value={compact(data.stats.cratesOpened)} />
                      <Line label="Double catches" value={compact(data.stats.doubleCatches)} />
                      <Line label="Rod jackpots" value={compact(data.stats.jackpots)} accent="#fbbf24" />
                      <Line label="Snags" value={compact(data.stats.snags)} />
                      <Line label="Fishing XP" value={compact(data.stats.fishingXP)} />
                      <Line label="Earned from fish" value={`${compact(data.stats.doubloonsFromFish)} ⟡`} accent="#f0c040" />
                      <Line label="Goldens landed" value={`${data.goldens.length}`} accent="#f0c040" />
                    </div>
                    {ZONE_ORDER.some(z => (data.prestige[z] ?? 0) > 0) && (
                      <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.44rem', color: '#5b5478', marginBottom: 4 }}>Prestige</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', columnGap: 14, rowGap: 4 }}>
                          {ZONE_ORDER.filter(z => (data.prestige[z] ?? 0) > 0).map(z => (
                            <Line key={z} label={ZONE_LABEL[z]} value={`✦ ${data.prestige[z]}`} accent="#f0c040" />
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Room tabs ── */}
            <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', gap: 4, padding: '0 0.7rem 0.6rem', background: 'rgba(9,8,16,0.82)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {TABS.map(t => {
                const on = room === t.key
                return (
                  <button key={t.key} type="button" onClick={() => setRoom(t.key)}
                    className="font-karla font-700"
                    style={{
                      flex: 1, minWidth: 0, padding: '0.42rem 0.2rem 0.38rem', borderRadius: 9,
                      // Translucent tint, never a solid fill.
                      background: on ? `${ACCENT}22` : 'transparent',
                      border: `1px solid ${on ? ACCENT + '66' : 'transparent'}`,
                      color: on ? '#efe9ff' : '#6b6486', cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <span style={{ display: 'block', fontSize: '0.66rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                    <span style={{ display: 'block', fontSize: '0.55rem', color: on ? ACCENT : '#514b68', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>{t.badge}</span>
                  </button>
                )
              })}
            </div>

            {/* ── The room ── */}
            <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '0.9rem 0.9rem calc(env(safe-area-inset-bottom, 0px) + 2.5rem)' }}>
              <AnimatePresence mode="wait">
                <motion.div key={room}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}>
                  {room === 'collection' && <BestiaryCollection data={data} />}
                  {room === 'goldens' && <BestiaryGoldens data={data} />}
                  {room === 'giants' && <BestiaryGiants data={data} giants={giants} />}
                  {room === 'pets' && <BestiaryPets data={data} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Line({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#5b5478', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span className="font-karla font-700" style={{ fontSize: '0.62rem', color: accent ?? '#c8c2dc', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '0.35rem 0.45rem' }}>
      <p className="font-karla font-600 uppercase tracking-[0.09em]" style={{ fontSize: '0.44rem', color: '#5b5478', marginBottom: 1 }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', lineHeight: 1, color: accent ?? '#d8d2ea', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
    </div>
  )
}
