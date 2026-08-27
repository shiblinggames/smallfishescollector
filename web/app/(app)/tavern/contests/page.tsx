import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/userData'
import { getContestsView } from './actions'
import ContestsClient from './ContestsClient'

export default async function ContestsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const views = await getContestsView()

  return (
    <main className="min-h-screen">
      <div className="page-col pt-6 pb-16">
        <ContestsClient views={views} />
      </div>
    </main>
  )
}
