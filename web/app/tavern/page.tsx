import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import CrownAndAnchor from './CrownAndAnchor'
import FishOfTheDay from './FishOfTheDay'
import { getDailyWagered } from './actions'
import { getDailyFishPuzzle, getAllFishNames } from './fishActions'

export default async function TavernPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, dailyWagered, puzzleResult, allFishNames] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons').eq('id', user.id).single(),
    getDailyWagered(),
    getDailyFishPuzzle(),
    getAllFishNames(),
  ])

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0">
        <div className="px-6 pt-8 pb-5 text-center">
          <h1
            className="font-cinzel font-700 text-[#f0ede8] leading-[0.92] tracking-[-0.01em]"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}
          >
            Tavern.
          </h1>
          <p className="font-karla font-300 text-[#8a8880] text-sm mt-3">
            Games of chance — earn doubloons, spend doubloons.
          </p>
        </div>

        <div className="px-6 flex flex-col gap-14 pb-12">

          {/* Fish of the Day */}
          <div className="max-w-sm mx-auto w-full">
            <div className="mb-6 text-center">
              <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Daily</p>
              <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.1rem' }}>Fish of the Day</p>
              <p className="font-karla font-300 text-[#8a8880] text-xs mt-1">
                Four clues. Four guesses. One fish.
              </p>
            </div>
            {'error' in puzzleResult ? (
              <p className="font-karla text-[#8a8880] text-sm text-center">{puzzleResult.error}</p>
            ) : (
              <FishOfTheDay initialPuzzle={puzzleResult} allFishNames={allFishNames} />
            )}
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

          {/* Crown & Anchor */}
          <div className="max-w-sm mx-auto w-full">
            <div className="mb-6 text-center">
              <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Dice Game</p>
              <p className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.1rem' }}>Crown &amp; Anchor</p>
              <p className="font-karla font-300 text-[#8a8880] text-xs mt-1">
                500 ⟡ daily limit
              </p>
            </div>
            <CrownAndAnchor
              doubloons={profile?.doubloons ?? 0}
              dailyWagered={dailyWagered}
            />
          </div>

        </div>
      </main>
    </>
  )
}
