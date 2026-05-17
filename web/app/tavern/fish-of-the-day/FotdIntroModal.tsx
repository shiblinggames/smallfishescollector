'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markFotdIntroSeen } from './fotdIntroAction'

const STEPS = [
  { color: '#4ade80', title: 'Guess the fish',   placement: 'top'    as const, body: 'A secret fish hides every day. Guess which one before you run out of tries.' },
  { color: '#f0c040', title: 'Start with a clue',placement: 'top'    as const, body: 'You begin with one clue. Stuck? Buy more clues with gems.' },
  { color: '#60a5fa', title: 'Four guesses',     placement: 'bottom' as const, body: 'You get four guesses. Start typing a fish name and pick it from the list.' },
  { color: '#a78bfa', title: 'Win the gems',     placement: 'bottom' as const, body: 'Every puzzle has gems on the line. Solve it to keep them — run out of guesses and they’re gone.' },
  { color: '#34d399', title: 'Hints cost gems',  placement: 'bottom' as const, body: 'Buy a hint when you’re stuck — one per round, then you have to take a guess.' },
  { color: '#fb923c', title: 'New fish daily',   placement: 'center' as const, body: 'A fresh fish every day at midnight. Come back tomorrow for another shot.' },
]

export default function FotdIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markFotdIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
