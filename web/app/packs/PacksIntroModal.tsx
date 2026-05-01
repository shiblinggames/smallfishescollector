'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markPacksIntroSeen } from './packsIntroAction'

const STEPS = [
  { color: '#c8a870', title: 'Crew Notices',    placement: 'top'    as const, body: 'Your Crew Notice count is shown up here. Each notice lets you recruit 4 fish cards — tap Recruit Crew to spend one.' },
  { color: '#f0ede8', title: 'Flipping Cards',  placement: 'center' as const, body: 'Four face-down cards will be dealt to you. Tap each card individually to flip it, or tap Reveal All to flip everything at once.' },
  { color: '#a78bfa', title: 'Rarities',         placement: 'bottom' as const, body: 'Cards come in five tiers: Common (grey) · Rare (blue) · Epic (purple) · Legendary (gold) · Mythic (red). Mythic cards — Kraken, Davy Jones, Golden Age — are extraordinarily difficult to pull.' },
]

export default function PacksIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markPacksIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
