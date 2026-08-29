'use client'

// ── TALKING TO ONE OF THE REGULARS ──────────────────────────────────────────
//
// ONE SURFACE. The first cut of this stacked three: the hail panel, a scene
// overlay with its own painted backdrop, and then the gift list back in the
// panel behind it. Sailing up to somebody and saying hello opened and closed
// three different things, which is the opposite of the seamlessness it was
// reaching for. Everything now happens on this card and nothing else opens.
//
// NO PAINTED BACKDROP EITHER. The expedition cutscenes drop you somewhere
// else on purpose, because a cutscene is a cut AWAY. This is not that: you are
// alongside their boat on the water you sailed to, and covering that with a
// picture of a dock is a worse lie the better the picture is. What was wanted
// from "cinematic" was the TYPEWRITER and the portrait, so that is what this
// keeps. Behind the card, the chart stays exactly where it was, dimmed.
//
// ── IT IS A CONVERSATION, NOT A NOTICE ──────────────────────────────────────
//
// They say something, and you can say something back. The replies mostly do
// not change what happens next, and that is fine: what they change is whether
// the exchange feels like two people talking or one person being read at.
//
// ASKING IS ALWAYS FREE. The daily gate is on the POINT, never on the talking,
// so somebody who has already had their word today can still pull alongside
// and get a real exchange out of it. A person who has nothing to say until
// tomorrow is a vending machine.

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import { TypedBody, useTypewriter, prefersReducedMotion } from '@/components/cutscene'
import { vibrate } from '@/lib/haptics'
import { TIER_NAME, TIER_AT, tierFor, ASKS, type Folk, type FolkTier } from '@/lib/seaFolk'

export type SceneGain = {
  points: number
  gained: number
  tier: FolkTier
  tierUp: string | null
  how?: 'loved' | 'plain'
}

/** Who is speaking. Their lines are typed; yours appear whole, because you
 *  already know what you said. */
type Turn = { who: 'them' | 'you'; text: string }

function RapportBar({ points, gained, accent }: {
  points: number; gained: number; accent: string
}) {
  const tier = tierFor(points)
  const floor = TIER_AT[tier]
  const ceil = tier === 4 ? TIER_AT[4] : TIER_AT[(tier + 1) as FolkTier]
  const span = Math.max(1, ceil - floor)
  const pct = tier === 4 ? 100 : Math.min(100, ((points - floor) / span) * 100)
  const was = tier === 4 ? 100 : Math.max(0, Math.min(100, ((points - gained - floor) / span) * 100))
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <p className="font-karla font-700 uppercase" style={{
          fontSize: '0.55rem', letterSpacing: '0.18em', color: accent, opacity: 0.85, margin: 0,
        }}>{TIER_NAME[tier]}</p>
        <div style={{ position: 'relative' }}>
          <p className="font-karla" style={{
            fontSize: '0.6rem', color: 'rgba(226,238,246,0.42)', margin: 0,
          }}>{tier === 4 ? 'As far as it goes' : `${ceil - points} to go`}</p>
          <AnimatePresence>
            {gained > 0 && (
              <motion.p
                key={`${points}:${gained}`}
                className="font-cinzel font-700"
                initial={{ opacity: 0, y: 4, scale: 0.8 }}
                animate={{ opacity: [0, 1, 1, 0], y: [-2, -14, -20, -30], scale: [0.9, 1.14, 1, 1] }}
                transition={{ duration: 1.5, times: [0, 0.18, 0.6, 1], ease: 'easeOut' }}
                style={{
                  position: 'absolute', right: 0, top: -2, margin: 0, whiteSpace: 'nowrap',
                  fontSize: '0.95rem', color: accent, pointerEvents: 'none',
                  textShadow: `0 0 14px ${accent}`,
                }}>+{gained}</motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div style={{
        height: 5, borderRadius: 999, marginTop: 5, overflow: 'hidden',
        background: 'rgba(255,255,255,0.09)',
      }}>
        <motion.div
          initial={{ width: `${was}%` }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
          style={{
            height: '100%', borderRadius: 999,
            background: `linear-gradient(90deg, ${accent}99, ${accent})`,
            boxShadow: `0 0 10px ${accent}70`,
          }} />
      </div>
    </div>
  )
}

/** One thing you can say or do. Same shape whether it continues the talk,
 *  spends the day's word, opens the hold or ends the visit. */
function Choice({ label, hint, accent, warm, onClick, disabled }: {
  label: string; hint?: string; accent: string; warm?: boolean
  onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="font-karla font-600"
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '0.55rem 0.7rem', marginTop: 6, borderRadius: 10,
        background: warm ? `${accent}1f` : 'rgba(255,255,255,0.045)',
        border: `1px solid ${warm ? accent + '5c' : 'rgba(255,255,255,0.13)'}`,
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

export default function FolkScene({
  folk, open, tier, points, opener, gain, resolved, canChat, canGift, knowsFav, hold, busy,
  onChat, onGift, onClose,
}: {
  folk: Folk | null
  open: boolean
  tier: FolkTier
  points: number
  /** What they say when the conversation opens. */
  opener: string
  /** Set on the beat a chat or gift lands, and cleared by the parent. */
  gain: SceneGain | null
  /** What they said in answer to a chat or a gift. Appended to the exchange
   *  when `nonce` changes, so a resolve CONTINUES the conversation rather than
   *  swapping the card out from under it. */
  resolved: { text: string; nonce: number } | null
  canChat: boolean
  canGift: boolean
  /** Have they actually told you what they like? Changes the picker from a
   *  hint into a statement. */
  knowsFav: boolean
  hold: { id: number; name: string; qty: number; habitat: string | null }[]
  busy: boolean
  onChat: () => void
  onGift: (fishId: number) => void
  onClose: () => void
}) {
  const reduced = useMemo(prefersReducedMotion, [])
  const accent = folk?.accent ?? '#f0c040'

  /** The exchange so far. Only the last turn is on screen; the rest is history
   *  that keeps the card from resetting as you talk. */
  const [turns, setTurns] = useState<Turn[]>([])
  const [asked, setAsked] = useState<Set<number>>(new Set())
  const [picking, setPicking] = useState(false)
  const [crest, setCrest] = useState<string | null>(null)

  // A fresh visit starts fresh.
  useEffect(() => {
    if (!open) return
    setTurns([{ who: 'them', text: opener }])
    setAsked(new Set())
    setPicking(false)
    setCrest(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folk?.id])

  // A resolve lands as their next turn; the tier-up then comes over the top of
  // it. Keyed on the nonce, so the same sentence said twice still shows twice.
  useEffect(() => {
    if (!resolved) return
    setTurns(t => [...t, { who: 'them', text: resolved.text }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved?.nonce])

  useEffect(() => {
    if (!gain?.tierUp) return
    setCrest(gain.tierUp)
    vibrate([0, 40, 60, 90])
    // BELT AND BRACES. The button below dismisses it and so does a tap, but a
    // celebration that can strand somebody in a modal is worse than one that
    // outstays its welcome, so it also leaves on its own.
    const t = setTimeout(() => setCrest(null), 9000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gain?.tierUp])

  const last = turns[turns.length - 1] ?? { who: 'them' as const, text: opener }
  const typedKey = `${turns.length}:${last.text}`
  const { shown, typing, finish } = useTypewriter(
    last.who === 'them' ? last.text : '', typedKey, { reduced },
  )
  const finishRef = useRef<() => void>(() => {})
  finishRef.current = finish

  if (!folk) return null

  const asks = ASKS[folk.id]?.[tier] ?? []
  const openAsks = asks.map((a, i) => ({ a, i })).filter(({ i }) => !asked.has(i))

  function say(text: string, reply: string) {
    setTurns(t => [...t, { who: 'you', text }, { who: 'them', text: reply }])
  }

  const choicesHidden = typing || !!crest || picking

  return (
    <AnimatePresence>
      {open && (
        /* THE CHART STAYS. Dimmed, not replaced: you are alongside their boat,
           on the water you sailed to get here. This element is both the dim and
           the flex box that centres the card. */
        <motion.div
            key="folk-dim"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => {
              if (crest) { setCrest(null); return }
              if (typing) { finishRef.current(); return }
              onClose()
            }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9300,
              background: 'rgba(4,8,14,0.72)',
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
              cursor: typing ? 'pointer' : 'default',
              // THE CARD LIVES INSIDE THE BACKDROP so one flex box does the
              // centring and its bottom padding carries the tab bar's room.
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '1rem 1rem calc(1rem + var(--tabbar-safe, 0px))',
            }}>

          <motion.div
            key="folk-card"
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
              // and scale, so the centring half was silently discarded on the
              // first frame. The card sat pinned at the halfway mark and hung
              // off the bottom, which is why the choices ended up under the nav
              // and why adjusting margins only moved the problem around.
              //
              // The parent flex box already reserves the tab bar, so the card
              // states a size and lets that box place it.
              //
              // The HEIGHT IS STILL FIXED rather than auto: an auto-height card
              // resized itself every time a choice appeared or a line ran long,
              // which moved the buttons under the reader's thumb mid-sentence.
              // `maxHeight: 100%` of the padded parent rather than a dvh sum,
              // because two independent height calculations are two things that
              // can disagree.
              maxWidth: 480, width: '100%',
              height: 524, maxHeight: '100%',
              display: 'flex', flexDirection: 'column',
              // THE SAME SLAB AS THE PANEL THIS OPENED FROM. TraderPanel's
              // card is a flat near-black; this was a blue gradient that ran
              // lighter at the top, so stepping from "speak to them" into the
              // conversation changed screens rather than continued one. The
              // accent stays in the border and the glow, where it names who
              // you are talking to without repainting the surface.
              background: 'rgba(10,16,22,0.98)',
              border: `1px solid ${accent}3d`,
              borderTop: `1px solid ${accent}8f`,
              borderRadius: 18, padding: '1rem 1rem 0.9rem',
              boxShadow: `0 18px 50px rgba(0,0,0,0.6), 0 0 34px ${accent}14`,
              overflow: 'hidden',
            }}>

            {/* ── WHO ─────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: '0.7rem', flexShrink: 0 }}>
              <motion.div
                animate={gain ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                transition={{ duration: 0.5 }}
                style={{
                  transform: folk.face.mirrored ? 'scaleX(-1)' : 'none',
                  flexShrink: 0, borderRadius: '50%',
                  boxShadow: `0 0 16px ${accent}40`,
                }}>
                <CharacterAvatar
                  characterColor={folk.face.characterColor}
                  equippedHat={folk.face.hat}
                  bgColor={folk.face.bg}
                  ringColor={folk.face.ring}
                  size={58}
                />
              </motion.div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="font-karla font-700 uppercase" style={{
                  fontSize: '0.53rem', color: accent, letterSpacing: '0.2em', marginBottom: 2,
                }}>{folk.role}</p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1,
                }}>{folk.name}</p>
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

            {/* ── WHAT YOU SAID LAST, kept above so the exchange reads as
                one conversation rather than a series of cards. */}
            {turns.length > 1 && turns[turns.length - 2]?.who === 'you' && (
              <p className="font-karla" style={{
                fontSize: '0.78rem', color: 'rgba(180,214,232,0.45)',
                margin: '0 0 7px', paddingLeft: 10,
                borderLeft: '2px solid rgba(180,214,232,0.2)', lineHeight: 1.4,
              }}>You: {turns[turns.length - 2].text}</p>
            )}

            {/* ── WHAT THEY ARE SAYING ──────────────────────────────────
                A RESERVED BLOCK. Their lines run from four words to thirty and
                the card must not resize between them, so the tallest sets the
                height once and short lines sit in the space. */}
            <div style={{ height: 104, flexShrink: 0, overflowY: 'auto', touchAction: 'pan-y' }}
              onClick={() => { if (typing) finishRef.current() }}>
              <TypedBody all={[last.text]} text={last.text}
                shown={last.who === 'them' ? shown : last.text.length}
                typing={last.who === 'them' ? typing : false}
                accent={accent} quoted size="1rem" />
            </div>

            <div style={{ flexShrink: 0 }}>
              <RapportBar points={points} gained={gain?.gained ?? 0} accent={accent} />
            </div>

            {/* ── THE HOLD, INLINE. It never opens anything: the choices are
                replaced by the list and come back when you pick or back out. */}
            {picking && (
              <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: 'auto', touchAction: 'pan-y' }}>
                {hold.length === 0 ? (
                  <p className="font-karla" style={{
                    fontSize: '0.8rem', color: 'rgba(226,238,246,0.5)', margin: '6px 0', lineHeight: 1.5,
                  }}>
                    Your hold is empty. Anything you catch is worth having,
                    and the one fish they actually want is worth three times as much.
                  </p>
                ) : hold.map(f => (
                  <Choice key={f.id}
                    label={f.name}
                    /* TWO WAYS TO LEARN WHAT SOMEBODY LIKES, and this is
                       the one that does not need them to say it. Before they
                       have told you, holding their fish shows a NUDGE - they
                       keep looking at it - which is enough to work out on your
                       own and not enough to be told. Afterwards it is a plain
                       statement with the number on it, because by then it is
                       something you know rather than something you noticed. */
                    hint={f.id === folk.favourite.id
                      ? (knowsFav
                        ? 'Their favourite. Worth three.'
                        : 'They keep looking at this one.')
                      : `${f.qty} in the hold`}
                    accent={accent}
                    warm={f.id === folk.favourite.id}
                    disabled={busy}
                    onClick={() => { setPicking(false); onGift(f.id) }} />
                ))}
                <Choice label="Never mind" accent={accent} onClick={() => setPicking(false)} />
              </div>
            )}

            {/* ── WHAT YOU CAN SAY ────────────────────────────────────── */}
            {!choicesHidden && (
              <motion.div
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: 'auto', touchAction: 'pan-y' }}>

                {/* The day's word, when it has not been had. Warm, because it
                    is the one choice here that moves the friendship. */}
                {canChat && (
                  <Choice
                    label="So how have you been?"
                    hint={busy ? undefined : 'They will have something new to say'}
                    accent={accent} warm disabled={busy}
                    onClick={() => { vibrate(10); onChat() }} />
                )}

                {/* Free, always, whether or not the day's word is spent. */}
                {openAsks.map(({ a, i }) => (
                  <Choice key={i} label={a.you} accent={accent} disabled={busy}
                    onClick={() => {
                      vibrate(6)
                      setAsked(s => new Set(s).add(i))
                      say(a.you, a.they)
                    }} />
                ))}

                {/* OFFERED EVEN WITH AN EMPTY HOLD, and that is the point.
                    It used to be hidden unless you were already carrying fish,
                    so a captain who had never happened to pull alongside with a
                    full hold had no way of learning that gifting exists at all.
                    Tapping it with nothing aboard says so, which teaches the
                    mechanic in the one place somebody would want it. */}
                {canGift && (
                  <Choice label="I brought you something." accent={accent}
                    hint={hold.length === 0 ? 'Your hold is empty' : undefined}
                    disabled={busy}
                    onClick={() => { vibrate(8); setPicking(true) }} />
                )}

                <Choice label="I should get back to it." accent={accent} onClick={onClose} />

                {/* Only once both are spent, and only as a fact. Never a
                    warning about a streak, because there is not one. */}
                {!canChat && !canGift && (
                  <p className="font-karla" style={{
                    fontSize: '0.66rem', color: 'rgba(226,238,246,0.35)',
                    textAlign: 'center', margin: '9px 0 2px',
                  }}>
                    You have had your word and given your gift today. Nothing is lost by waiting.
                  </p>
                )}
              </motion.div>
            )}

            {/* ── THE BOND DEEPENING ──────────────────────────────────── */}
            <AnimatePresence>
              {crest && (
                <motion.div
                  key="crest"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.28 }}
                  onClick={() => setCrest(null)}
                  style={{
                    position: 'absolute', inset: 0, zIndex: 4, cursor: 'pointer',
                    // Covers the card, so it is the card's own colour. A
                    // different gradient here made the surface change shade
                    // underneath the gift instead of the gift landing on it.
                    background: 'rgba(10,16,22,0.98)',
                    borderRadius: 18,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    padding: '1.4rem 1.2rem', textAlign: 'center',
                  }}>
                  {!reduced && (
                    <motion.div
                      initial={{ scale: 0.2, opacity: 0.9 }}
                      animate={{ scale: 2.6, opacity: 0 }}
                      transition={{ duration: 1.1, ease: 'easeOut' }}
                      style={{
                        position: 'absolute', width: 140, height: 140, borderRadius: '50%',
                        border: `2px solid ${accent}`, pointerEvents: 'none',
                      }} />
                  )}
                  <motion.p
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="font-karla font-700 uppercase"
                    style={{ fontSize: '0.56rem', letterSpacing: '0.24em', color: accent, margin: 0 }}>
                    You are now
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.14 }}
                    className="font-cinzel font-700"
                    style={{
                      fontSize: '1.45rem', color: '#f6ecd6', margin: '6px 0 12px',
                      textShadow: `0 0 22px ${accent}80`,
                    }}>{TIER_NAME[gain?.tier ?? tier]}</motion.p>
                  <motion.p
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 }}
                    className="font-karla"
                    style={{
                      fontSize: '0.92rem', color: 'rgba(240,237,232,0.92)',
                      lineHeight: 1.55, margin: 0, fontStyle: 'italic',
                    }}>&ldquo;{gain?.tierUp}&rdquo;</motion.p>
                  {/* A REAL BUTTON, not a hint that the whole panel is
                      tappable. The tap-anywhere was the only way out and it
                      could end up somewhere unreachable; this cannot. */}
                  <motion.button
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    onClick={e => { e.stopPropagation(); setCrest(null) }}
                    className="font-cinzel font-700"
                    style={{
                      marginTop: 18, padding: '0.6rem 1.6rem', borderRadius: 999,
                      background: `${accent}26`, border: `1px solid ${accent}7a`,
                      color: '#f4ecd8', fontSize: '0.92rem', cursor: 'pointer',
                    }}>Carry on</motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
