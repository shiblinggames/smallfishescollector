'use server'

// The World Chart — server actions. Reveal state derives from lifetime
// puzzle_points (read-only); this only owns the one-time gem CLAIM per landmark,
// gated server-side against the threshold + the already-claimed set.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { grant } from '@/lib/wallet'
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
    .select('puzzle_points, charting_landmarks_claimed')
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
  // Record the claim FIRST, and only over the exact claimed set we read. Two
  // taps fired together both reach here; only the one whose update comes back
  // with a row is paid (and only it can be the one that completes the chart).
  const claimQ = admin.from('profiles').update({ charting_landmarks_claimed: newClaimed }).eq('id', user.id)
  const { data: moved } = await (profile.charting_landmarks_claimed == null
    ? claimQ.is('charting_landmarks_claimed', null)
    : claimQ.eq('charting_landmarks_claimed', `{${claimed.join(',')}}`)
  ).select('id')
  if (!moved || moved.length === 0) return { error: 'Already claimed' }

  const newGems = await grant(admin, user.id, 'gems', awarded)
  await Promise.all([
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
