// THE ACCOUNT'S "ALREADY SHOWN" HINTS (profiles.sea_hints_seen), read and
// marked from anywhere without a server action (2026-09-27). The fight's
// stat-card nudges read this at the start of a fight, and a server action
// there would queue in front of the fight's own (see /api/unlocks).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifiedSession } from '@/lib/verifiedSession'
import { arrayAdd } from '@/lib/wallet'

export async function GET() {
  const session = await verifiedSession(await createClient())
  if (!session) return NextResponse.json({ hints: [] })
  const { data } = await createAdminClient().from('profiles').select('sea_hints_seen').eq('id', session.user.id).single()
  return NextResponse.json({ hints: (data?.sea_hints_seen as string[] | null) ?? [] })
}

export async function POST(req: Request) {
  const session = await verifiedSession(await createClient())
  if (!session) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await req.json().catch(() => null) as { id?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id.trim().slice(0, 64) : ''
  if (!id) return NextResponse.json({ ok: false }, { status: 400 })
  await arrayAdd(createAdminClient(), session.user.id, 'sea_hints_seen', id)
  return NextResponse.json({ ok: true })
}
