'use client'

import { useTransition } from 'react'
import StepTourModal from '@/components/StepTourModal'
import { markMarketIntroSeen } from './marketIntroAction'

// Two steps. The sell flow + the rising/falling indicators are
// obvious from the UI; what's NOT obvious is that prices change
// and waiting matters. Lead with that.
const STEPS = [
  { color: '#38bdf8', title: 'Prices change hourly',   placement: 'top'    as const, body: 'Fish prices swing all day. Sell when they spike to earn way more than the dock.' },
  { color: '#a78bfa', title: "Don't rush",             placement: 'center' as const, body: 'Waiting for a high can double your payout. Free accounts pay a small selling fee. Premium is fee-free.' },
]

export default function MarketIntroModal() {
  const [, startTransition] = useTransition()
  function handleDone() {
    startTransition(async () => { await markMarketIntroSeen() })
  }
  return <StepTourModal steps={STEPS} onDone={handleDone} />
}
