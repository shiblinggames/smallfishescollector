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

import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import {
  FINN_NAME, FINN_AVATAR, FINN_ENCOUNTER_BEATS, FINN_WIN_BEATS,
  findNextEncounterBeat,
} from '@/lib/finn'
import { RESIDENTS, YOON, PLACES } from './chart'
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

/** One named, permanent person. Locked ones keep their name back: the water is
 *  the thing you have not reached, so the water is what it tells you. */
function FolkRow({ name, water, what, locked, need }: {
  name: string; water: string; what: string; locked: boolean; need: number
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8, padding: '0.42rem 0',
      borderTop: `1px solid ${SEA},0.1)`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.9rem', margin: 0,
          color: locked ? `${SEA},0.35)` : '#e8f2ea',
        }}>{locked ? 'Someone out there' : name}</p>
        <p className="font-karla" style={{
          fontSize: '0.7rem', margin: '1px 0 0', color: `${SEA},0.62)`,
        }}>
          {locked ? `${water}. Fishing ${need} to work that water.` : `${water}. ${what}`}
        </p>
      </div>
    </div>
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
  const seen = new Set(finn?.seenBeats ?? [])
  const heard = FINN_ENCOUNTER_BEATS.filter(b => seen.has(b.id)).length
  const wonHeard = FINN_WIN_BEATS.filter(b => seen.has(b.id)).length
  const more = findNextEncounterBeat(finn?.seenBeats ?? []) !== null

  const waterOf = (zoneId: string) => PLACES.find(p => p.id === zoneId)
  const needFor = (zoneId: string) => waterOf(zoneId)?.minLevel ?? 1
  const nameOf = (zoneId: string) => waterOf(zoneId)?.name ?? 'Open water'

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
              width: 'min(100%, 420px)', maxHeight: '82vh', overflowY: 'auto',
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

            {/* ── FINN. The reason the button exists, so he gets the top of the
                panel, the gold, and the only progress bars. */}
            <div style={{
              marginTop: '0.7rem', padding: '0.7rem 0.8rem', borderRadius: 12,
              background: 'rgba(28,22,8,0.72)',
              border: `1px solid ${GOLD},${more ? 0.5 : 0.26})`,
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <CharacterAvatar
                  characterColor={FINN_AVATAR.characterColor}
                  equippedHat={FINN_AVATAR.equippedHat}
                  size={38}
                  bgColor={FINN_AVATAR.bgColor}
                  ringColor={FINN_AVATAR.borderColor}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-cinzel font-700" style={{
                    fontSize: '1.02rem', margin: 0, color: '#f4e2c0',
                  }}>{FINN_NAME}</p>
                  <p className="font-karla" style={{
                    fontSize: '0.72rem', margin: '1px 0 0', color: `${GOLD},0.8)`,
                  }}>
                    Met {finn?.encounters ?? 0} {(finn?.encounters ?? 0) === 1 ? 'time' : 'times'}
                  </p>
                </div>
              </div>

              {/* WHAT THE COUNTER IS FOR. Every meeting hands over the next
                  piece of his story, and this is the only place that says so. */}
              <div style={{ marginTop: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <p className="font-karla font-700" style={{
                    fontSize: '0.7rem', margin: 0, color: 'rgba(244,226,192,0.9)',
                  }}>His story</p>
                  <p className="font-karla" style={{
                    fontSize: '0.7rem', margin: 0, color: `${GOLD},0.75)`,
                  }}>{heard} of {FINN_ENCOUNTER_BEATS.length}</p>
                </div>
                <Bar at={heard} of={FINN_ENCOUNTER_BEATS.length} color={`${GOLD},0.7)`} />
              </div>

              {(finn?.wins ?? 0) > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <p className="font-karla font-700" style={{
                      fontSize: '0.7rem', margin: 0, color: 'rgba(244,226,192,0.9)',
                    }}>Wagers won</p>
                    <p className="font-karla" style={{
                      fontSize: '0.7rem', margin: 0, color: `${GOLD},0.75)`,
                    }}>{finn?.wins ?? 0}</p>
                  </div>
                  {wonHeard > 0 && (
                    <Bar at={wonHeard} of={FINN_WIN_BEATS.length} color={`${GOLD},0.45)`} />
                  )}
                </div>
              )}

              <p className="font-karla" style={{
                fontSize: '0.74rem', margin: '0.6rem 0 0', lineHeight: 1.45,
                color: more ? 'rgba(244,226,192,0.92)' : `${SEA},0.6)`,
              }}>
                {!finn
                  ? 'Somewhere on this sea, and in no hurry to be found.'
                  : more
                    ? `He has more to say, and he only says it face to face. Last seen out in ${finn.at.bandName}. Follow the compass and go and find him.`
                    : 'You have heard everything he will tell you for now. He is still out there, and he still wants your coin.'}
              </p>

              {finn?.challenge && (
                <p className="font-karla font-700" style={{
                  fontSize: '0.7rem', margin: '0.45rem 0 0', color: '#ffd986',
                }}>A wager of his is running.</p>
              )}
            </div>

            {/* ── THE NAMED FOLK. Permanent, always in the same water, worth
                knowing about before you sail out to them. */}
            <Section title="Always out there">
              <FolkRow
                name={RESIDENTS[0].name} water={nameOf('shallows')}
                what={`Buys your hold at ${Math.round(RESIDENTS[0].rate * 100)}% of market.`}
                locked={level < needFor('shallows')} need={needFor('shallows')} />
              {RESIDENTS.slice(1).map(r => (
                <FolkRow key={r.zoneId}
                  name={r.name} water={nameOf(r.zoneId)}
                  what={`Buys your hold at ${Math.round(r.rate * 100)}% of market.`}
                  locked={level < needFor(r.zoneId)} need={needFor(r.zoneId)} />
              ))}
              <FolkRow
                name={YOON.name} water={nameOf(YOON.zoneId)}
                what="Carries one rod, and it is not sold anywhere else."
                locked={level < needFor(YOON.zoneId)} need={needFor(YOON.zoneId)} />
            </Section>

            <p className="font-karla" style={{
              fontSize: '0.68rem', margin: '0.5rem 0 0', color: `${SEA},0.45)`, lineHeight: 1.4,
            }}>
              Buyers pay less than the market ashore and pay it where you are floating. The
              deeper the water, the better their rate, because the row home is longer.
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
