'use client'

import { useEffect, useRef, useState } from 'react'
import { getUnlockedBadges } from '@/app/(app)/achievements/badgeActions'
import BadgeUnlockedCelebration from './BadgeUnlockedCelebration'

const TRIGGER_EVENTS = [
  'doubloons-changed',
  'gems-changed',
  'packs-changed',
  'crew-changed',
  'badges-may-have-changed',
]

export default function BadgeWatcher() {
  const seenRef = useRef<Set<string> | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)

  async function check() {
    if (inFlightRef.current) {
      pendingRef.current = true
      return
    }
    inFlightRef.current = true
    try {
      const list = await getUnlockedBadges()
      if (seenRef.current === null) {
        seenRef.current = new Set(list)
        return
      }
      const fresh = list.filter(b => !seenRef.current!.has(b))
      if (fresh.length > 0) {
        for (const id of fresh) seenRef.current!.add(id)
        setQueue(q => [...q, ...fresh])
      }
    } finally {
      inFlightRef.current = false
      if (pendingRef.current) {
        pendingRef.current = false
        check()
      }
    }
  }

  useEffect(() => {
    check()
    const handler = () => { check() }
    TRIGGER_EVENTS.forEach(e => window.addEventListener(e, handler))
    return () => TRIGGER_EVENTS.forEach(e => window.removeEventListener(e, handler))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <BadgeUnlockedCelebration
      badgeId={queue[0] ?? null}
      onDismiss={() => setQueue(q => q.slice(1))}
    />
  )
}
