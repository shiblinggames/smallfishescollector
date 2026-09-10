'use client'

// ── THE CREW, WHOLE, OVER THE WATER ─────────────────────────────────────────
//
// This panel is the crew hall now. There was a page — /crew, five tabs, a
// column, a title — and everything it did happens in here instead: seating a
// party, signing hands on, reading the manifest, dressing a legend. The page is
// a redirect.
//
// ── WHY IT MOVED ────────────────────────────────────────────────────────────
//
// The rest of the game came out onto the sea. The forge, the shipyard, the
// bounties, the campaign: every one of them used to be a route you left the
// water for, and every one of them is a panel now, because sailing somewhere
// and then being taken off the sea to press buttons about it is two games
// stitched together. The crew was the last big room still ashore.
//
// ── FOUR DOORS, PAINTED ─────────────────────────────────────────────────────
//
// Not a tab bar. A tab bar is five words in a row and it makes five equal
// things out of four rooms that feel nothing alike — and it was already
// carrying so much that the page needed a guided tour to explain itself. Four
// paintings of four places aboard one ship say what each is without a word:
// the muster deck with its empty benches, the gangplank and the signing table,
// the hammocks and the ledger, the open chest of coats.
//
// ── AND THE ROLL CALL STAYS ON TOP ──────────────────────────────────────────
//
// This panel's first job was answering "where is everybody", because the answer
// used to live across four screens. That has not stopped being useful, so it is
// a line at the top you can open, rather than a fifth card or a lost feature.
//
// ── THE HALL ITSELF IS NOT IN HERE ──────────────────────────────────────────
//
// The building, its tiers, the Drills and Stores ladder and the bunks are the
// Crew Hall ISLAND's business. There is a hall on the chart with a shore you
// tie up at; putting its upgrades in a panel you can open from the middle of
// the ocean would make the island scenery.

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import { vibrate } from '@/lib/haptics'
import { crewHub, type CrewHubState, type HubCrew } from './crewHubActions'
import { getCrewState } from '@/app/(app)/crew/actions'
import type { CrewState } from '@/app/(app)/crew/actions'
import { CREW_SKINS } from '@/lib/crewSkins'

/**
 * THE HALL'S WHOLE SELF, FETCHED ONLY WHEN A DOOR IS OPENED.
 *
 * `CrewClient` is four and a half thousand lines and drags the recruit board,
 * the compare sheet, the blood market and the crate reveal in behind it. The
 * chart holds this component for the entire session, so a static import would
 * put all of that in the sea's bundle for every captain who never opens it.
 */
const CrewClient = dynamic(() => import('@/app/(app)/crew/CrewClient'), { ssr: false })

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const artSrc = (filename: string) => `${SUPA}/storage/v1/object/public/card-arts/${filename}`

/** The rarity ring, the same four colours the hall and every crate use. A crew
 *  read anywhere in this game has always been read by this ring. */
const RARITY = ['rgba(150,160,170,0.7)', 'rgba(90,180,220,0.8)', 'rgba(180,120,230,0.85)', 'rgba(240,192,64,0.95)']

/**
 * ── FOUR THINGS A HAND CAN BE DOING, AND ONE THING THEY CAN NOT ────────────
 *
 * "In the hall" used to be the last group and it meant two different things at
 * once: somebody TRAINING in the Crew Hall, and somebody doing nothing at all.
 * Those are the two states a captain most needs to tell apart — one is working
 * and one is a berth going to waste — and there is a real Crew Hall on the
 * chart, so the phrase read as a place rather than as a state.
 *
 * Training is its own group with its own clock now, and the idle are Inactive,
 * which is a word about them rather than about a building.
 */
const GROUPS = [
  { key: 'trawl' as const, title: 'Out on the trawls' },
  { key: 'voyage' as const, title: 'Away on the voyage' },
  { key: 'raid' as const, title: 'Aboard for the raid' },
  { key: 'bunk' as const, title: 'Training in the Crew Hall' },
  { key: 'hall' as const, title: 'Inactive' },
]

type Section = 'assign' | 'roster' | 'recruits' | 'wardrobe'

/**
 * THE FOUR DOORS.
 *
 * One painted plate each, all four of the same ship at the same hour by the
 * same lamp, so they read as a set rather than as four illustrations that
 * happen to be next to each other. `/public/crew/cards`.
 */
const CARDS: { id: Section; title: string; blurb: string; art: string }[] = [
  { id: 'assign', title: 'Assign', blurb: 'Seat your raid and voyage parties', art: '/crew/cards/assign.jpg' },
  { id: 'recruits', title: 'Recruit', blurb: 'Sign new hands on', art: '/crew/cards/recruit.jpg' },
  { id: 'roster', title: 'Roster', blurb: 'Every hand you have, and the fallen', art: '/crew/cards/roster.jpg' },
  { id: 'wardrobe', title: 'Skins', blurb: 'Coats and colours for your legends', art: '/crew/cards/skins.jpg' },
]

const TITLES: Record<Section, string> = {
  assign: 'Assign', recruits: 'Recruit', roster: 'Roster', wardrobe: 'Skins',
}

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
  open, onClose, openCard = null,
}: {
  open: boolean
  /** A room to open straight into, when a link named one. The retired /crew
   *  route's `?tab=` lands here: those links are errands ("go sign somebody
   *  on"), not addresses, so arriving on the four cards would lose the point of
   *  following one. */
  openCard?: Section | null
  onClose: () => void
}) {
  const [state, setState] = useState<CrewHubState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [rollOpen, setRollOpen] = useState(false)
  /**
   * THE BOARD HAS BEEN LOOKED AT.
   *
   * The dot means "there is something here you have not dealt with", and once
   * you have opened Recruit and read the faces, you have dealt with it — you
   * either signed somebody on or decided not to. Leaving it lit until the board
   * is EMPTY makes it a badge for "you did not recruit today", which is nagging
   * rather than telling.
   *
   * Session-only on purpose. It is not worth a profile column: the board rolls
   * daily, and a captain who comes back tomorrow should be told again.
   */
  const [boardSeen, setBoardSeen] = useState(false)
  const [section, setSection] = useState<Section | null>(openCard)
  /** The hall's full state, for whichever section is showing. */
  const [hall, setHall] = useState<CrewState | null>(null)
  /** Bumped when the berth pill is pressed — see CrewClient's openCapacity. */
  const [capacityAsk, setCapacityAsk] = useState(0)
  const [hallErr, setHallErr] = useState<string | null>(null)

  // FETCHED ON OPEN, not on mount. The chart holds this component for the whole
  // session and the crew changes while you sail — somebody comes back off a
  // trawl, a voyage lands — so the read has to be tied to the look, not to the
  // page load.
  //
  // BOTH READS GO AT ONCE. The roll call is what the panel opens on and the
  // hall's state is what every card behind it needs; starting them together
  // means the first card you press is already drawn rather than saying
  // "mustering" for a second. Neither blocks the other.
  useEffect(() => {
    if (!open) return
    let live = true
    setErr(null); setHallErr(null)
    crewHub().then(r => {
      if (!live) return
      if ('error' in r) setErr(r.error)
      else setState(r)
    }, () => { if (live) setErr('Could not reach the hall.') })
    getCrewState().then(r => {
      if (!live) return
      if (!r) setHallErr('Could not reach the hall.')
      else setHall(r)
    }, () => { if (live) setHallErr('Could not reach the hall.') })
    return () => { live = false }
  }, [open])

  // Back to the four doors every time the panel is shut, so re-opening it is
  // never a room you have forgotten you were standing in. A link that named a
  // room still gets it: `openCard` only survives the first open, which is the
  // one the link paid for.
  useEffect(() => { if (!open) { setSection(null); setRollOpen(false) } }, [open])
  // Which room is showing, told to the chart: the anchorage tour waits on it.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('crew-hub-section', { detail: { section: open ? section : null } }))
  }, [open, section])
  // ── RE-READ WHEN THE CREW CHANGES ───────────────────────────────────────
  // Both reads happened on open and never again, so a hand signed on in the
  // Recruit room was not on the front page's count when you came back to it,
  // and the board handed to the room on the NEXT visit still showed them
  // unsigned: press Recruit again and the server said "already recruited".
  // The room fires `crew-changed` on every change it makes; the hub reads
  // again on it, so what the front page says and what the room starts from
  // are the crew as they are.
  useEffect(() => {
    if (!open) return
    const again = () => {
      crewHub().then(r => { if (!('error' in r)) setState(r) }, () => {})
      getCrewState().then(r => { if (r) setHall(r) }, () => {})
    }
    window.addEventListener('crew-changed', again)
    return () => window.removeEventListener('crew-changed', again)
  }, [open])

  // The clocks, once a minute. Nothing in here is measured finer than that.
  useEffect(() => {
    if (!open) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [open])

  const rows = (g: HubCrew['doing']) => (state?.crew ?? []).filter(c => c.doing === g)

  const back = useCallback(() => { vibrate(8); setSection(null) }, [])

  /** The roll call in one line: who is out, who is training, who is idle. */
  const summary = (() => {
    if (!state) return null
    const out = state.crew.filter(c => c.doing !== 'hall' && c.doing !== 'bunk')
    const training = state.crew.filter(c => c.doing === 'bunk')
    const onAClock = [...out, ...training]
    const ready = onAClock.filter(c => c.ready).length
    const soon = onAClock.filter(c => !c.ready && c.backAt && new Date(c.backAt).getTime() - now < 3_600_000).length
    const idle = state.crew.filter(c => c.doing === 'hall').length
    const bits: string[] = []
    if (out.length) bits.push(`${out.length} out`)
    if (training.length) bits.push(`${training.length} training`)
    if (ready) bits.push(`${ready} back and waiting`)
    else if (soon) bits.push(`${soon} due within the hour`)
    if (idle) bits.push(`${idle} inactive`)
    return bits.length ? bits.join(' · ') : 'Nobody signed on yet'
  })()

  return (
    <AnimatePresence>
      {open && (
        <div onClick={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()}>
          <PopupShell open onClose={onClose}>
            <motion.div
              // ── OPACITY ONLY, AND IT MATTERS ──────────────────────────
              //
              // Everything this panel opens — the assign sheet, the crew
              // detail, the blood confirms — is `position: fixed` and NOT
              // portalled, and a transform on an ancestor makes fixed resolve
              // against that ancestor instead of the viewport. A `y` or a
              // `scale` here would leave a transform on the box and drop every
              // one of those sheets into a 560px column.
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'relative',
                margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
                borderRadius: 20, padding: '1.1rem 1.05rem 1rem',
                // AN OPAQUE BASE. This sits over painted water, and a panel with
                // any transparency in its base reads as a smear rather than as a
                // thing lying on top of the sea.
                background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
                border: '1px solid rgba(196,169,106,0.34)',
                boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
                // ── AND NEVER TALLER THAN THE ROOM IT IS IN ──────────
                //
                // `vh` is the LARGE viewport on a phone — the one you get with
                // the browser's toolbars hidden — so a card capped in vh can be
                // taller than what is actually on screen. And PopupShell has
                // already reserved the top for the header and the bottom for
                // the tab bar and the home indicator; a card measured against
                // the whole window ignores both and runs off under them, which
                // is where the foot of this panel was going.
                //
                // `100%` here IS that padded box. The vh cap keeps it from
                // filling a tall desktop window; the percentage keeps it inside
                // the space the shell actually left.
                maxHeight: 'min(84vh, 100%)', display: 'flex', flexDirection: 'column',
              }}>

              {/* ── THE HEADER, WHICH KNOWS WHERE YOU ARE ─────────────────
                  On the four doors it names the panel. Inside a room it names
                  the room and carries the way out of it, so a section is never
                  a place you have to guess your way back from. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', paddingRight: 34 }}>
                {section && (
                  <button type="button" onClick={back} aria-label="Back to the crew"
                    className="tap" style={{
                      flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 28, height: 28, borderRadius: '50%', padding: 0, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                      color: 'rgba(230,240,246,0.8)',
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                )}
                <p className="font-cinzel font-700" style={{ fontSize: '1.26rem', color: '#f4ecd8', margin: 0, flex: 1, minWidth: 0 }}>
                  {section ? TITLES[section] : 'Your Crew'}
                </p>
                {/* ── THE HEADER CARRIES THE COUNT ─────────────────────
                    Whatever the room is about, in the row that already names
                    it: berths on the front page, skins collected in the Trunk.
                    Both used to be centred lines of their own underneath a
                    title that was right there — one row saying two things beats
                    two rows saying one each, and in a panel this narrow the row
                    it saves is a row of skins you can see. */}
                {section === 'wardrobe' && hall && (
                  <p className="font-karla font-600" style={{
                    fontSize: '0.78rem', color: 'rgba(196,169,106,0.85)', margin: 0, flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {/* Counted against the CATALOGUE, not off the stored array:
                        a retired id still sitting in somebody's profile would
                        otherwise read as 76 / 75 collected. */}
                    {CREW_SKINS.filter(k => hall.ownedCrewSkins.includes(k.id)).length} / {CREW_SKINS.length} collected
                  </p>
                )}
                {/* ── THE BERTH PILL, AND IT IS THE HALL'S OWN ──────────────
                    "17 of 17 berths" was a line of text here and the crew page's
                    pill was a control that said the same thing at the top of all
                    four sections. One of them had to go, and the one worth
                    keeping is the one that answers the question it raises: 40
                    comes from two ladders, and pressing this opens the sheet
                    that shows them. It goes red when full, which is the wall
                    every section butts against. */}
                {!section && state && (
                  <button type="button" className="font-karla font-700 tap"
                    onClick={() => { vibrate(8); setCapacityAsk(n => n + 1); setSection('roster') }}
                    aria-label={`${state.crew.length} of ${state.capacity} crew. See how the limit is worked out and how to raise it.`}
                    style={{
                      flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '0.22rem 0.4rem 0.22rem 0.55rem', borderRadius: 7, cursor: 'pointer',
                      fontSize: '0.7rem', letterSpacing: '0.08em', textTransform: 'uppercase',
                      lineHeight: 1.2, whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                      color: state.crew.length >= state.capacity ? '#f4c4c4' : '#e0cfa4',
                      background: state.crew.length >= state.capacity
                        ? 'rgba(220,90,90,0.16)' : 'rgba(200,170,100,0.14)',
                      border: `1px solid ${state.crew.length >= state.capacity ? 'rgba(240,150,150,0.72)' : 'rgba(210,182,116,0.6)'}`,
                    }}>
                    {state.crew.length} / {state.capacity} Crew
                    <span aria-hidden style={{
                      display: 'grid', placeItems: 'center', flexShrink: 0,
                      width: 13, height: 13, borderRadius: '50%',
                      border: '1px solid currentColor', opacity: 0.85,
                      fontSize: '0.5rem', fontStyle: 'italic', lineHeight: 1,
                    }}>i</span>
                  </button>
                )}
              </div>
              {/* Named so the tour can point at the way out. */}
              <span data-coach="crew-close" style={{ position: 'absolute', top: 12, right: 12, borderRadius: 999 }}>
                <CloseButton onClick={onClose} />
              </span>

              {err && !section && (
                <p className="font-karla" style={{ fontSize: '0.82rem', color: '#e6a0a0', margin: '0.8rem 0 0' }}>{err}</p>
              )}

              {/* ── THE SCROLLER, AND WHY IT CLIPS SIDEWAYS ──────────────
                  The recruit reveal throws shock rings and a particle burst out
                  of each card, all `position: absolute` with `overflow:
                  visible`, which is right — they are meant to spill past the
                  card. Inside a scroll box they spill past the BOX, so the
                  browser grew a horizontal scrollbar to reach them; the bar
                  ate 15px of width, the cards reflowed narrower, the particles
                  moved with them, and the whole panel juddered for the length
                  of the animation with two scrollbars flickering on and off.
                  Clipped sideways it cannot happen: nothing in this panel is
                  ever meant to be reached by scrolling right. */}
              <div style={{
                overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain',
                minHeight: 0, marginTop: '0.75rem', flex: 1,
              }}>
                {/* ── A ROOM ────────────────────────────────────────────── */}
                {section ? (
                  hall ? (
                    <CrewClient initial={hall} embedded section={section} openCapacity={capacityAsk} />
                  ) : (
                    <p className="font-karla" style={{ fontSize: '0.82rem', color: hallErr ? '#e6a0a0' : 'rgba(190,212,228,0.6)', margin: 0 }}>
                      {hallErr ?? 'Mustering the hall…'}
                    </p>
                  )
                ) : (
                  <>
                    {/* ── THE ROLL CALL, AS ONE LINE ──────────────────────
                        It was the whole panel and it is a strip now. Four
                        painted doors are what this is for; a full list of every
                        hand and every clock above them would bury them. Open it
                        and the old panel is still there, unchanged. */}
                    {state && (
                      <>
                        <button type="button" onClick={() => { vibrate(6); setRollOpen(o => !o) }}
                          aria-expanded={rollOpen} className="tap"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                            padding: '0.5rem 0.65rem', borderRadius: 11, cursor: 'pointer', textAlign: 'left',
                            background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)',
                          }}>
                          <span className="font-karla font-600" style={{
                            flex: 1, minWidth: 0, fontSize: '0.76rem', color: 'rgba(214,232,240,0.72)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{summary}</span>
                          {state.crew.some(c => c.ready) && (
                            <span aria-hidden style={{
                              flexShrink: 0, width: 8, height: 8, borderRadius: 999,
                              background: '#8fdc9a', boxShadow: '0 0 9px rgba(143,220,154,0.7)',
                            }} />
                          )}
                          <span aria-hidden style={{
                            flexShrink: 0, color: 'rgba(190,212,228,0.55)',
                            transform: rollOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s',
                          }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                          </span>
                        </button>

                        <AnimatePresence initial={false}>
                          {rollOpen && (
                            <motion.div key="roll"
                              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2, ease: 'easeOut' }}
                              style={{ overflow: 'hidden' }}>
                              <div style={{ paddingTop: '0.7rem' }}>
                                {state.crew.length === 0 && (
                                  <p className="font-karla" style={{ fontSize: '0.84rem', color: 'rgba(190,212,228,0.6)', lineHeight: 1.5, margin: 0 }}>
                                    Nobody signed on yet. Recruit is where you start.
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

                                      {/* ── THREE ABREAST, AND EACH ONE IS A FACE ──
                                          It was a stack of full-width rows with a
                                          34px medallion at the left of each: on a
                                          phone that is the right shape, and in a
                                          560px panel on a desktop it is a column of
                                          seventeen letterboxes with a postage stamp
                                          in the corner and two thirds of the row
                                          empty. Seventeen hands took four screens to
                                          scroll past to answer a question — where is
                                          everybody — that is supposed to be one look.

                                          A grid of portraits answers it in one:
                                          three across, the art at the size a face
                                          reads at, the name under it and the clock on
                                          the picture where a clock belongs. It is the
                                          same object the four doors are, which is the
                                          panel's own vocabulary rather than a list
                                          idiom borrowed from a settings screen. */}
                                      <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                        gap: '0.45rem',
                                      }}>
                                        {list.map(c => (
                                          <div key={c.id} style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                                            gap: 5, padding: '0.5rem 0.3rem 0.45rem', borderRadius: 12,
                                            background: 'rgba(255,255,255,0.035)',
                                            border: '1px solid rgba(255,255,255,0.07)',
                                            minWidth: 0,
                                          }}>
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                              {/* eslint-disable-next-line @next/next/no-img-element */}
                                              <img src={artSrc(c.filename)} alt="" aria-hidden decoding="async" style={{
                                                display: 'block', width: 58, height: 58, borderRadius: '50%',
                                                // TOP OF THE PLATE. These are full card
                                                // illustrations, so a centred crop of a
                                                // 58px circle is somebody's chest.
                                                objectFit: 'cover', objectPosition: 'top center',
                                                border: `2px solid ${RARITY[Math.min(3, Math.max(0, c.rarity - 1))]}`,
                                                background: 'rgba(0,0,0,0.4)',
                                              }} />
                                              {/* THE CLOCK RIDES THE PORTRAIT. On its own
                                                  line it would set the card's height for
                                                  everybody, including the three quarters
                                                  of a roster that are not on one. */}
                                              {(c.ready || c.backAt) && (
                                                <span className="font-karla font-700" style={{
                                                  position: 'absolute', bottom: -3, left: '50%',
                                                  transform: 'translateX(-50%)',
                                                  padding: '0.05rem 0.32rem', borderRadius: 999,
                                                  fontSize: '0.56rem', whiteSpace: 'nowrap',
                                                  fontVariantNumeric: 'tabular-nums',
                                                  background: 'rgba(6,10,16,0.95)',
                                                  border: `1px solid ${c.ready ? 'rgba(143,220,154,0.7)' : 'rgba(196,169,106,0.5)'}`,
                                                  color: c.ready ? '#8fdc9a' : 'rgba(240,214,150,0.9)',
                                                }}>
                                                  {c.ready ? 'back' : backIn(c.backAt!, now)}
                                                </span>
                                              )}
                                            </div>
                                            <p className="font-karla font-600" style={{
                                              margin: 0, maxWidth: '100%', fontSize: '0.76rem', color: '#f0ede8',
                                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>{c.name}</p>
                                            <p className="font-karla" style={{
                                              margin: 0, maxWidth: '100%', fontSize: '0.6rem',
                                              color: 'rgba(190,212,228,0.5)', textAlign: 'center',
                                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                            }}>
                                              Lv {c.level}{c.where ? ` · ${c.where}` : ''}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}

                    {/* ── THE FOUR DOORS ──────────────────────────────────
                        Two by two, painted, with the words at the foot where
                        every plate is already dark. */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem',
                      marginTop: '0.85rem',
                    }}>
                      {CARDS.map(card => {
                        // WHAT IS WAITING BEHIND EACH DOOR. A count, not a
                        // banner: the dot is the same amber the HUD uses and
                        // means the same thing, which is that there is
                        // something here you have not dealt with.
                        const waiting = card.id === 'recruits' && !boardSeen && (state?.recruitsWaiting ?? 0) > 0
                        const note = card.id === 'recruits' && state
                          ? (state.recruitsWaiting > 0 ? `${state.recruitsWaiting} on the board` : 'board taken for today')
                          : card.id === 'roster' && state
                            ? `${state.crew.length} aboard`
                            : card.blurb
                        return (
                          <button key={card.id} type="button" className="tap"
                            // Named, so a tour can light one door and the
                            // lock can stand the other three down.
                            data-coach={`crew-${card.id}`}
                            onClick={() => {
                              vibrate(10)
                              if (card.id === 'recruits') setBoardSeen(true)
                              setSection(card.id)
                            }}
                            style={{
                              position: 'relative', display: 'block', padding: 0, width: '100%',
                              borderRadius: 14, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
                              background: '#070c14',
                              border: `1px solid ${waiting ? 'rgba(240,192,64,0.55)' : 'rgba(255,255,255,0.1)'}`,
                              boxShadow: waiting ? '0 0 18px rgba(240,192,64,0.18)' : 'none',
                            }}>
                            <div style={{ position: 'relative', aspectRatio: '4 / 3' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={card.art} alt="" aria-hidden loading="lazy" decoding="async"
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                              {/* The scrim, weighted to the foot. The plates are
                                  painted with a dark lower third for exactly
                                  this, so it has very little work to do. */}
                              <div aria-hidden style={{
                                position: 'absolute', inset: 0,
                                background: 'linear-gradient(180deg, rgba(4,8,14,0.05) 0%, rgba(4,8,14,0.5) 58%, rgba(4,8,14,0.94) 100%)',
                              }} />
                              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0.4rem 0.55rem 0.5rem' }}>
                                <span className="font-cinzel font-700" style={{
                                  display: 'block', fontSize: '0.98rem', lineHeight: 1.1, color: '#f6f1e6',
                                  textShadow: '0 2px 12px rgba(0,0,0,0.95)',
                                }}>{card.title}</span>
                                <span className="font-karla" style={{
                                  display: 'block', fontSize: '0.6rem', lineHeight: 1.3, marginTop: 2,
                                  color: waiting ? '#f0c040' : 'rgba(214,232,240,0.6)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{note}</span>
                              </div>
                              {waiting && (
                                <span aria-hidden style={{
                                  position: 'absolute', top: 7, right: 7,
                                  width: 10, height: 10, borderRadius: 999,
                                  background: '#f0c040', border: '1px solid rgba(20,14,4,0.8)',
                                  boxShadow: '0 0 10px rgba(240,192,64,0.6)',
                                }} />
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* NO VOYAGE BOARD AND NO TRAWLS DOWN HERE. Both are their
                        own panels on this chart with their own way in — the
                        Charterhouse you moor at, the trawl disc in the HUD —
                        and a second door to each at the foot of this panel made
                        a page of links out of a set of four painted cards. What
                        the roll call above says about them (who is out, when
                        they are back) is the part that belonged here. */}
                  </>
                )}
              </div>
            </motion.div>
          </PopupShell>
        </div>
      )}
    </AnimatePresence>
  )
}
