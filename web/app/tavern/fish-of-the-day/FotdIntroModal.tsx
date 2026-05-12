'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markFotdIntroSeen } from './fotdIntroAction'

const STEPS = [
  { color: '#4ade80', title: 'Mystery Fish',     placement: 'top'    as const, body: 'A secret fish is chosen every day. Figure out which one it is before your guesses run out.' },
  { color: '#f0c040', title: 'Four Clues',       placement: 'top'    as const, body: 'You start with one clue visible. Each wrong guess automatically reveals the next clue — up to four total.' },
  { color: '#60a5fa', title: 'Four Guesses',     placement: 'bottom' as const, body: 'You get four attempts. Type a fish name and pick from the dropdown — no free-typing allowed.' },
  { color: '#a78bfa', title: 'Banked Gems',      placement: 'bottom' as const, body: 'You start each puzzle with 100 ◆ banked. Solve it and the gems are yours. Run out of guesses → you forfeit everything.' },
  { color: '#34d399', title: 'Buy Hints',        placement: 'bottom' as const, body: 'Stuck? Spend banked gems on hints — reveal a letter (5 ◆), an attribute (10 ◆), the word lengths (15 ◆), even the picture (40 ◆). The more you spend, the smaller your payout.' },
  { color: '#fb923c', title: 'Daily Reset',      placement: 'center' as const, body: 'A new fish drops every day at midnight. Come back tomorrow for another shot.' },
]

export default function FotdIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markFotdIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
