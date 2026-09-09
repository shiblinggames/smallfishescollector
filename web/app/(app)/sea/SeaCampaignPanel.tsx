'use client'

// ── THE STORY SO FAR ────────────────────────────────────────────────────────
//
// The expedition side's Salt Road. The fishing half has a panel that says where
// Finn's campaign has got to; this is the same thing for the other half of the
// game, opened from the pennant in the HUD row.
//
// ── IT IS A READ, NOT A HUB ─────────────────────────────────────────────────
//
// /expeditions has the interactive version: tap a node, open its sheet, enter
// the fight. This one names things and gets out of the way, and that is a rule
// rather than a stage it is at. Every node out here is somewhere on the water,
// and the whole reason the campaign was moved onto the sea is that you sail to
// it. A panel that let you enter a raid from a list would put the page of cards
// back on top of the ocean that replaced it.
//
// ── AND IT CARRIES THE ONE INSTRUCTION A NEW CAPTAIN NEEDS ──────────────────
//
// Captain's Orders sits at the top of it until every order is done once. That
// card is the same role this panel already has — "here is where you are, here
// is the next thing" — told to somebody who has not learned the shape of the
// game yet, and it lived only on /expeditions, which is the surface a captain
// who starts on the water never opens. It is a LIVE checklist rather than a
// tour: it reads the roster and the ship every time it is drawn, so it can help
// two days later when somebody is stuck, and it latches shut for good the first
// time every order is met.
//
// ── AND IT KEEPS THE SAME SECRETS THE WATER DOES ────────────────────────────
//
// The sea hides every node the chain has not reached. A list that spelled out
// the whole chapter would hand all of that back in one tap and there would have
// been no point hiding it. So this shows what you have done, what you are on,
// and then says how much is left without saying what it is.

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import { RAID_MAP, RAID_CHAPTERS, isCombatNode, type RaidNode, type RaidChapter } from '@/lib/raidMap'
import CaptainsOrders, { type OrderAction } from '@/app/(app)/expeditions/CaptainsOrders'
import { captainsOrders, type CaptainsOrdersState } from './ordersActions'
import { RAID_BOSS_BG, RAID_LOCATION_BG } from '@/lib/bossRaids'
import { getRaidConfigById } from '@/lib/raidRegistry'

const GOLD = '#f0c040'

/** What a node is, in one word, under its name. */
function kindOf(n: RaidNode): string {
  if (n.type === 'raid') return 'Raid'
  if (n.type === 'skirmish') return 'Skirmish'
  if (n.type === 'story') return 'Story'
  if (n.type === 'milestone') return 'Spoils'
  if (n.type === 'class_pick') return "Captain's choice"
  if (n.type === 'shop') return 'Stores'
  if (n.type === 'puzzle' || n.type === 'dice' || n.type === 'dps_check') return 'Trial'
  return 'Stop'
}

export default function SeaCampaignPanel({ open, onClose, status, nextId, onOrder }: {
  open: boolean
  onClose: () => void
  /** Where an order sends you. The chart owns every one of these doors, so it
   *  runs them; this panel only knows that one was pressed. */
  onOrder?: (a: OrderAction | 'recruit' | 'assign') => void
  /** The LIVE status map — the chart's own, so this and the water can never
   *  disagree about what is open. */
  status: Record<string, string>
  /** The one thing the campaign wants next, so it can be the chapter that
   *  opens itself and the row that is lit. */
  nextId: string | null
}) {
  /**
   * THE CHAPTERS, EACH WITH ITS NODES AND ITS OWN PAINTED WATER.
   *
   * Built off RAID_MAP's order and RAID_CHAPTERS' boundaries, which is the same
   * pair /expeditions walks. Challenge variants are dropped: they are a
   * difficulty switch on a boss you already have, not a stop on the road.
   *
   * THE ART IS THE CHAPTER'S LAST BOSS FIGHT — the place the whole chapter has
   * been walking toward, and the one image that is unmistakably about it. These
   * plates already exist and are already painted to a rule (see the composition
   * note in bossRaids: horizon high, lower two thirds open water), which is
   * exactly the shape a banner wants.
   */
  /**
   * THE CHECKLIST'S NUMBERS, READ ON EVERY OPEN.
   *
   * Not once, and not from a page prop: the whole value of this card is that it
   * is live. You sign a hand on, come back, and the order has moved on. A
   * payload kept from the first open would keep telling you to do a thing you
   * did an hour ago, which is the one failure a checklist cannot survive.
   */
  const [orders, setOrders] = useState<CaptainsOrdersState | null>(null)
  useEffect(() => {
    if (!open) return
    let live = true
    captainsOrders().then(r => { if (live && !('error' in r)) setOrders(r) }, () => {})
    return () => { live = false }
  }, [open])

  const chapters = useMemo(() => {
    const out: { ch: RaidChapter; nodes: RaidNode[]; art: string | null }[] = []
    let i = 0
    for (const ch of RAID_CHAPTERS) {
      const end = RAID_MAP.findIndex(n => n.id === ch.lastNodeId)
      const nodes: RaidNode[] = []
      let art: string | null = null
      for (; i <= end && i < RAID_MAP.length; i++) {
        const n = RAID_MAP[i]
        if (n.sideBranch) continue
        nodes.push(n)
        if (n.type === 'raid' && n.raidId) {
          art = RAID_BOSS_BG[n.raidId] ?? RAID_LOCATION_BG[n.raidId] ?? art
        }
      }
      out.push({ ch, nodes, art })
    }
    return out
  }, [])

  const st = (id: string) => status[id] ?? 'locked'

  /** Which chapter the next stop is in. That one opens itself. */
  const liveChapter = useMemo(() => {
    if (!nextId) return null
    return chapters.find(c => c.nodes.some(n => n.id === nextId))?.ch.id ?? null
  }, [chapters, nextId])

  const [openCh, setOpenCh] = useState<string | null>(null)
  const expanded = openCh ?? liveChapter

  return (
    <PopupShell open={open} onClose={onClose}>
      <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 6 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        style={{
          position: 'relative', margin: 'auto', width: '100%',
          // The app's one modal width — see --modal-w in globals.css. This panel
          // is where that number came from; it now reads it like everything else.
          maxWidth: 'var(--modal-w)',
          // ── ONE SIZE, WHATEVER IS OPEN ──────────────────────────────────
          //
          // A FIXED height, not a max: the chapters expand and collapse inside
          // this box and the box does not move. Sized to content it grew and
          // shrank on every tap, which drags the close button and half the
          // chapters to a new place mid-read and makes the panel feel like it
          // is arguing with you. The list scrolls; the frame is still.
          // Never taller than the room the shell left — see CrewHub's note.
          height: 'min(80vh, 680px)', maxHeight: '100%',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(10,16,26,0.985) 0%, rgba(5,9,16,0.99) 100%)',
          border: '1px solid rgba(196,169,106,0.3)', borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        }}>
        <CloseButton onClick={onClose} style={{ position: 'absolute', top: 10, right: 12, zIndex: 6 }} />

        <div style={{ flexShrink: 0, padding: '1.05rem 1rem 0.7rem' }}>
          <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.26em', color: `${GOLD}cc` }}>
            The Sunken Hand
          </p>
          <h2 className="font-cinzel font-800" style={{ fontSize: '1.3rem', color: '#f4efe4', lineHeight: 1.1, marginTop: 2 }}>
            The Campaign
          </h2>
        </div>

        {/* THE ONLY THING THAT MOVES. minHeight 0 or a flex child will not
            scroll: it grows to its content and pushes the box open instead,
            which is the exact failure this layout is here to prevent. */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 0.75rem 0.9rem' }}>
          {/* ── THE ONE THING TO DO NEXT ──────────────────────────────────
              Above the chapters, because it outranks them: a captain who has
              not seated a raid crew does not need to know where Chapter III
              got to. It draws nothing once the checklist has latched, which is
              most captains most of the time. */}
          {orders && !orders.done && onOrder && (
            <CaptainsOrders
              alreadyDone={orders.done}
              state={orders}
              onAction={a => { onClose(); onOrder(a) }}
              onHref={href => {
                // The two crew errands. Both are panels on this chart, and
                // following their route would unload the ocean to reach one.
                const card = href.includes('tab=recruits') ? 'recruit'
                  : href.includes('tab=assign') ? 'assign' : null
                if (!card) return false
                onClose()
                onOrder(card)
                return true
              }} />
          )}
          {chapters.map(({ ch, nodes, art }) => {
            const done = nodes.every(n => st(n.id) === 'cleared')
            const started = nodes.some(n => st(n.id) !== 'locked')
            const isOpen = expanded === ch.id
            const isLive = liveChapter === ch.id
            // WHAT IS SAFE TO NAME. Everything you have done or can do now, and
            // nothing else — see the note at the top.
            const named = nodes.filter(n => st(n.id) !== 'locked' || n.previewWhenLocked)
            const hidden = nodes.length - named.length
            const cleared = nodes.filter(n => st(n.id) === 'cleared').length
            return (
              <div key={ch.id} style={{ marginBottom: 10 }}>
                {/* ── THE CHAPTER, AS ITS OWN WATER ────────────────────────
                    A banner of the place the chapter ends, with the title over
                    it. A chapter you have not reached is drawn dark and unlit
                    and DOES NOT SAY ITS NAME — see the note on `started` below.

                    It is not a button either, once there is nothing behind it:
                    a row that opens to say how much of itself is hidden has
                    still told you how big it is, and a chevron on a locked row
                    invites a tap that answers nothing. */}
                {(() => {
                  const Row = started ? 'button' : 'div'
                  return (
                <Row {...(started ? { type: 'button' as const, className: 'tap',
                    onClick: () => setOpenCh(isOpen ? '' : ch.id),
                    'aria-expanded': isOpen } : {})}
                  style={{
                    position: 'relative', display: 'block', width: '100%', padding: 0,
                    border: `1px solid ${isLive ? `${GOLD}66` : 'rgba(255,255,255,0.09)'}`,
                    borderRadius: 14, overflow: 'hidden',
                    cursor: started ? 'pointer' : 'default', textAlign: 'left',
                    background: '#070c14',
                    boxShadow: isLive ? `0 0 20px ${GOLD}22` : 'none',
                  }}>
                  <div style={{ position: 'relative', height: 92 }}>
                    {art && started && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={art} alt="" loading="lazy" decoding="async"
                        style={{
                          position: 'absolute', inset: 0, width: '100%', height: '100%',
                          objectFit: 'cover', objectPosition: 'center 38%',
                          filter: done ? 'saturate(0.72) brightness(0.62)' : 'brightness(0.82)',
                        }} />
                    )}
                    {/* The scrim. Weighted to the foot, where the words are. */}
                    <div aria-hidden style={{
                      position: 'absolute', inset: 0,
                      background: started
                        ? 'linear-gradient(180deg, rgba(4,8,14,0.30) 0%, rgba(4,8,14,0.62) 52%, rgba(4,8,14,0.92) 100%)'
                        : 'linear-gradient(180deg, rgba(8,12,20,0.9), rgba(4,8,14,0.96))',
                    }} />
                    <div style={{
                      position: 'absolute', left: 0, right: 0, bottom: 0,
                      padding: '0.5rem 0.75rem 0.6rem', display: 'flex', alignItems: 'flex-end', gap: 8,
                    }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {/* ── A CHAPTER YOU HAVE NOT REACHED HAS NO NAME ──
                            The art was already withheld and the subtitle with
                            it, and then the row printed "A Bigger Fish" in
                            grey underneath, which gives away as much as either
                            of them: the titles ARE the story. Four rows saying
                            what is coming is a contents page for a book whose
                            whole shape is that you do not know how long it is.

                            The numeral stays. Knowing there is a Chapter II is
                            not a spoiler, it is the reason to keep sailing —
                            and the coda has no numeral by design, so the last
                            row simply does not exist until it does. */}
                        <span className="font-karla font-800 uppercase" style={{ display: 'block', fontSize: '0.5rem', letterSpacing: '0.2em', color: '#a49c8e' }}>
                          {ch.coda ? (started ? 'The Coda' : 'And after that') : `Chapter ${ch.romanNumeral}`}
                          {done ? <span style={{ color: '#8ff0c0' }}> · Cleared</span>
                            : started ? <span style={{ color: GOLD }}> · {cleared}/{nodes.length}</span>
                              : null}
                        </span>
                        <span className="font-cinzel font-700" style={{
                          display: 'block', fontSize: started ? '1.06rem' : '0.92rem',
                          lineHeight: 1.15, marginTop: 1,
                          color: started ? '#f6f1e6' : '#5f5b57',
                          fontStyle: started ? 'normal' : 'italic',
                          textShadow: started ? '0 2px 12px rgba(0,0,0,0.95)' : 'none',
                        }}>{started ? ch.title : 'Still dark'}</span>
                      </span>
                      {started ? (
                        <span aria-hidden style={{
                          flexShrink: 0, color: '#cfc9bf', marginBottom: 3,
                          transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s',
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                        </span>
                      ) : (
                        // A closed padlock, not a chevron. The row is not
                        // refusing to open, there is nothing in it yet.
                        <span aria-hidden style={{ flexShrink: 0, color: '#4a4744', marginBottom: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* The blurb sits UNDER the art rather than on it: a line of
                      italic over a painting is the one thing that always reads
                      badly, whatever the painting is. */}
                  <span className="font-karla" style={{
                    display: 'block', fontSize: '0.7rem', lineHeight: 1.4, fontStyle: 'italic',
                    color: started ? '#928c85' : '#5f5b57', padding: '0.45rem 0.75rem 0.55rem',
                  }}>
                    {started ? ch.subtitle : 'Nothing has been said of this water yet.'}
                  </span>
                </Row>
                  )
                })()}

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div key="spine"
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.22, ease: 'easeOut' }}
                      style={{ overflow: 'hidden' }}>
                      <div style={{ position: 'relative', padding: '10px 4px 2px 6px' }}>
                        <span aria-hidden style={{
                          position: 'absolute', left: 17, top: 16, bottom: 14, width: 2,
                          background: 'linear-gradient(180deg, rgba(196,169,106,0.35), rgba(196,169,106,0.06))',
                        }} />
                        {named.map(n => {
                          const s = st(n.id)
                          const isNext = n.id === nextId
                          const isDone = s === 'cleared'
                          // THE BOSS'S OWN FACE, off the raid config's enemy
                          // table — the same read the Wargate does, so the two
                          // never show a different portrait for one man.
                          const cfg = isCombatNode(n.type) && n.raidId ? getRaidConfigById(n.raidId) : null
                          const face = cfg ? cfg.enemies[cfg.bossId]?.image ?? null : null
                          return (
                            <div key={n.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '4px 0' }}>
                              <span aria-hidden style={{
                                flexShrink: 0, width: 18, height: 18, marginTop: 3, position: 'relative', zIndex: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                borderRadius: isNext ? 3 : '50%',
                                transform: isNext ? 'rotate(45deg)' : 'none',
                                background: isDone ? 'rgba(74,222,128,0.16)' : isNext ? GOLD : 'rgba(8,14,22,0.95)',
                                border: `1.5px solid ${isDone ? 'rgba(74,222,128,0.7)' : isNext ? GOLD : 'rgba(196,169,106,0.45)'}`,
                                boxShadow: isNext ? `0 0 14px ${GOLD}88` : 'none',
                              }}>
                                {isDone && (
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8ff0c0" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                )}
                              </span>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                {/* A FIGHT LOOKS LIKE A FIGHT. Every combat stop
                                    carries its enemy's portrait at a size you
                                    can read a face at; the story beats between
                                    them stay a line of type, which is what
                                    makes the bosses land as the spine of the
                                    chapter rather than five more list rows. */}
                                {face ? (
                                  <span style={{
                                    display: 'flex', alignItems: 'center', gap: 9,
                                    borderRadius: 12, padding: '0.35rem 0.5rem',
                                    background: isNext ? `${GOLD}12` : 'rgba(255,255,255,0.03)',
                                    border: `1px solid ${isNext ? `${GOLD}44` : 'rgba(255,255,255,0.06)'}`,
                                  }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={face} alt="" loading="lazy" decoding="async"
                                      style={{
                                        width: 46, height: 46, flexShrink: 0, borderRadius: 9, objectFit: 'cover',
                                        objectPosition: 'center top', background: 'rgba(4,9,15,0.7)',
                                        filter: isDone ? 'saturate(0.6) brightness(0.72)' : 'none',
                                      }} />
                                    <span style={{ minWidth: 0 }}>
                                      <span className="font-cinzel font-700" style={{
                                        display: 'block', fontSize: '0.94rem', lineHeight: 1.15,
                                        color: isNext ? '#fff' : isDone ? '#cfc9bf' : '#f2ead8',
                                      }}>{n.label}</span>
                                      <span className="font-karla font-700 uppercase" style={{
                                        display: 'block', fontSize: '0.5rem', letterSpacing: '0.16em', marginTop: 2,
                                        color: isNext ? GOLD : '#7a7674',
                                      }}>{kindOf(n)}{isNext ? ' · You are here' : ''}</span>
                                    </span>
                                  </span>
                                ) : (
                                  <>
                                    <span className="font-cinzel font-700" style={{
                                      display: 'block', fontSize: '0.9rem', lineHeight: 1.2,
                                      color: isNext ? '#fff' : isDone ? '#cfc9bf' : '#e8e2d6',
                                    }}>{n.label}</span>
                                    <span className="font-karla font-700 uppercase" style={{
                                      display: 'block', fontSize: '0.5rem', letterSpacing: '0.16em', marginTop: 2,
                                      color: isNext ? GOLD : '#7a7674',
                                    }}>{kindOf(n)}{isNext ? ' · You are here' : ''}</span>
                                  </>
                                )}
                                {/* The one you are on gets its line of voice.
                                    Everything else is a name: a wall of flavour
                                    is a chapter you scroll past rather than
                                    read. */}
                                {isNext && (
                                  <span className="font-karla" style={{
                                    display: 'block', fontSize: '0.72rem', color: '#b9b2a6',
                                    lineHeight: 1.4, marginTop: 5, paddingLeft: face ? 4 : 0,
                                  }}>{n.flavor}</span>
                                )}
                              </span>
                            </div>
                          )
                        })}
                        {hidden > 0 && (
                          <div style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '5px 0' }}>
                            <span aria-hidden style={{
                              flexShrink: 0, width: 18, height: 18, borderRadius: '50%', position: 'relative', zIndex: 1,
                              border: '1.5px dashed rgba(255,255,255,0.2)', background: 'rgba(8,14,22,0.95)',
                            }} />
                            <span className="font-karla" style={{ fontSize: '0.7rem', color: '#6a6460', fontStyle: 'italic' }}>
                              {hidden} more, still dark
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}

          <p className="font-karla" style={{ fontSize: '0.64rem', color: '#6a6460', lineHeight: 1.45, marginTop: 6, textAlign: 'center' }}>
            Every stop is somewhere on the water. Sail to it.
          </p>
        </div>
      </motion.div>
    </PopupShell>
  )
}
