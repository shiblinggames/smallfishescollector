import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SocialClient from './SocialClient'
import { getCrew, getNewFollowers, type CrewMember } from './actions'

export default async function SocialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, crew, newFollowers, { count: mySpecies }] = await Promise.all([
    supabase.from('profiles').select('packs_available, gems, username, fishing_xp, expedition_xp, highest_perfect_streak, character_color, equipped_hat, avatar_bg_color, avatar_border_color').eq('id', user.id).single(),
    getCrew(),
    getNewFollowers(),
    supabase.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const me: CrewMember = {
    username:             profile?.username ?? '',
    fishingXP:            profile?.fishing_xp ?? 0,
    expeditionXP:         profile?.expedition_xp ?? 0,
    highestPerfectStreak: profile?.highest_perfect_streak ?? 0,
    species:             mySpecies ?? 0,
    characterColor:      (profile?.character_color as string | null) ?? null,
    equippedHat:         (profile?.equipped_hat as string | null) ?? null,
    avatarBg:            (profile?.avatar_bg_color as string | null) ?? null,
    avatarBorder:        (profile?.avatar_border_color as string | null) ?? null,
  }

  return (
    <>
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
          me={me}
          username={profile?.username ?? ''}
          newFollowers={newFollowers}
        />
      </main>
    </>
  )
}
