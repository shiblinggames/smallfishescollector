'use client'

// ── TALKING TO THE RIVAL ────────────────────────────────────────────────────
//
// The regulars' scene, in his colours, with the campaign bolted into it.
//
// A SEPARATE COMPONENT FROM `fishing/FinnEncounter` on purpose. That one is
// still mounted by the old fishing screen, which is retired but not deleted,
// and rewriting it in place would have meant one component serving two very
// different surfaces. This is the sea's, and it follows the sea's convention:
// no painted backdrop, the chart dimmed behind, house modal width, a fixed card
// that does not resize under your thumb, and replies you actually choose.
//
// ── THE CAMPAIGN LIVES IN THE MIDDLE OF IT ──────────────────────────────────
//
// He tells you something, then asks you for something, and the next thing he
// has to say is behind the work. So the card has a slot the regulars' does not:
// the job. Open, it shows the task and how far along you are. Finished, it
// turns gold and the only thing he wants is for you to hand it over.
//
// Asking him things is free and always available, exactly as with the regulars.
// The story is gated behind the work; the man is not.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { TypedBody, useTypewriter, prefersReducedMotion } from '@/components/cutscene'
import { vibrate } from '@/lib/haptics'
import {
  FINN_NAME, FINN_AVATAR, FINN_ASKS, FINN_STANDING_NAME, FINN_STANDING_AT,
  finnStanding, finnStandingTier, finnToNext,
} from '@/lib/finn'
import type { FinnSeaState, FinnQuestView } from './finnActions'

const GOLD = '#c8a060'

type Turn = { who: 'them' | 'you'; text: string }

/** His standing, in the same shape the regulars' rapport bar has, so the two
 *  read as one system with one of them wearing different colours. */
function StandingBar({ points }: { points: number }) {
  const tier = finnStandingTier(points)
  const floor = FINN_STANDING_AT[tier]
  const ceil = tier === 4 ? FINN_STANDING_AT[4] : FINN_STANDING_AT[tier + 1]
  const span = Math.max(1, ceil - floor)
  const pct = tier === 4 ? 100 : Math.min(100, ((points - floor) / span) * 100)
  const left = finnToNext(points)
  return (
    <div style={{ marginTop: 12, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.55rem', letterSpacing: '0.18em', color: GOLD, opacity: 0.85, margin: 0,
        }}>{FINN_STANDING_NAME[tier]}</p>
        <p className="font-karla" style={{
          fontSize: '0.6rem', color: 'rgba(226,238,246,0.42)', margin: 0,
        }}>{left === null ? 'As far as it goes' : `${left} to go`}</p>
      </div>
      <div style={{
        height: 5, borderRadius: 999, marginTop: 5, overflow: 'hidden',
        background: 'rgba(255,255,255,0.09)',
      }}>
        <motion.div
          initial={false} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height: '100%', borderRadius: 999,
            background: `linear-gradient(90deg, ${GOLD}99, ${GOLD})`,
            boxShadow: `0 0 10px ${GOLD}70`,
          }} />
      </div>
    </div>
  )
}

/** THE JOB. The one thing on this card the regulars have no equivalent of, and
 *  the reason the campaign now has a middle rather than only an end. */
function QuestSlot({ quest }: { quest: FinnQuestView }) {
  const pct = Math.min(100, Math.round((quest.have / quest.target) * 100))
  return (
    <div style={{
      marginTop: 10, flexShrink: 0,
      padding: '0.6rem 0.7rem', borderRadius: 11,
      background: quest.done ? 'rgba(60,44,10,0.75)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${quest.done ? 'rgba(240,192,64,0.6)' : 'rgba(255,255,255,0.14)'}`,
      boxShadow: quest.done ? '0 0 18px rgba(240,192,64,0.18)' : 'none',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.5rem', letterSpacing: '0.18em', margin: 0,
          color: quest.done ? '#ffd986' : 'rgba(226,238,246,0.45)',
        }}>{quest.done ? 'Done. Hand it over' : 'He asked you for'}</p>
        <p className="font-cinzel font-700" style={{
          fontSize: '0.78rem', margin: 0, color: '#f0c040',
        }}>{quest.reward.toLocaleString()} ⟡</p>
      </div>
      <p className="font-karla font-600" style={{
        fontSize: '0.86rem', margin: '3px 0 0', color: '#f0ede8', lineHeight: 1.3,
      }}>{quest.label}</p>
      <div style={{
        height: 4, borderRadius: 999, marginTop: 7, overflow: 'hidden',
        background: 'rgba(255,255,255,0.08)',
      }}>
        <motion.div
          initial={false} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height: '100%', borderRadius: 999,
            background: quest.done ? '#f0c040' : 'rgba(226,238,246,0.5)',
          }} />
      </div>
      <p className="font-karla" style={{
        fontSize: '0.64rem', margin: '4px 0 0', color: 'rgba(226,238,246,0.45)',
      }}>{quest.progressText}</p>
    </div>
  )
}

function Choice({ label, hint, warm, onClick, disabled }: {
  label: string; hint?: string; warm?: boolean
  onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="font-karla font-600"
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '0.55rem 0.7rem', marginTop: 6, borderRadius: 10,
        background: warm ? 'rgba(200,168,80,0.2)' : 'rgba(255,255,255,0.045)',
        border: `1px solid ${warm ? 'rgba(200,168,80,0.6)' : 'rgba(255,255,255,0.13)'}`,
        color: warm ? '#f4ecd8' : '#cfe0ec',
        fontSize: '0.86rem', lineHeight: 1.35,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}>
      {label}
      {hint && (
        <span className="font-karla" style={{
          display: 'block', fontSize: '0.66rem', color: 'rgba(226,238,246,0.4)', marginTop: 2,
        }}>{hint}</span>
      )}
    </button>
  )
}

export default function FinnTalk({
  finn, open, incoming, busy, onSpeak, onTurnIn, onClose,
}: {
  finn: FinnSeaState | null
  open: boolean
  /** Lines the server just returned, appended when `nonce` changes so a
   *  resolve continues the conversation rather than replacing the card. */
  incoming: { lines: string[]; nonce: number } | null
  busy: boolean
  onSpeak: () => void
  onTurnIn: () => void
  onClose: () => void
}) {
  const reduced = useMemo(prefersReducedMotion, [])
  const [turns, setTurns] = useState<Turn[]>([])
  const [queue, setQueue] = useState<string[]>([])
  const [asked, setAsked] = useState<Set<number>>(new Set())

  const points = finnStanding(finn?.encounters ?? 0, finn?.wins ?? 0)
  const tier = finnStandingTier(points)
  const asks = FINN_ASKS[tier] ?? []
  const openAsks = asks.map((a, i) => ({ a, i })).filter(({ i }) => !asked.has(i))

  // A fresh visit opens on where things stand rather than a greeting, because
  // the first thing a captain wants to know is whether he is waiting on them.
  useEffect(() => {
    if (!open) return
    const q = finn?.quest
    setTurns([{
      who: 'them',
      text: q
        ? (q.done ? "You have got it. Go on then, hand it over." : "Still working, are you. Good.")
        : "Well. You found me.",
    }])
    setQueue([])
    setAsked(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Server lines arrive as a QUEUE, because his beats are several lines long
  // and they should land one at a time the way they always have.
  useEffect(() => {
    if (!incoming || incoming.lines.length === 0) return
    const [first, ...rest] = incoming.lines
    setTurns(t => [...t, { who: 'them', text: first }])
    setQueue(rest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming?.nonce])

  const last = turns[turns.length - 1] ?? { who: 'them' as const, text: '' }
  const { shown, typing, finish } = useTypewriter(
    last.who === 'them' ? last.text : '', `${turns.length}:${last.text}`, { reduced },
  )
  const finishRef = useRef<() => void>(() => {})
  finishRef.current = finish

  if (!finn) return null

  const quest = finn.quest
  const more = queue.length > 0

  function advanceQueue() {
    if (!more) return
    const [next, ...rest] = queue
    setTurns(t => [...t, { who: 'them', text: next }])
    setQueue(rest)
  }

  function tapBody() {
    if (typing) { finishRef.current(); return }
    if (more) advanceQueue()
  }

  const choicesHidden = typing || more

  return (
    <AnimatePresence>
      {open && (
        <motion.div
            key="finn-dim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => { if (typing || more) tapBody(); else onClose() }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9300,
              background: 'rgba(4,8,14,0.72)',
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
              cursor: 'pointer',
              // THE CARD LIVES INSIDE THE BACKDROP so one flex box does the
              // centring and the bottom padding carries the tab bar's room.
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1rem 1rem calc(1rem + var(--tabbar-safe, 0px))',
            }}>

          <motion.div
            key="finn-card"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={e => e.stopPropagation()}
            style={{
              // CENTRED BY LAYOUT, NEVER BY TRANSFORM.
              //
              // This was `top: 50%` with `transform: translateY(-50%)` on a
              // motion.div — and framer-motion writes `transform` for its own y
              // and scale, so the centring half of that was silently thrown
              // away on the first frame. The card was simply pinned at the
              // halfway mark and hung off the bottom of the screen, which is
              // why the choices were under the nav bar and why nudging the
              // margins only ever moved the problem around.
              //
              // The parent is a flex box that already reserves the tab bar, so
              // the card just says how big it may be and lets that box place
              // it. `100%` of the padded parent rather than a dvh sum, because
              // two independent height calculations are two things that can
              // disagree.
              maxWidth: 480, width: '100%',
              height: 560, maxHeight: '100%',
              display: 'flex', flexDirection: 'column',
              // THE SAME SLAB AS THE PANEL THIS OPENED FROM. TraderPanel's
              // card is a flat near-black; this was a blue gradient that ran
              // lighter at the top, so stepping from "speak to them" into the
              // conversation changed screens rather than continued one. The
              // accent stays in the border and the glow, where it names who
              // you are talking to without repainting the surface.
              background: 'rgba(10,16,22,0.98)',
              border: `1px solid ${GOLD}52`,
              borderTop: `1px solid ${GOLD}`,
              borderRadius: 18, padding: '1rem 1rem 0.9rem',
              boxShadow: `0 18px 50px rgba(0,0,0,0.6), 0 0 34px ${GOLD}1f`,
              overflow: 'hidden',
            }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: '0.7rem', flexShrink: 0 }}>
              <div style={{
                transform: FINN_AVATAR.mirrored ? 'scaleX(-1)' : 'none',
                flexShrink: 0, borderRadius: '50%',
                boxShadow: `0 0 18px ${GOLD}45`,
              }}>
                <CharacterAvatar
                  characterColor={FINN_AVATAR.characterColor}
                  equippedHat={FINN_AVATAR.equippedHat}
                  bgColor={FINN_AVATAR.bgColor}
                  ringColor={FINN_AVATAR.borderColor}
                  size={58}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.53rem', color: GOLD, letterSpacing: '0.2em', marginBottom: 2,
                }}>Rival</p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1,
                }}>{FINN_NAME}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close"
                style={{
                  width: 26, height: 26, borderRadius: '50%', padding: 0, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)',
                  color: '#cfcabf', cursor: 'pointer',
                }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {turns.length > 1 && turns[turns.length - 2]?.who === 'you' && (
              <p className="font-karla" style={{
                fontSize: '0.78rem', color: 'rgba(180,214,232,0.45)',
                margin: '0 0 7px', paddingLeft: 10, flexShrink: 0,
                borderLeft: '2px solid rgba(180,214,232,0.2)', lineHeight: 1.4,
              }}>You: {turns[turns.length - 2].text}</p>
            )}

            <div style={{ height: 112, flexShrink: 0, overflowY: 'auto', touchAction: 'pan-y' }} onClick={tapBody}>
              <TypedBody all={[last.text]} text={last.text}
                shown={last.who === 'them' ? shown : last.text.length}
                typing={last.who === 'them' ? typing : false}
                accent={GOLD} quoted size="1rem" />
            </div>

            {more && (
              <p className="font-karla font-400 uppercase" style={{
                fontSize: '0.55rem', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.3)',
                textAlign: 'center', margin: '4px 0 0', flexShrink: 0,
              }}>{typing ? 'tap to skip' : 'tap to go on'}</p>
            )}

            <StandingBar points={points} />
            {quest && <QuestSlot quest={quest} />}

            {!choicesHidden && (
              <motion.div
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: 'auto', touchAction: 'pan-y' }}>

                {/* HANDING IT BACK is the campaign's only forward gear, so when
                    it is available it is the loudest thing on the card. */}
                {quest?.done && (
                  <Choice
                    label="Here. Done."
                    hint={`He owes you ${quest.reward.toLocaleString()} ⟡ and the next piece of it`}
                    warm disabled={busy}
                    onClick={() => { vibrate([0, 30, 50, 70]); onTurnIn() }} />
                )}

                {/* No job outstanding: there is a beat waiting behind a word. */}
                {!quest && (
                  <Choice
                    label="What have you got for me?"
                    hint={busy ? undefined : 'He has something to say, and something to ask'}
                    warm disabled={busy}
                    onClick={() => { vibrate(10); onSpeak() }} />
                )}

                {/* Mid-job, a word is still worth having: he says where you are
                    and it still counts as a meeting. */}
                {quest && !quest.done && (
                  <Choice label="How am I doing?" disabled={busy}
                    onClick={() => { vibrate(8); onSpeak() }} />
                )}

                {openAsks.map(({ a, i }) => (
                  <Choice key={i} label={a.you} disabled={busy}
                    onClick={() => {
                      vibrate(6)
                      setAsked(x => new Set(x).add(i))
                      setTurns(t => [...t, { who: 'you', text: a.you }, { who: 'them', text: a.they }])
                    }} />
                ))}

                <Choice label="I should get back to it." onClick={onClose} />
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
