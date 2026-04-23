'use client'

import { useEffect, useState } from 'react'
import { claimDailyBonus } from '@/app/actions/dailyBonus'

const DAILY_BONUS = 50

export default function DailyBonus() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    claimDailyBonus().then(({ claimed }) => {
      if (claimed) setShow(true)
    })
  }, [])

  useEffect(() => {
    if (!show) return
    const t = setTimeout(() => setShow(false), 4000)
    return () => clearTimeout(t)
  }, [show])

  if (!show) return null

  return (
    <div
      className="fixed top-4 left-1/2 z-50 font-karla font-600 text-sm tracking-wide"
      style={{
        transform: 'translateX(-50%)',
        background: 'rgba(20,18,14,0.92)',
        border: '1px solid rgba(240,192,64,0.4)',
        color: '#f0c040',
        padding: '0.6rem 1.25rem',
        borderRadius: '9999px',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 0 24px rgba(240,192,64,0.15)',
        animation: 'fadeInDown 0.3s ease',
        whiteSpace: 'nowrap',
      }}
    >
      Daily bonus · +{DAILY_BONUS} ⟡
    </div>
  )
}
