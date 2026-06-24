'use client'

import { useEffect, useRef, useState } from 'react'
import { reconcileBadges } from '@/app/(app)/achievements/badgeActions'
import BadgeUnlockedCelebration from './BadgeUnlockedCelebration'

const TRIGGER_EVENTS = [
  'doubloons-changed',
  'gems-changed',
  'packs-changed',
  'crew-changed',
  'badges-may-have-changed',
]

// Minimum gap between reconciles. Trigger events (esp. doubloons-changed) fire
// rapidly during a fishing session, and reconcile is a 5-query grant — so we
// throttle, with a guaranteed trailing run after any burst so nothing is missed.
const MIN_INTERVAL_MS = 4000

export default function BadgeWatcher() {
  const seenRef = useRef<Set<string> | null>(null)
  const [queue, setQueue] = useState<string[]>([])
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)
  const lastRunRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reconcile GRANTS every newly-earned derivable badge and returns the full
  // unlocked list — so a badge completed mid-gameplay is detected the moment a
  // trigger event fires, not later when its reward is claimed.
  async function run() {
    inFlightRef.current = true
    lastRunRef.current = Date.now()
    try {
      const list = await reconcileBadges()
      if (seenRef.current === null) {
        // First pass = baseline: grant anything already earned silently (those
        // were completed before this session), no celebration spam on load.
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
      if (pendingRef.current) { pendingRef.current = false; schedule() }
    }
  }

  // Coalesce + throttle: while a reconcile is in flight, mark pending (a trailing
  // run fires when it finishes); otherwise (re)arm a timer for the remainder of
  // the throttle window so a burst of events collapses into one run.
  function schedule() {
    if (inFlightRef.current) { pendingRef.current = true; return }
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastRunRef.current))
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(run, wait)
  }

  useEffect(() => {
    schedule()
    const handler = () => schedule()
    TRIGGER_EVENTS.forEach(e => window.addEventListener(e, handler))
    return () => {
      TRIGGER_EVENTS.forEach(e => window.removeEventListener(e, handler))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <BadgeUnlockedCelebration
      badgeId={queue[0] ?? null}
      onDismiss={() => setQueue(q => q.slice(1))}
    />
  )
}
