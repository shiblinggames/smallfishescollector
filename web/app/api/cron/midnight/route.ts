import { NextRequest, NextResponse } from 'next/server'
import { getTodaysBoard } from '@/app/(app)/tavern/trivia/board/generate'

export const maxDuration = 60

// Midnight content roll. Fish of the Day + the orphaned daily quiz
// retired 2026-06-11 in favor of Trivia Night's Captain's Board.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [board] = await Promise.allSettled([
    getTodaysBoard(),
  ])

  return NextResponse.json({
    board: board.status === 'fulfilled' ? 'ok' : 'failed',
  })
}
