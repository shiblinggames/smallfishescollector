'use client'

import { useEffect } from 'react'
import { pingActivity } from '@/app/actions/activity'

// Fire-and-forget: stamps last_seen_at once per app load so the admin
// dashboard's "active (7 days)" count reflects real returning players.
export default function ActivityPing() {
  useEffect(() => {
    pingActivity().catch(() => {})
  }, [])
  return null
}
