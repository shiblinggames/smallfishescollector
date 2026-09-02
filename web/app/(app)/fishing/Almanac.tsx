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

// 'stats', not 'record'. Every other room is named for the THING inside it —
// Collection, Goldens, Giants, Pets — and "Record" named the book rather than
// the contents, so it was the one tab you could not guess from the label. Stats
// is also what the Crew, Gear and Raid screens already call this exact kind of
// page, so it is the game's own word rather than a new one.
type Room = 'collection' | 'goldens' | 'giants' | 'pets' | 'stats'

export default function Almanac({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [data, setData] = useState<AlmanacData | null>(null)
  const [error, setError] = useState('')
  const [room, setRoom] = useState<Room>('collection')

  /**
   * ── IS THERE ROOM TO OPEN THE BOOK FLAT? ──────────────────────────────────
   *
   * The Almanac was a 512px column whatever it was opened on: a phone layout
   * centred in a fourteen-hundred-pixel window with darkness either side of it.
   * That is the wrong shape for the one surface in this game that is nothing
   * but a lot of things to look through.
   *
   * TWO LAYOUTS, rather than one that stretches. Narrow keeps the rail of tabs
   * across the top, which is right when the tabs are most of the width there
   * is. Wide moves them to a column down the LEFT, the way a book's contents
   * page has always looked, and gives every pixel that saves to the shelves —
   * which is the actual win, because those grids gain COLUMNS rather than
   * growing their cards.
   */
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 900px)')
    if (!mq) return
    const sync = () => setWide(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [])

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

  // The Collection tab does NOT list the six Ancient Deep trophies: they are
  // mounts rather than stock and they have the Giants room to themselves. Its
  // badge counted all 152 species anyway, so it promised six fish that tab
  // could never show. A tab's number describes that tab; 146 + 6 is the book.
  const giants = data ? data.entries.filter(e => isGiant(e.sellValue, e.habitat)) : []
  const collectable = data ? data.entries.filter(e => !isGiant(e.sellValue, e.habitat)) : []
  const caught = collectable.filter(e => e.everCaught).length
  const total = collectable.length
  const giantsGot = giants.filter(e => e.everCaught).length

  const TABS: { key: Room; label: string; badge: string }[] = [
    { key: 'collection', label: 'Collection', badge: data ? `${caught}/${total}` : '' },
    { key: 'goldens', label: 'Goldens', badge: data ? `${data.goldens.length}` : '' },
    { key: 'giants', label: 'Giants', badge: data ? `${giantsGot}/${giants.length}` : '' },
    { key: 'pets', label: 'Pets', badge: data ? `${data.unlockedPets.length}/${PETS.length}` : '' },
    { key: 'stats', label: 'Stats', badge: '' },
  ]

  return createPortal(
    <div role="dialog" aria-modal
      style={{ position: 'fixed', inset: 0, zIndex: 111, background: '#0a090d', display: 'flex', justifyContent: 'center' }}>
      <div className="relative w-full" style={{
        // 1,240 is roomy enough for five shelves of species and still a BOOK
        // rather than a wall: past about that the eye stops tracking a row back
        // to the start of the next, and a collection becomes a spreadsheet.
        maxWidth: wide ? 1240 : 512,
        height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* The page you are writing on. Dark cotton-rag stock: fibre grain,
            damp bloom, a couple of ring marks, edges gone darker with handling.
            It is deliberately DARK paper rather than cream, because every
            colour in this book is set for a dark ground and a light page would
            mean re-picking all of them.

            Only a light wash over it, since a texture under an 86% scrim is
            not a texture. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/almanac-paper.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,7,10,0.42) 0%, rgba(8,7,10,0.52) 55%, rgba(6,5,8,0.62) 100%)' }} />
        </div>

        {/* ── Header ── matches the zone selector / campaign map shell. */}
        <div style={{
          position: 'relative', zIndex: 2, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'calc(env(safe-area-inset-top, 0px) + 0.7rem) 1rem 0.7rem',
          background: 'linear-gradient(180deg, rgba(10,9,13,0.90) 0%, rgba(10,9,13,0.72) 100%)',
          borderBottom: `1px solid ${ACCENT}2e`,
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
          <div style={{
            position: 'relative', zIndex: 1, flex: 1, minHeight: 0,
            display: 'flex', flexDirection: wide ? 'row' : 'column',
          }}>
            {/* ── THE CONTENTS ──
                Across the top on a phone, where the tabs are most of the width
                there is. Down the left on a desktop, which is what a book's
                contents page has always looked like, and which stops five tabs
                being stretched into five banners.

                Every number that used to sit above them lives in the Record,
                where it has the space to be read rather than glanced past on
                the way to somewhere else. */}
            <div style={{
              position: 'relative', zIndex: 2, flexShrink: 0,
              display: 'flex', flexDirection: wide ? 'column' : 'row', gap: 4,
              width: wide ? 208 : undefined,
              padding: wide ? '0.9rem 0.7rem' : '0.6rem 0.7rem',
              background: wide
                ? 'linear-gradient(90deg, rgba(10,9,13,0.74) 0%, rgba(10,9,13,0.34) 100%)'
                : 'linear-gradient(180deg, rgba(10,9,13,0.72) 0%, rgba(10,9,13,0.40) 100%)',
              borderRight: wide ? '1px solid rgba(255,255,255,0.09)' : undefined,
              borderBottom: wide ? undefined : '1px solid rgba(255,255,255,0.09)',
            }}>
              {TABS.map(t => {
                const on = room === t.key
                return (
                  <button key={t.key} type="button" onClick={() => setRoom(t.key)}
                    className="font-karla font-700"
                    style={{
                      flex: wide ? undefined : 1, minWidth: 0, borderRadius: 9,
                      padding: wide ? '0.5rem 0.7rem' : '0.42rem 0.12rem 0.38rem',
                      textAlign: wide ? 'left' : 'center',
                      // Translucent tint, never a solid fill.
                      background: on ? `${ACCENT}22` : 'transparent',
                      border: `1px solid ${on ? ACCENT + '66' : 'transparent'}`,
                      color: on ? '#efe9ff' : '#a49dc0', cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                      display: wide ? 'flex' : undefined,
                      alignItems: wide ? 'baseline' : undefined,
                      justifyContent: wide ? 'space-between' : undefined,
                      gap: wide ? 8 : undefined,
                    }}>
                    <span style={{ display: 'block', fontSize: wide ? '0.84rem' : '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</span>
                    <span style={{ display: 'block', fontSize: wide ? '0.72rem' : '0.62rem', color: on ? ACCENT : '#9a93b8', fontVariantNumeric: 'tabular-nums', marginTop: wide ? 0 : 1 }}>{t.badge}</span>
                  </button>
                )
              })}
            </div>

            {/* ── The room ── */}
            <div style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: wide ? '1.1rem 1.3rem 2rem' : '0.9rem 0.9rem calc(env(safe-area-inset-bottom, 0px) + 2.5rem)' }}>
              <AnimatePresence mode="wait">
                <motion.div key={room}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}>
                  {room === 'collection' && <AlmanacCollection data={data} />}
                  {room === 'goldens' && <AlmanacGoldens data={data} />}
                  {room === 'giants' && <AlmanacGiants data={data} giants={giants} />}
                  {room === 'pets' && <AlmanacPets data={data} />}
                  {room === 'stats' && <AlmanacRecord data={data} />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
