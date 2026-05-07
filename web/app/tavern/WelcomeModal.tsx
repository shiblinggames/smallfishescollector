'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { claimWelcomePack } from './welcomeActions'

const STEPS = [
  {
    color: '#60a5fa',
    title: 'Welcome to Small Fishes',
    placement: 'center' as const,
    body: "Start by heading to the fishing dock. Cast your line, catch fish, sell them for doubloons. That's the core loop — everything else opens up from there.",
  },
  {
    color: '#c8a870',
    title: 'Recruit Crew & Set Sail',
    placement: 'top' as const,
    body: "Spend Crew Notices (the scroll icon) to recruit fish cards. Once you have a crew and a Sloop, you can send them on voyages — they run in the background and come back with doubloons, rare gear, and more.",
  },
  {
    color: '#f0c040',
    title: 'Come Back Daily',
    placement: 'center' as const,
    body: "Claim free doubloons and bait from the Daily Bonus. New bounty fish appear every week — catch them for extra rewards. Now go fish.",
  },
]

export default function WelcomeModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await claimWelcomePack() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
