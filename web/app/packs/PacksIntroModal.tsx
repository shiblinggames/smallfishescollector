'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markPacksIntroSeen } from './packsIntroAction'

const STEPS = [
  { color: '#c8a870', title: 'Crew Notices',  placement: 'top'    as const, body: 'Each Crew Notice deals you 4 fish cards. Your count is up top — tap Recruit Crew to open one.' },
  { color: '#f0ede8', title: 'Flip your cards', placement: 'center' as const, body: 'Tap each card to flip it, or hit Reveal All to turn them all over at once.' },
  { color: '#a78bfa', title: 'Rarities',       placement: 'bottom' as const, body: 'Five tiers: Common, Rare, Epic, Legendary, Mythic. Mythic cards (Kraken, Davy Jones, Golden Age) are incredibly rare.' },
]

export default function PacksIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markPacksIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
