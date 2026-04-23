import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { getTodaysQuiz } from './generate'
import QuizClient from './QuizClient'

export default async function DailyQuizPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [quiz, { data: profile }, { data: previousAnswer }] = await Promise.all([
    getTodaysQuiz(),
    supabase.from('profiles').select('packs_available, doubloons').eq('id', user.id).single(),
    admin.from('quiz_answers').select('correct, chosen_index, reward').eq('user_id', user.id).eq('date', today).single(),
  ])

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen">
        <div className="px-6 max-w-xl mx-auto pt-8 pb-2">
          <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Daily Quiz</p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem' }}>Fish Trivia</h1>
          <p className="font-karla text-[#6a6764] mt-1" style={{ fontSize: '0.78rem' }}>
            One question per day · 50 ⟡ for a correct answer
          </p>
        </div>

        {quiz ? (
          <QuizClient quiz={quiz} previousAnswer={previousAnswer ?? null} />
        ) : (
          <div className="px-6 max-w-xl mx-auto pt-12 text-center">
            <p className="font-karla text-[#6a6764]" style={{ fontSize: '0.85rem' }}>
              No quiz available right now. Try again in a moment.
            </p>
          </div>
        )}
      </main>
    </>
  )
}
