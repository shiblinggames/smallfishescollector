'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markFotdIntroSeen } from './fotdIntroAction'

// Two steps. Six was way too many for a daily guessing puzzle —
// the gem counter, guess counter, and hint button all surface
// themselves the moment the player opens the page.
const STEPS = [
  { color: '#4ade80', title: 'Guess the fish',  placement: 'top'    as const, body: 'Guess the secret fish in 4 tries. Solve it to win the gems on the line.' },
  { color: '#f0c040', title: 'Stuck? Buy hints', placement: 'bottom' as const, body: 'Hints cost gems, one per round. New fish every day at midnight.' },
]

export default function FotdIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markFotdIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
