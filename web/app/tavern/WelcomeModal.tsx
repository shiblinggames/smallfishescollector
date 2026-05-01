'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { claimWelcomePack } from './welcomeActions'

const STEPS = [
  { color: '#f0ede8', title: 'Welcome to Small Fishes', placement: 'center' as const, body: "You're in the Tavern — your home base. Catch fish, earn doubloons, open packs, and build your crew. Let's walk you through everything here." },
  { color: '#f0c040', title: 'Your Resources',  placement: 'top'    as const, body: 'Three things to keep track of up here — Doubloons (⟡) are your main currency, earned from fishing and selling. Gems (◆) come from daily bonuses and challenges. Crew Notices (the scroll) are spent to recruit new fish cards.' },
  { color: '#c8a870', title: 'Recruit Crew',    placement: 'top'    as const, body: 'Use Crew Notices to recruit fish card crew members. Tap the card above to spend a notice and draw 4 cards — Common through Mythic.' },
  { color: '#f0c040', title: 'Daily Bonus',     placement: 'top'    as const, body: 'Claim free gems and 10 worms every day. Premium members also get a free Crew Notice daily.' },
  { color: '#fb923c', title: 'Weekly Bounty',   placement: 'center' as const, body: 'New target fish every week across 4 zones. Catch them all for doubloons — and the Abyss bounty rewards a bonus Crew Notice.' },
  { color: '#60a5fa', title: 'Games',           placement: 'bottom' as const, body: 'Two ways to wager your doubloons — Crown & Anchor (pick a symbol, roll dice, match to multiply) and Fish Slots (spin the reels, match three fish). Both have a 5,000 ⟡ daily limit.' },
]

export default function WelcomeModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await claimWelcomePack() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
