'use server'

// Async Ship PvP lifecycle (v1) — server-authoritative WeGo duels. Mirrors the
// fishing-challenge plumbing but with combat resolved by lib/shipBattle/resolver
// and ZERO currency at stake (bragging rights only). Each round both players
// secretly submit one move; when both are in, the server rolls the round and
// advances. See [[project-ship-pvp-decision]].

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { snapshotLoadout } from '@/lib/shipBattle/loadout'
import { resolveRound, type BattleLoadout, type BattleMove, type BattleAction, type ShotResult, type RoundStep } from '@/lib/shipBattle/resolver'

type Side = 'challenger' | 'opponent'

interface BattleRow {
  id: string
  challenger_id: string
  opponent_id: string
  challenger_username: string
  opponent_username: string
  status: string
  challenger_loadout: BattleLoadout | null
  opponent_loadout: BattleLoadout | null
  challenger_hp: number
  opponent_hp: number
  challenger_charges: number
  opponent_charges: number
  round: number
  challenger_move: BattleMove | null
  opponent_move: BattleMove | null
  rounds: { round: number; steps: RoundStep[] }[]
  current_round_started_at: string | null
  winner_id: string | null
  created_at: string
}

async function authUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function sendMail(admin: ReturnType<typeof createAdminClient>, targetUserId: string, subject: string, body: string) {
  await admin.from('mail_messages').insert({ subject, body, sender_label: 'The Duelist’s Ledger', target_user_id: targetUserId }).then(() => {}, () => {})
}

// ── Create ────────────────────────────────────────────────────────────────
export async function createShipBattle(opponentUsername: string): Promise<{ id: string } | { error: string }> {
  const user = await authUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const trimmed = opponentUsername.trim()
  if (!trimmed) return { error: 'Enter a captain’s name.' }

  const [{ data: me }, { data: foe }] = await Promise.all([
    admin.from('profiles').select('username').eq('id', user.id).single(),
    admin.from('profiles').select('id, username').ilike('username', trimmed).maybeSingle(),
  ])
  if (!me?.username) return { error: 'Set a username first.' }
  if (!foe?.id) return { error: 'No captain by that name.' }
  if (foe.id === user.id) return { error: 'You can’t duel yourself.' }

  // One live duel per pair at a time (either direction).
  const { data: existing } = await admin
    .from('ship_battles')
    .select('id')
    .in('status', ['pending', 'active'])
    .or(`and(challenger_id.eq.${user.id},opponent_id.eq.${foe.id}),and(challenger_id.eq.${foe.id},opponent_id.eq.${user.id})`)
    .maybeSingle()
  if (existing) return { error: 'You already have a duel going with them.' }

  const loadout = await snapshotLoadout(user.id)
  const { data: inserted, error } = await admin
    .from('ship_battles')
    .insert({
      challenger_id: user.id,
      opponent_id: foe.id,
      challenger_username: me.username,
      opponent_username: foe.username,
      status: 'pending',
      challenger_loadout: loadout,
    })
    .select('id')
    .single()
  if (error || !inserted) return { error: 'Could not start the duel.' }

  await sendMail(admin, foe.id, `${me.username} challenged you to a duel`, `${me.username} has called you out to a ship battle. Head to the Crew page to accept or decline.`)
  revalidatePath('/social')
  return { id: inserted.id }
}

// ── Accept / Decline ────────────────────────────────────────────────────────
export async function acceptShipBattle(id: string): Promise<{ ok: true } | { error: string }> {
  const user = await authUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: b } = await admin.from('ship_battles').select('*').eq('id', id).single<BattleRow>()
  if (!b) return { error: 'Duel not found.' }
  if (b.opponent_id !== user.id) return { error: 'Not your duel to accept.' }
  if (b.status !== 'pending') return { error: 'This duel can no longer be accepted.' }

  const opponentLoadout = await snapshotLoadout(user.id)
  const cHp = b.challenger_loadout?.hpMax ?? 1
  const oHp = opponentLoadout.hpMax

  const { error } = await admin.from('ship_battles').update({
    opponent_loadout: opponentLoadout,
    status: 'active',
    challenger_hp: cHp,
    opponent_hp: oHp,
    challenger_charges: 0,
    opponent_charges: 0,
    round: 1,
    current_round_started_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'pending').select('id').single()
  if (error) return { error: 'Could not start the duel.' }

  await sendMail(admin, b.challenger_id, `${b.opponent_username} accepted your duel`, `The cannons are loaded. It’s your move — open the duel from the Crew page.`)
  revalidatePath('/social')
  return { ok: true }
}

export async function declineShipBattle(id: string): Promise<{ ok: true } | { error: string }> {
  const user = await authUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: b } = await admin.from('ship_battles').select('challenger_id, opponent_id, opponent_username, status').eq('id', id).single()
  if (!b) return { error: 'Duel not found.' }
  if (b.opponent_id !== user.id || b.status !== 'pending') return { error: 'Cannot decline this duel.' }

  await admin.from('ship_battles').update({ status: 'declined' }).eq('id', id).eq('status', 'pending')
  await sendMail(admin, b.challenger_id, `${b.opponent_username} declined your duel`, 'They weren’t ready for the fight. Challenge someone else!')
  revalidatePath('/social')
  return { ok: true }
}

// ── Submit a move (resolves the round when both are in) ──────────────────────
export async function submitBattleMove(id: string, action: BattleAction, aimResult?: ShotResult): Promise<{ ok: true; resolved: boolean } | { error: string }> {
  const user = await authUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: b } = await admin.from('ship_battles').select('*').eq('id', id).single<BattleRow>()
  if (!b) return { error: 'Duel not found.' }
  if (b.status !== 'active') return { error: 'This duel is over.' }
  const side: Side | null = b.challenger_id === user.id ? 'challenger' : b.opponent_id === user.id ? 'opponent' : null
  if (!side) return { error: 'Not your duel.' }
  if ((action === 'fire' || action === 'volley') && !aimResult) return { error: 'Missing aim.' }

  const move: BattleMove = { action, aimResult }
  const moveCol = side === 'challenger' ? 'challenger_move' : 'opponent_move'

  // Atomic claim: only succeeds if this side hasn't moved this round yet.
  const { data: claimed } = await admin
    .from('ship_battles')
    .update({ [moveCol]: move })
    .eq('id', id).eq('status', 'active').is(moveCol, null)
    .select('id')
  if (!claimed || claimed.length === 0) return { error: 'You’ve already moved this round.' }

  // Re-read to see if the opponent's move is now in too.
  const { data: fresh } = await admin.from('ship_battles').select('*').eq('id', id).single<BattleRow>()
  if (!fresh || !fresh.challenger_move || !fresh.opponent_move) {
    revalidatePath('/social')
    return { ok: true, resolved: false }
  }

  // Both in — resolve the round. (Loadouts are guaranteed present once active.)
  const r = resolveRound(
    fresh.challenger_loadout!, fresh.opponent_loadout!,
    { hp: fresh.challenger_hp, charges: fresh.challenger_charges },
    { hp: fresh.opponent_hp, charges: fresh.opponent_charges },
    fresh.challenger_move, fresh.opponent_move,
  )
  const newRounds = [...(fresh.rounds ?? []), { round: fresh.round, steps: r.steps }]
  const winnerId = r.winner === 'challenger' ? fresh.challenger_id : r.winner === 'opponent' ? fresh.opponent_id : null

  // Commit guarded by both-moves-still-present so a concurrent resolver can't
  // double-apply (the loser's conditional update affects 0 rows).
  const { data: committed } = await admin
    .from('ship_battles')
    .update({
      challenger_hp: r.challenger.hp,
      opponent_hp: r.opponent.hp,
      challenger_charges: r.challenger.charges,
      opponent_charges: r.opponent.charges,
      challenger_move: null,
      opponent_move: null,
      rounds: newRounds,
      round: fresh.round + 1,
      current_round_started_at: new Date().toISOString(),
      ...(winnerId ? { status: 'complete', winner_id: winnerId, completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', id)
    .not('challenger_move', 'is', null)
    .not('opponent_move', 'is', null)
    .select('id')
  if (committed && committed.length > 0 && winnerId) {
    const loserId = winnerId === fresh.challenger_id ? fresh.opponent_id : fresh.challenger_id
    const winnerName = winnerId === fresh.challenger_id ? fresh.challenger_username : fresh.opponent_username
    const loserName = winnerId === fresh.challenger_id ? fresh.opponent_username : fresh.challenger_username
    await Promise.all([
      admin.rpc('bump_pvp_stats', { uid: winnerId, wins: 1, losses: 0 }),
      admin.rpc('bump_pvp_stats', { uid: loserId, wins: 0, losses: 1 }),
      sendMail(admin, winnerId, `Victory over ${loserName}!`, `You sank ${loserName}’s ship. The sea remembers your name.`),
      sendMail(admin, loserId, `Defeated by ${winnerName}`, `${winnerName} sent you to the depths this time. Rebuild and call them out again.`),
    ])
  }

  revalidatePath('/social')
  return { ok: true, resolved: true }
}

// ── Reads ────────────────────────────────────────────────────────────────
export interface ShipBattleSummary {
  id: string
  status: string
  isChallenger: boolean
  opponentUsername: string
  round: number
  /** Whose move the round is waiting on, from THIS player's POV. */
  myTurn: boolean
  iWon: boolean | null
  createdAt: string
}

export async function getShipBattles(): Promise<{ battles: ShipBattleSummary[]; wins: number; losses: number }> {
  const user = await authUser()
  if (!user) return { battles: [], wins: 0, losses: 0 }
  const admin = createAdminClient()
  const [{ data: rows }, { data: profile }] = await Promise.all([
    admin.from('ship_battles')
      .select('id, status, challenger_id, opponent_id, challenger_username, opponent_username, round, challenger_move, opponent_move, winner_id, created_at')
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(30),
    admin.from('profiles').select('pvp_wins, pvp_losses').eq('id', user.id).single(),
  ])
  const battles: ShipBattleSummary[] = ((rows ?? []) as Array<Record<string, unknown>>).map(r => {
    const isChallenger = r.challenger_id === user.id
    const myMove = isChallenger ? r.challenger_move : r.opponent_move
    return {
      id: r.id as string,
      status: r.status as string,
      isChallenger,
      opponentUsername: (isChallenger ? r.opponent_username : r.challenger_username) as string,
      round: r.round as number,
      myTurn: r.status === 'active' && myMove == null,
      iWon: r.winner_id == null ? null : r.winner_id === user.id,
      createdAt: r.created_at as string,
    }
  })
  return { battles, wins: profile?.pvp_wins ?? 0, losses: profile?.pvp_losses ?? 0 }
}

export interface ShipBattleState {
  id: string
  status: string
  side: Side
  me: BattleLoadout
  foe: BattleLoadout
  myHp: number
  foeHp: number
  myCharges: number
  foeCharges: number
  round: number
  myMoveIn: boolean
  foeMoveIn: boolean
  rounds: { round: number; steps: RoundStep[] }[]
  iWon: boolean | null
}

export async function getShipBattleState(id: string): Promise<ShipBattleState | { error: string }> {
  const user = await authUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { data: b } = await admin.from('ship_battles').select('*').eq('id', id).single<BattleRow>()
  if (!b) return { error: 'Duel not found.' }
  const side: Side | null = b.challenger_id === user.id ? 'challenger' : b.opponent_id === user.id ? 'opponent' : null
  if (!side) return { error: 'Not your duel.' }
  const isC = side === 'challenger'
  if (!b.challenger_loadout || !b.opponent_loadout) {
    // Not yet accepted — minimal state.
    return {
      id: b.id, status: b.status, side,
      me: (isC ? b.challenger_loadout : b.opponent_loadout)!,
      foe: (isC ? b.opponent_loadout : b.challenger_loadout)!,
      myHp: 0, foeHp: 0, myCharges: 0, foeCharges: 0, round: b.round,
      myMoveIn: false, foeMoveIn: false, rounds: b.rounds ?? [],
      iWon: b.winner_id == null ? null : b.winner_id === user.id,
    }
  }
  return {
    id: b.id, status: b.status, side,
    me: isC ? b.challenger_loadout : b.opponent_loadout,
    foe: isC ? b.opponent_loadout : b.challenger_loadout,
    myHp: isC ? b.challenger_hp : b.opponent_hp,
    foeHp: isC ? b.opponent_hp : b.challenger_hp,
    myCharges: isC ? b.challenger_charges : b.opponent_charges,
    foeCharges: isC ? b.opponent_charges : b.challenger_charges,
    round: b.round,
    myMoveIn: (isC ? b.challenger_move : b.opponent_move) != null,
    foeMoveIn: (isC ? b.opponent_move : b.challenger_move) != null,
    rounds: b.rounds ?? [],
    iWon: b.winner_id == null ? null : b.winner_id === user.id,
  }
}
