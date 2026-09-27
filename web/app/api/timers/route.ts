// WHEN THE LONG CLOCKS FINISH (2026-09-27): every Crew Hall stint, the
// Abyssal Accelerator's conversion and the Ultimate build. The chart sets one
// timer per future finish and puts up the day board's notice when it lands.
// A route handler, not a server action, for the reason /api/unlocks gives: a
// background read must not queue in front of the captain's own actions.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifiedSession } from '@/lib/verifiedSession'
import { parseAbyssalConversion } from '@/lib/abyssalAccelerator'
import { parseAugmentBuild } from '@/lib/shipAugments'

export async function GET() {
  const session = await verifiedSession(await createClient())
  if (!session) return NextResponse.json({ bunks: [], accel: null, ultimate: null })
  const admin = createAdminClient()
  const uid = session.user.id
  const [{ data: prof }, { data: bunkRows }] = await Promise.all([
    admin.from('profiles').select('abyssal_conversion, manowar_augment_build').eq('id', uid).single(),
    admin.from('crew_hall_bunks').select('since, cap_hours').eq('user_id', uid),
  ])
  const bunks = ((bunkRows ?? []) as { since: string; cap_hours: number }[])
    .map(b => new Date(new Date(b.since).getTime() + Number(b.cap_hours ?? 0) * 3_600_000).toISOString())
  const accel = parseAbyssalConversion((prof as { abyssal_conversion?: unknown } | null)?.abyssal_conversion)?.completesAt ?? null
  const ultimate = parseAugmentBuild((prof as { manowar_augment_build?: unknown } | null)?.manowar_augment_build)?.completesAt ?? null
  return NextResponse.json({ bunks, accel, ultimate })
}
