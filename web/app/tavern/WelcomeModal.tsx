'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { claimWelcomePack } from './welcomeActions'

const STEPS = [
  { color: '#f0ede8', title: 'Welcome to Small Fishes', placement: 'center' as const, body: "You're in the Tavern — your home base. Catch fish, earn doubloons, open packs, and build your crew. Let's walk you through everything here." },
  { color: '#c8a870', title: 'Recruit Crew',   placement: 'top'    as const, body: 'Use Crew Notices to recruit fish card crew members. Tap the card above to spend a notice and draw 4 cards — Common through Mythic.' },
  { color: '#f0c040', title: 'Daily Bonus',    placement: 'top'    as const, body: 'Claim free gems and 10 worms every day. Premium members also get a free Crew Notice daily.' },
  { color: '#4ade80', title: 'Fish of the Day',placement: 'top'    as const, body: 'A new mystery fish every day. Use up to 4 clues to guess which fish it is. Earlier guesses earn more gems.' },
  { color: '#fb923c', title: 'Weekly Bounty',  placement: 'center' as const, body: 'New target fish every week across 4 zones. Catch them all for doubloons — and the Abyss bounty rewards a bonus Crew Notice.' },
  { color: '#60a5fa', title: 'Crown & Anchor', placement: 'bottom' as const, body: 'Pick a symbol and wager your doubloons. Match it on the dice roll to multiply your bet. Up to 5,000 ⟡ per day.' },
  { color: '#a78bfa', title: 'Fish Slots',     placement: 'bottom' as const, body: 'Spin the reels and match three fish symbols to multiply your wager. Three anchors give you a free bonus spin.' },
]

export default function WelcomeModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await claimWelcomePack() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
