'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markFotdIntroSeen } from './fotdIntroAction'

const STEPS = [
  { color: '#4ade80', title: 'Mystery Fish',  placement: 'top'    as const, body: 'A secret fish is chosen every day. Your job is to figure out which one it is before your guesses run out.' },
  { color: '#f0c040', title: 'Four Clues',    placement: 'top'    as const, body: 'You start with one clue visible up here. Each wrong guess reveals the next clue — up to four total.' },
  { color: '#60a5fa', title: 'Four Guesses',  placement: 'bottom' as const, body: 'You get four attempts. Type a fish name and pick from the dropdown below — no free-typing allowed.' },
  { color: '#a78bfa', title: 'Gem Rewards',   placement: 'bottom' as const, body: 'Guess correctly on the 1st try → 100 ◆ · 2nd try → 75 ◆ · 3rd → 50 ◆ · 4th → 25 ◆. The earlier the better.' },
  { color: '#fb923c', title: 'Daily Reset',   placement: 'center' as const, body: 'A new fish drops every day at midnight. Come back tomorrow for another shot at gems.' },
]

export default function FotdIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markFotdIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
