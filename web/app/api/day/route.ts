// "I have looked at today's recruits" (2026-09-27): the Recruits line on the
// day board's list ticks when the crew panel opens on the recruit board. A
// route handler so it never queues in front of the panel's own actions.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifiedSession } from '@/lib/verifiedSession'

export async function POST() {
  const session = await verifiedSession(await createClient())
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const today = new Date().toISOString().split('T')[0]
  await createAdminClient().from('profiles').update({ recruits_seen_on: today }).eq('id', session.user.id)
  return NextResponse.json({ ok: true })
}
