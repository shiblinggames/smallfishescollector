import { NextRequest, NextResponse } from 'next/server'
import { getTodaysFishPuzzle } from '@/app/tavern/fish-of-the-day/generate'
import { getTodaysQuiz } from '@/app/tavern/daily-quiz/generate'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [fish, quiz] = await Promise.allSettled([
    getTodaysFishPuzzle(),
    getTodaysQuiz(),
  ])

  return NextResponse.json({
    fish: fish.status === 'fulfilled' ? 'ok' : 'failed',
    quiz: quiz.status === 'fulfilled' ? 'ok' : 'failed',
  })
}
