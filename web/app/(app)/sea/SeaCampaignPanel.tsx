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
// ── AND IT KEEPS THE SAME SECRETS THE WATER DOES ────────────────────────────
//
// The sea hides every node the chain has not reached. A list that spelled out
// the whole chapter would hand all of that back in one tap and there would have
// been no point hiding it. So this shows what you have done, what you are on,
// and then says how much is left without saying what it is.

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import { RAID_MAP, RAID_CHAPTERS, isCombatNode, type RaidNode, type RaidChapter } from '@/lib/raidMap'
import { getRaidConfigById } from '@/lib/raidRegistry'

const GOLD = '#f0c040'
const TEAL = '#5eead4'

/** What a node is, in one word, under its name. The screenshot's caption row. */
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

export default function SeaCampaignPanel({ open, onClose, status, nextId }: {
  open: boolean
  onClose: () => void
  /** The LIVE status map — the chart's own, so this and the water can never
   *  disagree about what is open. */
  status: Record<string, string>
  /** The one thing the campaign wants next, so it can be the chapter that
   *  opens itself and the row that is lit. */
  nextId: string | null
}) {
  /**
   * THE CHAPTERS, EACH WITH ITS OWN NODES AND ITS OWN STATE.
   *
   * Built off RAID_MAP's order and RAID_CHAPTERS' boundaries, which is the same
   * pair /expeditions walks. Challenge variants are dropped: they are a
   * difficulty switch on a boss you already have, not a stop on the road, and
   * the hub's own spine drops them for the same reason.
   */
  const chapters = useMemo(() => {
    const out: { ch: RaidChapter; nodes: RaidNode[] }[] = []
    let i = 0
    for (const ch of RAID_CHAPTERS) {
      const end = RAID_MAP.findIndex(n => n.id === ch.lastNodeId)
      const nodes: RaidNode[] = []
      for (; i <= end && i < RAID_MAP.length; i++) {
        const n = RAID_MAP[i]
        if (n.sideBranch) continue
        nodes.push(n)
      }
      out.push({ ch, nodes })
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
          // Wider than a phone sheet where there is room: this is a list of
          // long titles and a spine, and 420 wraps most of them.
          maxWidth: 'clamp(360px, 46vw, 560px)',
          maxHeight: '84vh', overflowY: 'auto',
          background: 'linear-gradient(180deg, rgba(10,16,26,0.985) 0%, rgba(5,9,16,0.99) 100%)',
          border: '1px solid rgba(196,169,106,0.3)', borderRadius: 20,
          padding: '1.1rem 1rem 1.2rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        }}>
        <CloseButton onClick={onClose} style={{ position: 'absolute', top: 8, right: 10, zIndex: 6 }} />
        <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.26em', color: `${GOLD}cc` }}>
          The Sunken Hand
        </p>
        <h2 className="font-cinzel font-800" style={{ fontSize: '1.3rem', color: '#f4efe4', lineHeight: 1.1, marginTop: 2, marginBottom: 12 }}>
          The Campaign
        </h2>

        {chapters.map(({ ch, nodes }) => {
          const done = nodes.every(n => st(n.id) === 'cleared')
          const started = nodes.some(n => st(n.id) !== 'locked')
          const isOpen = expanded === ch.id
          // WHAT IS SAFE TO NAME. Everything you have done or can do now, plus
          // nothing else — see the note at the top.
          const named = nodes.filter(n => st(n.id) !== 'locked' || n.previewWhenLocked)
          const hidden = nodes.length - named.length
          return (
            <div key={ch.id} style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 10, marginTop: 10 }}>
              <button type="button" className="tap"
                onClick={() => setOpenCh(isOpen ? '' : ch.id)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
                }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="font-karla font-800 uppercase" style={{ display: 'block', fontSize: '0.52rem', letterSpacing: '0.2em', color: '#9a948a' }}>
                    {ch.coda ? ch.title : `Chapter ${ch.romanNumeral}`}
                    {done ? <span style={{ color: '#8ff0c0' }}> · Cleared</span>
                      : started ? <span style={{ color: GOLD }}> · Under way</span>
                        : <span style={{ color: '#6a6460' }}> · Not yet</span>}
                  </span>
                  <span className="font-cinzel font-700" style={{
                    display: 'block', fontSize: '1.05rem', lineHeight: 1.15, marginTop: 2,
                    color: started ? '#f4efe4' : '#7a7674',
                  }}>{ch.title}</span>
                  {/* THE BLURB IS ONLY FOR A CHAPTER YOU HAVE REACHED. It is a
                      one-line summary of what the chapter is about, which for
                      one you have not started is a spoiler with a lamp on it. */}
                  <span className="font-karla" style={{ display: 'block', fontSize: '0.7rem', color: '#8b8681', fontStyle: 'italic', marginTop: 3, lineHeight: 1.35 }}>
                    {started ? ch.subtitle : 'Nothing has been said of this water yet.'}
                  </span>
                </span>
                <span aria-hidden style={{ color: '#7a7674', flexShrink: 0, marginTop: 4, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.18s' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
                </span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div key="spine"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    style={{ overflow: 'hidden' }}>
                    <div style={{ position: 'relative', paddingTop: 10, paddingLeft: 4 }}>
                      {/* The line the stops hang off. */}
                      <span aria-hidden style={{
                        position: 'absolute', left: 11, top: 16, bottom: 14, width: 2,
                        background: 'linear-gradient(180deg, rgba(196,169,106,0.35), rgba(196,169,106,0.06))',
                      }} />
                      {named.map(n => {
                        const s = st(n.id)
                        const isNext = n.id === nextId
                        const cleared = s === 'cleared'
                        // THE BOSS'S OWN FACE, off the raid config's enemy
                        // table — the same read the Wargate does, so the two
                        // never show a different portrait for one man.
                        const cfg = isCombatNode(n.type) && n.raidId ? getRaidConfigById(n.raidId) : null
                        const art = cfg ? cfg.enemies[cfg.bossId]?.image ?? null : null
                        return (
                          <div key={n.id} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '5px 0' }}>
                            {/* THE WAYPOINT. A tick for done, a lit diamond for
                                the one you are on, a hollow ring for a stop that
                                is open and not yet taken. */}
                            <span aria-hidden style={{
                              flexShrink: 0, width: 18, height: 18, marginTop: 1, position: 'relative', zIndex: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              borderRadius: isNext ? 3 : '50%',
                              transform: isNext ? 'rotate(45deg)' : 'none',
                              background: cleared ? 'rgba(74,222,128,0.16)' : isNext ? GOLD : 'rgba(8,14,22,0.95)',
                              border: `1.5px solid ${cleared ? 'rgba(74,222,128,0.7)' : isNext ? GOLD : 'rgba(196,169,106,0.45)'}`,
                              boxShadow: isNext ? `0 0 14px ${GOLD}88` : 'none',
                            }}>
                              {cleared && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#8ff0c0" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                              )}
                            </span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                              <span className="font-cinzel font-700" style={{
                                display: 'block', fontSize: '0.9rem', lineHeight: 1.2,
                                color: isNext ? '#fff' : cleared ? '#cfc9bf' : '#e8e2d6',
                              }}>{n.label}</span>
                              <span className="font-karla font-700 uppercase" style={{
                                display: 'block', fontSize: '0.5rem', letterSpacing: '0.16em', marginTop: 2,
                                color: isNext ? GOLD : '#7a7674',
                              }}>
                                {kindOf(n)}{isNext ? ' · You are here' : ''}
                              </span>
                              {/* The one you are on gets its art and its line of
                                  voice. Everything else is a name on a list —
                                  a wall of flavour text is a chapter you scroll
                                  past rather than read. */}
                              {isNext && (
                                <span style={{
                                  display: 'block', marginTop: 6, borderRadius: 12, overflow: 'hidden',
                                  border: `1px solid ${GOLD}44`, background: 'rgba(6,12,20,0.7)',
                                }}>
                                  {art && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={art} alt="" loading="lazy" decoding="async"
                                      style={{ display: 'block', width: '100%', height: 96, objectFit: 'contain', background: 'rgba(4,9,15,0.6)' }} />
                                  )}
                                  <span className="font-karla" style={{ display: 'block', fontSize: '0.72rem', color: '#b9b2a6', lineHeight: 1.4, padding: '0.5rem 0.6rem' }}>
                                    {n.flavor}
                                  </span>
                                </span>
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

        <p className="font-karla" style={{ fontSize: '0.64rem', color: '#6a6460', lineHeight: 1.45, marginTop: 14, textAlign: 'center' }}>
          Every stop is somewhere on the water. Sail to it.
        </p>
      </motion.div>
    </PopupShell>
  )
}
