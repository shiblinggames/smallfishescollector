'use client'

// ── WHO IS OUT HERE ─────────────────────────────────────────────────────────
//
// One panel behind one HUD button, answering the question the chart could not:
// the sea is full of people, and nothing on it ever said who they are or which
// of them is worth crossing water for.
//
// FINN IS THE HEADLINE, and that is the whole reason this exists. His story is
// the fishing campaign, every meeting hands over the next piece of it, and none
// of that was legible from the boat: a captain who met him twice had no way to
// learn that a third meeting would say something new, so the one NPC the story
// hangs on read as a man who occasionally appears and talks. The block at the
// top makes the loop visible. How many times you have found him, how much of
// what he has to say you have heard, and whether there is more waiting.
//
// ── WHY THE REST IS A ROSTER AND NOT A LOG ──────────────────────────────────
//
// "Who have I met" cannot be answered honestly for most of this sea. The
// wanderers are hashed out of (cell, day) and cease to exist at midnight (see
// docs/systems/sea-npcs.md) — there is no row to mark met, and a peddler you
// traded with on Tuesday is not a person you can go back and visit.
//
// What IS permanent: Finn, the five zone buyers, and Yoon. Those are named,
// they are always in the same water, and they are worth knowing about before
// you sail. So the named folk are listed as a roster gated by the water they
// stand in — you can read about anyone whose band you have unlocked — and the
// wanderers get a legend saying what the five kinds want, because "salter" is
// not a word the game had ever explained.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import {
  FINN_NAME, FINN_AVATAR, FINN_ENCOUNTER_BEATS, FINN_WIN_BEATS,
  findNextEncounterBeat, finnStanding, finnStandingTier, finnToNext,
  FINN_STANDING_NAME, FINN_STANDING_AT,
} from '@/lib/finn'
import { PLACES } from './chart'
import { FOLK, TIER_NAME, TIER_AT, toNextTier, GIFT_FAVOURITE_POINTS, type Folk } from '@/lib/seaFolk'
import { PLACES as WATERS } from './chart'
import { folkState, type Rapport } from './folkActions'
import type { FinnSeaState } from './finnActions'

const GOLD = 'rgba(240,192,64'
const SEA = 'rgba(180,214,232'

/** The bar under a counted thing. Plain: filled part, track, nothing clever. */
function Bar({ at, of, color }: { at: number; of: number; color: string }) {
  return (
    <div style={{
      height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.08)',
      overflow: 'hidden', marginTop: 5,
    }}>
      <div style={{
        width: `${Math.round((Math.min(at, of) / of) * 100)}%`, height: '100%',
        background: color, borderRadius: 999,
        transition: 'width 400ms ease-out',
      }} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '1rem' }}>
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.6rem', letterSpacing: '0.18em', margin: '0 0 0.45rem',
        color: `${SEA},0.5)`,
      }}>{title}</p>
      {children}
    </div>
  )
}

/**
 * ONE REGULAR YOU HAVE MET, as a card.
 *
 * ONLY ever rendered for somebody already spoken to. A roster of strangers is
 * a list of homework: it tells a captain there are eight more people out there
 * and exactly nothing about any of them, which turns a thing you discover into
 * a thing you are behind on. The sea is for finding people; this is for
 * remembering them.
 *
 * A CARD RATHER THAN A ROW, because the face is the point. A line of text with
 * a small portrait bolted to the left is a database; a portrait with a name
 * under it is somebody you know. Tapping one opens what you have learned.
 */
function FolkCard({ folk, rap, onOpen }: {
  folk: Folk; rap: Rapport; onOpen: () => void
}) {
  const pct = Math.round((Math.min(rap.points, TIER_AT[4]) / TIER_AT[4]) * 100)
  return (
    <button onClick={onOpen}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '0.7rem 0.5rem 0.6rem', borderRadius: 14, cursor: 'pointer',
        background: `linear-gradient(180deg, ${folk.accent}14 0%, rgba(255,255,255,0.02) 60%)`,
        border: `1px solid ${folk.accent}3a`,
        position: 'relative', overflow: 'hidden',
      }}>
      {/* SOMETHING TO SAY. The one piece of live state a card carries, so the
          grid answers "who should I go and see" at a glance. */}
      {!rap.chattedToday && (
        <span aria-hidden style={{
          position: 'absolute', top: 7, right: 7,
          width: 8, height: 8, borderRadius: 999,
          background: folk.accent, boxShadow: `0 0 8px ${folk.accent}`,
        }} />
      )}
      <div style={{
        transform: folk.face.mirrored ? 'scaleX(-1)' : 'none',
        borderRadius: '50%', boxShadow: `0 0 16px ${folk.accent}30`,
      }}>
        <CharacterAvatar
          characterColor={folk.face.characterColor}
          equippedHat={folk.face.hat}
          bgColor={folk.face.bg}
          ringColor={folk.face.ring}
          size={62}
        />
      </div>
      <p className="font-cinzel font-700" style={{
        fontSize: '0.82rem', color: '#e8f2ea', margin: '7px 0 0',
        textAlign: 'center', lineHeight: 1.15,
      }}>{folk.name}</p>
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.5rem', letterSpacing: '0.14em', color: folk.accent,
        margin: '3px 0 0', textAlign: 'center',
      }}>{TIER_NAME[rap.tier]}</p>
      <div style={{
        width: '100%', height: 3, borderRadius: 999, marginTop: 6,
        background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: folk.accent, borderRadius: 999,
        }} />
      </div>
    </button>
  )
}

/**
 * WHAT YOU KNOW ABOUT THEM.
 *
 * Everything the captain has actually earned the right to know, in one place:
 * where they keep to, how far the friendship has got, and the one fish they
 * want. The favourite is withheld until they are a known face, because a
 * shortcut handed over before you have said hello is not a thing you learned
 * about somebody, it is a hint from the game.
 */
function FolkDetail({ folk, rap, onBack }: {
  folk: Folk; rap: Rapport; onBack: () => void
}) {
  const water = WATERS.find(w => w.id === folk.zoneId)?.name ?? 'Open water'
  const left = toNextTier(rap.points)
  return (
    <motion.div
      initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}>
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

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{
          transform: folk.face.mirrored ? 'scaleX(-1)' : 'none',
          flexShrink: 0, borderRadius: '50%',
          boxShadow: `0 0 20px ${folk.accent}40`,
        }}>
          <CharacterAvatar
            characterColor={folk.face.characterColor}
            equippedHat={folk.face.hat}
            bgColor={folk.face.bg}
            ringColor={folk.face.ring}
            size={72}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-700 uppercase" style={{
            fontSize: '0.52rem', letterSpacing: '0.2em', color: folk.accent, margin: 0,
          }}>{folk.role}</p>
          <p className="font-cinzel font-700" style={{
            fontSize: '1.24rem', color: '#f0ede8', margin: '2px 0 0', lineHeight: 1.1,
          }}>{folk.name}</p>
          <p className="font-karla" style={{
            fontSize: '0.72rem', color: `${SEA},0.55)`, margin: '3px 0 0',
          }}>{water}</p>
        </div>
      </div>

      <p className="font-karla" style={{
        fontSize: '0.78rem', color: `${SEA},0.75)`, lineHeight: 1.5, margin: '0.8rem 0 0',
      }}>{folk.blurb}</p>

      {/* ── HOW FAR IT HAS GOT ──────────────────────────────────────── */}
      <div style={{
        marginTop: '0.8rem', padding: '0.6rem 0.7rem', borderRadius: 11,
        background: `${folk.accent}10`, border: `1px solid ${folk.accent}30`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <p className="font-cinzel font-700" style={{
            fontSize: '0.95rem', color: '#f6ecd6', margin: 0,
          }}>{TIER_NAME[rap.tier]}</p>
          <p className="font-karla" style={{
            fontSize: '0.68rem', color: `${SEA},0.5)`, margin: 0,
          }}>{left === null ? 'As far as it goes' : `${left} to the next`}</p>
        </div>
        <div style={{
          height: 5, borderRadius: 999, marginTop: 6,
          background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.round((Math.min(rap.points, TIER_AT[4]) / TIER_AT[4]) * 100)}%`,
            height: '100%', background: folk.accent, borderRadius: 999,
          }} />
        </div>
      </div>

      {/* ── THE ONE FISH ────────────────────────────────────────────── */}
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
              fontSize: '0.7rem', color: `${SEA},0.55)`, margin: '3px 0 0', lineHeight: 1.45,
            }}>
              Hand them one of these and it is worth {GIFT_FAVOURITE_POINTS} where a word is
              worth one. Anything else out of their own water is worth two.
            </p>
          </>
        ) : (
          <p className="font-karla" style={{
            fontSize: '0.74rem', color: `${SEA},0.45)`, margin: '4px 0 0', lineHeight: 1.45,
          }}>
            You do not know them well enough yet. Keep turning up and they will mention it.
          </p>
        )}
      </div>

      {/* Facts, not warnings. */}
      <p className="font-karla" style={{
        fontSize: '0.68rem', color: `${SEA},0.4)`, margin: '10px 0 0', lineHeight: 1.45,
      }}>
        {rap.giftsGiven > 0
          ? `You have brought them ${rap.giftsGiven} ${rap.giftsGiven === 1 ? 'gift' : 'gifts'}. `
          : ''}
        {rap.chattedToday
          ? 'You have had your word today.'
          : 'They have something to say to you.'}
      </p>
    </motion.div>
  )
}

export default function FolkPanel({ open, onClose, finn, level }: {
  open: boolean
  onClose: () => void
  finn: FinnSeaState | null
  level: number
}) {
  // How much of each track has been heard. seenBeats holds ids from both, so
  // each side counts only its own — the reveal id is in there too and belongs
  // to neither.
  // Loaded on open. Rows only exist for regulars already spoken to, so a
  // missing one reads as tier zero without any backfill.
  const [rap, setRap] = useState<Rapport[]>([])
  useEffect(() => {
    if (!open) return
    let alive = true
    void folkState().then(rows => { if (alive) setRap(rows) })
    return () => { alive = false }
  }, [open])
  /** Only the ones actually spoken to, in the order the cast is written so
   *  the list does not reshuffle as standings change. */
  const met = FOLK
    .map(folk => ({ folk, rap: rap.find(r => r.folkId === folk.id) }))
    .filter((x): x is { folk: Folk; rap: Rapport } => !!x.rap && x.rap.points > 0)

  /** Which one is open, if any. Cleared whenever the panel closes so it never
   *  reopens onto somebody the captain has stopped looking at. */
  const [openFolk, setOpenFolk] = useState<string | null>(null)
  useEffect(() => { if (!open) setOpenFolk(null) }, [open])
  const showing = met.find(m => m.folk.id === openFolk) ?? null
  /** He gets his own slot in the same one-open-at-a-time state. */
  const showRival = openFolk === 'finn'
  const rivalPts = finnStanding(finn?.encounters ?? 0, finn?.wins ?? 0)
  const rivalTier = finnStandingTier(rivalPts)
  const rivalNext = finnToNext(rivalPts)

  const seen = new Set(finn?.seenBeats ?? [])
  const heard = FINN_ENCOUNTER_BEATS.filter(b => seen.has(b.id)).length
  const wonHeard = FINN_WIN_BEATS.filter(b => seen.has(b.id)).length
  const more = findNextEncounterBeat(finn?.seenBeats ?? []) !== null


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
              // 480 IS THE HOUSE MODAL WIDTH. The leaderboards, the crew
              // assign picker, the bunks, the raid sheets and the tackle shop
              // all sit at it; this was at 420 and read as a narrower thing
              // than everything else the game opens.
              width: '100%', maxWidth: 480, maxHeight: '82vh', overflowY: 'auto',
              background: 'rgba(8,14,22,0.98)',
              border: `1px solid ${SEA},0.28)`,
              borderRadius: 16, padding: '1rem 1.1rem',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#e8f2ea', margin: 0 }}>
                {showing ? showing.folk.name : 'The Salt Road'}
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

            {/* ── ONE OF THEM, OR EVERYBODY ────────────────────────────
                Tapping a card swaps the whole body for what you know about
                that person rather than opening a second modal over the first.
                A panel that opens a panel is how the conversation flow went
                wrong the first time, and the Back control is right there. */}
            {showing ? (
              <div style={{ marginTop: '0.9rem' }}>
                <FolkDetail folk={showing.folk} rap={showing.rap}
                  onBack={() => setOpenFolk(null)} />
              </div>
            ) : (
              <>
            {/* ── THE RIVAL, IN HIS OWN CATEGORY ───────────────────────
                He is not one of the regulars and the panel should never file
                him with them: they are people you are getting to know and he
                is the fishing campaign wearing a coat. Same card language so
                the panel reads as one thing, his own heading and his own gold
                so it is obvious he is not the same kind of entry.

                His STANDING is derived, never stored: meetings plus two for
                every bet taken off him, both of which the profile has been
                counting since long before any of this existed. */}
            <Section title="The Rival">
              <button
                onClick={() => setOpenFolk(showRival ? null : 'finn')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, width: '100%',
                  padding: '0.65rem 0.7rem', borderRadius: 13, cursor: 'pointer',
                  textAlign: 'left',
                  background: `linear-gradient(180deg, ${GOLD},0.1) 0%, rgba(255,255,255,0.02) 70%)`,
                  border: `1px solid ${GOLD},${more ? 0.5 : 0.28})`,
                  position: 'relative',
                }}>
                <div style={{
                  transform: FINN_AVATAR.mirrored ? 'scaleX(-1)' : 'none',
                  flexShrink: 0, borderRadius: '50%',
                  boxShadow: `0 0 14px ${GOLD},0.28)`,
                }}>
                  <CharacterAvatar
                    characterColor={FINN_AVATAR.characterColor}
                    equippedHat={FINN_AVATAR.equippedHat}
                    bgColor={FINN_AVATAR.bgColor}
                    ringColor={FINN_AVATAR.borderColor}
                    size={46}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-cinzel font-700" style={{
                    fontSize: '1rem', color: '#f4e2c0', margin: 0, lineHeight: 1.1,
                  }}>{FINN_NAME}</p>
                  <p className="font-karla font-700" style={{
                    fontSize: '0.66rem', color: `${GOLD},0.8)`, margin: '2px 0 0',
                  }}>{FINN_STANDING_NAME[rivalTier]}</p>
                  <div style={{
                    height: 3, borderRadius: 999, marginTop: 5,
                    background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${Math.round((Math.min(rivalPts, FINN_STANDING_AT[4]) / FINN_STANDING_AT[4]) * 100)}%`,
                      height: '100%', background: `${GOLD},0.75)`, borderRadius: 999,
                    }} />
                  </div>
                </div>
                {more && (
                  <span aria-hidden style={{
                    position: 'absolute', top: 8, right: 9,
                    width: 8, height: 8, borderRadius: 999,
                    background: '#f0c040', boxShadow: '0 0 8px rgba(240,192,64,0.8)',
                  }} />
                )}
              </button>

              {/* Opened, he shows the campaign rather than a favourite fish:
                  how much of what he has to say you have heard, what he has
                  taken off you and what you have taken back. */}
              {showRival && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    marginTop: 8, padding: '0.7rem 0.8rem', borderRadius: 12,
                    background: 'rgba(28,22,8,0.6)',
                    border: `1px solid ${GOLD},0.24)`,
                  }}>
                  <p className="font-karla" style={{
                    fontSize: '0.76rem', color: 'rgba(244,226,192,0.85)',
                    lineHeight: 1.5, margin: 0,
                  }}>
                    {more
                      ? `He has more to say, and he only says it face to face. Moored off the Mainland, a short sail out.`
                      : 'You have heard everything he will tell you for now. He is still out there, and he still wants your coin.'}
                  </p>

                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <div style={{ flex: 1 }}>
                      <p className="font-karla font-700 uppercase" style={{
                        fontSize: '0.5rem', letterSpacing: '0.16em', color: `${SEA},0.45)`, margin: 0,
                      }}>Met</p>
                      <p className="font-cinzel font-700" style={{
                        fontSize: '1.05rem', color: '#f4e2c0', margin: '2px 0 0',
                      }}>{finn?.encounters ?? 0}</p>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p className="font-karla font-700 uppercase" style={{
                        fontSize: '0.5rem', letterSpacing: '0.16em', color: `${SEA},0.45)`, margin: 0,
                      }}>Wagers won</p>
                      <p className="font-cinzel font-700" style={{
                        fontSize: '1.05rem', color: '#f4e2c0', margin: '2px 0 0',
                      }}>{finn?.wins ?? 0}</p>
                    </div>
                    <div style={{ flex: 1.3 }}>
                      <p className="font-karla font-700 uppercase" style={{
                        fontSize: '0.5rem', letterSpacing: '0.16em', color: `${SEA},0.45)`, margin: 0,
                      }}>His story</p>
                      <p className="font-cinzel font-700" style={{
                        fontSize: '1.05rem', color: '#f4e2c0', margin: '2px 0 0',
                      }}>{heard} of {FINN_ENCOUNTER_BEATS.length}</p>
                    </div>
                  </div>

                  <Bar at={heard} of={FINN_ENCOUNTER_BEATS.length} color={`${GOLD},0.7)`} />

                  {(finn?.wins ?? 0) > 0 && wonHeard > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <p className="font-karla" style={{
                        fontSize: '0.62rem', color: `${SEA},0.45)`, margin: 0,
                      }}>What winning has got out of him: {wonHeard} of {FINN_WIN_BEATS.length}</p>
                      <Bar at={wonHeard} of={FINN_WIN_BEATS.length} color={`${GOLD},0.45)`} />
                    </div>
                  )}

                  <p className="font-karla" style={{
                    fontSize: '0.66rem', color: `${SEA},0.42)`, margin: '10px 0 0', lineHeight: 1.45,
                  }}>
                    {rivalNext === null
                      ? 'There is no higher opinion of you to be had.'
                      : `${rivalNext} more before he thinks better of you. A meeting counts once, a wager won counts twice.`}
                  </p>

                  {finn?.challenge && (
                    <p className="font-karla font-700" style={{
                      fontSize: '0.7rem', margin: '8px 0 0', color: '#ffd986',
                    }}>A wager of his is running.</p>
                  )}
                </motion.div>
              )}
            </Section>

            {/* ── THE NAMED FOLK. Permanent, always in the same water, worth
                knowing about before you sail out to them. */}
            <Section title={met.length > 0 ? `Known to you (${met.length})` : 'Known to you'}>
              {met.length === 0 ? (
                <p className="font-karla" style={{
                  fontSize: '0.76rem', color: `${SEA},0.55)`, lineHeight: 1.5,
                  padding: '0.5rem 0', margin: 0,
                }}>
                  Nobody yet. There are folk out there who keep to the same water year in and
                  year out. Pull alongside one and say something, and they will turn up here.
                </p>
              ) : (
                // AUTO-FILL rather than a fixed three: at the house width a
                // desktop fits four across and a narrow phone drops to three,
                // without either being written down as a breakpoint.
                <div style={{
                  display: 'grid', gap: 8,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                }}>
                  {met.map(({ folk, rap }) => (
                    <FolkCard key={folk.id} folk={folk} rap={rap}
                      onOpen={() => setOpenFolk(folk.id)} />
                  ))}
                </div>
              )}
            </Section>

            <p className="font-karla" style={{
              fontSize: '0.68rem', margin: '0.7rem 0 0', color: `${SEA},0.45)`, lineHeight: 1.4,
            }}>
              Have a word once a day and they warm to you. The one fish each of them actually
              wants is worth five times that, and nothing is lost by staying away: there is no
              streak here and none of it fades.
            </p>

            {/* ── THE WANDERERS. Not a log: these people are different every
                day, so what the panel can honestly give is what the five kinds
                want when you pull alongside one. */}
            <Section title="Who else you might meet">
              {[
                ['Bait peddler', 'Sells bait well under shop price.'],
                ['Salter', 'Buys your whole hold on the spot.'],
                ['Deep tinker', 'Better bait, bigger discount, deep water only.'],
                ['An old hand', 'Wants nothing. Says one thing and means it.'],
                ['Blockade runner', 'Night and deep water. Carries rods no shop will stock.'],
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

            <p className="font-karla" style={{
              fontSize: '0.68rem', margin: '0.55rem 0 0', color: `${SEA},0.45)`, lineHeight: 1.4,
            }}>
              They are somewhere different every day, and there are only so many deals in a
              day to be had. Nobody is waiting for you in particular.
            </p>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
