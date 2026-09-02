'use client'

// ── THE CREW HUB ────────────────────────────────────────────────────────────
//
// One panel that answers "where is everybody" and then lets you do something
// about it. Before this the answer was spread across four screens — the hall
// knows who is assigned, the docks know who is trawling, the voyage board knows
// who sailed, the sortie knows who is boarding — and none of them knew about
// the others, so the only way to hold the whole crew in view was to visit all
// four and remember.
//
// ── GROUPED BY WHAT THEY ARE DOING, NOT BY WHO THEY ARE ─────────────────────
//
// A roster sorted by rarity is the hall's job and the hall does it well. From
// the deck the question is never "who is my best crew", it is "who is free" and
// "when is anybody back", so the grouping IS the answer: out on the trawls, out
// on the voyage, aboard for the raid, resting in the hall.
//
// The ones on a clock come first and the clock is on the row, because that is
// the only thing in here that changes while you are looking at it.
//
// ── AND IT IS A HUB, SO EVERYTHING IS ONE PRESS ─────────────────────────────
//
// Trawls and the voyage board are already panels on this chart, so those rows
// open them where you stand rather than sailing you to an island first. The
// hall and the recruit board are real screens and cannot be, so those two are
// links. Nothing in here is a dead end.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import { crewHub, type CrewHubState, type HubCrew } from './crewHubActions'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const artSrc = (filename: string) => `${SUPA}/storage/v1/object/public/card-arts/${filename}`

/** The rarity ring, the same four colours the hall and every crate use. A crew
 *  read anywhere in this game has always been read by this ring. */
const RARITY = ['rgba(150,160,170,0.7)', 'rgba(90,180,220,0.8)', 'rgba(180,120,230,0.85)', 'rgba(240,192,64,0.95)']

const GROUPS = [
  { key: 'trawl' as const, title: 'Out on the trawls' },
  { key: 'voyage' as const, title: 'Away on the voyage' },
  { key: 'raid' as const, title: 'Aboard for the raid' },
  { key: 'hall' as const, title: 'In the hall' },
]

/** How long until they are back, in the shortest true form. Under a minute is
 *  "any moment": a countdown of seconds on a three-hour trawl is precision
 *  nobody asked for and it makes the row twitch. */
function backIn(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return 'back now'
  const m = Math.round(ms / 60000)
  if (m < 1) return 'any moment'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`
}

export default function CrewHub({
  open, onClose, onTrawls, onVoyage,
}: {
  open: boolean
  onClose: () => void
  /** Show the trawls that are out. Null when none are, and the row then says so
   *  rather than opening an empty panel. */
  onTrawls: (() => void) | null
  onVoyage: () => void
}) {
  const router = useRouter()
  const [state, setState] = useState<CrewHubState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // FETCHED ON OPEN, not on mount. The chart holds this component for the whole
  // session and the crew changes while you sail — somebody comes back off a
  // trawl, a voyage lands — so the read has to be tied to the look, not to the
  // page load.
  useEffect(() => {
    if (!open) return
    let live = true
    setErr(null)
    crewHub().then(r => {
      if (!live) return
      if ('error' in r) setErr(r.error)
      else setState(r)
    }, () => { if (live) setErr('Could not reach the hall.') })
    return () => { live = false }
  }, [open])

  // The clocks, once a minute. Nothing in here is measured finer than that.
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [open])

  const rows = (g: HubCrew['doing']) => (state?.crew ?? []).filter(c => c.doing === g)

  return (
    <AnimatePresence>
      {open && (
        <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <PopupShell open onClose={onClose}>
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={e => e.stopPropagation()}
              style={{
                margin: 'auto', width: '100%', maxWidth: 420,
                borderRadius: 20, padding: '1.1rem 1.05rem 1rem',
                // AN OPAQUE BASE. This sits over painted water, and a panel with
                // any transparency in its base reads as a smear rather than as a
                // thing lying on top of the sea.
                background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
                border: '1px solid rgba(196,169,106,0.34)',
                boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
                maxHeight: '82vh', display: 'flex', flexDirection: 'column',
              }}>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.6rem' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.26rem', color: '#f4ecd8', margin: 0 }}>
                  Your Crew
                </p>
                <p className="font-karla font-600" style={{
                  fontSize: '0.78rem', color: 'rgba(196,169,106,0.85)', margin: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {state ? `${state.crew.length} of ${state.capacity} berths` : ''}
                </p>
              </div>

              {err && (
                <p className="font-karla" style={{ fontSize: '0.82rem', color: '#e6a0a0', margin: '0.8rem 0 0' }}>{err}</p>
              )}
              {!state && !err && (
                <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(190,212,228,0.6)', margin: '0.9rem 0 0' }}>
                  Counting heads…
                </p>
              )}

              {state && (
                <div style={{ overflowY: 'auto', minHeight: 0, marginTop: '0.75rem', flex: 1 }}>
                  {state.crew.length === 0 && (
                    <p className="font-karla" style={{ fontSize: '0.84rem', color: 'rgba(190,212,228,0.6)', lineHeight: 1.5, margin: 0 }}>
                      Nobody signed on yet. The board below is where you start.
                    </p>
                  )}

                  {GROUPS.map(g => {
                    const list = rows(g.key)
                    if (list.length === 0) return null
                    return (
                      <div key={g.key} style={{ marginBottom: '0.9rem' }}>
                        <p className="font-karla font-700 uppercase" style={{
                          margin: '0 0 0.4rem', fontSize: '0.54rem', letterSpacing: '0.18em',
                          color: 'rgba(196,169,106,0.72)',
                        }}>{g.title} · {list.length}</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.34rem' }}>
                          {list.map(c => (
                            <div key={c.id} style={{
                              display: 'flex', alignItems: 'center', gap: '0.6rem',
                              padding: '0.34rem 0.5rem', borderRadius: 10,
                              background: 'rgba(255,255,255,0.035)',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={artSrc(c.filename)} alt="" aria-hidden decoding="async" style={{
                                width: 34, height: 34, borderRadius: '50%', objectFit: 'cover',
                                border: `2px solid ${RARITY[Math.min(3, Math.max(0, c.rarity - 1))]}`,
                                flexShrink: 0, background: 'rgba(0,0,0,0.4)',
                              }} />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <p className="font-karla font-600" style={{
                                  margin: 0, fontSize: '0.86rem', color: '#f0ede8',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{c.name}</p>
                                <p className="font-karla" style={{
                                  margin: 0, fontSize: '0.68rem', color: 'rgba(190,212,228,0.55)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  Lv {c.level}{c.where ? ` · ${c.where}` : ''}
                                </p>
                              </div>
                              {(c.ready || c.backAt) && (
                                <p className="font-karla font-700" style={{
                                  margin: 0, fontSize: '0.7rem', flexShrink: 0,
                                  fontVariantNumeric: 'tabular-nums',
                                  color: c.ready ? '#8fdc9a' : 'rgba(196,169,106,0.8)',
                                }}>
                                  {c.ready ? 'back' : backIn(c.backAt!, now)}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* ── WHERE TO GO NEXT ──────────────────────────────────
                      The four things you can do about any of the above, in the
                      order they are most often wanted from the water. */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '0.4rem',
                    paddingTop: '0.75rem', marginTop: '0.2rem',
                    borderTop: '1px solid rgba(196,169,106,0.18)',
                  }}>
                    <HubLink
                      label="Recruit new crew"
                      note={state.recruitsWaiting > 0
                        ? `${state.recruitsWaiting} on the board`
                        : 'board taken for today'}
                      dot={state.recruitsWaiting > 0}
                      onClick={() => router.push('/crew?tab=recruits')} />
                    <HubLink
                      label="The Crew Hall"
                      note={`Hall ${state.hall.tier} · Drills ${state.hall.drill} · Stores ${state.hall.stores}`}
                      onClick={() => router.push('/crew?tab=hall')} />
                    <HubLink
                      label="The voyage board"
                      note={state.voyage
                        ? state.voyage.ready ? `${state.voyage.route} — back, unread` : `out on ${state.voyage.route}`
                        : 'nobody sailing today'}
                      dot={state.voyage?.ready === true}
                      onClick={() => { onClose(); onVoyage() }} />
                    <HubLink
                      label="The trawls"
                      note={onTrawls ? 'see who is out' : 'nobody trawling'}
                      onClick={onTrawls ? () => { onClose(); onTrawls() } : null} />
                  </div>
                </div>
              )}
            </motion.div>
          </PopupShell>
        </div>
      )}
    </AnimatePresence>
  )
}

/** One row of the hub's foot. A link that cannot go anywhere is drawn as a
 *  statement rather than as a button that does nothing — a dead control reads
 *  as the game being broken, and this one is only ever saying "there is nothing
 *  here right now". */
function HubLink({ label, note, dot, onClick }: {
  label: string
  note: string
  dot?: boolean
  onClick: (() => void) | null
}) {
  return (
    <button type="button" disabled={!onClick} onClick={onClick ?? undefined} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem',
      width: '100%', textAlign: 'left', padding: '0.5rem 0.65rem', borderRadius: 10,
      background: onClick ? 'rgba(240,192,64,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${onClick ? 'rgba(240,192,64,0.28)' : 'rgba(255,255,255,0.06)'}`,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <span style={{ minWidth: 0 }}>
        <span className="font-karla font-700" style={{
          display: 'block', fontSize: '0.84rem',
          color: onClick ? '#f6dfa0' : 'rgba(190,212,228,0.5)',
        }}>{label}</span>
        <span className="font-karla" style={{
          display: 'block', fontSize: '0.68rem', color: 'rgba(190,212,228,0.5)',
        }}>{note}</span>
      </span>
      {dot && (
        <span aria-hidden style={{
          width: 9, height: 9, borderRadius: 999, flexShrink: 0,
          background: '#f0c040', boxShadow: '0 0 10px rgba(240,192,64,0.6)',
        }} />
      )}
    </button>
  )
}
