'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markMarketIntroSeen } from './marketIntroAction'

const STEPS = [
  { color: '#38bdf8', title: 'Live prices',    placement: 'top'    as const, body: 'Fish prices change every hour. Sell when they’re high to earn way more than the dock.' },
  { color: '#4ade80', title: 'Sell your catch', placement: 'bottom' as const, body: 'Open My Portfolio, tap a fish, pick how many, and sell.' },
  { color: '#fb923c', title: 'Watch the signals', placement: 'top' as const, body: 'The banner up top sets the mood and swings every price. Each fish’s line shows it rising (green) or falling (red).' },
  { color: '#a78bfa', title: 'Don’t rush',     placement: 'center' as const, body: 'Waiting for a high can double what you make. Heads up: free accounts pay a small selling fee — Premium is fee-free.' },
]

export default function MarketIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markMarketIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
