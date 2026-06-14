import { NextRequest, NextResponse } from 'next/server'
import { getTodaysBoard } from '@/app/(app)/tavern/trivia/board/generate'
import { getThisWeeksLadder } from '@/app/(app)/tavern/trivia/king/generate'
import { getThisWeeksSudoku } from '@/app/(app)/tavern/chart-room/hold/generate'
import { getThisWeeksMinefield } from '@/app/(app)/charting/generate'
import { getThisWeeksRigging } from '@/app/(app)/tavern/chart-room/rigging/generate'

export const maxDuration = 60

// Midnight content roll. Fish of the Day + the orphaned daily quiz
// retired 2026-06-11 in favor of The Parlor. Board generates first
// so the ladder's avoid-list can see today's board questions. The
// King ladder is weekly: Tuesday-Sunday this is a cache hit, Monday
// rigs the fresh one. The Quartermaster's Hold rolls three fresh
// sudoku (easy/medium/hard) each night.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const board = await Promise.allSettled([getTodaysBoard()]).then(r => r[0])
  const ladder = await Promise.allSettled([getThisWeeksLadder()]).then(r => r[0])
  const hold = await Promise.allSettled([getThisWeeksSudoku()]).then(r => r[0])
  const minefield = await Promise.allSettled([getThisWeeksMinefield()]).then(r => r[0])
  const rigging = await Promise.allSettled([getThisWeeksRigging()]).then(r => r[0])

  return NextResponse.json({
    board: board.status === 'fulfilled' ? 'ok' : 'failed',
    ladder: ladder.status === 'fulfilled' ? 'ok' : 'failed',
    hold: hold.status === 'fulfilled' ? 'ok' : 'failed',
    minefield: minefield.status === 'fulfilled' ? 'ok' : 'failed',
    rigging: rigging.status === 'fulfilled' ? 'ok' : 'failed',
  })
}
