'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markMarketIntroSeen } from './marketIntroAction'

const STEPS = [
  { color: '#38bdf8', title: 'Live prices',    placement: 'top'    as const, body: 'Fish prices change every hour. Sell when they’re high to earn a lot more.' },
  { color: '#4ade80', title: 'Sell your catch', placement: 'bottom' as const, body: 'Open My Portfolio to see your fish. Tap one, pick how many, and sell.' },
  { color: '#f0c040', title: 'Price trends',   placement: 'top'    as const, body: 'The little line shows recent moves. Green = price going up, red = going down.' },
  { color: '#fb923c', title: 'Market moods',   placement: 'top'    as const, body: 'The banner up top sets the mood — Calm, Storm, Kraken Surge — and swings every price.' },
  { color: '#a78bfa', title: 'Don’t rush',     placement: 'center' as const, body: 'Prices rise and fall. Waiting for a high can double or triple what you make.' },
  { color: '#f0ede8', title: 'Selling fees',   placement: 'bottom' as const, body: 'Free accounts pay a small fee per sale. Premium Members sell with no fees.' },
]

export default function MarketIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markMarketIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
