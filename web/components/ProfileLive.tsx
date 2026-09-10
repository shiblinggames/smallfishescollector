'use client'

// ── THE PURSE, LIVE ─────────────────────────────────────────────────────────
//
// Every grant in the game lands in profiles.doubloons and profiles.gems, and
// the two numbers in the nav were only ever moved by a window event that the
// granting call site remembered to fire, with the right value. A Finn job fired
// it with no value and the nav (rightly) ignored it. A dig and a landing wrote
// a ledger row and fired nothing. A trawl collected on another page arrived on
// the next load. Each was its own bug and each was the same bug: the number on
// screen was a COPY, kept by hand.
//
// So the client watches its own row. Postgres tells Realtime about every
// update to profiles, Realtime checks the table's RLS for the subscriber --
// "profiles own read", auth.uid() = id -- and hands this one captain this one
// row. Doubloons moved: the nav moves, whoever moved them and wherever from.
// Badges grew: the badge watcher goes and looks. The events are the same ones
// the call sites fire, so nothing downstream had to change; the direct fires
// stay too, because they are instant and this is a round trip.
//
// Own row only, by construction. The filter narrows the stream and the policy
// is what makes it a rule rather than a courtesy.

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Row = { doubloons?: number; gems?: number; unlocked_badges?: string[] }

export default function ProfileLive() {
  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let dead = false
    // What we last told the page, so a heartbeat that touched only the
    // position does not re-announce a purse that did not move.
    const last: { doubloons?: number; gems?: number; badges?: number } = {}

    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid || dead) return
      // The socket has to carry the session or the policy sees nobody. Same
      // call the sea's presence makes, for the same reason.
      await supabase.realtime.setAuth().catch(() => {})
      if (dead) return
      channel = supabase
        .channel(`profile:${uid}`)
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
          payload => {
            const row = payload.new as Row | undefined
            if (!row) return
            if (typeof row.doubloons === 'number' && row.doubloons !== last.doubloons) {
              last.doubloons = row.doubloons
              window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: row.doubloons }))
            }
            if (typeof row.gems === 'number' && row.gems !== last.gems) {
              last.gems = row.gems
              window.dispatchEvent(new CustomEvent('gems-changed', { detail: row.gems }))
            }
            const n = Array.isArray(row.unlocked_badges) ? row.unlocked_badges.length : undefined
            if (n !== undefined) {
              // Grew since we last saw it: something was earned. The watcher
              // reconciles and celebrates; this only says "go and look".
              if (last.badges !== undefined && n > last.badges) {
                window.dispatchEvent(new Event('badges-may-have-changed'))
              }
              last.badges = n
            }
          })
        .subscribe()
    })()

    return () => {
      dead = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [])
  return null
}
