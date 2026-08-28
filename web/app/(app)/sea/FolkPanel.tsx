'use client'

// ── WHO IS OUT HERE ─────────────────────────────────────────────────────────
//
// One panel behind one HUD button. Everybody permanent on this sea gets a card
// with their face on it, and turning a card over shows what you know about
// them.
//
// ── ONLY PEOPLE YOU HAVE MET ────────────────────────────────────────────────
//
// A roster of strangers is a list of homework: it says there are eight more
// people out there and nothing about any of them, which turns a thing you
// discover into a thing you are behind on. The sea is for finding people; this
// is for remembering them.
//
// ── AND IT EXPLAINS ALMOST NOTHING ──────────────────────────────────────────
//
// There were two paragraphs here spelling out the daily word, the five-point
// favourite and the fact that the wanderers move. They are gone on purpose.
// Every one of those is discoverable by pulling alongside somebody once, and a
// panel that pre-explains its own systems reads as a manual rather than a
// place. What is left is the faces, where you stand, and one line each on the
// kinds of stranger you might meet, which is the only thing out here the game
// never says anywhere else.

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { prefersReducedMotion } from '@/components/cutscene'
import { vibrate } from '@/lib/haptics'
import {
  FINN_NAME, FINN_AVATAR, FINN_ENCOUNTER_BEATS, FINN_WIN_BEATS,
  findNextEncounterBeat, finnStanding, finnStandingTier, finnToNext,
  FINN_STANDING_NAME, FINN_STANDING_AT,
} from '@/lib/finn'
import { PLACES } from './chart'
import { FOLK, TIER_NAME, TIER_AT, toNextTier, GIFT_FAVOURITE_POINTS, type Folk } from '@/lib/seaFolk'
import { folkState, type Rapport } from './folkActions'
import type { FinnSeaState } from './finnActions'

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'

/** A face, in the one shape both the regulars and the rival can be drawn from. */
type Portrait = {
  characterColor: string; hat: string | null
  bg: string; ring: string; mirrored?: boolean
}

const FINN_FACE: Portrait = {
  characterColor: FINN_AVATAR.characterColor,
  hat: FINN_AVATAR.equippedHat,
  bg: FINN_AVATAR.bgColor,
  ring: FINN_AVATAR.borderColor,
  mirrored: FINN_AVATAR.mirrored,
}

function Bar({ at, of, color }: { at: number; of: number; color: string }) {
  return (
    <div style={{
      height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.08)',
      overflow: 'hidden', marginTop: 5,
    }}>
      <div style={{
        width: `${Math.round((Math.min(at, of) / Math.max(1, of)) * 100)}%`,
        height: '100%', background: color, borderRadius: 999,
      }} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '0.9rem' }}>
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.58rem', letterSpacing: '0.18em', margin: '0 0 0.45rem',
        color: `${SEA},0.5)`,
      }}>{title}</p>
      {children}
    </div>
  )
}

/**
 * ONE PERSON, AS A CARD.
 *
 * Deliberately generic. The rival used to be a wide banner with its own layout
 * at the top of the panel, which said "this is a different kind of thing" so
 * loudly that it stopped reading as part of the same list. He is a card like
 * everybody else now, in his own section and his own gold, which says the same
 * thing quietly and leaves the panel one idea instead of two.
 */
function PersonCard({ face, accent, name, sub, pct, dot, onOpen }: {
  face: Portrait; accent: string; name: string; sub: string
  pct: number; dot?: boolean; onOpen: () => void
}) {
  return (
    <button onClick={onOpen}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '0.7rem 0.5rem 0.6rem', borderRadius: 14, cursor: 'pointer',
        background: `linear-gradient(180deg, ${accent}14 0%, rgba(255,255,255,0.02) 60%)`,
        border: `1px solid ${accent}3a`,
        position: 'relative', overflow: 'hidden',
      }}>
      {dot && (
        <span aria-hidden style={{
          position: 'absolute', top: 7, right: 7,
          width: 8, height: 8, borderRadius: 999,
          background: accent, boxShadow: `0 0 8px ${accent}`,
        }} />
      )}
      <div style={{
        transform: face.mirrored ? 'scaleX(-1)' : 'none',
        borderRadius: '50%', boxShadow: `0 0 16px ${accent}30`,
      }}>
        <CharacterAvatar
          characterColor={face.characterColor}
          equippedHat={face.hat}
          bgColor={face.bg}
          ringColor={face.ring}
          size={62}
        />
      </div>
      <p className="font-cinzel font-700" style={{
        fontSize: '0.82rem', color: '#e8f2ea', margin: '7px 0 0',
        textAlign: 'center', lineHeight: 1.15,
      }}>{name}</p>
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.5rem', letterSpacing: '0.14em', color: accent,
        margin: '3px 0 0', textAlign: 'center',
      }}>{sub}</p>
      <div style={{
        width: '100%', height: 3, borderRadius: 999, marginTop: 6,
        background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
      }}>
        <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 999 }} />
      </div>
    </button>
  )
}

function BackTo({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} className="font-karla font-700"
      style={{
        display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10,
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        color: `${SEA},0.6)`, fontSize: '0.72rem',
      }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 18l-6-6 6-6" /></svg>
      Everyone
    </button>
  )
}

function Head({ face, accent, role, name, water }: {
  face: Portrait; accent: string; role: string; name: string; water?: string
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{
        transform: face.mirrored ? 'scaleX(-1)' : 'none',
        flexShrink: 0, borderRadius: '50%', boxShadow: `0 0 20px ${accent}40`,
      }}>
        <CharacterAvatar
          characterColor={face.characterColor} equippedHat={face.hat}
          bgColor={face.bg} ringColor={face.ring} size={72}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.52rem', letterSpacing: '0.2em', color: accent, margin: 0,
        }}>{role}</p>
        <p className="font-cinzel font-700" style={{
          fontSize: '1.24rem', color: '#f0ede8', margin: '2px 0 0', lineHeight: 1.1,
        }}>{name}</p>
        {water && (
          <p className="font-karla" style={{
            fontSize: '0.72rem', color: `${SEA},0.55)`, margin: '3px 0 0',
          }}>{water}</p>
        )}
      </div>
    </div>
  )
}

/** What you know about one of the regulars. */
function FolkDetail({ folk, rap, onBack }: { folk: Folk; rap: Rapport; onBack: () => void }) {
  const water = PLACES.find(w => w.id === folk.zoneId)?.name ?? 'Open water'
  const left = toNextTier(rap.points)
  return (
    <>
      <BackTo onBack={onBack} />
      <Head face={folk.face} accent={folk.accent} role={folk.role} name={folk.name} water={water} />

      <p className="font-karla" style={{
        fontSize: '0.78rem', color: `${SEA},0.75)`, lineHeight: 1.5, margin: '0.8rem 0 0',
      }}>{folk.blurb}</p>

      <div style={{
        marginTop: '0.8rem', padding: '0.6rem 0.7rem', borderRadius: 11,
        background: `${folk.accent}10`, border: `1px solid ${folk.accent}30`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f6ecd6', margin: 0 }}>
            {TIER_NAME[rap.tier]}
          </p>
          <p className="font-karla" style={{ fontSize: '0.68rem', color: `${SEA},0.5)`, margin: 0 }}>
            {left === null ? 'As far as it goes' : `${left} to the next`}
          </p>
        </div>
        <Bar at={rap.points} of={TIER_AT[4]} color={folk.accent} />
      </div>

      {/* The one fish. Withheld until they are a known face, so it reads as
          something you learned about them rather than a hint handed over. */}
      <div style={{
        marginTop: 8, padding: '0.6rem 0.7rem', borderRadius: 11,
        background: 'rgba(255,255,255,0.035)', border: `1px solid ${SEA},0.14)`,
      }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.52rem', letterSpacing: '0.18em', color: `${SEA},0.5)`, margin: 0,
        }}>Favourite catch</p>
        {rap.tier >= 1 ? (
          <>
            <p className="font-cinzel font-700" style={{
              fontSize: '1rem', color: folk.accent, margin: '4px 0 0',
            }}>{folk.favourite.name}</p>
            <p className="font-karla" style={{
              fontSize: '0.7rem', color: `${SEA},0.55)`, margin: '3px 0 0',
            }}>Worth {GIFT_FAVOURITE_POINTS} where a word is worth one.</p>
          </>
        ) : (
          <p className="font-karla" style={{
            fontSize: '0.74rem', color: `${SEA},0.45)`, margin: '4px 0 0', lineHeight: 1.45,
          }}>You do not know them well enough yet.</p>
        )}
      </div>

      {rap.giftsGiven > 0 && (
        <p className="font-karla" style={{
          fontSize: '0.68rem', color: `${SEA},0.4)`, margin: '10px 0 0',
        }}>
          You have brought them {rap.giftsGiven} {rap.giftsGiven === 1 ? 'gift' : 'gifts'}.
        </p>
      )}
    </>
  )
}

/** What you know about the rival. His card turns over to the campaign rather
 *  than to a favourite fish, because that is what he is. */
function RivalDetail({ finn, onBack }: { finn: FinnSeaState | null; onBack: () => void }) {
  const points = finnStanding(finn?.encounters ?? 0, finn?.wins ?? 0)
  const tier = finnStandingTier(points)
  const left = finnToNext(points)
  const seen = new Set(finn?.seenBeats ?? [])
  const heard = FINN_ENCOUNTER_BEATS.filter(b => seen.has(b.id)).length
  const wonHeard = FINN_WIN_BEATS.filter(b => seen.has(b.id)).length
  const quest = finn?.quest ?? null
  return (
    <>
      <BackTo onBack={onBack} />
      <Head face={FINN_FACE} accent={GOLD} role="Rival" name={FINN_NAME}
        water={finn ? `Moored off ${finn.at.bandName}` : undefined} />

      <div style={{
        marginTop: '0.8rem', padding: '0.6rem 0.7rem', borderRadius: 11,
        background: `${GOLD}10`, border: `1px solid ${GOLD}30`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f6ecd6', margin: 0 }}>
            {FINN_STANDING_NAME[tier]}
          </p>
          <p className="font-karla" style={{ fontSize: '0.68rem', color: `${SEA},0.5)`, margin: 0 }}>
            {left === null ? 'As far as it goes' : `${left} to the next`}
          </p>
        </div>
        <Bar at={points} of={FINN_STANDING_AT[4]} color={GOLD} />
      </div>

      {/* The job, when he has set one. The loudest thing here when it is done,
          because that is the campaign waiting on you. */}
      {quest && (
        <div style={{
          marginTop: 8, padding: '0.6rem 0.7rem', borderRadius: 11,
          background: quest.done ? 'rgba(60,44,10,0.72)' : 'rgba(255,255,255,0.035)',
          border: `1px solid ${quest.done ? 'rgba(240,192,64,0.6)' : `${SEA},0.14)`}`,
        }}>
          <p className="font-karla font-700 uppercase" style={{
            fontSize: '0.52rem', letterSpacing: '0.18em', margin: 0,
            color: quest.done ? '#ffd986' : `${SEA},0.5)`,
          }}>{quest.done ? 'Done. Go and hand it over' : 'He asked you for'}</p>
          <p className="font-karla font-600" style={{
            fontSize: '0.84rem', color: '#f0ede8', margin: '3px 0 0', lineHeight: 1.3,
          }}>{quest.label}</p>
          <Bar at={quest.have} of={quest.target} color={quest.done ? GOLD : 'rgba(226,238,246,0.5)'} />
          <p className="font-karla" style={{
            fontSize: '0.64rem', color: `${SEA},0.45)`, margin: '4px 0 0',
          }}>{quest.progressText}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {([['Met', finn?.encounters ?? 0], ['Wagers won', finn?.wins ?? 0],
          ['Jobs done', finn?.questsDone.length ?? 0]] as const).map(([k, v]) => (
          <div key={k} style={{ flex: 1 }}>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.5rem', letterSpacing: '0.16em', color: `${SEA},0.45)`, margin: 0,
            }}>{k}</p>
            <p className="font-cinzel font-700" style={{
              fontSize: '1.05rem', color: '#f4e2c0', margin: '2px 0 0',
            }}>{v}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: 'rgba(244,226,192,0.9)', margin: 0 }}>
            His story
          </p>
          <p className="font-karla" style={{ fontSize: '0.7rem', color: `${SEA},0.5)`, margin: 0 }}>
            {heard} of {FINN_ENCOUNTER_BEATS.length}
          </p>
        </div>
        <Bar at={heard} of={FINN_ENCOUNTER_BEATS.length} color={GOLD} />
        {wonHeard > 0 && <Bar at={wonHeard} of={FINN_WIN_BEATS.length} color={`${GOLD}70`} />}
      </div>
    </>
  )
}

export default function FolkPanel({ open, onClose, finn }: {
  open: boolean
  onClose: () => void
  finn: FinnSeaState | null
}) {
  const reduced = useMemo(prefersReducedMotion, [])
  const [rap, setRap] = useState<Rapport[]>([])
  const [showing, setShowing] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    void folkState().then(rows => { if (alive) setRap(rows) })
    return () => { alive = false }
  }, [open])

  useEffect(() => { if (!open) setShowing(null) }, [open])

  const met = FOLK
    .map(folk => ({ folk, rap: rap.find(r => r.folkId === folk.id) }))
    .filter((x): x is { folk: Folk; rap: Rapport } => !!x.rap && x.rap.points > 0)

  const openFolk = met.find(m => m.folk.id === showing) ?? null
  const openRival = showing === 'finn'

  const finnPts = finnStanding(finn?.encounters ?? 0, finn?.wins ?? 0)
  const finnMore = !!finn && (finn.questReady || findNextEncounterBeat(finn.seenBeats) !== null)
  const finnQuest = finn?.quest ?? null

  /**
   * ── THE TURN ────────────────────────────────────────────────────────────
   *
   * ONE element out, one element in, and nothing else moving. The first cut
   * flipped the tapped card, THEN faded the whole grid, THEN turned the detail
   * in: three phases across two elements, with the panel's own height changing
   * underneath all of it. That is why it read as a stutter rather than as a
   * card turning over.
   *
   * The face itself is what rotates now. The outgoing one turns to edge-on and
   * the incoming one completes the same rotation from the other side, in `wait`
   * mode so the two are never on screen together. Opacity SNAPS at the edge
   * rather than easing across the turn: a rotation that fades looks like a
   * dissolve, and at ninety degrees the element is invisible anyway.
   *
   * A floor height on the container stops the panel resizing mid-turn, which
   * was the other half of the jank.
   */
  const face = reduced
    ? {
      initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 },
      transition: { duration: 0.12 },
    }
    : {
      initial: { rotateY: -90, opacity: 0 },
      animate: {
        rotateY: 0, opacity: 1,
        transition: {
          rotateY: { duration: 0.2, ease: [0.16, 0.8, 0.36, 1] as [number, number, number, number] },
          opacity: { duration: 0.01 },
        },
      },
      exit: {
        rotateY: 90, opacity: 0,
        transition: {
          rotateY: { duration: 0.17, ease: [0.7, 0, 0.84, 0] as [number, number, number, number] },
          opacity: { duration: 0.01, delay: 0.16 },
        },
      },
    }

  const faceStyle = {
    transformStyle: 'preserve-3d' as const,
    backfaceVisibility: 'hidden' as const,
    willChange: 'transform',
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', inset: 0, zIndex: 9200,
            background: 'rgba(3,8,14,0.86)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}>
          <motion.div
            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480, maxHeight: '82vh', overflowY: 'auto',
              background: 'rgba(8,14,22,0.98)',
              border: `1px solid ${SEA},0.28)`,
              borderRadius: 16, padding: '1rem 1.1rem',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#e8f2ea', margin: 0 }}>
                The Salt Road
              </p>
              <button type="button" onClick={onClose} aria-label="Close"
                style={{
                  width: 26, height: 26, borderRadius: '50%', cursor: 'pointer',
                  background: 'rgba(255,255,255,0.06)', border: `1px solid ${SEA},0.22)`,
                  color: 'rgba(226,238,246,0.8)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', padding: 0,
                }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div style={{ perspective: 1400, minHeight: 340 }}>
              <AnimatePresence mode="wait" initial={false}>
                {openRival ? (
                  <motion.div key="rival" {...face}
                    style={{ ...faceStyle, paddingTop: '0.9rem' }}>
                    <RivalDetail finn={finn} onBack={() => { vibrate(6); setShowing(null) }} />
                  </motion.div>
                ) : openFolk ? (
                  <motion.div key={`folk:${openFolk.folk.id}`} {...face}
                    style={{ ...faceStyle, paddingTop: '0.9rem' }}>
                    <FolkDetail folk={openFolk.folk} rap={openFolk.rap}
                      onBack={() => { vibrate(6); setShowing(null) }} />
                  </motion.div>
                ) : (
                  <motion.div key="grid" {...face} style={faceStyle}>

                    <Section title="The Rival">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                        <div style={{ width: 118, flexShrink: 0, display: 'flex' }}>
                          <PersonCard
                            face={FINN_FACE} accent={GOLD} name={FINN_NAME}
                            sub={FINN_STANDING_NAME[finnStandingTier(finnPts)]}
                            pct={Math.round((Math.min(finnPts, FINN_STANDING_AT[4]) / FINN_STANDING_AT[4]) * 100)}
                            dot={finnMore}
                            onOpen={() => { vibrate(6); setShowing('finn') }} />
                        </div>

                        {/* ── WHAT HE HAS ASKED YOU FOR ─────────────────────
                            BESIDE HIS CARD, not buried behind it. This is the
                            one live task in the game and the panel a captain
                            opens to see who is out there is exactly where they
                            will look for it. Done, it goes gold and stops
                            describing the task at all: the only thing left to
                            know is that he is holding your pay. */}
                        {finnQuest ? (
                          <button
                            onClick={() => { vibrate(6); setShowing('finn') }}
                            style={{
                              flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer',
                              padding: '0.6rem 0.7rem', borderRadius: 14,
                              background: finnQuest.done
                                ? 'linear-gradient(180deg, rgba(96,72,14,0.85) 0%, rgba(44,32,6,0.9) 100%)'
                                : 'rgba(255,255,255,0.035)',
                              border: `1px solid ${finnQuest.done ? 'rgba(240,192,64,0.7)' : `${SEA},0.14)`}`,
                              boxShadow: finnQuest.done ? '0 0 20px rgba(240,192,64,0.2)' : 'none',
                              display: 'flex', flexDirection: 'column', justifyContent: 'center',
                            }}>
                            <p className="font-karla font-700 uppercase" style={{
                              fontSize: '0.5rem', letterSpacing: '0.18em', margin: 0,
                              color: finnQuest.done ? '#ffd986' : `${SEA},0.5)`,
                            }}>{finnQuest.done ? 'Done' : 'He asked you for'}</p>
                            <p className="font-karla font-600" style={{
                              fontSize: '0.82rem', margin: '3px 0 0', lineHeight: 1.3,
                              color: '#f0ede8',
                            }}>{finnQuest.label}</p>
                            {finnQuest.done ? (
                              <p className="font-cinzel font-700" style={{
                                fontSize: '0.86rem', margin: '6px 0 0', color: '#ffd986',
                              }}>Go back to Finn and hand it over</p>
                            ) : (
                              <>
                                <Bar at={finnQuest.have} of={finnQuest.target}
                                  color="rgba(226,238,246,0.5)" />
                                <p className="font-karla" style={{
                                  fontSize: '0.64rem', margin: '4px 0 0', color: `${SEA},0.45)`,
                                }}>{finnQuest.progressText}</p>
                              </>
                            )}
                          </button>
                        ) : (
                          <div style={{
                            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center',
                            padding: '0.6rem 0.7rem', borderRadius: 14,
                            border: `1px dashed ${SEA},0.14)`,
                          }}>
                            <p className="font-karla" style={{
                              fontSize: '0.74rem', color: `${SEA},0.45)`, margin: 0, lineHeight: 1.45,
                            }}>He has not asked you for anything. Go and see what he wants.</p>
                          </div>
                        )}
                      </div>
                    </Section>

                    <Section title={met.length > 0 ? `Known to you (${met.length})` : 'Known to you'}>
                      {met.length === 0 ? (
                        <p className="font-karla" style={{
                          fontSize: '0.76rem', color: `${SEA},0.55)`, lineHeight: 1.5, margin: 0,
                        }}>
                          Nobody yet. Pull alongside somebody out there and say something.
                        </p>
                      ) : (
                        <div style={{
                          display: 'grid', gap: 8,
                          gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                        }}>
                          {met.map(({ folk, rap: r }) => (
                            <PersonCard key={folk.id}
                              face={folk.face} accent={folk.accent} name={folk.name}
                              sub={TIER_NAME[r.tier]}
                              pct={Math.round((Math.min(r.points, TIER_AT[4]) / TIER_AT[4]) * 100)}
                              dot={!r.chattedToday}
                              onOpen={() => { vibrate(6); setShowing(folk.id) }} />
                          ))}
                        </div>
                      )}
                    </Section>

                    {/* The wanderers get a legend rather than rows: they are
                        hashed out of (cell, day) and gone at midnight, so "who
                        have I met" has no honest answer for them. What the
                        panel CAN give is what each kind wants, which the game
                        says nowhere else. */}
                    <Section title="Who else you might meet">
                      {[
                        ['Bait peddler', 'Sells bait well under shop price.'],
                        ['Salter', 'Buys your whole hold on the spot.'],
                        ['Deep tinker', 'Better bait, bigger discount, deep water only.'],
                        ['An old hand', 'Wants nothing. Says one thing and means it.'],
                        ['Blockade runner', 'Night and deep water. Rods no shop will stock.'],
                      ].map(([who, what]) => (
                        <div key={who} style={{
                          display: 'flex', gap: 8, padding: '0.34rem 0',
                          borderTop: `1px solid ${SEA},0.1)`,
                        }}>
                          <p className="font-karla font-700" style={{
                            fontSize: '0.74rem', margin: 0, color: 'rgba(226,238,246,0.85)',
                            flexShrink: 0, width: 116,
                          }}>{who}</p>
                          <p className="font-karla" style={{
                            fontSize: '0.72rem', margin: 0, color: `${SEA},0.62)`, flex: 1,
                          }}>{what}</p>
                        </div>
                      ))}
                    </Section>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
