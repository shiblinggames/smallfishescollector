'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markMarketIntroSeen } from './marketIntroAction'

const STEPS = [
  { color: '#38bdf8', title: 'Live Prices',     body: 'Every fish has a price multiplier that shifts every hour — up to 2.5× base value. The same fish can be worth very different amounts throughout the day.' },
  { color: '#4ade80', title: 'Sell Your Catch', body: 'Go to My Portfolio to see the fish you have in your hold. Tap any fish, choose a quantity, and confirm the sale to earn doubloons.' },
  { color: '#f0c040', title: 'Price Trends',    body: 'Each fish shows a sparkline of recent price movement and an arrow — green means the price is rising, red means it\'s falling.' },
  { color: '#fb923c', title: 'Market Moods',    body: 'The market has three moods: Calm, Storm, and Kraken Surge. Moods shift prices across the whole market — watch the status indicator at the top.' },
  { color: '#a78bfa', title: 'Time It Right',   body: "Prices cycle up and down — don't rush to sell. Holding your catch and waiting for a price spike can easily double or triple your earnings." },
  { color: '#f0ede8', title: 'Transaction Fees', body: 'Free accounts pay a small cut to the house on every sale. Premium Members sell with no fees, keeping every doubloon they earn.' },
]

export default function MarketIntroModal() {
  const [, startTransition] = useTransition()

  function handleDone() {
    startTransition(async () => {
      await markMarketIntroSeen()
    })
  }

  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
