// THE CREW PROMOTION CHECK, AS A ROUTE AND NOT A SERVER ACTION (2026-09-27).
// Same reason as /api/unlocks: a background check must not queue in front of
// the server actions a press is waiting on.
import { NextResponse } from 'next/server'
import { checkPromotions } from '@/app/(app)/crewPromotionActions'

export async function POST() {
  try {
    return NextResponse.json(await checkPromotions())
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
