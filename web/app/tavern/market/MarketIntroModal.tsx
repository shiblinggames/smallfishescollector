'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markMarketIntroSeen } from './marketIntroAction'

const STEPS = [
  { color: '#38bdf8', title: 'Live Prices',      placement: 'top'    as const, body: 'Every fish has a price multiplier shown up here that shifts every hour — up to 2.5× base value.' },
  { color: '#4ade80', title: 'Sell Your Catch',  placement: 'bottom' as const, body: 'Go to My Portfolio below to see fish in your hold. Tap any fish, choose a quantity, and confirm the sale.' },
  { color: '#f0c040', title: 'Price Trends',     placement: 'top'    as const, body: 'Each fish shows a sparkline of recent movement. A green arrow means the price is rising — red means falling.' },
  { color: '#fb923c', title: 'Market Moods',     placement: 'top'    as const, body: 'The status indicator at the top shows the current mood: Calm, Storm, or Kraken Surge. Moods shift prices across the whole market.' },
  { color: '#a78bfa', title: 'Time It Right',    placement: 'center' as const, body: "Prices cycle up and down — don't rush. Waiting for a spike can easily double or triple your earnings." },
  { color: '#f0ede8', title: 'Transaction Fees', placement: 'bottom' as const, body: 'Free accounts pay a small cut on every sale. Premium Members sell with no fees, keeping every doubloon they earn.' },
]

export default function MarketIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markMarketIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
