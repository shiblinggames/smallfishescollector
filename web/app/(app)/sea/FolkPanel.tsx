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

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { vibrate } from '@/lib/haptics'
import {
  FINN_NAME, FINN_AVATAR, FINN_ENCOUNTER_BEATS, FINN_WIN_BEATS,
  findNextEncounterBeat, finnStanding, finnStandingTier, finnToNext,
  FINN_STANDING_NAME, FINN_STANDING_AT,
} from '@/lib/finn'
import { PLACES } from './chart'
import { getCharacterSprites } from '@/lib/characters'
import { HATS } from '@/lib/hats'
import { FOLK, TIER_NAME, TIER_AT, toNextTier, knowsFavourite, GIFT_FAVOURITE_POINTS, type Folk } from '@/lib/seaFolk'
import { folkState, type Rapport } from './folkActions'
import { finnState } from './finnActions'
import { finnChapters, finnWaitingOn, type FinnChapterView } from '@/lib/finnQuests'
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

/**
 * SOMEBODY OUT THERE YOU HAVE NOT MET.
 *
 * The roster was met-only for a while, on the reasoning that a list of
 * strangers is homework. That was true when it was a list; as CARDS it reads
 * the opposite way, because an empty slot in a set is an invitation rather than
 * a chore. The difference is entirely in the shape.
 *
 * It gives away the WATER and nothing else. That is the honest middle: it tells
 * you somebody is out there and roughly where to start looking, which is a
 * reason to sail, without handing over the name or the face, which are the
 * things worth finding.
 */
function UnknownCard({ water }: { water: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '0.7rem 0.5rem 0.6rem', borderRadius: 14,
      background: 'rgba(255,255,255,0.018)',
      border: `1px dashed ${SEA},0.18)`,
    }}>
      <div style={{
        width: 62, height: 62, borderRadius: '50%',
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${SEA},0.14)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="font-cinzel font-700" style={{
          fontSize: '1.5rem', color: `${SEA},0.3)`, lineHeight: 1,
        }}>?</span>
      </div>
      <p className="font-cinzel font-700" style={{
        fontSize: '0.82rem', color: `${SEA},0.32)`, margin: '7px 0 0',
        textAlign: 'center', lineHeight: 1.15,
      }}>???</p>
      <p className="font-karla font-700 uppercase" style={{
        fontSize: '0.5rem', letterSpacing: '0.14em', color: `${SEA},0.28)`,
        margin: '3px 0 0', textAlign: 'center',
      }}>{water}</p>
      <div style={{ width: '100%', height: 3, marginTop: 6 }} />
    </div>
  )
}

/**
 * ONE ACT OF THE FISHING CAMPAIGN.
 *
 * The raid map has had chapters since Chapter I and the fishing story never
 * did, which is most of why this panel read as a list of people rather than as
 * the other half of the game. Same idea, same shape: a numbered act, a title, a
 * line under it, and how far through you are.
 *
 * THE LOCKED STATE IS THE IMPORTANT ONE. Each act after the first opens on
 * water with a level gate, so the campaign genuinely halts until you are rated
 * for the next band. Shown as a chapter that has not started yet, that is a
 * story waiting for you. Shown as a job you cannot do, it is a bug. The fact is
 * identical and the framing is the whole difference.
 */
function ChapterRow({ view }: { view: FinnChapterView }) {
  const { chapter, done, total, complete, current, open } = view
  const accent = complete ? 'rgba(150,182,164' : current ? 'rgba(240,192,64' : SEA
  const alpha = open ? 1 : 0.45
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      padding: '0.5rem 0.6rem', borderRadius: 11, marginBottom: 5,
      background: current ? 'rgba(240,192,64,0.08)' : 'rgba(255,255,255,0.022)',
      border: `1px ${open ? 'solid' : 'dashed'} ${accent},${current ? 0.4 : 0.14})`,
      opacity: alpha,
    }}>
      <p className="font-cinzel font-700" style={{
        fontSize: '0.86rem', color: `${accent},0.9)`, margin: 0,
        width: 22, flexShrink: 0, textAlign: 'center',
      }}>{chapter.romanNumeral}</p>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <p className="font-cinzel font-700" style={{
            fontSize: '0.88rem', color: open ? '#f0ede8' : `${SEA},0.5)`, margin: 0,
          }}>{chapter.title}</p>
          <p className="font-karla font-700" style={{
            fontSize: '0.62rem', margin: 0, flexShrink: 0,
            color: complete ? 'rgba(150,182,164,0.9)' : `${SEA},0.45)`,
          }}>
            {complete ? 'Done' : open ? `${done} of ${total}` : `Fishing ${chapter.minLevel}`}
          </p>
        </div>
        {/* The blurb only for acts you have reached. An unopened chapter gets
            its title and its level and nothing else, because the line under it
            is written for somebody who has been there. */}
        {open && (
          <p className="font-karla" style={{
            fontSize: '0.68rem', color: `${SEA},0.52)`, margin: '2px 0 0', lineHeight: 1.4,
          }}>{chapter.subtitle}</p>
        )}
        {open && total > 0 && (
          <div style={{
            height: 3, borderRadius: 999, marginTop: 5,
            background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.round((done / total) * 100)}%`, height: '100%',
              background: `${accent},0.8)`, borderRadius: 999,
            }} />
          </div>
        )}
      </div>
    </div>
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
        {/* Shown once they have SAID it, not at a tier. The reveal and the
            telling are the same event now. */}
        {knowsFavourite(folk, rap.seenLines) ? (
          <>
            <p className="font-cinzel font-700" style={{
              fontSize: '1rem', color: folk.accent, margin: '4px 0 0',
            }}>{folk.favourite.name}</p>
            <p className="font-karla" style={{
              fontSize: '0.7rem', color: `${SEA},0.55)`, margin: '3px 0 0',
            }}>Worth {GIFT_FAVOURITE_POINTS}. Any other fish is worth one.</p>
          </>
        ) : (
          <p className="font-karla" style={{
            fontSize: '0.74rem', color: `${SEA},0.45)`, margin: '4px 0 0', lineHeight: 1.45,
          }}>
            They have not mentioned it. Keep talking, or watch what they do when
            you offer them something out of your hold.
          </p>
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
function RivalDetail({ finn, chapters, onBack }: {
  finn: FinnSeaState | null
  chapters: FinnChapterView[]
  onBack: () => void
}) {
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

      {/* The act he is currently walking you through, named, so his page and
          the campaign strip on the front agree about where you are. */}
      {/* THE WHOLE LADDER lives here now rather than on the front, where it
          buried the one thing a captain actually needed. Five acts deep, the
          way the raid map shows its chapters. */}
      <div style={{ marginTop: '0.9rem' }}>
        {chapters.map(v => <ChapterRow key={v.chapter.id} view={v} />)}
      </div>

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

/**
 * ── THE FACES ARE FETCHED BEFORE ANYBODY ASKS FOR THEM ──────────────────────
 *
 * Every avatar on this panel was popping in a beat after it opened, every time.
 * Two reasons, and the second is the real one.
 *
 * CharacterAvatar renders its sprites with `loading="lazy"`, which is right
 * almost everywhere it is used (leaderboards, crew lists, long rosters) and
 * exactly wrong here: a modal you deliberately opened is not somewhere the
 * browser should be deferring work. And the panel's contents unmount when it
 * closes, so every open re-created ten avatars and the lazy loader re-evaluated
 * all of them from scratch.
 *
 * The cast is FIXED and TINY: nine regulars plus the rival, one body sprite and
 * one hat each. So they are warmed once, on mount, long before the button is
 * ever pressed. `decode()` rather than `onload` because a load event only means
 * the bytes arrived, and what matters here is that the bitmap is ready to
 * PAINT. After that the browser has them and the lazy attribute costs nothing.
 *
 * This runs on the sea page whether or not anybody opens the panel, which is
 * the trade: about twenty small PNGs fetched once per session, against a
 * visible stutter every single time the panel is opened.
 */
function warmFaces() {
  const urls = new Set<string>()
  for (const f of [...FOLK.map(x => x.face), FINN_FACE]) {
    urls.add(getCharacterSprites(f.characterColor).rest)
    const hat = HATS.find(h => h.id === f.hat)
    if (hat?.restImageUrl) urls.add(hat.restImageUrl)
  }
  for (const src of urls) {
    const img = new Image()
    img.src = src
    if (typeof img.decode === 'function') void img.decode().catch(() => {})
  }
}

export default function FolkPanel({ open, onClose, finn: finnProp }: {
  open: boolean
  onClose: () => void
  finn: FinnSeaState | null
}) {
  /**
   * ── READ IT FRESH ON EVERY OPEN ────────────────────────────────────────
   *
   * The rival's state arrived as a prop from the map, which is loaded once when
   * the chart mounts and refreshed only when you actually speak to him. So a
   * captain who took a job, went and caught eight fish, and opened this panel
   * saw the progress it had when they last stood in front of him: zero. The
   * numbers were real, they were just old.
   *
   * The prop stays as the immediate value so the panel never opens blank, and a
   * live read lands over it. Job progress is computed server-side from counters
   * the cast path maintains, so this is genuinely current rather than a cache.
   */
  const [finnLive, setFinnLive] = useState<FinnSeaState | null>(null)
  const finn = finnLive ?? finnProp
  useEffect(() => {
    if (!open) return
    let alive = true
    void finnState().then(f => { if (alive && f) setFinnLive(f) })
    return () => { alive = false }
  }, [open])

  // Once per mount of the sea, not once per open.
  useEffect(() => { warmFaces() }, [])

  const [rap, setRap] = useState<Rapport[]>([])
  const [showing, setShowing] = useState<string | null>(null)

  /**
   * Standings are loaded ON MOUNT and refreshed whenever the panel opens. The
   * refresh matters (a chat out on the water changes them), but loading only on
   * open meant the very first open had no cards at all until a server round
   * trip came home. Mounting warm costs one read per session.
   */
  useEffect(() => {
    let alive = true
    void folkState().then(rows => { if (alive) setRap(rows) })
    return () => { alive = false }
  }, [open])

  useEffect(() => { if (!open) setShowing(null) }, [open])

  const met = FOLK
    .map(folk => ({ folk, rap: rap.find(r => r.folkId === folk.id) }))
    .filter((x): x is { folk: Folk; rap: Rapport } => !!x.rap && x.rap.points > 0)

  /** Everybody still out there, in the cast's own order so the grid does not
   *  reshuffle as they are found. */
  const unmet = FOLK.filter(f => !met.some(m => m.folk.id === f.id))

  const openFolk = met.find(m => m.folk.id === showing) ?? null
  const openRival = showing === 'finn'

  const finnMore = !!finn && (finn.questReady || findNextEncounterBeat(finn.seenBeats) !== null)
  const finnQuest = finn?.quest ?? null
  const chapters = finnChapters(finn?.questsDone ?? [], finn?.fishingLevel ?? 1)
  const here = chapters.find(c => c.current) ?? null
  /** Everything reachable is done and the next act wants a level you have not
   *  got. Distinct from finishing the campaign, and it has to say so. */
  const waitingOn = finnWaitingOn(finn?.questsDone ?? [], finn?.fishingLevel ?? 1)

  /**
   * ── NO TURN AT ALL ──────────────────────────────────────────────────────
   *
   * There was a card flip here, in two versions. The first stuttered, because
   * it ran three phases across two elements while the panel resized underneath
   * them. The second was smooth and was simply annoying, which is the more
   * useful verdict of the two: a panel you open to check on nine people is
   * somewhere you move around quickly, and an animation between every face
   * taxes the exact thing the panel is for.
   *
   * So the faces just swap. A 120ms fade on the one arriving, nothing on the
   * one leaving, no perspective and no rotation. The floor height stays,
   * because stopping the panel jumping between a tall grid and a short detail
   * was always a layout problem rather than an animation one.
   */

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
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // The bottom padding carries the mobile tab bar's room, so a tall
            // panel centres in the space that is actually visible instead of
            // running its last rows under the nav.
            padding: '1rem 1rem calc(1rem + var(--tabbar-safe, 0px))',
          }}>
          <motion.div
            initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480, overflowY: 'auto',
              // 100% OF THE PADDED PARENT, not a dvh sum of its own. The
              // container already subtracts its padding and the tab bar; doing
              // the arithmetic again here meant two numbers that could
              // disagree, and on a phone they did — the panel came out taller
              // than the space it was being centred in, so it overflowed
              // upward and lost its title off the top of the screen.
              maxHeight: '100%',
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

            <div style={{ minHeight: 340 }}>
              {openRival ? (
                <motion.div key="rival"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.12 }}
                  style={{ paddingTop: '0.9rem' }}>
                  <RivalDetail finn={finn} chapters={chapters}
                    onBack={() => { vibrate(6); setShowing(null) }} />
                </motion.div>
              ) : openFolk ? (
                <motion.div key={`folk:${openFolk.folk.id}`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.12 }}
                  style={{ paddingTop: '0.9rem' }}>
                  <FolkDetail folk={openFolk.folk} rap={openFolk.rap}
                    onBack={() => { vibrate(6); setShowing(null) }} />
                </motion.div>
              ) : (
                <motion.div key="grid"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ duration: 0.12 }}>

                    {/* ── ONE ROW: HIS FACE, AND WHAT HE WANTS ──────────
                        The card, the act and the job were three stacked boxes
                        saying one thing between them. They are one row now:
                        his portrait on the left, the chapter and the job beside
                        it. Tapping anywhere on it opens his page.

                        No "of 5" on the chapter and no "3 of 6" on the jobs.
                        Both were answering how much is left, which is a
                        question for his page; the front is for what you are
                        doing next, and a denominator on a story reads like a
                        checklist. */}
                    <Section title="The Fishing Campaign">
                      <button
                        onClick={() => { vibrate(6); setShowing('finn') }}
                        style={{
                          display: 'flex', gap: 11, alignItems: 'center', width: '100%',
                          textAlign: 'left', cursor: 'pointer',
                          padding: '0.7rem 0.8rem', borderRadius: 14,
                          background: finnQuest?.done
                            ? 'linear-gradient(180deg, rgba(96,72,14,0.85) 0%, rgba(44,32,6,0.9) 100%)'
                            : `linear-gradient(180deg, ${GOLD}14 0%, rgba(255,255,255,0.02) 70%)`,
                          border: `1px solid ${finnQuest?.done ? 'rgba(240,192,64,0.7)' : `${GOLD}3d`}`,
                          boxShadow: finnQuest?.done ? '0 0 20px rgba(240,192,64,0.2)' : 'none',
                          position: 'relative',
                        }}>
                        {finnMore && !finnQuest?.done && (
                          <span aria-hidden style={{
                            position: 'absolute', top: 8, right: 9,
                            width: 8, height: 8, borderRadius: 999,
                            background: GOLD, boxShadow: `0 0 8px ${GOLD}`,
                          }} />
                        )}

                        <div style={{
                          transform: FINN_FACE.mirrored ? 'scaleX(-1)' : 'none',
                          flexShrink: 0, borderRadius: '50%',
                          boxShadow: `0 0 16px ${GOLD}30`,
                        }}>
                          <CharacterAvatar
                            characterColor={FINN_FACE.characterColor}
                            equippedHat={FINN_FACE.hat}
                            bgColor={FINN_FACE.bg}
                            ringColor={FINN_FACE.ring}
                            size={58}
                          />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-karla font-700 uppercase" style={{
                            fontSize: '0.5rem', letterSpacing: '0.18em', color: GOLD, margin: 0,
                          }}>{FINN_NAME}</p>
                          <p className="font-cinzel font-700" style={{
                            fontSize: '0.98rem', color: '#f4e2c0', margin: '1px 0 0', lineHeight: 1.15,
                          }}>
                            {here ? here.chapter.title
                              : waitingOn ? waitingOn.title
                                : 'The story is told'}
                          </p>

                          {finnQuest ? (
                            <>
                              <p className="font-karla font-600" style={{
                                fontSize: '0.78rem', margin: '5px 0 0', lineHeight: 1.3,
                                color: finnQuest.done ? '#ffd986' : 'rgba(240,237,232,0.9)',
                              }}>
                                {finnQuest.done
                                  ? 'Done. Go back to Finn and hand it over.'
                                  : finnQuest.label}
                              </p>
                              {!finnQuest.done && (
                                <>
                                  <Bar at={finnQuest.have} of={finnQuest.target}
                                    color="rgba(226,238,246,0.5)" />
                                  <p className="font-karla" style={{
                                    fontSize: '0.62rem', margin: '3px 0 0', color: `${SEA},0.45)`,
                                  }}>{finnQuest.progressText}</p>
                                </>
                              )}
                            </>
                          ) : waitingOn ? (
                            <p className="font-karla" style={{
                              fontSize: '0.72rem', color: GOLD, margin: '5px 0 0', lineHeight: 1.4,
                            }}>Opens at Fishing {waitingOn.minLevel}.</p>
                          ) : (
                            <p className="font-karla" style={{
                              fontSize: '0.72rem', color: `${SEA},0.5)`, margin: '5px 0 0', lineHeight: 1.4,
                            }}>He has not asked you for anything. Go and see what he wants.</p>
                          )}
                        </div>
                      </button>
                    </Section>

                    {met.length > 0 && (
                      <Section title={`Known to you (${met.length})`}>
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
                      </Section>
                    )}

                    {/* The set, minus what you have found. A card moves out of
                        here and into the section above the moment you say
                        something to them, which is the only reward this panel
                        has to give and the reason the empty slots are worth
                        showing at all. Gone entirely once nobody is left. */}
                    {unmet.length > 0 && (
                      <Section title={`Still out there (${unmet.length})`}>
                        <div style={{
                          display: 'grid', gap: 8,
                          gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                        }}>
                          {unmet.map(folk => (
                            <UnknownCard key={folk.id}
                              water={PLACES.find(w => w.id === folk.zoneId)?.name ?? 'Open water'} />
                          ))}
                        </div>
                      </Section>
                    )}

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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
