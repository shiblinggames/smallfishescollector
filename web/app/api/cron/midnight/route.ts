import { NextRequest, NextResponse } from 'next/server'
import { getTodaysFishPuzzle } from '@/app/tavern/fish-of-the-day/generate'
import { getTodaysQuiz } from '@/app/tavern/daily-quiz/generate'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = await Promise.allSettled([
    getTodaysFishPuzzle(),
    getTodaysQuiz(),
    // Add future midnight tasks here
  ])

  return NextResponse.json({
    fish:  results[0].status === 'fulfilled' ? 'ok' : 'failed',
    quiz:  results[1].status === 'fulfilled' ? 'ok' : 'failed',
  })
}
