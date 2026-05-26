'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getPendingSales, type PendingSale } from '@/app/(app)/tavern/market/actions'
import PendingSaleSettledToast from './PendingSaleSettledToast'

export default function PendingSalesWatcher() {
  const [toastAmount, setToastAmount] = useState<number | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const inFlightRef = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const result = await getPendingSales()
      window.dispatchEvent(new CustomEvent('pending-sales-changed', { detail: result.pending }))
      if (result.justSettled > 0) {
        setToastAmount(result.justSettled)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.doubloons }))
      }
      // Schedule a refresh slightly after each pending settle_at
      timersRef.current.forEach(clearTimeout)
      timersRef.current = result.pending.map(p => {
        const ms = new Date(p.settlesAt).getTime() - Date.now() + 750
        if (ms <= 0) return null as unknown as ReturnType<typeof setTimeout>
        return setTimeout(refresh, ms)
      }).filter(Boolean)
    } finally {
      inFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    refresh()
    const handler = () => refresh()
    window.addEventListener('pending-sales-may-have-changed', handler)
    return () => {
      window.removeEventListener('pending-sales-may-have-changed', handler)
      timersRef.current.forEach(clearTimeout)
    }
  }, [refresh])

  return (
    <PendingSaleSettledToast
      amount={toastAmount}
      onDismiss={() => setToastAmount(null)}
    />
  )
}
