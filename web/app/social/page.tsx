import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Nav from '@/components/Nav'
import SocialClient from './SocialClient'
import { getCrew, getNewFollowers } from './actions'
import { getChallenges, getWLRecord } from './challengeActions'

export default async function SocialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, crew, newFollowers, challenges, wlRecord, { data: baitRows }] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems, username').eq('id', user.id).single(),
    getCrew(),
    getNewFollowers(),
    getChallenges(),
    getWLRecord(),
    supabase.from('bait_inventory').select('quantity').eq('user_id', user.id),
  ])

  const myBait = (baitRows ?? []).reduce((sum: number, row: { quantity: number }) => sum + (row.quantity ?? 0), 0)

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <main className="min-h-screen pt-6">
        {profile?.username && (
          <div className="px-6 max-w-xl mx-auto mb-4 flex justify-end">
            <Link
              href={`/u/${profile.username}`}
              className="font-karla font-600"
              style={{ fontSize: '0.7rem', color: '#7a7674', textDecoration: 'none' }}
            >
              View your profile →
            </Link>
          </div>
        )}
        <SocialClient
          initialCrew={crew}
          username={profile?.username ?? ''}
          newFollowers={newFollowers}
          initialChallenges={challenges}
          wlRecord={wlRecord}
          myDoubloons={profile?.doubloons ?? 0}
          myBait={myBait}
        />
      </main>
    </>
  )
}
