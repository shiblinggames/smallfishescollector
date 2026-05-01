'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markPacksIntroSeen } from './packsIntroAction'

const STEPS = [
  { color: '#c8a870', title: 'Crew Notices',    placement: 'top'    as const, body: 'Your Crew Notice count is shown up here. Each notice lets you recruit 4 fish cards — tap Recruit Crew to spend one.' },
  { color: '#f0ede8', title: 'Flipping Cards',  placement: 'center' as const, body: 'Four face-down cards will be dealt to you. Tap each card individually to flip it, or tap Reveal All to flip everything at once.' },
  { color: '#5a5650', title: 'Common',          placement: 'bottom' as const, body: 'The most frequent cards. Every crew needs a solid backbone of reliable Common fish.' },
  { color: '#3b8ef0', title: 'Rare',            placement: 'bottom' as const, body: 'Noticeably harder to pull. Rare cards are worth holding onto and show off at market.' },
  { color: '#a78bfa', title: 'Epic',            placement: 'bottom' as const, body: 'Special art effects like Pearl and Holographic. Much harder to find than Rare.' },
  { color: '#f0c040', title: 'Legendary',       placement: 'bottom' as const, body: 'Ghost, Shadow, and Prismatic variants. Very rare — most players go many notices without seeing one.' },
  { color: '#ff3838', title: 'Mythic',          placement: 'bottom' as const, body: 'The rarest cards in existence — Kraken, Davy Jones, Golden Age, and beyond. Extraordinarily difficult to pull.' },
]

export default function PacksIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markPacksIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
