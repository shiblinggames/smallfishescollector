'use server'

// The World Chart — server actions. Reveal state derives from lifetime
// puzzle_points (read-only); this only owns the one-time gem CLAIM per landmark,
// gated server-side against the threshold + the already-claimed set.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { LANDMARKS, WORLD_CHART_COMPLETION_BONUS } from '@/lib/worldChart'

export async function getWorldChartState(): Promise<{ points: number; claimed: number[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { points: 0, claimed: [] }

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('puzzle_points, charting_landmarks_claimed')
    .eq('id', user.id)
    .single()

  return {
    points: (data?.puzzle_points as number | null) ?? 0,
    claimed: (data?.charting_landmarks_claimed as number[] | null) ?? [],
  }
}

/** Collect a discovered landmark's gems. Pays once; re-validates the threshold
 *  and the claimed set server-side so the client can't forge a payout. */
export async function claimLandmark(landmarkId: number): Promise<
  { ok: true; gems: number; awarded: number; bonus: number; completed: boolean; claimed: number[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const landmark = LANDMARKS.find(l => l.id === landmarkId)
  if (!landmark) return { error: 'Unknown landmark' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('puzzle_points, charting_landmarks_claimed, gems')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'No profile' }

  const points = (profile.puzzle_points as number | null) ?? 0
  const claimed = (profile.charting_landmarks_claimed as number[] | null) ?? []

  if (points < landmark.threshold) return { error: 'Not yet discovered' }
  if (claimed.includes(landmarkId)) return { error: 'Already claimed' }

  const newClaimed = [...claimed, landmarkId]
  // Completing the LAST landmark (bringing the count to all 13) pays the
  // one-time completion bonus on top — a crossing that can only happen once.
  const completed = newClaimed.length === LANDMARKS.length
  const bonus = completed ? WORLD_CHART_COMPLETION_BONUS : 0
  const awarded = landmark.gems + bonus
  const newGems = ((profile.gems as number | null) ?? 0) + awarded

  await Promise.all([
    admin.from('profiles').update({ charting_landmarks_claimed: newClaimed, gems: newGems }).eq('id', user.id),
    admin.from('gem_transactions').insert(
      completed
        ? [
            { user_id: user.id, amount: landmark.gems, reason: `World Chart: ${landmark.name}` },
            { user_id: user.id, amount: bonus, reason: 'World Chart: fully charted' },
          ]
        : [{ user_id: user.id, amount: landmark.gems, reason: `World Chart: ${landmark.name}` }],
    ),
  ])

  // Badge hooks (also covered by the derive, but grant now for an immediate unlock).
  grantBadgeDirect(user.id, 'landfall').catch(() => {})
  if (newClaimed.length >= 7) grantBadgeDirect(user.id, 'uncharted_no_more').catch(() => {})
  if (completed) grantBadgeDirect(user.id, 'master_cartographer').catch(() => {})

  return { ok: true, gems: newGems, awarded, bonus, completed, claimed: newClaimed }
}
