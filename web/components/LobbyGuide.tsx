'use client'

// First-visit walkthrough for the tavern sub-lobbies (Den / Parlor / Chart
// Room). Same shape as the Expeditions tour: a stepped GuideCoach card at the
// bottom that flashes the live element it's talking about via [data-coach=X]
// targets rendered by the lobby. Plain, clear copy — one line per element.
//
// The "seen" flag is marked the moment the guide starts, not on finish, so a
// player who taps straight into a game isn't nagged on the next visit.

import { useEffect, useRef, useState } from 'react'
import GuideCoach from './GuideCoach'

export interface LobbyGuideStep {
  /** data-coach target to pulse for this step ('' flashes nothing). */
  coachId: string
  portrait: string
  speaker: string
  /** One line. Wrap the key term in *asterisks* to hit it in the accent. */
  text: string
}

function clearFlash(id: string) {
  if (!id) return
  document.querySelector(`[data-coach="${id}"]`)?.classList.remove('coach-flash', 'coach-flash-gold')
}

export default function LobbyGuide({ show, steps, accent = '#f0c040', onSeen, anchored = false, z }: {
  show: boolean
  steps: LobbyGuideStep[]
  accent?: string
  /** Fired once when the guide first opens — mark the has_seen_* flag here. */
  onSeen?: () => void
  /**
   * Put the card NEXT TO the flashed control (GuideCoach's `anchor`) rather
   * than at the bottom of the screen. Off by default so the three tavern
   * lobbies keep the layout they were tuned with; the fight's tour turns it
   * on, because a card at the bottom would sit on the action row it is
   * describing.
   */
  anchored?: boolean
  /** z-index for the card, for a guide that plays inside a portal. */
  z?: number
}) {
  const [step, setStep] = useState<number | null>(null)
  const seenFiredRef = useRef(false)

  // Open on first eligible render; mark seen immediately.
  useEffect(() => {
    if (!show || seenFiredRef.current) return
    seenFiredRef.current = true
    setStep(0)
    onSeen?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  // Pulse the current step's target; clear every other target first.
  useEffect(() => {
    if (step == null) return
    for (const s of steps) clearFlash(s.coachId)
    const cur = steps[step]
    if (cur?.coachId) {
      const el = document.querySelector(`[data-coach="${cur.coachId}"]`)
      if (el) {
        el.classList.add('coach-flash', 'coach-flash-gold')
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  }, [step, steps])

  // Belt-and-braces: strip any lingering flash if this unmounts mid-tour.
  useEffect(() => () => { for (const s of steps) clearFlash(s.coachId) }, [steps])

  function finish() {
    for (const s of steps) clearFlash(s.coachId)
    setStep(null)
  }

  function next() {
    if (step == null) return
    if (step >= steps.length - 1) { finish(); return }
    setStep(step + 1)
  }

  const cur = step != null ? steps[step] : null
  const last = step != null && step === steps.length - 1

  return (
    <GuideCoach
      show={cur != null}
      portrait={cur?.portrait ?? ''}
      speaker={cur?.speaker ?? ''}
      text={cur?.text ?? ''}
      accent={accent}
      placement="bottom"
      offset="calc(env(safe-area-inset-bottom, 0px) + 90px)"
      anchor={anchored ? cur?.coachId || undefined : undefined}
      z={z}
      onNext={next}
      nextLabel={last ? 'Got it' : 'Next →'}
      onClose={finish}
    />
  )
}
