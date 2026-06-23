import { NextRequest, NextResponse } from 'next/server'
import { getThisWeeksBoard } from '@/app/(app)/tavern/trivia/board/generate'
import { getThisWeeksLadder } from '@/app/(app)/tavern/trivia/king/generate'
import { getThisWeeksSudoku } from '@/app/(app)/tavern/chart-room/hold/generate'
import { getThisWeeksMatch } from '@/app/(app)/charting/generate'
import { getThisWeeksMinefield } from '@/app/(app)/charting/minefieldGenerate'
import { getThisWeeksRigging } from '@/app/(app)/tavern/chart-room/rigging/generate'

export const maxDuration = 60

// Midnight content roll. Fish of the Day + the orphaned daily quiz
// retired 2026-06-11 in favor of The Parlor. Both the Captain's Board
// and the King ladder are now WEEKLY (fresh each Monday): Tue–Sun the
// board/ladder calls are cache hits, Monday rolls the fresh ones. Board
// generates first so the ladder's avoid-list can see its questions. The
// Quartermaster's Hold rolls three fresh sudoku (easy/medium/hard) each night.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const board = await Promise.allSettled([getThisWeeksBoard()]).then(r => r[0])
  const ladder = await Promise.allSettled([getThisWeeksLadder()]).then(r => r[0])
  const hold = await Promise.allSettled([getThisWeeksSudoku()]).then(r => r[0])
  const match = await Promise.allSettled([getThisWeeksMatch()]).then(r => r[0])
  const minefield = await Promise.allSettled([getThisWeeksMinefield()]).then(r => r[0])
  const rigging = await Promise.allSettled([getThisWeeksRigging()]).then(r => r[0])

  return NextResponse.json({
    board: board.status === 'fulfilled' ? 'ok' : 'failed',
    ladder: ladder.status === 'fulfilled' ? 'ok' : 'failed',
    hold: hold.status === 'fulfilled' ? 'ok' : 'failed',
    match: match.status === 'fulfilled' ? 'ok' : 'failed',
    minefield: minefield.status === 'fulfilled' ? 'ok' : 'failed',
    rigging: rigging.status === 'fulfilled' ? 'ok' : 'failed',
  })
}
