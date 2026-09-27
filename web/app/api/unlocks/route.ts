// THE UNLOCK BANNER'S CHECK, AS A ROUTE AND NOT A SERVER ACTION (2026-09-27).
//
// Next runs a page's server actions one at a time. A background check that is
// a server action sits in that queue, and a press that needs an action (the
// boss card on the chart, a claim) waits behind it: Kong saw entering Barnacle
// Pete's raid hang. A route handler runs alongside everything else.
import { NextResponse } from 'next/server'
import { checkUnlocks } from '@/app/(app)/unlockActions'

export async function POST() {
  try {
    return NextResponse.json(await checkUnlocks())
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
