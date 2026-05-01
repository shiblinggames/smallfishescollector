'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type ChallengeType = 'most_fish' | 'most_doubloons' | 'most_perfects'
export type ChallengeStatus =
  | 'pending'
  | 'challenger_active'
  | 'challenger_done'
  | 'challenged_active'
  | 'complete'
  | 'expired'
  | 'declined'

export interface FishingChallenge {
  id: string
  challenger_id: string
  challenged_id: string
  challenger_username: string
  challenged_username: string
  duration_seconds: number
  challenge_type: ChallengeType
  wager: number
  message: string | null
  status: ChallengeStatus
  challenger_score: number
  challenged_score: number
  challenger_started_at: string | null
  challenger_finished_at: string | null
  challenged_started_at: string | null
  challenged_finished_at: string | null
  winner_id: string | null
  expires_at: string
  created_at: string
}

async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function createChallenge(
  challengedUsername: string,
  durationSeconds: number,
  challengeType: ChallengeType,
  wager: number,
  message: string,
): Promise<{ id: string } | { error: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const [{ data: myProfile }, { data: challenged }] = await Promise.all([
    admin.from('profiles').select('username, doubloons').eq('id', user.id).single(),
    admin.from('profiles').select('id, username').eq('username', challengedUsername).single(),
  ])

  if (!myProfile) return { error: 'Profile not found' }
  if (!challenged) return { error: 'Player not found' }
  if (challenged.id === user.id) return { error: 'Cannot challenge yourself' }
  if (wager > 0 && (myProfile.doubloons ?? 0) < wager) return { error: 'Not enough doubloons' }

  // Check no active challenge already exists between these two
  const { data: existing } = await admin
    .from('fishing_challenges')
    .select('id')
    .or(`and(challenger_id.eq.${user.id},challenged_id.eq.${challenged.id}),and(challenger_id.eq.${challenged.id},challenged_id.eq.${user.id})`)
    .in('status', ['pending', 'challenger_active', 'challenger_done', 'challenged_active'])
    .maybeSingle()

  if (existing) return { error: 'You already have an active challenge with this player' }

  // Deduct wager from challenger
  if (wager > 0) {
    await admin.from('profiles')
      .update({ doubloons: (myProfile.doubloons ?? 0) - wager })
      .eq('id', user.id)
  }

  const { data, error } = await admin.from('fishing_challenges').insert({
    challenger_id: user.id,
    challenged_id: challenged.id,
    challenger_username: myProfile.username,
    challenged_username: challenged.username,
    duration_seconds: durationSeconds,
    challenge_type: challengeType,
    wager,
    message: message.trim() || null,
    status: 'pending',
  }).select('id').single()

  if (error) return { error: error.message }
  return { id: data.id }
}

export async function acceptChallenge(challengeId: string): Promise<{ success: true } | { error: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: challenge } = await admin
    .from('fishing_challenges').select('*').eq('id', challengeId).single()

  if (!challenge) return { error: 'Challenge not found' }
  if (challenge.challenged_id !== user.id) return { error: 'Not your challenge' }
  if (challenge.status !== 'pending' && challenge.status !== 'challenger_done') return { error: 'Challenge is not pending' }
  if (new Date(challenge.expires_at) < new Date()) return { error: 'Challenge has expired' }

  if (challenge.wager > 0) {
    const { data: profile } = await admin.from('profiles').select('doubloons').eq('id', user.id).single()
    if (!profile || (profile.doubloons ?? 0) < challenge.wager) return { error: 'Not enough doubloons' }
    await admin.from('profiles').update({ doubloons: (profile.doubloons ?? 0) - challenge.wager }).eq('id', user.id)
  }

  return { success: true }
}

export async function declineChallenge(challengeId: string): Promise<{ success: true } | { error: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: challenge } = await admin
    .from('fishing_challenges').select('*').eq('id', challengeId).single()

  if (!challenge) return { error: 'Challenge not found' }
  if (challenge.challenged_id !== user.id) return { error: 'Not your challenge' }
  if (challenge.status !== 'pending' && challenge.status !== 'challenger_done') return { error: 'Cannot decline' }

  // Refund challenger's wager
  if (challenge.wager > 0) {
    const { data: profile } = await admin.from('profiles').select('doubloons').eq('id', challenge.challenger_id).single()
    if (profile) {
      await admin.from('profiles').update({ doubloons: (profile.doubloons ?? 0) + challenge.wager }).eq('id', challenge.challenger_id)
    }
  }

  await admin.from('fishing_challenges').update({ status: 'declined' }).eq('id', challengeId)
  return { success: true }
}

export async function startSession(challengeId: string): Promise<{ endsAt: string } | { error: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: challenge } = await admin
    .from('fishing_challenges').select('*').eq('id', challengeId).single()

  if (!challenge) return { error: 'Challenge not found' }

  const isChallenger = challenge.challenger_id === user.id
  const isChallenged = challenge.challenged_id === user.id

  if (!isChallenger && !isChallenged) return { error: 'Not your challenge' }

  // Challenger can start from 'pending', challenged can start once challenger is done
  if (isChallenger && challenge.status !== 'pending') return { error: 'Cannot start session now' }
  if (isChallenged && challenge.status !== 'challenger_done') return { error: 'Wait for challenger to finish first' }

  const now = new Date().toISOString()
  const endsAt = new Date(Date.now() + challenge.duration_seconds * 1000).toISOString()

  const update = isChallenger
    ? { status: 'challenger_active', challenger_started_at: now }
    : { status: 'challenged_active', challenged_started_at: now }

  await admin.from('fishing_challenges').update(update).eq('id', challengeId)
  return { endsAt }
}

export async function finishSession(challengeId: string): Promise<{ success: true } | { error: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: challenge } = await admin
    .from('fishing_challenges').select('*').eq('id', challengeId).single()

  if (!challenge) return { error: 'Challenge not found' }

  const isChallenger = challenge.challenger_id === user.id
  const isChallenged = challenge.challenged_id === user.id
  if (!isChallenger && !isChallenged) return { error: 'Not your challenge' }

  const now = new Date().toISOString()

  if (isChallenger && challenge.status === 'challenger_active') {
    await admin.from('fishing_challenges').update({
      status: 'challenger_done',
      challenger_finished_at: now,
    }).eq('id', challengeId)
    return { success: true }
  }

  if (isChallenged && challenge.status === 'challenged_active') {
    // Determine winner
    const cScore = challenge.challenger_score
    const dScore = challenge.challenged_score
    const winnerId = cScore > dScore ? challenge.challenger_id : dScore > cScore ? challenge.challenged_id : null

    await admin.from('fishing_challenges').update({
      status: 'complete',
      challenged_finished_at: now,
      winner_id: winnerId,
    }).eq('id', challengeId)

    // Pay out wager to winner (both wagers pooled)
    if (challenge.wager > 0 && winnerId) {
      const payout = challenge.wager * 2
      const { data: winnerProfile } = await admin.from('profiles').select('doubloons').eq('id', winnerId).single()
      if (winnerProfile) {
        await admin.from('profiles').update({ doubloons: (winnerProfile.doubloons ?? 0) + payout }).eq('id', winnerId)
      }
    } else if (challenge.wager > 0 && !winnerId) {
      // Tie — refund both
      const [{ data: cp }, { data: dp }] = await Promise.all([
        admin.from('profiles').select('doubloons').eq('id', challenge.challenger_id).single(),
        admin.from('profiles').select('doubloons').eq('id', challenge.challenged_id).single(),
      ])
      await Promise.all([
        cp && admin.from('profiles').update({ doubloons: (cp.doubloons ?? 0) + challenge.wager }).eq('id', challenge.challenger_id),
        dp && admin.from('profiles').update({ doubloons: (dp.doubloons ?? 0) + challenge.wager }).eq('id', challenge.challenged_id),
      ])
    }

    return { success: true }
  }

  return { error: 'No active session to finish' }
}

// Called from reelIn to update challenge score in real-time
export async function recordChallengeScore(
  userId: string,
  fishValue: number,
  isPerfect: boolean,
): Promise<void> {
  const admin = createAdminClient()

  const { data: challenge } = await admin
    .from('fishing_challenges')
    .select('*')
    .or(`challenger_id.eq.${userId},challenged_id.eq.${userId}`)
    .in('status', ['challenger_active', 'challenged_active'])
    .maybeSingle()

  if (!challenge) return

  const isChallenger = challenge.challenger_id === userId
  const startedAt = isChallenger ? challenge.challenger_started_at : challenge.challenged_started_at
  if (!startedAt) return

  // Check session is still within time window
  const sessionEnd = new Date(startedAt).getTime() + challenge.duration_seconds * 1000
  if (Date.now() > sessionEnd) return

  const type: ChallengeType = challenge.challenge_type
  let increment = 0
  if (type === 'most_fish') increment = 1
  else if (type === 'most_doubloons') increment = fishValue
  else if (type === 'most_perfects' && isPerfect) increment = 1

  if (increment === 0) return

  const scoreField = isChallenger ? 'challenger_score' : 'challenged_score'
  const currentScore = isChallenger ? challenge.challenger_score : challenge.challenged_score

  await admin.from('fishing_challenges')
    .update({ [scoreField]: currentScore + increment })
    .eq('id', challenge.id)
}

export interface ActiveSession {
  challengeId: string
  opponentUsername: string
  challengeType: ChallengeType
  endsAt: string
  myScore: number
}

export async function getActiveChallengeSession(): Promise<ActiveSession | null> {
  const user = await getUser()
  if (!user) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('fishing_challenges')
    .select('*')
    .or(`challenger_id.eq.${user.id},challenged_id.eq.${user.id}`)
    .in('status', ['challenger_active', 'challenged_active'])
    .maybeSingle()

  if (!data) return null

  const isChallenger = data.challenger_id === user.id
  const startedAt = isChallenger ? data.challenger_started_at : data.challenged_started_at
  if (!startedAt) return null

  const endsAt = new Date(new Date(startedAt).getTime() + data.duration_seconds * 1000).toISOString()

  // Auto-expire if time passed
  if (new Date(endsAt) < new Date()) {
    await finishSession(data.id)
    return null
  }

  return {
    challengeId: data.id,
    opponentUsername: isChallenger ? data.challenged_username : data.challenger_username,
    challengeType: data.challenge_type,
    endsAt,
    myScore: isChallenger ? data.challenger_score : data.challenged_score,
  }
}

export interface PendingChallenge {
  id: string
  challengerUsername: string
  challengedUsername: string
  isIncoming: boolean
  durationSeconds: number
  challengeType: ChallengeType
  wager: number
  message: string | null
  status: ChallengeStatus
  myScore: number
  opponentScore: number | null
  winnerId: string | null
  myId: string
  expiresAt: string
  createdAt: string
  challengerFinishedAt: string | null
  challengedFinishedAt: string | null
}

export async function getChallenges(): Promise<PendingChallenge[]> {
  const user = await getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('fishing_challenges')
    .select('*')
    .or(`challenger_id.eq.${user.id},challenged_id.eq.${user.id}`)
    .not('status', 'in', '("expired","declined")')
    .order('created_at', { ascending: false })
    .limit(20)

  if (!data) return []

  return data.map((c: FishingChallenge) => {
    const isIncoming = c.challenged_id === user.id
    const myScore = isIncoming ? c.challenged_score : c.challenger_score
    // Only reveal opponent score once complete
    const opponentScore = c.status === 'complete'
      ? (isIncoming ? c.challenger_score : c.challenged_score)
      : null

    return {
      id: c.id,
      challengerUsername: c.challenger_username,
      challengedUsername: c.challenged_username,
      isIncoming,
      durationSeconds: c.duration_seconds,
      challengeType: c.challenge_type,
      wager: c.wager,
      message: c.message,
      status: c.status,
      myScore,
      opponentScore,
      winnerId: c.winner_id,
      myId: user.id,
      expiresAt: c.expires_at,
      createdAt: c.created_at,
      challengerFinishedAt: c.challenger_finished_at,
      challengedFinishedAt: c.challenged_finished_at,
    }
  })
}

export async function getWLRecord(): Promise<{ wins: number; losses: number; ties: number }> {
  const user = await getUser()
  if (!user) return { wins: 0, losses: 0, ties: 0 }

  const admin = createAdminClient()
  const { data } = await admin
    .from('fishing_challenges')
    .select('winner_id, challenger_id, challenged_id')
    .or(`challenger_id.eq.${user.id},challenged_id.eq.${user.id}`)
    .eq('status', 'complete')

  if (!data) return { wins: 0, losses: 0, ties: 0 }

  let wins = 0, losses = 0, ties = 0
  for (const c of data) {
    if (c.winner_id === null) ties++
    else if (c.winner_id === user.id) wins++
    else losses++
  }
  return { wins, losses, ties }
}
