'use client'

// ── TALKING TO KIP ──────────────────────────────────────────────────────────
//
// He was the door to Tide Run. Tide Run has left this game for a store of its
// own, and rather than delete a good character to delete a minigame, he kept
// the water and changed his trade: he is a fixer who knows how the harbour
// works, and what he tells you now is what the harbour gives its Captains.
//
// ── THE TERMS ARE THEIR OWN BEAT, AND THEY ARE FLAT ─────────────────────────
//
// Two steps, and the split is the same one the smuggler's card used to make.
// The first step is a person talking and can be skimmed. The second is the
// OFFER: what you get, what it costs, how long it lasts. Real money sits at the
// end of this conversation, so that half is written the way a mechanic is
// written anywhere in this game -- plainly, literally, with no charm standing
// between the player and the facts.
//
// The perks are not written here. They come from MembershipModal's own table,
// so the man on the water and the card that takes the money cannot end up
// describing two different offers.
//
// ── AND HE DOES NOT PITCH A CAPTAIN ─────────────────────────────────────────
//
// Somebody who has already paid gets told so and gets let go. A sales pitch
// aimed at a paying player is the clearest possible way of saying that nothing
// in the game is reading what they bought.

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import PopupShell from '@/components/PopupShell'
import { openMembership, PERKS } from '@/components/MembershipModal'
import { vibrate } from '@/lib/haptics'
import { KIP, KIP_INTRO, KIP_TERMS, KIP_AGAIN, KIP_ALREADY } from '@/lib/seaSmuggler'
import { smugglerStanding } from './smugglerActions'

/** His colour. Cold and low-contrast on purpose: he is a man actively trying
 *  not to be looked at. The offer itself is gold, like every other place in
 *  this game where the Captain's register comes up. */
const KIP_ACCENT = '#8fb3c4'
const GOLD = '#f0c040'
const SEA = 'rgba(190,212,228'

/** Remembers only whether the pitch has been heard, on the DEVICE.
 *
 *  The house rule sends one-time flags to a profile column so a phone and a
 *  laptop agree — that rule is about things a PLAYER has seen, like a tour.
 *  This is closer to a skip button: hearing him out again on a new device costs
 *  one extra tap, and it is not worth a migration and a column to save it. */
const MET_KEY = 'seaMetSmuggler'

/** One line of him talking, arriving after the one above it. A stagger says
 *  "he is still talking" without holding the player behind a typewriter they
 *  will tap through anyway. */
function Line({ text, i, style }: { text: string; i: number; style?: React.CSSProperties }) {
  return (
    <motion.p className="font-karla font-600"
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.16, duration: 0.28 }}
      style={{ fontSize: '0.86rem', lineHeight: 1.55, color: '#dce7ee', ...style }}>
      {text}
    </motion.p>
  )
}

export default function SmugglerTalk({ open, onClose }: {
  open: boolean
  onClose: () => void
}) {
  const [step, setStep] = useState(0)
  const [met, setMet] = useState(false)
  /** Null while the answer is still in the post. The card opens on his first
   *  line either way; only the last step waits on this, and by then it has
   *  landed. */
  const [captain, setCaptain] = useState<boolean | null>(null)

  useEffect(() => {
    if (!open) return
    setStep(0)
    try { setMet(window.localStorage.getItem(MET_KEY) === 'true') } catch { setMet(false) }
    let alive = true
    void smugglerStanding()
      .then(r => { if (alive) setCaptain(r.isCaptain) })
      .catch(() => { if (alive) setCaptain(false) })
    return () => { alive = false }
  }, [open])

  const lines = useMemo(
    () => (captain ? KIP_ALREADY : met ? KIP_AGAIN : KIP_INTRO),
    [captain, met],
  )
  /** A Captain gets one card and a way out. Everyone else gets him, then the
   *  offer. */
  const lastStep = captain ? 0 : 1

  return (
    <PopupShell open={open} onClose={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 4 }}
        transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
        style={{
          margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
          // OPAQUE. It floats over painted, moving water like every other panel
          // out here, and a translucent card over the sea reads as a smear.
          background: 'rgba(7,11,16,0.98)',
          border: `1px solid ${step > 0 ? `${GOLD}3d` : `${KIP_ACCENT}3d`}`,
          borderRadius: 18, padding: '1.15rem 1.05rem 1.2rem',
          boxShadow: '0 22px 60px rgba(0,0,0,0.7)',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flexShrink: 0 }}>
            <CharacterAvatar characterColor={KIP.look.characterColor} equippedHat={KIP.look.hatId} size={54} ringColor={step > 0 ? GOLD : KIP_ACCENT} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-800" style={{
              fontSize: '1.16rem', color: '#eef4f8', lineHeight: 1.1,
            }}>{KIP.name}</p>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.54rem', letterSpacing: '0.2em',
              color: step > 0 ? GOLD : KIP_ACCENT, marginTop: 3,
            }}>{step > 0 ? "The Captain's register"
              : captain ? 'Nothing to sell you'
              : 'Keeping his head down'}</p>
          </div>
        </div>

        <div style={{
          marginTop: 14, paddingTop: 12,
          borderTop: '1px solid rgba(255,255,255,0.07)',
          minHeight: 168,
        }}>
          {step === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lines.map((l, i) => (
                <Line key={`${captain ? 'cap' : met ? 'again' : 'intro'}-${i}`} text={l} i={i} />
              ))}
            </div>
          ) : (
            <>
              <p className="font-cinzel font-800" style={{
                fontSize: '1rem', color: GOLD, marginBottom: 9,
              }}>{KIP_TERMS.title}</p>
              {/* THE MEMBERSHIP'S OWN LIST. Not a retelling of it: see PERKS. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {PERKS.map(([perk, sub], i) => (
                  <motion.div key={perk}
                    initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.05, duration: 0.24 }}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span aria-hidden style={{
                      flexShrink: 0, width: 5, height: 5, borderRadius: 999,
                      background: GOLD, transform: 'translateY(-2px)',
                    }} />
                    <p className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.45, color: '#e8eef3' }}>
                      <span className="font-700">{perk}</span>
                      <span style={{ color: `${SEA},0.55)` }}>, {sub}</span>
                    </p>
                  </motion.div>
                ))}
              </div>
              {/* WHAT IT COSTS AND HOW LONG IT LASTS, flat. Everything above is
                  a list of good things; this is the part somebody is entitled
                  to have stated without any charm on it at all. */}
              <p className="font-karla font-700" style={{
                marginTop: 12, padding: '0.6rem 0.7rem', borderRadius: 10,
                background: 'rgba(240,192,64,0.09)',
                border: '1px solid rgba(240,192,64,0.28)',
                fontSize: '0.8rem', lineHeight: 1.5, color: '#f2dda0',
              }}>{KIP_TERMS.terms}</p>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" data-no-steer
            onClick={e => { e.stopPropagation(); onClose() }}
            className="tap font-karla font-700 uppercase tracking-[0.12em]"
            style={{
              flex: 1, padding: '0.72rem', borderRadius: 12, fontSize: '0.74rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.16)',
              color: `${SEA},0.7)`, cursor: 'pointer',
            }}>
            {captain ? 'Fair winds' : 'Not now'}
          </button>
          {!captain && (
            <button type="button" data-no-steer
              onClick={e => {
                e.stopPropagation()
                vibrate(8)
                if (step < lastStep) { setStep(s => s + 1); return }
                try { window.localStorage.setItem(MET_KEY, 'true') } catch { /* private mode */ }
                // THE REAL TILL, not a second one. `openMembership` is the same
                // event every "Become a Captain" button in the game fires, and
                // the modal it opens is mounted in the app shell — so the chart
                // stays where it is and nobody is routed off the water to buy
                // something.
                onClose()
                openMembership()
              }}
              className="tap font-karla font-700 uppercase tracking-[0.12em]"
              style={{
                flex: 1.5, padding: '0.72rem', borderRadius: 12, fontSize: '0.78rem',
                background: 'rgba(240,192,64,0.16)',
                border: '1px solid rgba(240,192,64,0.5)',
                color: GOLD, cursor: 'pointer',
              }}>
              {/* IT SAYS WHERE IT GOES. The thing behind this button asks for
                  money, and a button that hides that is the one kind of button
                  this game does not ship. */}
              {step < lastStep ? 'Go on' : 'Become a Captain'}
            </button>
          )}
        </div>

        {step === lastStep && !captain && (
          <p className="font-karla" style={{
            fontSize: '0.68rem', color: `${SEA},0.42)`, textAlign: 'center',
            marginTop: 9, lineHeight: 1.45,
          }}>{KIP_TERMS.aside}</p>
        )}
      </motion.div>
    </PopupShell>
  )
}
