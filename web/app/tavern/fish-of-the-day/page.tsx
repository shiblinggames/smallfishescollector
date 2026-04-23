import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import FishOfTheDay from '../FishOfTheDay'
import { getDailyFishPuzzle, getAllFishNames } from '../fishActions'

export default async function FishOfTheDayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, puzzleResult, allFishNames] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons').eq('id', user.id).single(),
    getDailyFishPuzzle(),
    getAllFishNames(),
  ])

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0">
        <div className="px-6 pt-6 pb-2">
          <Link
            href="/tavern"
            className="font-karla text-[#6a6764] text-xs uppercase tracking-[0.12em] hover:text-[#8a8880] transition-colors"
          >
            ← Tavern
          </Link>
        </div>

        <div className="px-6 pt-4 pb-5 text-center">
          <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Daily</p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem' }}>
            Fish of the Day
          </h1>
          <p className="font-karla font-300 text-[#8a8880] text-xs mt-1">
            Four clues. Four guesses. One fish.
          </p>
        </div>

        <div className="px-6 pb-12 max-w-sm mx-auto">
          {'error' in puzzleResult ? (
            <p className="font-karla text-[#8a8880] text-sm text-center">{puzzleResult.error}</p>
          ) : (
            <FishOfTheDay initialPuzzle={puzzleResult} allFishNames={allFishNames} />
          )}
        </div>
      </main>
    </>
  )
}
