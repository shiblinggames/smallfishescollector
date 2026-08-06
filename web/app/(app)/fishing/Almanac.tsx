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
// Data loads ON OPEN (see almanacActions.ts), so the fishing page pays
// nothing for a room most visits never enter.

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { getAlmanacData, type AlmanacData } from './almanacActions'
import AlmanacCollection from './AlmanacCollection'
import AlmanacGoldens from './AlmanacGoldens'
import AlmanacGiants from './AlmanacGiants'
import AlmanacPets from './AlmanacPets'
import AlmanacRecord from './AlmanacRecord'
import { PETS } from '@/lib/pets'
import { isGiant } from '@/lib/almanac'

const ACCENT = '#a78bfa'

type Room = 'collection' | 'goldens' | 'giants' | 'pets' | 'record'

export default function Almanac({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [data, setData] = useState<AlmanacData | null>(null)
  const [error, setError] = useState('')
  const [room, setRoom] = useState<Room>('collection')

  // Load once per open. Kept after close so reopening in the same session is
  // instant; a catch made in between is picked up on the next page load, which
  // is the same freshness the collection log always had.
  useEffect(() => {
    if (!open || data) return
    let alive = true
    getAlmanacData().then(res => {
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

  const TABS: { key: Room; label: string; badge: string }[] = [
    { key: 'collection', label: 'Collection', badge: data ? `${caught}/${total}` : '' },
    { key: 'goldens', label: 'Goldens', badge: data ? `${data.goldens.length}` : '' },
    { key: 'giants', label: 'Giants', badge: data ? `${giantsGot}/${giants.length}` : '' },
    { key: 'pets', label: 'Pets', badge: data ? `${data.unlockedPets.length}/${PETS.length}` : '' },
    { key: 'record', label: 'Record', badge: '' },
  ]

  return createPortal(
    <div role="dialog" aria-modal
      style={{ position: 'fixed', inset: 0, zIndex: 111, background: '#07080f', display: 'flex', justifyContent: 'center' }}>
      <div className="relative w-full max-w-lg" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Backdrop — the logbook plate. It was under an 86% scrim at the top,
            which is to say it was not there at all and the masthead sat on flat
            near-black. The rooms scroll over their own opaque cards, so only
            the masthead band needs the art to stay readable: it opens at 55%
            and closes fast. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fish-bestiary.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(7,8,15,0.55) 0%, rgba(7,8,15,0.80) 26%, rgba(5,6,11,0.96) 52%, rgba(5,6,11,0.99) 100%)' }} />
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
            <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.6rem', color: `${ACCENT}b8`, marginBottom: 1 }}>Fishing</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#efe9ff' }}>The Angler's Almanac</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: '50%', padding: 0, flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {!data ? (
          <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'grid', placeItems: 'center' }}>
            <p className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.62rem', color: error ? '#f87171' : '#a49dc0' }}>
              {error || 'Opening the logbook…'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Room tabs ── the header is nothing but these now. Every
                number that used to sit above them lives in the Record, where
                it has the space to be read rather than glanced past on the way
                to somewhere else. */}
            <div style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', gap: 4, padding: '0.6rem 0.7rem', background: 'linear-gradient(180deg, rgba(9,8,16,0.55) 0%, rgba(9,8,16,0.86) 100%)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {TABS.map(t => {
                const on = room === t.key
                return (
                  <button key={t.key} type="button" onClick={() => setRoom(t.key)}
                    className="font-karla font-700"
                    style={{
                      flex: 1, minWidth: 0, padding: '0.42rem 0.12rem 0.38rem', borderRadius: 9,
                      // Translucent tint, never a solid fill.
                      background: on ? `${ACCENT}22` : 'transparent',
                      border: `1px solid ${on ? ACCENT + '66' : 'transparent'}`,
                      color: on ? '#efe9ff' : '#a49dc0', cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <span style={{ display: 'block', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                    <span style={{ display: 'block', fontSize: '0.62rem', color: on ? ACCENT : '#9a93b8', fontVariantNumeric: 'tabular-nums', marginTop: 1 }}>{t.badge}</span>
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
                  {room === 'collection' && <AlmanacCollection data={data} />}
                  {room === 'goldens' && <AlmanacGoldens data={data} />}
                  {room === 'giants' && <AlmanacGiants data={data} giants={giants} />}
                  {room === 'pets' && <AlmanacPets data={data} />}
                  {room === 'record' && <AlmanacRecord data={data} />}
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
