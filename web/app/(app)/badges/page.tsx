import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/userData'
import { progressData } from '@/lib/data/progressData'
import { badgesPage } from '@/lib/core/badgesPage'
import BadgesView from './BadgesView'

// The groups and goals are worked out in lib/core/badgesPage, shared with the
// desktop build. Global rarity is the one read that is about other captains,
// so it stays here.
export default async function BadgesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  // Global badge rarity (Steam-style % of players who've unlocked each badge),
  // read alongside the rest.
  const rarity = admin.rpc('get_badge_rarity').then(r => (r.data ?? []) as { badge_id: string; pct: number }[])
  const model = await badgesPage(progressData(admin), user.id, rarity)
  return <BadgesView {...model} />
}
