import { redirect } from 'next/navigation'
import Link from 'next/link'
import SocialClient from './SocialClient'
import PactBoard from '@/components/PactBoard'
import { getCrew, getNewFollowers, type CrewMember } from './actions'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/userData'

/**
 * EVERYBODY, IN FULL.
 *
 * The tavern is the social ROOM: who is about, and a digest of everything else
 * with a way through to it. This is the everything else — the whole follow
 * list, the search, and the pact board — because a room that contains every
 * list in full is not a room, it is a filing cabinet with a fireplace.
 *
 * So the split is: the tavern says how things stand and this says what they
 * are. One door in, from the tavern's Crew group. It keeps no nav entry of its
 * own: two links to two halves of the same thing is the arrangement this whole
 * change was undoing.
 */
export const metadata = { title: 'Your crew' }

export default async function SocialPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [{ data: profile }, crew, newFollowers, { count: mySpecies }] = await Promise.all([
    supabase.from('profiles')
      .select('packs_available, gems, username, fishing_xp, expedition_xp, highest_perfect_streak, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
      .eq('id', user.id).single(),
    getCrew(),
    getNewFollowers(),
    supabase.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const me: CrewMember = {
    username:             profile?.username ?? '',
    fishingXP:            profile?.fishing_xp ?? 0,
    expeditionXP:         profile?.expedition_xp ?? 0,
    highestPerfectStreak: profile?.highest_perfect_streak ?? 0,
    species:              mySpecies ?? 0,
    characterColor:       (profile?.character_color as string | null) ?? null,
    equippedHat:          (profile?.equipped_hat as string | null) ?? null,
    avatarBg:             (profile?.avatar_bg_color as string | null) ?? null,
    avatarBorder:         (profile?.avatar_border_color as string | null) ?? null,
  }

  return (
    <main className="min-h-screen pt-6">
      <div className="page-col mb-4 flex items-center justify-between gap-3">
        <Link href="/tavern" className="font-karla font-600"
          style={{ fontSize: '0.7rem', color: '#7a7674', textDecoration: 'none' }}>
          ← The Tavern
        </Link>
        {profile?.username && (
          <Link href={`/u/${profile.username}`} className="font-karla font-600"
            style={{ fontSize: '0.7rem', color: '#7a7674', textDecoration: 'none' }}>
            View your profile →
          </Link>
        )}
      </div>

      <SocialClient
        initialCrew={crew}
        me={me}
        username={profile?.username ?? ''}
        newFollowers={newFollowers}
      />

      {/* THE PACT BOARD, in full, under the list it depends on. Following
          somebody is the floor and the pact is the permission, so the two
          belong on one page: every name you could ask is on the list above. */}
      <div className="page-col pb-16" style={{ marginTop: '1.25rem' }}>
        <section style={{
          borderRadius: 16, padding: '0.9rem 1rem 1rem',
          background: 'rgba(8,14,22,0.6)',
          border: '1px solid rgba(180,214,232,0.16)',
        }}>
          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#e8f2ea', margin: 0 }}>
            Sailing crew
          </p>
          {/* An empty set: this page has no live poll of the water, and a row
              claiming somebody is "on the water" from a page that cannot know
              would be a guess. The tavern's room is where that is answered. */}
          <PactBoard atSea={new Set<string>()} />
        </section>
      </div>
    </main>
  )
}
