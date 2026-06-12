import { NextRequest, NextResponse } from 'next/server'
import { getTodaysBoard } from '@/app/(app)/tavern/trivia/board/generate'
import { getTodaysLadder } from '@/app/(app)/tavern/trivia/king/generate'

export const maxDuration = 60

// Midnight content roll. Fish of the Day + the orphaned daily quiz
// retired 2026-06-11 in favor of Trivia Night. Board generates first
// so the ladder's avoid-list can see today's board questions.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const board = await Promise.allSettled([getTodaysBoard()]).then(r => r[0])
  const ladder = await Promise.allSettled([getTodaysLadder()]).then(r => r[0])

  return NextResponse.json({
    board: board.status === 'fulfilled' ? 'ok' : 'failed',
    ladder: ladder.status === 'fulfilled' ? 'ok' : 'failed',
  })
}
