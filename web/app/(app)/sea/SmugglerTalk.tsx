'use client'

// ── TALKING TO KIP, AND CASTING OFF ─────────────────────────────────────────
//
// The door to Tide Run. It used to be a card in the Tavern under a heading
// about things that reset; now it is a frightened man on the water who tells
// you what he is carrying and what will get you both caught.
//
// ── THE WARNING IS ITS OWN BEAT ─────────────────────────────────────────────
//
// The scene is two steps, not one long speech, and the split is deliberate.
// Everything in the first step is colour: who he is, what he took, what he
// wants. The second step is a CONTROL INSTRUCTION — rocks you jump, beacons you
// smash — and it is the only thing on either card that changes how somebody
// plays rather than how they feel.
//
// Folded into the story it would read as more atmosphere and be skipped with
// it, and the player would lose their first run to precisely the reflex the
// beacon is designed to punish. On its own card, with the rule stated flat at
// the bottom, it survives the skimming.
//
// ── AND HE DOES NOT REPEAT HIMSELF ──────────────────────────────────────────
//
// Second visit onward he says two short lines and gets out of the way. A story
// you cannot skip is a story you resent by the fourth run, and the run is the
// point of coming back.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import CharacterAvatar from '@/components/CharacterAvatar'
import PopupShell from '@/components/PopupShell'
import { vibrate } from '@/lib/haptics'
import { KIP, KIP_INTRO, KIP_WARNING, KIP_AGAIN, KIP_CAST_OFF } from '@/lib/seaSmuggler'
import { moorBesideSmuggler } from './smugglerActions'

/** His colour. Cold and low-contrast on purpose: everything else that opens a
 *  mode out here is gold, and he is a man actively trying not to be looked at. */
const KIP_ACCENT = '#8fb3c4'
const SEA = 'rgba(190,212,228'

/** Remembers only whether the story has been heard, on the DEVICE.
 *
 *  The house rule sends one-time flags to a profile column so a phone and a
 *  laptop agree — that rule is about things a PLAYER has seen, like a tour. This
 *  is closer to a skip button: getting the full story again on a new device
 *  costs one extra tap, and it is not worth a migration and a column to save it.
 *  If it ever needs to be per-player it becomes `has_met_smuggler` and nothing
 *  else here changes. */
const MET_KEY = 'seaMetSmuggler'

/** One line of him talking, arriving after the one above it.
 *
 *  NOT the cutscene kit's TypedBody: that types a single line under an external
 *  `useTypewriter` clock and is built for a full-screen scene that owns the
 *  screen. This is a modal on the water with four short paragraphs in it, and a
 *  stagger says "he is still talking" without holding the player behind a
 *  character-by-character reveal they will tap through anyway. */
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
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [met, setMet] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep(0)
    setBusy(false)
    try { setMet(window.localStorage.getItem(MET_KEY) === 'true') } catch { setMet(false) }
  }, [open])

  const lines = useMemo(() => (met ? KIP_AGAIN : KIP_INTRO), [met])
  // A returning captain gets one card and the button; a first-timer gets the
  // story, then the warning, then the button.
  const lastStep = met ? 0 : 1

  const castOff = async () => {
    if (busy) return
    setBusy(true)
    vibrate([0, 18, 40, 26])
    try { window.localStorage.setItem(MET_KEY, 'true') } catch { /* private mode */ }
    // MOOR FIRST, THEN GO. The chart is about to unmount and its periodic
    // position sync may be seconds stale; this pins the return to his bow so
    // the run ends where the conversation started. Never blocking: a failed
    // write costs a slightly wrong start position, and refusing to launch over
    // that would trade a whole game mode for a cosmetic.
    await moorBesideSmuggler().catch(() => {})
    router.push('/tavern/tide-run?from=sea')
  }

  return (
    <PopupShell open={open} onClose={busy ? () => {} : onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 4 }}
        transition={{ duration: 0.18 }}
        onClick={e => e.stopPropagation()}
        style={{
          margin: 'auto', width: '100%', maxWidth: 420,
          // OPAQUE. It floats over painted, moving water like every other panel
          // out here, and a translucent card over the sea reads as a smear.
          background: 'rgba(7,11,16,0.98)',
          border: `1px solid ${KIP_ACCENT}3d`,
          borderRadius: 18, padding: '1.15rem 1.05rem 1.2rem',
          boxShadow: '0 22px 60px rgba(0,0,0,0.7)',
        }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flexShrink: 0 }}>
            <CharacterAvatar characterColor={KIP.look.characterColor} equippedHat={KIP.look.hatId} size={54} ringColor={KIP_ACCENT} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-800" style={{
              fontSize: '1.16rem', color: '#eef4f8', lineHeight: 1.1,
            }}>{KIP.name}</p>
            <p className="font-karla font-700 uppercase" style={{
              fontSize: '0.54rem', letterSpacing: '0.2em', color: KIP_ACCENT, marginTop: 3,
            }}>{step === 0 ? 'Keeping his head down' : 'Telling you the one rule'}</p>
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
                <Line key={`${met ? 'again' : 'intro'}-${i}`} text={l} i={i} />
              ))}
            </div>
          ) : (
            <>
              <p className="font-cinzel font-800" style={{
                fontSize: '1rem', color: '#f0c040', marginBottom: 8,
              }}>{KIP_WARNING.title}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {KIP_WARNING.body.map((l, i) => (
                  <Line key={`warn-${i}`} text={l} i={i} style={{ fontSize: '0.84rem' }} />
                ))}
              </div>
              {/* THE RULE, FLAT. Everything above it is a person talking and can
                  be skimmed; this is the instruction, and it is written the way
                  the house rule says a mechanic is written — literally, with no
                  cleverness in the way of it. */}
              <p className="font-karla font-700" style={{
                marginTop: 12, padding: '0.6rem 0.7rem', borderRadius: 10,
                background: 'rgba(240,192,64,0.09)',
                border: '1px solid rgba(240,192,64,0.28)',
                fontSize: '0.8rem', lineHeight: 1.5, color: '#f2dda0',
              }}>{KIP_WARNING.rule}</p>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" data-no-steer disabled={busy}
            onClick={e => { e.stopPropagation(); onClose() }}
            className="tap font-karla font-700 uppercase tracking-[0.12em]"
            style={{
              flex: 1, padding: '0.72rem', borderRadius: 12, fontSize: '0.74rem',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.16)',
              color: `${SEA},0.7)`, cursor: busy ? 'default' : 'pointer',
            }}>
            Not now
          </button>
          <button type="button" data-no-steer disabled={busy}
            onClick={e => {
              e.stopPropagation()
              vibrate(8)
              if (step < lastStep) { setStep(s => s + 1); return }
              void castOff()
            }}
            className="tap font-karla font-700 uppercase tracking-[0.12em]"
            style={{
              flex: 1.5, padding: '0.72rem', borderRadius: 12, fontSize: '0.78rem',
              background: 'rgba(240,192,64,0.16)',
              border: '1px solid rgba(240,192,64,0.5)',
              color: '#f0c040', cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.65 : 1,
            }}>
            {busy ? 'Casting off…' : step < lastStep ? 'Go on' : 'Take the wheel'}
          </button>
        </div>

        {step === lastStep && !busy && (
          <p className="font-karla" style={{
            fontSize: '0.68rem', color: `${SEA},0.42)`, textAlign: 'center',
            marginTop: 9, lineHeight: 1.45,
          }}>{KIP_CAST_OFF}</p>
        )}
      </motion.div>
    </PopupShell>
  )
}
