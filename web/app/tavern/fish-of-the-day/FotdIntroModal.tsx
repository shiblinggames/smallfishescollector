'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markFotdIntroSeen } from './fotdIntroAction'

const STEPS = [
  { color: '#4ade80', title: 'Mystery Fish',     placement: 'top'    as const, body: 'A secret fish is chosen every day. Figure out which one it is before your guesses run out.' },
  { color: '#f0c040', title: 'One Clue to Start',placement: 'top'    as const, body: 'You start with only one clue visible. The remaining three must be earned — buy them from the hint shop for 25 ◆ each.' },
  { color: '#60a5fa', title: 'Four Guesses',     placement: 'bottom' as const, body: 'You get four attempts. Type a fish name and pick from the dropdown — no free-typing allowed.' },
  { color: '#a78bfa', title: 'Banked Gems',      placement: 'bottom' as const, body: 'You start each puzzle with 100 ◆ banked. Solve it and the gems are yours. Run out of guesses → you forfeit everything.' },
  { color: '#34d399', title: 'One Hint Per Round',placement: 'bottom' as const, body: 'Each round you can buy one hint (letter 5 ◆, first letter 8 ◆, attribute 10 ◆, lengths 15 ◆, next clue 25 ◆, picture 40 ◆). Then you must guess before buying another.' },
  { color: '#fb923c', title: 'Daily Reset',      placement: 'center' as const, body: 'A new fish drops every day at midnight. Come back tomorrow for another shot.' },
]

export default function FotdIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markFotdIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
